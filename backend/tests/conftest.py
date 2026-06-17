"""Pytest fixtures: app, client, db, and authenticated users."""
from __future__ import annotations

import os

os.environ.setdefault("FLASK_ENV", "testing")

import pytest

from app import create_app
from app.extensions import db as _db
from app.models.enums import UserRole, UserStatus
from app.repositories import roles as role_repo
from app.security import hash_password


@pytest.fixture(scope="session")
def _app():
    app = create_app("testing")
    ctx = app.app_context()
    ctx.push()
    _db.create_all()
    ctx.pop()
    yield app


@pytest.fixture(autouse=True)
def app(_app):
    """Push a fresh application context per test for full isolation of the
    scoped session and ``flask.g``."""
    ctx = _app.app_context()
    ctx.push()
    try:
        yield _app
    finally:
        _db.session.rollback()
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()
        _db.session.remove()
        ctx.pop()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_user(email, password, role, status=UserStatus.active, verified=True):
    from app.models import User

    user = User(
        full_name=f"{role.value.title()} User",
        email=email,
        password_hash=hash_password(password),
        role_name=role,
        status=status,
        email_verified=verified,
    )
    _db.session.add(user)
    _db.session.commit()
    return user


@pytest.fixture()
def admin(app):
    return _make_user("admin@test.rw", "Password123", UserRole.admin)


@pytest.fixture()
def recruiter(app):
    return _make_user("recruiter@test.rw", "Password123", UserRole.recruiter)


@pytest.fixture()
def candidate(app):
    from app.models import CandidateProfile

    user = _make_user("candidate@test.rw", "Password123", UserRole.candidate)
    _db.session.add(CandidateProfile(user_id=user.id, candidate_code="CND-TEST-1"))
    _db.session.commit()
    return user


def _login(client, email, password="Password123"):
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return resp.get_json()["accessToken"]


@pytest.fixture()
def auth_header():
    def _make(client, email):
        token = _login(client, email)
        return {"Authorization": f"Bearer {token}"}

    return _make
