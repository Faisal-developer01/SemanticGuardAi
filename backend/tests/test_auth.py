"""Auth flow tests (Step 3)."""
from __future__ import annotations


def test_health(client):
    assert client.get("/health").status_code == 200


def test_register_and_login_flow(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "fullName": "New Candidate",
            "email": "new@test.rw",
            "password": "Password123",
            "role": "candidate",
        },
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["user"]["email"] == "new@test.rw"
    assert data["user"]["emailVerified"] is False

    # Cannot log in until verified.
    login = client.post("/api/v1/auth/login", json={"email": "new@test.rw", "password": "Password123"})
    assert login.status_code == 403


def test_login_success(client, candidate):
    resp = client.post(
        "/api/v1/auth/login", json={"email": "candidate@test.rw", "password": "Password123"}
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["accessToken"]
    assert body["refreshToken"]
    assert body["mfaRequired"] is False


def test_login_wrong_password(client, candidate):
    resp = client.post(
        "/api/v1/auth/login", json={"email": "candidate@test.rw", "password": "wrong"}
    )
    assert resp.status_code == 401


def test_me_requires_auth(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_returns_user(client, candidate, auth_header):
    resp = client.get("/api/v1/auth/me", headers=auth_header(client, "candidate@test.rw"))
    assert resp.status_code == 200
    assert resp.get_json()["user"]["role"] == "candidate"


def test_rbac_admin_only(client, candidate, auth_header):
    resp = client.get("/api/v1/users", headers=auth_header(client, "candidate@test.rw"))
    assert resp.status_code == 403
