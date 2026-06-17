"""Assessment + AI monitoring configuration models."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import GUID, BaseModel
from app.models.enums import AssessmentStatus


class Assessment(BaseModel):
    __tablename__ = "assessments"

    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[str | None] = mapped_column(String(150), index=True)

    recruiter_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    recruiter: Mapped["User"] = relationship(lazy="selectin")  # noqa: F821

    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[AssessmentStatus] = mapped_column(
        Enum(AssessmentStatus, name="assessment_status"),
        default=AssessmentStatus.draft,
        nullable=False,
        index=True,
    )
    risk_threshold: Mapped[float] = mapped_column(Float, default=60.0, nullable=False)
    pass_mark: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # AI monitoring toggles
    monitor_face_detection: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    monitor_eye_tracking: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    monitor_phone_detection: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    monitor_tab_switch: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    monitor_audio_detection: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    monitor_suspicious_movement: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    questions: Mapped[list["Question"]] = relationship(  # noqa: F821
        back_populates="assessment", cascade="all, delete-orphan", order_by="Question.order"
    )
    sessions: Mapped[list["AssessmentSession"]] = relationship(  # noqa: F821
        back_populates="assessment", cascade="all, delete-orphan"
    )

    @property
    def total_questions(self) -> int:
        return len(self.questions)
