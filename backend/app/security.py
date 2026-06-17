"""Password hashing & MFA helpers (bcrypt + TOTP)."""
from __future__ import annotations

import base64
import hashlib
import secrets

import bcrypt
import pyotp
from flask import current_app


def hash_password(password: str) -> str:
    rounds = current_app.config.get("BCRYPT_ROUNDS", 12) if current_app else 12
    salt = bcrypt.gensalt(rounds=rounds)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def generate_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ─── Numeric one-time codes (email MFA / OTP) ──────────────────────────────────

def generate_numeric_code(digits: int = 6) -> str:
    """Cryptographically-random zero-padded numeric code, e.g. ``"048213"``."""
    upper = 10 ** digits
    return f"{secrets.randbelow(upper):0{digits}d}"


def hash_code(code: str) -> str:
    """One-way hash for short-lived numeric codes stored at rest."""
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def verify_hashed_code(code: str | None, code_hash: str | None) -> bool:
    if not code or not code_hash:
        return False
    return secrets.compare_digest(hash_code(code), code_hash)


# ─── MFA / TOTP ────────────────────────────────────────────────────────────────

def generate_mfa_secret() -> str:
    return pyotp.random_base32()


def mfa_provisioning_uri(secret: str, account_name: str) -> str:
    issuer = current_app.config.get("MFA_ISSUER", "SemanticGuard AI") if current_app else "SemanticGuard AI"
    return pyotp.totp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=issuer)


def verify_mfa_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)


def mfa_qr_data_uri(secret: str, account_name: str) -> str:
    """Return a base64 PNG data URI for the TOTP provisioning QR code."""
    import io

    import qrcode

    uri = mfa_provisioning_uri(secret, account_name)
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
