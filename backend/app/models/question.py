"""Question model + options and coding test cases."""
from __future__ import annotations

from sqlalchemy import Boolean, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import GUID, BaseModel
from app.models.enums import CodingLanguage, QuestionDifficulty, QuestionType


class Question(BaseModel):
    __tablename__ = "questions"

    assessment_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assessment: Mapped["Assessment"] = relationship(back_populates="questions")  # noqa: F821

    text: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, name="question_type"), default=QuestionType.multiple_choice, nullable=False
    )
    marks: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        Enum(QuestionDifficulty, name="question_difficulty"),
        default=QuestionDifficulty.medium, server_default="medium", nullable=False,
    )
    required: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)

    # MCQ / true-false / short-answer. ``options`` (JSON) is retained only for
    # backward-compatible reads of legacy questions; new multiple-choice questions
    # store their options in the normalized ``question_options`` table below.
    options: Mapped[list | None] = mapped_column(JSON)  # legacy list[str]
    correct_answer: Mapped[str | None] = mapped_column(Text)

    # Coding question fields
    language: Mapped[CodingLanguage | None] = mapped_column(Enum(CodingLanguage, name="coding_language"))
    languages: Mapped[list | None] = mapped_column(JSON)  # list[str]
    entry_point: Mapped[str | None] = mapped_column(String(120))
    starter_code: Mapped[str | None] = mapped_column(Text)
    starter_codes: Mapped[dict | None] = mapped_column(JSON)  # {language: code}

    option_rows: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", order_by="QuestionOption.order"
    )
    test_cases: Mapped[list["TestCase"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", order_by="TestCase.order"
    )


class QuestionOption(BaseModel):
    """A single normalized answer option for a multiple-choice question."""

    __tablename__ = "question_options"

    question_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question: Mapped[Question] = relationship(back_populates="option_rows")

    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class TestCase(BaseModel):
    __tablename__ = "test_cases"

    question_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question: Mapped[Question] = relationship(back_populates="test_cases")

    args: Mapped[list | None] = mapped_column(JSON)  # arguments passed to entry function
    expected_output: Mapped[str | None] = mapped_column(Text)
    display: Mapped[str | None] = mapped_column(String(255))
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
