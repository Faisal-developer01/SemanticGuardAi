"""User management service (admin CRUD)."""
from __future__ import annotations

from app.errors import ConflictError, NotFoundError
from app.models.enums import UserRole, UserStatus
from app.repositories import users
from app.services import audit_service
from app.services.auth_service import register as register_user


def list_users(*, page, per_page, search, sort_by, sort_dir, role=None, status=None):
    filters: dict = {}
    if role:
        filters["role_name"] = UserRole(role)
    if status:
        filters["status"] = UserStatus(status)
    return users.paginate(
        page=page, per_page=per_page, search=search, sort_by=sort_by,
        sort_dir=sort_dir, filters=filters or None,
    )


def get_user(user_id):
    return users.get_or_404(user_id)


def create_user(actor, data: dict):
    user, _token = register_user(data)
    # Admin-created accounts are pre-verified and active.
    user.email_verified = True
    user.status = UserStatus.active
    users.session.commit()
    audit_service.record("user.create", user=actor, resource=str(user.id))
    return user


def update_user(actor, user_id, data: dict):
    user = users.get_or_404(user_id)
    if "status" in data and data["status"]:
        data["status"] = UserStatus(data["status"])
    users.update(user, **data)
    audit_service.record("user.update", user=actor, resource=str(user.id))
    return user


def set_status(actor, user_id, status: str):
    user = users.get_or_404(user_id)
    user.status = UserStatus(status)
    users.session.commit()
    audit_service.record("user.status", user=actor, resource=str(user.id), details=status)
    return user


def delete_user(actor, user_id):
    user = users.get_or_404(user_id)
    users.delete(user)
    audit_service.record("user.delete", user=actor, resource=str(user_id))
