"""Evidence capture: store proctoring media and expose it for recruiter review."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from werkzeug.datastructures import FileStorage

from app.errors import APIError, ForbiddenError, NotFoundError
from app.models.enums import EvidenceType, SessionStatus, UserRole
from app.repositories import evidence as evidence_repo
from app.repositories import sessions as sessions_repo
from app.services import audit_service, storage_service


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _resolve_type(raw: str | None, content_type: str | None) -> EvidenceType:
    if raw:
        try:
            return EvidenceType(raw)
        except ValueError:
            pass
    ct = (content_type or "").lower()
    if ct.startswith("video"):
        return EvidenceType.video
    if ct.startswith("audio"):
        return EvidenceType.audio
    if ct.startswith("image"):
        return EvidenceType.screenshot
    return EvidenceType.document


def _can_access(user, session) -> bool:
    if user.role_name in (UserRole.recruiter, UserRole.admin):
        return True
    return str(session.candidate_id) == str(user.id)


def upload(user, session_id, file: FileStorage, *, evidence_type: str | None = None,
           captured_at: datetime | None = None, metadata: dict | None = None):
    session = sessions_repo.get_or_404(session_id)
    if not _can_access(user, session):
        raise ForbiddenError("Not your session")

    if file is None or not file.filename:
        raise APIError("No file provided")

    from flask import current_app

    ext = _ext(file.filename)
    allowed = current_app.config.get("ALLOWED_UPLOAD_EXTENSIONS", set())
    if allowed and ext not in allowed:
        raise APIError(f"File type '.{ext}' is not allowed")

    data = file.read()
    max_bytes = current_app.config.get("MAX_CONTENT_LENGTH")
    if max_bytes and len(data) > max_bytes:
        raise APIError("File exceeds the maximum allowed size")
    if not data:
        raise APIError("Uploaded file is empty")

    storage_key = f"evidence/{session_id}/{uuid.uuid4().hex}.{ext or 'bin'}"
    stored = storage_service.save(data, storage_key=storage_key, content_type=file.mimetype)

    record = evidence_repo.create(
        session_id=session.id,
        type=_resolve_type(evidence_type, file.mimetype),
        storage_key=stored.storage_key,
        url=stored.url,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        captured_at=captured_at or datetime.now(timezone.utc),
        evidence_metadata=metadata,
    )
    audit_service.record("evidence.upload", user=user, resource=str(record.id),
                         details=f"{record.type.value} {stored.size_bytes}B")
    return record


def list_for_session(user, session_id):
    session = sessions_repo.get_or_404(session_id)
    if not _can_access(user, session):
        raise ForbiddenError("Not your session")
    return evidence_repo.for_session(str(session_id)).order_by(None).all()


def get_with_bytes(user, evidence_id):
    record = evidence_repo.get_or_404(evidence_id)
    session = sessions_repo.get_or_404(str(record.session_id))
    if not _can_access(user, session):
        raise ForbiddenError("Not permitted")
    data = storage_service.read(record.storage_key)
    return record, data
