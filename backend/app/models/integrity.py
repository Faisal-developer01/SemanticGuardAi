"""Integrity events, alerts, and evidence captured during monitoring."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import GUID, BaseModel
from app.models.enums import AlertSeverity, AlertType, EvidenceType


class IntegrityEvent(BaseModel):
    """Raw signal emitted by the AI monitoring pipeline (high volume)."""

    __tablename__ = "integrity_events"

    session_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session: Mapped["AssessmentSession"] = relationship(back_populates="integrity_events")  # noqa: F821

    type: Mapped[AlertType] = mapped_column(Enum(AlertType, name="integrity_event_type"), nullable=False, index=True)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="event_severity"), default=AlertSeverity.low, nullable=False
    )
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    risk_delta: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    payload: Mapped[dict | None] = mapped_column(JSON)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Alert(BaseModel):
    """Aggregated, reviewable alert raised from one or more integrity events."""

    __tablename__ = "alerts"

    session_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session: Mapped["AssessmentSession"] = relationship(back_populates="alerts")  # noqa: F821

    assessment_id: Mapped[str] = mapped_column(GUID(), ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    candidate_id: Mapped[str] = mapped_column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    type: Mapped[AlertType] = mapped_column(Enum(AlertType, name="alert_type"), nullable=False, index=True)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_severity"), default=AlertSeverity.medium, nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(Text)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    reviewed_by: Mapped[str | None] = mapped_column(GUID(), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)

    evidence: Mapped[list["Evidence"]] = relationship(back_populates="alert", cascade="all, delete-orphan")


class Evidence(BaseModel):
    """Stored media (screenshot/video/audio) backing an alert or event."""

    __tablename__ = "evidence"

    session_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alert_id: Mapped[str | None] = mapped_column(GUID(), ForeignKey("alerts.id", ondelete="CASCADE"), index=True)
    alert: Mapped["Alert | None"] = relationship(back_populates="evidence")

    type: Mapped[EvidenceType] = mapped_column(
        Enum(EvidenceType, name="evidence_type"), default=EvidenceType.screenshot, nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)  # blob path / object key
    url: Mapped[str | None] = mapped_column(String(1024))
    content_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))  # tamper-evidence checksum
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    evidence_metadata: Mapped[dict | None] = mapped_column(JSON)
