"""Alerts API: list, filter, review/resolve."""
from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import ok, paginated, pagination_args, parse, query_param
from app.repositories import alerts as alert_repo
from app.schemas import AlertReviewSchema, AlertSchema
from app.services import audit_service
from app.services.rbac import current_user, recruiter_required

bp = Blueprint("alerts", __name__)
_schema = AlertSchema()


@bp.get("")
@jwt_required()
@recruiter_required
def list_alerts():
    args = pagination_args()
    query = None
    if query_param("reviewed") == "false":
        query = alert_repo.unreviewed()
    filters = {}
    if query_param("severity"):
        from app.models.enums import AlertSeverity

        filters["severity"] = AlertSeverity(query_param("severity"))
    page = alert_repo.paginate(**args, filters=filters or None, query=query)
    return paginated(page, _schema.dump)


@bp.get("/<uuid:alert_id>")
@jwt_required()
@recruiter_required
def get_alert(alert_id):
    return ok(_schema.dump(alert_repo.get_or_404(str(alert_id))))


@bp.post("/<uuid:alert_id>/review")
@jwt_required()
@recruiter_required
def review_alert(alert_id):
    data = parse(AlertReviewSchema())
    actor = current_user()
    alert = alert_repo.get_or_404(str(alert_id))
    alert.reviewed = True
    alert.reviewed_by = actor.id
    alert.reviewed_at = datetime.now(timezone.utc)
    alert.resolution_note = data.get("resolution_note")
    alert_repo.session.commit()
    audit_service.record("alert.review", user=actor, resource=str(alert.id))
    return ok(_schema.dump(alert))
