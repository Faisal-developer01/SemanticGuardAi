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


def test_registration_ignores_entered_candidate_id(client, app, monkeypatch):
    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    response = client.post("/api/v1/auth/register", json={
        "fullName": "New Candidate",
        "email": "registered-id@test.rw",
        "password": "Password123",
        "candidateId": " CAND2024001 ",
    })
    assert response.status_code == 201
    user = response.get_json()["user"]
    assert user["candidateProfile"]["candidateCode"].startswith("CND-")
    assert user["candidateProfile"]["candidateCode"] != "CAND2024001"
    assert user["id"] != "CAND2024001"


def test_registration_does_not_reuse_existing_candidate_id(client, candidate, app, monkeypatch):
    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    response = client.post("/api/v1/auth/register", json={
        "fullName": "Another Candidate",
        "email": "duplicate-id@test.rw",
        "password": "Password123",
        "candidateId": "CND-TEST-1",
    })
    assert response.status_code == 201
    from app.repositories import users
    new_user = users.get_by_email("duplicate-id@test.rw")
    assert new_user.candidate_profile.candidate_code != "CND-TEST-1"
    assert candidate.candidate_profile.candidate_code == "CND-TEST-1"


def test_registration_without_candidate_id_keeps_generated_code(client, app, monkeypatch):
    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    response = client.post("/api/v1/auth/register", json={
        "fullName": "Legacy Candidate",
        "email": "legacy-id@test.rw",
        "password": "Password123",
    })
    assert response.status_code == 201
    assert response.get_json()["user"]["candidateProfile"]["candidateCode"].startswith("CND-")


def test_registration_ids_are_unique_and_persisted(client, app, monkeypatch, auth_header):
    from app.extensions import db
    from app.repositories import users

    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    codes = []
    for index in range(2):
        email = f"generated-{index}@test.rw"
        response = client.post("/api/v1/auth/register", json={
            "fullName": "Generated Candidate",
            "email": email,
            "password": "Password123",
            "department": "Software Engineering",
        })
        assert response.status_code == 201
        registered = response.get_json()["user"]
        code = registered["candidateProfile"]["candidateCode"]
        assert code.startswith("CND-")
        assert len(code) == 36
        db.session.expire_all()
        stored = users.get_by_email(email)
        assert stored.candidate_profile.candidate_code == code
        assert str(stored.candidate_profile.user_id) == registered["id"]
        profile = client.get("/api/v1/auth/me", headers=auth_header(client, email))
        assert profile.get_json()["user"]["candidateProfile"]["candidateCode"] == code
        codes.append(code)
    assert len(set(codes)) == 2


def test_registration_retries_generated_id_collision(client, candidate, app, monkeypatch):
    from app.services import auth_service
    from app.repositories import candidate_profiles, users

    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    tokens = iter(["TEST-1", "A" * 32])
    monkeypatch.setattr(auth_service.secrets, "token_hex", lambda size: next(tokens))
    existing_user_id = candidate.id
    existing_profile_id = candidate.candidate_profile.id
    response = client.post("/api/v1/auth/register", json={
        "fullName": "Collision Candidate",
        "email": "collision@test.rw",
        "password": "Password123",
    })
    assert response.status_code == 201
    assert response.get_json()["user"]["candidateProfile"]["candidateCode"] == f"CND-{'A' * 32}"
    assert candidate_profiles.find_one(candidate_code="CND-TEST-1").id == existing_profile_id
    assert candidate_profiles.get(existing_profile_id).user_id == existing_user_id
    assert users.get(existing_user_id).email == "candidate@test.rw"
    assert len(candidate_profiles.all()) == 2


def test_registration_collision_exhaustion_rolls_back_account(client, candidate, app, monkeypatch):
    from app.services import auth_service
    from app.repositories import candidate_profiles, users

    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    monkeypatch.setattr(auth_service.secrets, "token_hex", lambda size: "TEST-1")
    response = client.post("/api/v1/auth/register", json={
        "fullName": "Collision Candidate",
        "email": "exhausted@test.rw",
        "password": "Password123",
    })
    assert response.status_code == 409
    assert users.get_by_email("exhausted@test.rw") is None
    assert len(candidate_profiles.all()) == 1
    assert candidate.candidate_profile.candidate_code == "CND-TEST-1"


def test_candidate_id_database_constraint(candidate, recruiter):
    import pytest
    from sqlalchemy.exc import IntegrityError
    from app.extensions import db
    from app.models import CandidateProfile

    with pytest.raises(IntegrityError):
        with db.session.begin_nested():
            db.session.add(CandidateProfile(
                user_id=recruiter.id,
                candidate_code=candidate.candidate_profile.candidate_code,
            ))
            db.session.flush()


def test_recruiter_registration_does_not_create_candidate_profile(client, app, monkeypatch):
    monkeypatch.setitem(app.config, "AUTH_AUTO_VERIFY_EMAIL", True)
    response = client.post("/api/v1/auth/register", json={
        "fullName": "New Recruiter",
        "email": "new-recruiter@test.rw",
        "password": "Password123",
        "role": "recruiter",
    })
    assert response.status_code == 201
    user = response.get_json()["user"]
    assert user["candidateProfile"] is None
    assert user["recruiterProfile"]["recruiterCode"].startswith("REC-")


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
