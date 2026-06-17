"""RBAC helpers: current-user resolution + role/permission decorators."""
from __future__ import annotations

from functools import wraps

from flask import g
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from app.errors import ForbiddenError, UnauthorizedError
from app.models import User
from app.models.enums import UserRole
from app.repositories import users


def current_user() -> User:
    """Return the authenticated User, caching on ``flask.g`` per request.

    The cache is keyed by JWT identity so a reused application context (e.g. in
    tests, or any context shared across more than one authenticated request)
    never returns a stale user for a different token.
    """
    identity = get_jwt_identity()
    if not identity:
        raise UnauthorizedError("Authentication required")
    cached = g.get("current_user")
    if cached is not None and str(cached.id) == str(identity):
        return cached
    user = users.get(identity)
    if user is None:
        raise UnauthorizedError("User no longer exists")
    g.current_user = user
    return user


def roles_required(*allowed: str):
    """Require the JWT user to have one of the given roles."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            role = claims.get("role")
            if role not in allowed:
                raise ForbiddenError("Insufficient role for this resource")
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def permission_required(code: str):
    """Require the user's role to grant the given permission code."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = current_user()
            # Admins implicitly hold all permissions.
            if user.role_name == UserRole.admin:
                return fn(*args, **kwargs)
            granted = user.role.permission_codes() if user.role else set()
            if code not in granted:
                raise ForbiddenError(f"Missing permission: {code}")
            return fn(*args, **kwargs)

        return wrapper

    return decorator


admin_required = roles_required(UserRole.admin.value)
recruiter_required = roles_required(UserRole.recruiter.value, UserRole.admin.value)
candidate_required = roles_required(UserRole.candidate.value, UserRole.admin.value)
