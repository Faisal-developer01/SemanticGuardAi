"""Real-time proctoring channel (Socket.IO).

Architecture
------------
* Candidates push integrity events + live-status heartbeats over authenticated
  REST endpoints (``/sessions/:id/events`` and ``/sessions/:id/status``).
* Each REST write fans out to recruiters/admins over Socket.IO via
  :func:`broadcast_event` / :func:`broadcast_status`.
* Recruiters/admins open a Socket.IO connection, authenticate with their JWT
  access token, and ``join`` the ``monitor`` room to receive live updates.

Only one direction uses sockets (server -> monitors); the candidate -> server
direction stays on plain authenticated HTTP so it reuses the existing JWT
middleware and rate limiting. This keeps the candidate path simple and secure
while still giving recruiters a true push feed.
"""
from __future__ import annotations

from typing import Any

from flask import request, session as flask_session
from flask_jwt_extended import decode_token
from flask_socketio import disconnect, emit, join_room, leave_room

from app.extensions import socketio
from app.models.enums import SessionStatus, UserRole

MONITOR_ROOM = "monitor"


def _assessment_room(assessment_id: str) -> str:
    return f"assessment:{assessment_id}"


def _user_room(user_id: str) -> str:
    return f"user:{user_id}"


# ─── payload builders ────────────────────────────────────────────────────────

def live_session_payload(session) -> dict[str, Any]:
    """Serialize a session into the shape the monitoring UI consumes."""
    candidate = getattr(session, "candidate", None)
    assessment = getattr(session, "assessment", None)
    alert_count = len(getattr(session, "alerts", []) or [])
    return {
        "id": str(session.id),
        "sessionId": str(session.id),
        "candidateId": str(session.candidate_id),
        "candidateName": getattr(candidate, "full_name", None) or "Candidate",
        "assessmentId": str(session.assessment_id),
        "assessmentTitle": getattr(assessment, "title", None) or "Assessment",
        "status": session.status.value if session.status else None,
        "riskScore": session.risk_score or 0,
        "riskLevel": session.risk_level.value if session.risk_level else "low",
        "integrityScore": session.integrity_score if session.integrity_score is not None else 100,
        "tabSwitches": session.tab_switch_count or 0,
        "lookingAwayCount": session.looking_away_count or 0,
        "faceNotDetectedCount": session.face_not_detected_count or 0,
        "alertCount": alert_count,
        "isFlagged": session.status == SessionStatus.flagged
        or (session.risk_score or 0) >= 70,
        "liveStatus": session.live_status or None,
    }


def _alert_payload(alert) -> dict[str, Any] | None:
    if alert is None:
        return None
    return {
        "id": str(alert.id),
        "sessionId": str(alert.session_id),
        "candidateId": str(alert.candidate_id),
        "type": alert.type.value if alert.type else None,
        "severity": alert.severity.value if alert.severity else None,
        "description": alert.description,
        "riskScore": alert.risk_score or 0,
        "occurredAt": alert.occurred_at.isoformat() if alert.occurred_at else None,
    }


# ─── server -> monitors fan-out ──────────────────────────────────────────────

def _emit_to_monitors(event: str, payload: dict[str, Any], assessment_id: str | None) -> None:
    socketio.emit(event, payload, room=MONITOR_ROOM)
    if assessment_id:
        socketio.emit(event, payload, room=_assessment_room(assessment_id))


def broadcast_event(session, alert=None) -> None:
    """Push a session snapshot (and optional alert) to all monitors."""
    session_payload = live_session_payload(session)
    _emit_to_monitors("session_update", session_payload, str(session.assessment_id))
    alert_payload = _alert_payload(alert)
    if alert_payload:
        _emit_to_monitors("alert", alert_payload, str(session.assessment_id))


def broadcast_status(session) -> None:
    """Push a live-status heartbeat snapshot to all monitors."""
    _emit_to_monitors("session_update", live_session_payload(session), str(session.assessment_id))


def notify_user(user_id: str, payload: dict[str, Any]) -> None:
    """Push a notification to a single user's personal room."""
    socketio.emit("notification", payload, room=_user_room(str(user_id)))


# ─── socket connection lifecycle ─────────────────────────────────────────────

def _authenticate(auth: dict | None) -> dict | None:
    """Resolve the JWT from the socket handshake. Returns decoded claims."""
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    if not token:
        return None
    try:
        return decode_token(token)
    except Exception:
        return None


@socketio.on("connect")
def handle_connect(auth=None):
    claims = _authenticate(auth)
    if not claims:
        return False  # reject unauthenticated connections
    user_id = claims.get("sub")
    role = claims.get("role")
    # Remember identity for the lifetime of this socket connection so later
    # events (e.g. join_monitoring) can authorize without re-decoding a token.
    flask_session["user_id"] = user_id
    flask_session["role"] = role
    # Every authenticated user joins their personal room to receive notifications.
    if user_id:
        join_room(_user_room(str(user_id)))
    return True


@socketio.on("join_monitoring")
def handle_join_monitoring(data=None):
    """Recruiter/admin subscribes to live updates (optionally per assessment)."""
    role = flask_session.get("role")
    if role not in (UserRole.recruiter.value, UserRole.admin.value):
        emit("monitoring_denied", {"ok": False})
        return  # candidates may not watch the live feed
    join_room(MONITOR_ROOM)
    assessment_id = (data or {}).get("assessmentId") if isinstance(data, dict) else None
    if assessment_id:
        join_room(_assessment_room(str(assessment_id)))
    emit("monitoring_joined", {"ok": True})


@socketio.on("leave_monitoring")
def handle_leave_monitoring(data=None):
    leave_room(MONITOR_ROOM)
    assessment_id = (data or {}).get("assessmentId") if isinstance(data, dict) else None
    if assessment_id:
        leave_room(_assessment_room(str(assessment_id)))


@socketio.on("disconnect")
def handle_disconnect():  # pragma: no cover - cleanup is automatic
    leave_room(MONITOR_ROOM)
    user_id = flask_session.get("user_id")
    if user_id:
        leave_room(_user_room(str(user_id)))
