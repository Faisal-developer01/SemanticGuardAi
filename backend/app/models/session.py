"""Assessment session (a candidate's attempt) + per-question answers."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import GUID, BaseModel
from app.models.enums import RiskLevel, SessionStatus


class AssessmentSession(BaseModel):
    __tablename__ = "assessment_sessions"

    assessment_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assessment: Mapped["Assessment"] = relationship(back_populates="sessions")  # noqa: F821

    candidate_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    candidate: Mapped["User"] = relationship(lazy="selectin")  # noqa: F821

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status"), default=SessionStatus.in_progress, nullable=False, index=True
    )

    # Scoring
    score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    percentage: Mapped[float | None] = mapped_column(Float)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    # Result pipeline state: 'graded' (objective grading complete), 'processing'
    # (short-answer/manual evaluation pending), or 'under_review' (flagged for
    # integrity review). Drives the candidate's live result status.
    grading_status: Mapped[str | None] = mapped_column(String(20))

    # Integrity
    integrity_score: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel, name="risk_level"), default=RiskLevel.low, nullable=False, index=True
    )
    tab_switch_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    looking_away_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    face_not_detected_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Proctoring: live monitoring can be toggled per session, and a session is
    # marked flagged the moment a serious integrity violation is detected (kept
    # separate from ``status`` so the attempt can continue while flagged).
    monitoring_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="1", nullable=False
    )
    flagged: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False, index=True
    )
    flagged_reason: Mapped[str | None] = mapped_column(String(120))
    flagged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Live monitoring snapshot (latest AIMonitoringStatus payload)
    live_status: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))

    # Device fingerprinting: a stable hash of the candidate's browser/device plus
    # the raw characteristics, used to detect impersonation, second devices, and
    # concurrent multi-device logins for the same candidate.
    device_fingerprint: Mapped[str | None] = mapped_column(String(64), index=True)
    device_info: Mapped[dict | None] = mapped_column(JSON)

    answers: Mapped[list["Answer"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    integrity_events: Mapped[list["IntegrityEvent"]] = relationship(  # noqa: F821
        back_populates="session", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        back_populates="session", cascade="all, delete-orphan"
    )


class Answer(BaseModel):
    __tablename__ = "answers"

    session_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session: Mapped[AssessmentSession] = relationship(back_populates="answers")

    question_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )

    response: Mapped[str | None] = mapped_column(Text)
    selected_language: Mapped[str | None] = mapped_column(String(30))
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    awarded_marks: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    test_results: Mapped[dict | None] = mapped_column(JSON)  # coding-question run results

    # Behavioural biometrics captured while answering (typing rhythm, paste
    # activity) and the derived code-integrity analysis (plagiarism similarity +
    # AI-generated-code likelihood) computed at submission time.
    keystroke_stats: Mapped[dict | None] = mapped_column(JSON)
    code_analysis: Mapped[dict | None] = mapped_column(JSON)
