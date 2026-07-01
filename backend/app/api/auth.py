"""Authentication API (Step 3): register, login, MFA, tokens, verification."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import (
    get_jwt,
    jwt_required,
)

from app.api.helpers import created, ok, parse
from app.extensions import limiter
from app.schemas import (
    EmailVerifySchema,
    LoginSchema,
    MFASetupSchema,
    MFAVerifySchema,
    OtpResendSchema,
    OtpVerifySchema,
    PasswordChangeSchema,
    PasswordResetRequestSchema,
    PasswordResetSchema,
    RegisterSchema,
    user_schema,
)
from app.services import auth_service
from app.services.rbac import current_user

bp = Blueprint("auth", __name__)


@bp.post("/register")
@limiter.limit("10 per hour")
def register():
    data = parse(RegisterSchema())
    user, _token = auth_service.register(data)
    # The verification OTP is delivered by auth_service via SendGrid.
    return created({
        "user": user_schema.dump(user),
        "message": "Registration successful. Enter the 6-digit code we emailed to verify your account.",
    })


@bp.post("/login")
@limiter.limit("20 per minute")
def login():
    data = parse(LoginSchema())
    result = auth_service.authenticate(data["email"], data["password"], data.get("mfa_code"))
    return ok(result)


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    from flask_jwt_extended import get_jwt_identity

    return ok(auth_service.refresh_token(get_jwt_identity()))


@bp.post("/logout")
@jwt_required()
def logout():
    auth_service.logout(get_jwt())
    return ok({"message": "Logged out"})


@bp.get("/me")
@jwt_required()
def me():
    return ok({"user": user_schema.dump(current_user())})


@bp.post("/verify-email")
def verify_email():
    data = parse(EmailVerifySchema())
    user = auth_service.verify_email(data["token"])
    return ok({"user": user_schema.dump(user), "message": "Email verified"})


@bp.post("/verify-otp")
@limiter.limit("10 per 10 minutes")
def verify_otp():
    data = parse(OtpVerifySchema())
    user = auth_service.verify_otp(data["email"], data["otp"])
    return ok({"user": user_schema.dump(user), "message": "Account verified"})


@bp.post("/resend-otp")
@limiter.limit("5 per 10 minutes")
def resend_otp():
    data = parse(OtpResendSchema())
    auth_service.resend_otp(data["email"])
    return ok({"message": "If the account exists and is unverified, a new code has been sent."})


@bp.post("/change-password")
@jwt_required()
def change_password():
    data = parse(PasswordChangeSchema())
    auth_service.change_password(current_user(), data["current_password"], data["new_password"])
    return ok({"message": "Password updated"})


@bp.post("/forgot-password")
@limiter.limit("5 per hour")
def forgot_password():
    data = parse(PasswordResetRequestSchema())
    # The reset email (if the account exists) is delivered by auth_service.
    auth_service.request_password_reset(data["email"])
    return ok({"message": "If the account exists, a reset link has been sent."})


@bp.post("/reset-password")
@limiter.limit("5 per hour")
def reset_password():
    data = parse(PasswordResetSchema())
    auth_service.reset_password(data["token"], data["new_password"])
    return ok({"message": "Password reset successful"})


# ─── MFA ─────────────────────────────────────────────────────────────────────

@bp.post("/mfa/setup")
@jwt_required()
def mfa_setup():
    data = parse(MFASetupSchema())
    return ok(auth_service.begin_mfa_setup(current_user(), data["method"]))


@bp.post("/mfa/resend")
@jwt_required()
@limiter.limit("5 per 10 minutes")
def mfa_resend():
    return ok(auth_service.resend_mfa_code(current_user()))


@bp.post("/mfa/confirm")
@jwt_required()
def mfa_confirm():
    data = parse(MFAVerifySchema())
    auth_service.confirm_mfa(current_user(), data["code"])
    return ok({"message": "MFA enabled"})


@bp.post("/mfa/disable")
@jwt_required()
def mfa_disable():
    data = parse(MFAVerifySchema())
    auth_service.disable_mfa(current_user(), data["code"])
    return ok({"message": "MFA disabled"})
