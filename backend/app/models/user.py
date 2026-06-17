"""User account model + auth/MFA fields, plus candidate & recruiter profiles."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import GUID, BaseModel
from app.models.enums import UserRole, UserStatus


class User(BaseModel):
    __tablename__ = "users"

    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    role_name: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.candidate, nullable=False, index=True
    )
    role_id: Mapped[str | None] = mapped_column(GUID(), ForeignKey("roles.id", ondelete="SET NULL"))
    role: Mapped["Role | None"] = relationship(back_populates="users", lazy="selectin")  # noqa: F821

    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status"), default=UserStatus.pending, nullable=False, index=True
    )
    avatar_url: Mapped[str | None] = mapped_column(String(512))

    # Email verification
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verification_token: Mapped[str | None] = mapped_column(String(255))
    email_verification_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Password reset
    password_reset_token: Mapped[str | None] = mapped_column(String(255))
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # MFA (TOTP authenticator app *or* one-time code sent to the user's email)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64))
    mfa_method: Mapped[str] = mapped_column(
        String(10), default="totp", server_default="totp", nullable=False
    )
    email_otp_hash: Mapped[str | None] = mapped_column(String(64))
    email_otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Brute-force protection
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_ip: Mapped[str | None] = mapped_column(String(64))

    # Profiles (one-to-one, depending on role)
    candidate_profile: Mapped["CandidateProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )
    recruiter_profile: Mapped["RecruiterProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def is_locked(self) -> bool:
        from app.models.base import _utcnow

        return self.locked_until is not None and self.locked_until > _utcnow()

    def to_public_dict(self) -> dict:
        data = self.to_dict(
            exclude={
                "password_hash",
                "mfa_secret",
                "email_otp_hash",
                "email_verification_token",
                "password_reset_token",
            }
        )
        data["role"] = self.role_name.value
        return data


class CandidateProfile(BaseModel):
    __tablename__ = "candidate_profiles"

    user_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    user: Mapped[User] = relationship(back_populates="candidate_profile")

    candidate_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    department: Mapped[str | None] = mapped_column(String(120))
    position: Mapped[str | None] = mapped_column(String(120))
    experience_years: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    integrity_score: Mapped[float] = mapped_column(default=100.0, nullable=False)
    total_assessments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    passed_assessments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Face embedding (base64-encoded float32 vector) for identity verification.
    face_embedding: Mapped[str | None] = mapped_column(String)
    reference_photo_url: Mapped[str | None] = mapped_column(String(512))


class RecruiterProfile(BaseModel):
    __tablename__ = "recruiter_profiles"

    user_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    user: Mapped[User] = relationship(back_populates="recruiter_profile")

    recruiter_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    department: Mapped[str | None] = mapped_column(String(120))
    total_assessments_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
