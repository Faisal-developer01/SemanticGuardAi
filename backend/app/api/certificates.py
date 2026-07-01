"""Certificates & offer letters API.

Candidates list and download their own credentials; recruiters/admins can list
any, manually issue, or revoke. A public verification endpoint (no auth) backs
the QR-code landing page.
"""
from __future__ import annotations

from flask import Blueprint, Response, request
from flask_jwt_extended import jwt_required

from app.api.helpers import created, ok, paginated, pagination_args, parse, query_param
from app.errors import APIError, ForbiddenError
from app.models.enums import CredentialType, UserRole
from app.repositories import credentials as credentials_repo
from app.repositories import sessions as sessions_repo
from app.schemas import CredentialIssueSchema, CredentialSchema
from app.services import audit_service, certificate_service
from app.services.rbac import current_user, recruiter_required

bp = Blueprint("certificates", __name__)
_schema = CredentialSchema()


def _is_privileged(user) -> bool:
    return user.role_name in (UserRole.recruiter, UserRole.admin)


def _get_owned_or_privileged(credential_id):
    user = current_user()
    cred = credentials_repo.get_or_404(str(credential_id))
    if not _is_privileged(user) and str(cred.candidate_id) != str(user.id):
        raise ForbiddenError("Not your credential")
    return cred


# ─── public verification (no auth) ───────────────────────────────────────────

@bp.get("/verify/<token>")
def verify_credential(token):
    return ok(certificate_service.verify(token))


# ─── list / get ──────────────────────────────────────────────────────────────

@bp.get("")
@jwt_required()
def list_credentials():
    user = current_user()
    args = pagination_args()
    filters: dict = {}

    if _is_privileged(user):
        if query_param("candidateId"):
            filters["candidate_id"] = query_param("candidateId")
        query = None
    else:
        query = credentials_repo.for_candidate(user.id)

    if query_param("type"):
        try:
            filters["type"] = CredentialType(query_param("type"))
        except ValueError:
            pass
    if query_param("assessmentId"):
        filters["assessment_id"] = query_param("assessmentId")

    page = credentials_repo.paginate(**args, filters=filters or None, query=query)
    return paginated(page, _schema.dump)


@bp.get("/<uuid:credential_id>")
@jwt_required()
def get_credential(credential_id):
    return ok(_schema.dump(_get_owned_or_privileged(credential_id)))


# ─── download PDF ────────────────────────────────────────────────────────────

@bp.get("/<uuid:credential_id>/download")
@jwt_required()
def download_credential(credential_id):
    cred = _get_owned_or_privileged(credential_id)
    data = certificate_service.get_pdf_bytes(cred)
    filename = certificate_service.download_filename(cred)
    disposition = "inline" if request.args.get("inline") == "1" else "attachment"
    return Response(
        data,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


# ─── issue / revoke (recruiter/admin) ────────────────────────────────────────

@bp.post("")
@jwt_required()
@recruiter_required
def issue_credential():
    actor = current_user()
    data = parse(CredentialIssueSchema())
    try:
        credential_type = CredentialType(data["type"])
    except ValueError:
        raise APIError("type must be 'certificate' or 'offer_letter'")

    session = sessions_repo.get_or_404(data["session_id"])
    cred = certificate_service.issue(
        session,
        credential_type,
        position=data.get("position"),
        body=data.get("body"),
    )
    audit_service.record("credential.issue", user=actor, resource=str(cred.id), details=cred.number)
    return created(_schema.dump(cred))


@bp.post("/<uuid:credential_id>/revoke")
@jwt_required()
@recruiter_required
def revoke_credential(credential_id):
    actor = current_user()
    cred = credentials_repo.get_or_404(str(credential_id))
    reason = (request.get_json(silent=True) or {}).get("reason")
    cred.revoked = True
    cred.revoked_reason = reason
    credentials_repo.session.commit()
    audit_service.record("credential.revoke", user=actor, resource=str(cred.id), details=reason or "")
    return ok(_schema.dump(cred))
