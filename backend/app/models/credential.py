"""Issued credentials: completion certificates and offer letters.

A single table backs both artifact types (distinguished by ``type``). Each row
is a verifiable record: it carries a unique human-readable ``number`` and an
opaque ``verification_token`` encoded in the PDF's QR code, so a third party can
confirm authenticity via the public verification endpoint without logging in.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import GUID, BaseModel
from app.models.enums import CredentialType


class Credential(BaseModel):
    """A completion certificate or offer letter issued to a candidate."""

    __tablename__ = "credentials"

    type: Mapped[CredentialType] = mapped_column(
        Enum(CredentialType, name="credential_type"), nullable=False, index=True
    )
    number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    verification_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    candidate_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    candidate: Mapped["User"] = relationship(lazy="selectin")  # noqa: F821

    assessment_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("assessments.id", ondelete="SET NULL"), index=True
    )
    session_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("assessment_sessions.id", ondelete="SET NULL"), index=True
    )

    # Snapshot of the details as printed (kept even if the source records change).
    candidate_name: Mapped[str] = mapped_column(String(160), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[str | None] = mapped_column(String(160))
    department: Mapped[str | None] = mapped_column(String(160))
    integrity_score: Mapped[float | None] = mapped_column(Float)
    score: Mapped[float | None] = mapped_column(Float)
    percentage: Mapped[float | None] = mapped_column(Float)

    body: Mapped[str | None] = mapped_column(Text)  # offer-letter joining instructions

    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    file_path: Mapped[str | None] = mapped_column(String(400))  # cached PDF on disk

    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(200))
