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
        if role == UserRole.candidate.value:
            socketio.emit(
                "presence_change",
                {"userId": str(user_id), "status": "online"},
                room=MONITOR_ROOM,
            )
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


# ─── candidate -> monitors live video (WebRTC signaling) ─────────────────────
#
# Live video uses WebRTC for continuous, low-latency peer-to-peer streaming.
# The candidate is the publisher; each recruiter/admin is a viewer. Socket.IO
# only carries the signaling handshake (offer / answer / ICE) — the media itself
# flows directly between browsers over the peer connection.
#
# Routing is done through each participant's personal ``user:{id}`` room so a
# message is delivered to exactly one participant. The sender identity
# (``fromId`` / ``viewerId`` / ``candidateId``) is always derived from the
# authenticated socket session, never trusted from the client payload, so a
# candidate cannot impersonate another participant's feed.


def _is_monitor(role: str | None) -> bool:
    return role in (UserRole.recruiter.value, UserRole.admin.value)


@socketio.on("webrtc_request")
def handle_webrtc_request(data=None):
    """Viewer asks a candidate to open a live video peer connection."""
    if not isinstance(data, dict):
        return
    role = flask_session.get("role")
    viewer_id = flask_session.get("user_id")
    if not _is_monitor(role) or not viewer_id:
        return  # only recruiters/admins may request a candidate's feed
    candidate_id = data.get("candidateId")
    if not candidate_id:
        return
    socketio.emit(
        "webrtc_request",
        {
            "viewerId": str(viewer_id),
            "sessionId": str(data.get("sessionId")) if data.get("sessionId") else None,
            "candidateId": str(candidate_id),
        },
        room=_user_room(str(candidate_id)),
    )


@socketio.on("webrtc_offer")
def handle_webrtc_offer(data=None):
    """Candidate sends an SDP offer to a specific viewer."""
    if not isinstance(data, dict):
        return
    role = flask_session.get("role")
    user_id = flask_session.get("user_id")
    if role != UserRole.candidate.value or not user_id:
        return
    viewer_id = data.get("viewerId")
    sdp = data.get("sdp")
    if not viewer_id or not sdp:
        return
    socketio.emit(
        "webrtc_offer",
        {
            "candidateId": str(user_id),
            "sessionId": str(data.get("sessionId")) if data.get("sessionId") else None,
            "sdp": sdp,
        },
        room=_user_room(str(viewer_id)),
    )


@socketio.on("webrtc_answer")
def handle_webrtc_answer(data=None):
    """Viewer sends an SDP answer back to the candidate."""
    if not isinstance(data, dict):
        return
    role = flask_session.get("role")
    viewer_id = flask_session.get("user_id")
    if not _is_monitor(role) or not viewer_id:
        return
    candidate_id = data.get("candidateId")
    sdp = data.get("sdp")
    if not candidate_id or not sdp:
        return
    socketio.emit(
        "webrtc_answer",
        {"viewerId": str(viewer_id), "candidateId": str(candidate_id), "sdp": sdp},
        room=_user_room(str(candidate_id)),
    )


@socketio.on("webrtc_ice")
def handle_webrtc_ice(data=None):
    """Relay a trickled ICE candidate to the other peer (bidirectional)."""
    if not isinstance(data, dict):
        return
    from_id = flask_session.get("user_id")
    if not from_id:
        return
    target_id = data.get("targetId")
    candidate = data.get("candidate")
    if not target_id or candidate is None:
        return
    socketio.emit(
        "webrtc_ice",
        {"fromId": str(from_id), "candidate": candidate},
        room=_user_room(str(target_id)),
    )


@socketio.on("webrtc_stop")
def handle_webrtc_stop(data=None):
    """Tear down a peer connection (viewer closed a card, or candidate submitted)."""
    if not isinstance(data, dict):
        return
    from_id = flask_session.get("user_id")
    if not from_id:
        return
    target_id = data.get("targetId")
    if not target_id:
        return
    socketio.emit(
        "webrtc_stop",
        {"fromId": str(from_id)},
        room=_user_room(str(target_id)),
    )


@socketio.on("disconnect")
def handle_disconnect():  # pragma: no cover - cleanup is automatic
    leave_room(MONITOR_ROOM)
    user_id = flask_session.get("user_id")
    role = flask_session.get("role")
    if user_id:
        leave_room(_user_room(str(user_id)))
        if role == UserRole.candidate.value:
            socketio.emit(
                "presence_change",
                {"userId": str(user_id), "status": "offline"},
                room=MONITOR_ROOM,
            )
            # Send SMS warning recruiter that candidate closed browser / went offline
            from app.repositories import sessions as session_repo
            active_session = session_repo.base_query().filter_by(
                candidate_id=user_id, status=SessionStatus.in_progress
            ).first()
            if active_session:
                from app.services.sms_service import deliver_offline_alert
                deliver_offline_alert(active_session)
                # Also push an in-app notification to the recruiter (online now).
                try:
                    from app.services import notification_service

                    notification_service.notify_disconnect(active_session)
                except Exception:  # noqa: BLE001 - best-effort
                    pass
