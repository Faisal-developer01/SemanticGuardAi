"""Audit logging service — records security-relevant actions."""
from __future__ import annotations

from flask import request

from app.models.enums import AuditStatus
from app.repositories import audit_logs


def record(
    action: str,
    *,
    user=None,
    resource: str | None = None,
    status: AuditStatus = AuditStatus.success,
    details: str | None = None,
    context: dict | None = None,
) -> None:
    """Write an audit-log entry. Never raises (best-effort)."""
    try:
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) if request else None
        ua = request.headers.get("User-Agent") if request else None
        audit_logs.create(
            user_id=getattr(user, "id", None),
            user_name=getattr(user, "full_name", None),
            user_role=getattr(user, "role_name", None),
            action=action,
            resource=resource,
            status=status,
            ip_address=ip,
            user_agent=ua,
            details=details,
            context=context,
        )
    except Exception:  # pragma: no cover - auditing must not break flows
        from app.extensions import db

        db.session.rollback()
