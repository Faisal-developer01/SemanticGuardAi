"""Auth flow tests (Step 3)."""
from __future__ import annotations


def test_health(client):
    assert client.get("/health").status_code == 200


def test_no_whatsapp_routes_or_tasks(app):
    from app import tasks

    assert not any("whatsapp" in rule.rule for rule in app.url_map.iter_rules())
    assert not any(name.startswith("whatsapp.") for name in tasks.celery.tasks)


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
    assert not any("whatsapp" in key.lower() for key in data)
    assert not any("whatsapp" in key.lower() for key in data["user"])

    # Cannot log in until verified.
    login = client.post("/api/v1/auth/login", json={"email": "new@test.rw", "password": "Password123"})
    assert login.status_code == 403


def test_registration_preserves_entered_candidate_id(client, app, monkeypatch):
    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    response = client.post("/api/v1/auth/register", json={
        "fullName": "New Candidate",
        "email": "registered-id@test.rw",
        "password": "Password123",
        "candidateId": " CAND2024001 ",
    })
    assert response.status_code == 201
    user = response.get_json()["user"]
    assert user["candidateProfile"]["candidateCode"] == "CAND2024001"
    assert user["id"] != "CAND2024001"


def test_registration_rejects_duplicate_candidate_id(client, candidate, app, monkeypatch):
    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    response = client.post("/api/v1/auth/register", json={
        "fullName": "Another Candidate",
        "email": "duplicate-id@test.rw",
        "password": "Password123",
        "candidateId": "CND-TEST-1",
    })
    assert response.status_code == 409
    from app.repositories import users
    assert users.get_by_email("duplicate-id@test.rw") is None


def test_registration_without_candidate_id_keeps_generated_code(client, app, monkeypatch):
    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    response = client.post("/api/v1/auth/register", json={
        "fullName": "Legacy Candidate",
        "email": "legacy-id@test.rw",
        "password": "Password123",
    })
    assert response.status_code == 201
    assert response.get_json()["user"]["candidateProfile"]["candidateCode"].startswith("CND-")


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
