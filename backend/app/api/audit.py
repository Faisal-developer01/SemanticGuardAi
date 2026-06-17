"""Audit-log API (admin)."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import paginated, pagination_args, query_param
from app.repositories import audit_logs
from app.schemas import AuditLogSchema
from app.services.rbac import admin_required

bp = Blueprint("audit", __name__)
_schema = AuditLogSchema()


@bp.get("")
@jwt_required()
@admin_required
def list_audit_logs():
    args = pagination_args()
    filters = {}
    if query_param("action"):
        filters["action"] = query_param("action")
    page = audit_logs.paginate(**args, filters=filters or None)
    return paginated(page, _schema.dump)
