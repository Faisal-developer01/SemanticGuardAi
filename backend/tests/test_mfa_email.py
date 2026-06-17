"""Email-based MFA: enrolment via emailed code, then login gated by that code."""
from __future__ import annotations

import pytest

from app.services import auth_service


@pytest.fixture()
def fixed_code(monkeypatch):
    """Force a deterministic 6-digit code so we can replay the email OTP."""
    code = "246813"
    monkeypatch.setattr(auth_service, "generate_numeric_code", lambda digits=6: code)
    return code


def _auth_header(client, email):
    token = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Password123"}
    ).get_json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


def test_enroll_email_mfa_and_login(client, candidate, fixed_code):
    headers = _auth_header(client, "candidate@test.rw")

    # 1) Request email MFA enrolment -> a code is generated + (suppressed) emailed.
    setup = client.post("/api/v1/auth/mfa/setup", json={"method": "email"}, headers=headers)
    assert setup.status_code == 200
    assert setup.get_json()["method"] == "email"
    assert "candidate@test.rw" in setup.get_json()["destination"]

    # 2) Confirm with the emailed code -> MFA enabled via email.
    confirm = client.post("/api/v1/auth/mfa/confirm", json={"code": fixed_code}, headers=headers)
    assert confirm.status_code == 200

    # 3) Plain login now requires a second factor and triggers a fresh code.
    pending = client.post(
        "/api/v1/auth/login", json={"email": "candidate@test.rw", "password": "Password123"}
    ).get_json()
    assert pending["mfaRequired"] is True
    assert pending["mfaMethod"] == "email"
    assert "accessToken" not in pending

    # 4) Supplying the emailed code completes the login.
    done = client.post(
        "/api/v1/auth/login",
        json={"email": "candidate@test.rw", "password": "Password123", "mfaCode": fixed_code},
    ).get_json()
    assert done["mfaRequired"] is False
    assert done["accessToken"]


def test_wrong_email_code_is_rejected(client, candidate, fixed_code):
    headers = _auth_header(client, "candidate@test.rw")
    client.post("/api/v1/auth/mfa/setup", json={"method": "email"}, headers=headers)
    client.post("/api/v1/auth/mfa/confirm", json={"code": fixed_code}, headers=headers)

    # Trigger a code, then submit the wrong one.
    client.post("/api/v1/auth/login", json={"email": "candidate@test.rw", "password": "Password123"})
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "candidate@test.rw", "password": "Password123", "mfaCode": "000000"},
    )
    assert resp.status_code == 401
