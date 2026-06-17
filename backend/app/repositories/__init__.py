"""Concrete repositories for each domain aggregate."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app.models import (
    Alert,
    Answer,
    Assessment,
    AssessmentSession,
    AuditLog,
    CandidateProfile,
    Evidence,
    IntegrityEvent,
    Notification,
    Permission,
    Question,
    RecruiterProfile,
    Role,
    SystemSetting,
    TestCase,
    TokenBlocklist,
    User,
)
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User
    search_fields = ("full_name", "email", "phone")

    def get_by_email(self, email: str) -> User | None:
        return self.find_one(email=email.lower().strip())


class RoleRepository(BaseRepository[Role]):
    model = Role
    search_fields = ("name", "description")

    def get_by_name(self, name: str) -> Role | None:
        return self.find_one(name=name)


class PermissionRepository(BaseRepository[Permission]):
    model = Permission
    search_fields = ("code", "description")


class CandidateProfileRepository(BaseRepository[CandidateProfile]):
    model = CandidateProfile
    search_fields = ("candidate_code", "department", "position")

    def get_by_user(self, user_id) -> CandidateProfile | None:
        return self.find_one(user_id=user_id)


class RecruiterProfileRepository(BaseRepository[RecruiterProfile]):
    model = RecruiterProfile
    search_fields = ("recruiter_code", "department")

    def get_by_user(self, user_id) -> RecruiterProfile | None:
        return self.find_one(user_id=user_id)


class AssessmentRepository(BaseRepository[Assessment]):
    model = Assessment
    search_fields = ("title", "position", "description")

    def for_recruiter(self, recruiter_id):
        return self.base_query().filter(Assessment.recruiter_id == recruiter_id)


class QuestionRepository(BaseRepository[Question]):
    model = Question
    search_fields = ("text",)

    def for_assessment(self, assessment_id) -> list[Question]:
        return list(
            self.session.execute(
                select(Question).filter_by(assessment_id=assessment_id).order_by(Question.order)
            ).scalars().all()
        )

    def next_order(self, assessment_id) -> int:
        rows = self.for_assessment(assessment_id)
        return (max((q.order for q in rows), default=0) + 1) if rows else 1


class TestCaseRepository(BaseRepository[TestCase]):
    model = TestCase


class SessionRepository(BaseRepository[AssessmentSession]):
    model = AssessmentSession

    def for_candidate(self, candidate_id):
        return self.base_query().filter(AssessmentSession.candidate_id == candidate_id)

    def for_assessment(self, assessment_id):
        return self.base_query().filter(AssessmentSession.assessment_id == assessment_id)

    def active_for(self, assessment_id, candidate_id) -> AssessmentSession | None:
        from app.models.enums import SessionStatus

        return self.session.execute(
            select(AssessmentSession).filter_by(
                assessment_id=assessment_id,
                candidate_id=candidate_id,
                status=SessionStatus.in_progress,
            )
        ).scalar_one_or_none()


class AnswerRepository(BaseRepository[Answer]):
    model = Answer

    def for_session(self, session_id) -> list[Answer]:
        return list(self.session.execute(select(Answer).filter_by(session_id=session_id)).scalars().all())

    def upsert(self, session_id, question_id, **data) -> Answer:
        existing = self.session.execute(
            select(Answer).filter_by(session_id=session_id, question_id=question_id)
        ).scalar_one_or_none()
        if existing:
            return self.update(existing, **data)
        return self.create(session_id=session_id, question_id=question_id, **data)


class IntegrityEventRepository(BaseRepository[IntegrityEvent]):
    model = IntegrityEvent

    def for_session(self, session_id):
        return self.base_query().filter(IntegrityEvent.session_id == session_id)


class AlertRepository(BaseRepository[Alert]):
    model = Alert
    search_fields = ("description",)

    def for_session(self, session_id):
        return self.base_query().filter(Alert.session_id == session_id)

    def unreviewed(self):
        return self.base_query().filter(Alert.reviewed.is_(False))


class EvidenceRepository(BaseRepository[Evidence]):
    model = Evidence

    def for_session(self, session_id):
        return self.base_query().filter(Evidence.session_id == session_id)


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    def for_user(self, user_id):
        return self.base_query().filter(Notification.user_id == user_id)

    def unread_count(self, user_id) -> int:
        return self.for_user(user_id).filter(Notification.read.is_(False)).count()

    def mark_all_read(self, user_id) -> int:
        updated = self.for_user(user_id).filter(Notification.read.is_(False)).update(
            {Notification.read: True}, synchronize_session=False
        )
        self.session.commit()
        return updated


class AuditLogRepository(BaseRepository[AuditLog]):
    model = AuditLog
    search_fields = ("action", "resource", "user_name", "details")


class SystemSettingRepository(BaseRepository[SystemSetting]):
    model = SystemSetting

    def get_value(self, key: str, default=None):
        row = self.find_one(key=key)
        return row.value if row else default

    def set_value(self, key: str, value, description: str | None = None, updated_by=None) -> SystemSetting:
        row = self.find_one(key=key)
        if row:
            row.value = value
            if description:
                row.description = description
            row.updated_by = updated_by
            self.session.commit()
            return row
        return self.create(key=key, value=value, description=description, updated_by=updated_by)


class TokenBlocklistRepository(BaseRepository[TokenBlocklist]):
    model = TokenBlocklist

    def revoke(self, jti: str, token_type: str, user_id, expires_at: datetime) -> TokenBlocklist:
        return self.create(jti=jti, token_type=token_type, user_id=user_id, expires_at=expires_at)

    def purge_expired(self) -> int:
        now = datetime.now(timezone.utc)
        deleted = self.base_query().filter(TokenBlocklist.expires_at < now).delete()
        self.session.commit()
        return deleted


# Singleton instances for convenient import.
users = UserRepository()
roles = RoleRepository()
permissions = PermissionRepository()
candidate_profiles = CandidateProfileRepository()
recruiter_profiles = RecruiterProfileRepository()
assessments = AssessmentRepository()
questions = QuestionRepository()
test_cases = TestCaseRepository()
sessions = SessionRepository()
answers = AnswerRepository()
integrity_events = IntegrityEventRepository()
alerts = AlertRepository()
evidence = EvidenceRepository()
notifications = NotificationRepository()
audit_logs = AuditLogRepository()
system_settings = SystemSettingRepository()
token_blocklist = TokenBlocklistRepository()
