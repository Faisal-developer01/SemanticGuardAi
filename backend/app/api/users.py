"""User management API (admin)."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import created, ok, paginated, pagination_args, parse, query_param
from app.schemas import UserCreateSchema, UserUpdateSchema, user_schema
from app.services import user_service
from app.services.rbac import admin_required, current_user

bp = Blueprint("users", __name__)


@bp.get("")
@jwt_required()
@admin_required
def list_users():
    args = pagination_args()
    page = user_service.list_users(
        **args, role=query_param("role"), status=query_param("status")
    )
    return paginated(page, user_schema.dump)


@bp.post("")
@jwt_required()
@admin_required
def create_user():
    data = parse(UserCreateSchema())
    user = user_service.create_user(current_user(), data)
    return created(user_schema.dump(user))


@bp.get("/<uuid:user_id>")
@jwt_required()
@admin_required
def get_user(user_id):
    return ok(user_schema.dump(user_service.get_user(str(user_id))))


@bp.put("/<uuid:user_id>")
@jwt_required()
@admin_required
def update_user(user_id):
    data = parse(UserUpdateSchema(), partial=True)
    user = user_service.update_user(current_user(), str(user_id), data)
    return ok(user_schema.dump(user))


@bp.patch("/<uuid:user_id>/status")
@jwt_required()
@admin_required
def set_status(user_id):
    from app.api.helpers import body

    status = body().get("status")
    user = user_service.set_status(current_user(), str(user_id), status)
    return ok(user_schema.dump(user))


@bp.delete("/<uuid:user_id>")
@jwt_required()
@admin_required
def delete_user(user_id):
    user_service.delete_user(current_user(), str(user_id))
    return ok({"message": "User deleted"})
