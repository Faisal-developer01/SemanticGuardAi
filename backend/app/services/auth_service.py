"""Authentication & account service: register, login, MFA, tokens, verification."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from flask import current_app
from flask_jwt_extended import create_access_token, create_refresh_token

from app.errors import ConflictError, ForbiddenError, UnauthorizedError
from app.models import User
from app.models.enums import AuditStatus, UserRole, UserStatus
from app.repositories import (
    candidate_profiles,
    recruiter_profiles,
    roles,
    token_blocklist,
    users,
)
from app.security import (
    generate_mfa_secret,
    generate_numeric_code,
    generate_token,
    hash_code,
    hash_password,
    mfa_provisioning_uri,
    mfa_qr_data_uri,
    verify_hashed_code,
    verify_mfa_code,
    verify_password,
)
from app.services import audit_service, email_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """Coerce a (possibly naive, e.g. from SQLite) datetime to UTC-aware."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _generate_code(prefix: str) -> str:
    return f"{prefix}-{_now().year}-{secrets.randbelow(900000) + 100000}"


def _issue_tokens(user: User) -> dict:
    claims = {"role": user.role_name.value, "email": user.email, "name": user.full_name}
    access = create_access_token(identity=str(user.id), additional_claims=claims)
    refresh = create_refresh_token(identity=str(user.id), additional_claims={"role": user.role_name.value})
    return {"accessToken": access, "refreshToken": refresh, "tokenType": "Bearer"}


def register(data: dict) -> tuple[User, str]:
    email = data["email"].lower().strip()
    if users.get_by_email(email):
        raise ConflictError("An account with this email already exists")

    role_value = data.get("role", "candidate")
    role_enum = UserRole(role_value)
    role_row = roles.get_by_name(role_value)

    is_dev_or_test = current_app.config.get("DEBUG") or current_app.config.get("TESTING")
    verification_token = generate_token()
    user = users.create(
        full_name=data["full_name"],
        email=email,
        phone=data.get("phone"),
        password_hash=hash_password(data["password"]),
        role_name=role_enum,
        role_id=role_row.id if role_row else None,
        status=UserStatus.active if is_dev_or_test else UserStatus.pending,
        email_verified=is_dev_or_test,
        email_verification_token=None if is_dev_or_test else verification_token,
        email_verification_sent_at=None if is_dev_or_test else _now(),
        commit=False,
    )

    # Create the matching profile.
    if role_enum == UserRole.candidate:
        candidate_profiles.create(
            user_id=user.id,
            candidate_code=_generate_code("CND"),
            department=data.get("department"),
            position=data.get("position"),
            commit=False,
        )
    elif role_enum == UserRole.recruiter:
        recruiter_profiles.create(
            user_id=user.id,
            recruiter_code=_generate_code("REC"),
            department=data.get("department"),
            commit=False,
        )

    users.session.commit()
    audit_service.record("auth.register", user=user, resource=email)
    if not is_dev_or_test:
        email_service.deliver("verification", str(user.id), verification_token)
    return user, verification_token


def authenticate(email: str, password: str, mfa_code: str | None) -> dict:
    user = users.get_by_email(email)
    generic_error = UnauthorizedError("Invalid email or password")

    if not user:
        raise generic_error

    if user.is_locked:
        audit_service.record(
            "auth.login", user=user, status=AuditStatus.failure, details="account_locked"
        )
        raise ForbiddenError("Account temporarily locked due to failed attempts")

    if not verify_password(password, user.password_hash):
        _register_failed_attempt(user)
        raise generic_error

    if user.status == UserStatus.suspended:
        raise ForbiddenError("Account suspended")
    if not user.email_verified:
        raise ForbiddenError("Email not verified")

    # MFA gate
    if user.mfa_enabled:
        if not mfa_code:
            # Email MFA: generate + send a fresh one-time code, then ask for it.
            if user.mfa_method == "email":
                _send_email_otp(user)
            return {
                "mfaRequired": True,
                "mfaMethod": user.mfa_method,
                "userId": str(user.id),
            }
        if not _verify_mfa(user, mfa_code):
            _register_failed_attempt(user)
            raise UnauthorizedError("Invalid MFA code")

    _register_successful_login(user)
    tokens = _issue_tokens(user)
    audit_service.record("auth.login", user=user, status=AuditStatus.success)
    return {"mfaRequired": False, **tokens}


def _register_failed_attempt(user: User) -> None:
    max_attempts = current_app.config["MAX_LOGIN_ATTEMPTS"]
    user.failed_login_attempts += 1
    if user.failed_login_attempts >= max_attempts:
        user.locked_until = _now() + timedelta(minutes=current_app.config["ACCOUNT_LOCK_MINUTES"])
        audit_service.record("auth.lockout", user=user, status=AuditStatus.warning)
    users.session.commit()


def _register_successful_login(user: User) -> None:
    from flask import request

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = _now()
    if request:
        user.last_login_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    users.session.commit()


def refresh_token(user_id: str) -> dict:
    user = users.get_or_404(user_id)
    claims = {"role": user.role_name.value, "email": user.email, "name": user.full_name}
    return {
        "accessToken": create_access_token(identity=str(user.id), additional_claims=claims),
        "tokenType": "Bearer",
    }


def logout(jwt_payload: dict) -> None:
    exp = datetime.fromtimestamp(jwt_payload["exp"], tz=timezone.utc)
    token_blocklist.revoke(
        jti=jwt_payload["jti"],
        token_type=jwt_payload.get("type", "access"),
        user_id=jwt_payload.get("sub"),
        expires_at=exp,
    )
    audit_service.record("auth.logout", resource=jwt_payload.get("sub"))


def verify_email(token: str) -> User:
    user = users.find_one(email_verification_token=token)
    if not user:
        raise UnauthorizedError("Invalid or expired verification token")
    user.email_verified = True
    user.email_verification_token = None
    if user.status == UserStatus.pending:
        user.status = UserStatus.active
    users.session.commit()
    audit_service.record("auth.email_verified", user=user)
    return user


def change_password(user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise UnauthorizedError("Current password is incorrect")
    user.password_hash = hash_password(new_password)
    users.session.commit()
    audit_service.record("auth.password_changed", user=user)


def request_password_reset(email: str) -> tuple[User | None, str | None]:
    user = users.get_by_email(email)
    if not user:
        return None, None  # do not reveal account existence
    token = generate_token()
    user.password_reset_token = token
    user.password_reset_expires_at = _now() + timedelta(hours=1)
    users.session.commit()
    email_service.deliver("password_reset", str(user.id), token)
    return user, token


def reset_password(token: str, new_password: str) -> User:
    user = users.find_one(password_reset_token=token)
    if not user or not user.password_reset_expires_at or _aware(user.password_reset_expires_at) < _now():
        raise UnauthorizedError("Invalid or expired reset token")
    user.password_hash = hash_password(new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    user.failed_login_attempts = 0
    user.locked_until = None
    users.session.commit()
    audit_service.record("auth.password_reset", user=user)
    return user


# ─── MFA enrolment ───────────────────────────────────────────────────────────

def _set_email_otp(user: User) -> str:
    """Generate, hash, and store a fresh email one-time code; return the plaintext."""
    ttl = current_app.config.get("EMAIL_OTP_TTL_MINUTES", 10)
    code = generate_numeric_code(6)
    user.email_otp_hash = hash_code(code)
    user.email_otp_expires_at = _now() + timedelta(minutes=ttl)
    users.session.commit()
    return code


def _send_email_otp(user: User) -> None:
    code = _set_email_otp(user)
    email_service.deliver("mfa_code", str(user.id), code)


def _verify_email_otp(user: User, code: str) -> bool:
    if not user.email_otp_hash or not user.email_otp_expires_at:
        return False
    if _aware(user.email_otp_expires_at) < _now():
        return False
    if not verify_hashed_code(code, user.email_otp_hash):
        return False
    # One-time use: clear after a successful verification.
    user.email_otp_hash = None
    user.email_otp_expires_at = None
    users.session.commit()
    return True


def _verify_mfa(user: User, code: str) -> bool:
    if user.mfa_method == "email":
        return _verify_email_otp(user, code)
    return verify_mfa_code(user.mfa_secret, code)


def begin_mfa_setup(user: User, method: str = "totp") -> dict:
    method = (method or "totp").lower()

    if method == "email":
        _send_email_otp(user)
        return {
            "method": "email",
            "destination": user.email,
            "message": f"A verification code was sent to {user.email}.",
        }

    secret = generate_mfa_secret()
    user.mfa_secret = secret  # stored but not yet enabled until verified
    users.session.commit()
    return {
        "method": "totp",
        "secret": secret,
        "otpauthUri": mfa_provisioning_uri(secret, user.email),
        "qr": mfa_qr_data_uri(secret, user.email),
    }


def resend_mfa_code(user: User) -> dict:
    """Re-send an email MFA code (used during enrolment or a pending login)."""
    _send_email_otp(user)
    return {"method": "email", "destination": user.email, "message": "A new code was sent."}


def confirm_mfa(user: User, code: str) -> None:
    # Auto-detect the method being enrolled: a pending TOTP secret takes the
    # authenticator path, otherwise we verify the emailed one-time code.
    if user.mfa_secret and verify_mfa_code(user.mfa_secret, code):
        user.mfa_method = "totp"
    elif _verify_email_otp(user, code):
        user.mfa_method = "email"
        user.mfa_secret = None
    else:
        raise UnauthorizedError("Invalid MFA code")
    user.mfa_enabled = True
    users.session.commit()
    audit_service.record("auth.mfa_enabled", user=user, details=user.mfa_method)


def disable_mfa(user: User, code: str) -> None:
    if not _verify_mfa(user, code):
        raise UnauthorizedError("Invalid MFA code")
    user.mfa_enabled = False
    user.mfa_secret = None
    user.mfa_method = "totp"
    user.email_otp_hash = None
    user.email_otp_expires_at = None
    users.session.commit()
    audit_service.record("auth.mfa_disabled", user=user)
