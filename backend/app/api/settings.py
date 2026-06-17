"""System settings API (admin)."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import body, ok
from app.repositories import system_settings
from app.services import audit_service
from app.services.rbac import admin_required, current_user

bp = Blueprint("settings", __name__)


@bp.get("")
@jwt_required()
@admin_required
def list_settings():
    return ok({s.key: s.value for s in system_settings.all()})


@bp.get("/<string:key>")
@jwt_required()
@admin_required
def get_setting(key):
    return ok({"key": key, "value": system_settings.get_value(key)})


@bp.put("/<string:key>")
@jwt_required()
@admin_required
def set_setting(key):
    payload = body()
    actor = current_user()
    setting = system_settings.set_value(
        key, payload.get("value"), description=payload.get("description"), updated_by=actor.id
    )
    audit_service.record("settings.update", user=actor, resource=key)
    return ok({"key": setting.key, "value": setting.value})
