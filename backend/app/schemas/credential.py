"""Schemas for issued credentials (certificates and offer letters)."""
from __future__ import annotations

from marshmallow import EXCLUDE, Schema, fields

from app.schemas.common import CamelCaseSchema, UTCDateTime


class CredentialSchema(CamelCaseSchema):
    """Full credential record returned to the owner or a recruiter/admin."""

    id = fields.Str(dump_only=True)
    type = fields.Function(lambda o: o.type.value if o.type else None, dump_only=True)
    number = fields.Str(dump_only=True)
    verification_token = fields.Str(dump_only=True)
    candidate_id = fields.Str(dump_only=True)
    assessment_id = fields.Str(dump_only=True, allow_none=True)
    session_id = fields.Str(dump_only=True, allow_none=True)
    candidate_name = fields.Str(dump_only=True)
    title = fields.Str(dump_only=True)
    position = fields.Str(dump_only=True, allow_none=True)
    department = fields.Str(dump_only=True, allow_none=True)
    integrity_score = fields.Float(dump_only=True, allow_none=True)
    score = fields.Float(dump_only=True, allow_none=True)
    percentage = fields.Float(dump_only=True, allow_none=True)
    body = fields.Str(dump_only=True, allow_none=True)
    issued_at = UTCDateTime(dump_only=True)
    revoked = fields.Bool(dump_only=True)
    created_at = UTCDateTime(dump_only=True)


class CredentialPublicSchema(Schema):
    """Minimal, unauthenticated verification payload (QR-code landing)."""

    class Meta:
        unknown = EXCLUDE

    valid = fields.Bool()
    type = fields.Str()
    number = fields.Str()
    candidateName = fields.Str()
    title = fields.Str()
    position = fields.Str(allow_none=True)
    integrityScore = fields.Float(allow_none=True)
    issuedAt = fields.Str(allow_none=True)
    revoked = fields.Bool()
    issuer = fields.Str()


class CredentialIssueSchema(Schema):
    """Recruiter/admin request to manually issue a credential for a session."""

    class Meta:
        unknown = EXCLUDE

    session_id = fields.Str(required=True, data_key="sessionId")
    type = fields.Str(required=True)
    position = fields.Str(load_default=None)
    body = fields.Str(load_default=None)
