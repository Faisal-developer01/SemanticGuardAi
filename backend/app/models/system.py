"""Notifications, audit logs, JWT token blocklist, and system settings."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import GUID, BaseModel
from app.models.enums import AuditStatus, NotificationType, UserRole


class Notification(BaseModel):
    __tablename__ = "notifications"

    user_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user: Mapped["User"] = relationship(lazy="selectin")  # noqa: F821

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type"), default=NotificationType.info, nullable=False
    )
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    link: Mapped[str | None] = mapped_column(String(512))
    delivered_email: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivered_sms: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AuditLog(BaseModel):
    __tablename__ = "audit_logs"

    user_id: Mapped[str | None] = mapped_column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    user_name: Mapped[str | None] = mapped_column(String(150))
    user_role: Mapped[UserRole | None] = mapped_column(Enum(UserRole, name="audit_user_role"))

    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    resource: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[AuditStatus] = mapped_column(
        Enum(AuditStatus, name="audit_status"), default=AuditStatus.success, nullable=False, index=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    details: Mapped[str | None] = mapped_column(Text)
    context: Mapped[dict | None] = mapped_column(JSON)


class TokenBlocklist(BaseModel):
    """Revoked JWTs (by jti) for logout / forced invalidation."""

    __tablename__ = "token_blocklist"

    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    token_type: Mapped[str] = mapped_column(String(16), nullable=False)
    user_id: Mapped[str | None] = mapped_column(GUID(), ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SystemSetting(BaseModel):
    """Singleton-style key/value store for platform-wide configuration."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    value: Mapped[dict | None] = mapped_column(JSON)
    description: Mapped[str | None] = mapped_column(String(255))
    updated_by: Mapped[str | None] = mapped_column(GUID(), ForeignKey("users.id", ondelete="SET NULL"))
