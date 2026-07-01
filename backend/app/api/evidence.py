"""Evidence API: stream stored proctoring media for recruiter review."""
from __future__ import annotations

from flask import Blueprint, Response, request
from flask_jwt_extended import jwt_required

from app.services import evidence_service
from app.services.rbac import current_user

bp = Blueprint("evidence", __name__)


@bp.get("/<uuid:evidence_id>/download")
@jwt_required()
def download_evidence(evidence_id):
    record, data = evidence_service.get_with_bytes(current_user(), str(evidence_id))
    disposition = "inline" if request.args.get("inline") == "1" else "attachment"
    filename = f"{record.type.value}-{record.id}"
    return Response(
        data,
        mimetype=record.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )
