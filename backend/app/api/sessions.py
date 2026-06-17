"""Assessment session API: start, answer, submit, monitoring events."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import created, ok, paginated, pagination_args, parse, query_param
from app.models.enums import UserRole
from app.schemas import (
    AlertSchema,
    AnswerSubmitSchema,
    IntegrityEventSchema,
    SessionSchema,
    SessionStartSchema,
)
from app.services import session_service
from app.services.rbac import current_user, recruiter_required

bp = Blueprint("sessions", __name__)

_session_schema = SessionSchema()
_alert_schema = AlertSchema()


@bp.post("")
@jwt_required()
def start_session():
    data = parse(SessionStartSchema())
    session = session_service.start_session(current_user(), data["assessment_id"])
    return created(_session_schema.dump(session))


@bp.get("")
@jwt_required()
def list_sessions():
    from app.repositories import sessions as session_repo

    user = current_user()
    args = pagination_args()
    if user.role_name == UserRole.candidate:
        query = session_repo.for_candidate(user.id)
    elif query_param("assessmentId"):
        query = session_repo.for_assessment(query_param("assessmentId"))
    else:
        query = None
    page = session_repo.paginate(**args, query=query)
    return paginated(page, _session_schema.dump)


@bp.get("/<uuid:session_id>")
@jwt_required()
def get_session(session_id):
    session = session_service.get_session(current_user(), str(session_id))
    return ok(_session_schema.dump(session))


@bp.post("/<uuid:session_id>/answers")
@jwt_required()
def save_answer(session_id):
    data = parse(AnswerSubmitSchema())
    session_service.save_answer(
        current_user(), str(session_id), data["question_id"],
        data.get("response"), data.get("selected_language"),
    )
    return ok({"message": "Answer saved"})


@bp.post("/<uuid:session_id>/submit")
@jwt_required()
def submit_session(session_id):
    session = session_service.submit_session(current_user(), str(session_id))
    return ok(_session_schema.dump(session))


@bp.post("/<uuid:session_id>/events")
@jwt_required()
def ingest_event(session_id):
    data = parse(IntegrityEventSchema())
    session, _event, alert = session_service.ingest_event(
        current_user(), str(session_id), data["type"],
        confidence=data.get("confidence", 0.0), severity=data.get("severity"),
        occurred_at=data.get("occurred_at"), payload=data.get("payload"),
    )
    # Broadcast to recruiters watching this session (Step 4 realtime).
    try:
        from app.realtime import broadcast_event

        broadcast_event(session, alert)
    except Exception:
        pass
    return ok({
        "session": _session_schema.dump(session),
        "alert": _alert_schema.dump(alert) if alert else None,
    })


@bp.get("/<uuid:session_id>/alerts")
@jwt_required()
@recruiter_required
def session_alerts(session_id):
    from app.repositories import alerts as alert_repo

    rows = alert_repo.for_session(str(session_id)).order_by(None).all()
    return ok([_alert_schema.dump(a) for a in rows])


@bp.get("/live")
@jwt_required()
@recruiter_required
def live_sessions():
    """Active (in-progress) sessions with their latest monitoring snapshot."""
    from app.realtime import live_session_payload

    rows = session_service.active_sessions()
    return ok([live_session_payload(s) for s in rows])


@bp.post("/<uuid:session_id>/status")
@jwt_required()
def update_status(session_id):
    """Candidate live-status heartbeat — persists the AI snapshot and fans
    it out to recruiters/admins watching the live feed."""
    from app.api.helpers import body

    status = body().get("status") or {}
    session = session_service.update_live_status(current_user(), str(session_id), status)
    try:
        from app.realtime import broadcast_status

        broadcast_status(session)
    except Exception:
        pass
    return ok({"message": "Status updated"})

