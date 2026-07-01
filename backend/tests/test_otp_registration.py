"""Registration OTP verification via SendGrid Dynamic Templates.

These tests exercise the OTP lifecycle (register -> verify -> login) plus the
resend cooldown, without hitting the real SendGrid API (disabled in the test
config). The plaintext code is forced to a known value via monkeypatch so we can
replay it through the public endpoints.
"""
from __future__ import annotations

import pytest

from app.services import auth_service


@pytest.fixture()
def fixed_otp(monkeypatch):
    code = "135792"
    monkeypatch.setattr(auth_service, "generate_numeric_code", lambda digits=6: code)
    return code


def _register(client, email="otp@test.rw"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "fullName": "OTP Candidate",
            "email": email,
            "password": "Password123",
            "role": "candidate",
        },
    )


def test_register_requires_otp_then_verifies_and_logs_in(client, fixed_otp):
    # 1) Register -> account is created but unverified, login is blocked.
    resp = _register(client)
    assert resp.status_code == 201
    assert resp.get_json()["user"]["emailVerified"] is False

    blocked = client.post(
        "/api/v1/auth/login", json={"email": "otp@test.rw", "password": "Password123"}
    )
    assert blocked.status_code == 403

    # 2) Verify with the OTP -> account is activated.
    verify = client.post(
        "/api/v1/auth/verify-otp", json={"email": "otp@test.rw", "otp": fixed_otp}
    )
    assert verify.status_code == 200
    assert verify.get_json()["user"]["emailVerified"] is True

    # 3) Login now succeeds.
    login = client.post(
        "/api/v1/auth/login", json={"email": "otp@test.rw", "password": "Password123"}
    )
    assert login.status_code == 200
    assert login.get_json()["accessToken"]


def test_otp_cleared_after_successful_verification(client, fixed_otp):
    _register(client)
    first = client.post("/api/v1/auth/verify-otp", json={"email": "otp@test.rw", "otp": fixed_otp})
    assert first.status_code == 200

    # The stored code is consumed (single use) so it can never be replayed.
    from app.repositories import users

    user = users.get_by_email("otp@test.rw")
    assert user.email_otp_hash is None
    assert user.email_otp_expires_at is None


def test_wrong_otp_rejected(client, fixed_otp):
    _register(client)
    resp = client.post("/api/v1/auth/verify-otp", json={"email": "otp@test.rw", "otp": "000000"})
    assert resp.status_code == 401


def test_resend_enforces_cooldown(client, fixed_otp):
    _register(client)
    # The registration just sent a code, so an immediate resend is rate-limited.
    resp = client.post("/api/v1/auth/resend-otp", json={"email": "otp@test.rw"})
    assert resp.status_code == 429


def test_resend_unknown_email_does_not_leak(client):
    # Unknown accounts get a generic 200 (no account enumeration).
    resp = client.post("/api/v1/auth/resend-otp", json={"email": "nobody@test.rw"})
    assert resp.status_code == 200
