"""Enumerations shared across the domain models and API layer."""
from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    candidate = "candidate"
    recruiter = "recruiter"
    admin = "admin"


class UserStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    suspended = "suspended"
    pending = "pending"  # awaiting email verification


class AssessmentStatus(str, enum.Enum):
    draft = "draft"
    upcoming = "upcoming"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class QuestionType(str, enum.Enum):
    multiple_choice = "multiple_choice"
    true_false = "true_false"
    short_answer = "short_answer"
    coding = "coding"


class CodingLanguage(str, enum.Enum):
    javascript = "javascript"
    typescript = "typescript"
    python = "python"
    java = "java"
    r = "r"
    cpp = "cpp"
    csharp = "csharp"
    go = "go"
    sql = "sql"


class SessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    abandoned = "abandoned"
    flagged = "flagged"


class RiskLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class AlertType(str, enum.Enum):
    multiple_faces = "multiple_faces"
    phone_detected = "phone_detected"
    looking_away = "looking_away"
    tab_switch = "tab_switch"
    suspicious_movement = "suspicious_movement"
    audio_detected = "audio_detected"
    face_not_detected = "face_not_detected"
    identity_mismatch = "identity_mismatch"
    browser_unfocused = "browser_unfocused"
    object_detected = "object_detected"


class AlertSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class EvidenceType(str, enum.Enum):
    screenshot = "screenshot"
    snapshot = "snapshot"
    video = "video"
    audio = "audio"
    document = "document"


class NotificationType(str, enum.Enum):
    info = "info"
    warning = "warning"
    alert = "alert"
    success = "success"


class AuditStatus(str, enum.Enum):
    success = "success"
    failure = "failure"
    warning = "warning"
