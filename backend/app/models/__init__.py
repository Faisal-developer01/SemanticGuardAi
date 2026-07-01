"""Model package — import all models so Alembic autogenerate sees them."""
from app.models.assessment import Assessment
from app.models.base import BaseModel
from app.models.enums import (
    AlertSeverity,
    AlertType,
    AssessmentStatus,
    AuditStatus,
    CodingLanguage,
    CredentialType,
    EvidenceType,
    NotificationType,
    QuestionDifficulty,
    QuestionType,
    RiskLevel,
    SessionStatus,
    UserRole,
    UserStatus,
)
from app.models.credential import Credential
from app.models.integrity import Alert, Evidence, IntegrityEvent
from app.models.question import Question, QuestionOption, TestCase
from app.models.role import Permission, Role, role_permissions
from app.models.session import Answer, AssessmentSession
from app.models.system import AuditLog, Notification, SystemSetting, TokenBlocklist
from app.models.user import CandidateProfile, RecruiterProfile, User

__all__ = [
    "BaseModel",
    "User",
    "CandidateProfile",
    "RecruiterProfile",
    "Role",
    "Permission",
    "role_permissions",
    "Assessment",
    "Question",
    "QuestionOption",
    "TestCase",
    "AssessmentSession",
    "Answer",
    "IntegrityEvent",
    "Alert",
    "Evidence",
    "Credential",
    "Notification",
    "AuditLog",
    "TokenBlocklist",
    "SystemSetting",
    # enums
    "UserRole",
    "UserStatus",
    "AssessmentStatus",
    "QuestionType",
    "QuestionDifficulty",
    "CodingLanguage",
    "SessionStatus",
    "RiskLevel",
    "AlertType",
    "AlertSeverity",
    "EvidenceType",
    "NotificationType",
    "CredentialType",
    "AuditStatus",
]
