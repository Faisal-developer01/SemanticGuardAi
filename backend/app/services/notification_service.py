"""Notification service: persist a notification and push it in real time.

Notifications are written to the database (so they survive reloads and appear in
the notification centre) and simultaneously pushed to the recipient's personal
Socket.IO room (``user:{id}``) so connected clients update instantly without
polling.
"""
from __future__ import annotations

from typing import Any

from app.models.enums import AlertSeverity, NotificationType
from app.repositories import notifications


def serialize(notif) -> dict[str, Any]:
    """Shape a Notification into the payload the frontend consumes (camelCase)."""
    return {
        "id": str(notif.id),
        "title": notif.title,
        "message": notif.message,
        "type": notif.type.value if notif.type else NotificationType.info.value,
        "read": notif.read,
        "link": notif.link,
        "createdAt": notif.created_at.isoformat() if notif.created_at else None,
    }


def push(notif) -> None:
    """Emit an existing notification to its owner's live room."""
    # Imported lazily to avoid importing the socket layer at module load.
    from app.realtime import notify_user

    notify_user(str(notif.user_id), serialize(notif))


def create(
    user_id,
    title: str,
    message: str,
    *,
    type: NotificationType = NotificationType.info,
    link: str | None = None,
    realtime: bool = True,
    commit: bool = True,
):
    """Persist a notification for ``user_id`` and (optionally) push it live."""
    notif = notifications.create(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        link=link,
        read=False,
        commit=commit,
    )
    if realtime:
        push(notif)
    return notif


def _type_for_alert(alert) -> NotificationType:
    """Map an alert to a notification importance.

    An Alert row is only created for noteworthy events, so the floor is
    ``warning``; high/critical severity or an inherently serious detection
    (phone, extra faces, identity mismatch, prohibited object) escalates to
    ``alert``.
    """
    from app.services.risk_engine import ALERTABLE

    if alert.severity in (AlertSeverity.high, AlertSeverity.critical) or alert.type in ALERTABLE:
        return NotificationType.alert
    return NotificationType.warning


def notify_alert(session, alert) -> None:
    """Notify the recruiter who owns the assessment that an integrity alert fired."""
    assessment = getattr(session, "assessment", None)
    recruiter_id = getattr(assessment, "recruiter_id", None)
    if not recruiter_id:
        return
    candidate = getattr(session, "candidate", None)
    candidate_name = getattr(candidate, "full_name", None) or "A candidate"
    create(
        recruiter_id,
        title=f"{alert.severity.value.title()} integrity alert",
        message=f"{candidate_name}: {alert.description}",
        type=_type_for_alert(alert),
        link="/recruiter/monitoring",
    )
