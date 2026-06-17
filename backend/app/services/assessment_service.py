"""Assessment & question domain services."""
from __future__ import annotations

from app.errors import ForbiddenError, NotFoundError
from app.models.enums import AssessmentStatus, UserRole
from app.repositories import assessments, questions, test_cases
from app.services import audit_service


def list_assessments(user, *, page, per_page, search, sort_by, sort_dir, status=None):
    query = None
    # Recruiters see only their own assessments; admins see all; candidates see active/upcoming.
    if user.role_name == UserRole.recruiter:
        query = assessments.for_recruiter(user.id)
    elif user.role_name == UserRole.candidate:
        query = assessments.base_query().filter(
            assessments.model.status.in_([AssessmentStatus.active, AssessmentStatus.upcoming])
        )
    filters = {"status": AssessmentStatus(status)} if status else None
    return assessments.paginate(
        page=page, per_page=per_page, search=search, sort_by=sort_by,
        sort_dir=sort_dir, filters=filters, query=query,
    )


def get_assessment(assessment_id):
    return assessments.get_or_404(assessment_id)


def _ensure_owner(user, assessment):
    if user.role_name == UserRole.admin:
        return
    if assessment.recruiter_id != user.id:
        raise ForbiddenError("You do not own this assessment")


def create_assessment(user, data: dict):
    assessment = assessments.create(recruiter_id=user.id, **data)
    if user.recruiter_profile:
        user.recruiter_profile.total_assessments_created += 1
        assessments.session.commit()
    audit_service.record("assessment.create", user=user, resource=str(assessment.id))
    return assessment


def update_assessment(user, assessment_id, data: dict):
    assessment = assessments.get_or_404(assessment_id)
    _ensure_owner(user, assessment)
    assessments.update(assessment, **data)
    audit_service.record("assessment.update", user=user, resource=str(assessment.id))
    return assessment


def change_status(user, assessment_id, status: str):
    assessment = assessments.get_or_404(assessment_id)
    _ensure_owner(user, assessment)
    assessment.status = AssessmentStatus(status)
    assessments.session.commit()
    audit_service.record(
        "assessment.status", user=user, resource=str(assessment.id), details=status
    )
    return assessment


def delete_assessment(user, assessment_id):
    assessment = assessments.get_or_404(assessment_id)
    _ensure_owner(user, assessment)
    assessments.delete(assessment)
    audit_service.record("assessment.delete", user=user, resource=str(assessment_id))


# ─── Questions ───────────────────────────────────────────────────────────────

def list_questions(assessment_id, *, include_answers: bool):
    rows = questions.for_assessment(assessment_id)
    return rows


def add_question(user, assessment_id, data: dict):
    assessment = assessments.get_or_404(assessment_id)
    _ensure_owner(user, assessment)
    cases = data.pop("test_cases", None) or []
    if not data.get("order"):
        data["order"] = questions.next_order(assessment_id)
    question = questions.create(assessment_id=assessment_id, commit=False, **data)
    questions.session.flush()
    for idx, case in enumerate(cases):
        test_cases.create(question_id=question.id, order=case.get("order", idx), commit=False,
                          args=case.get("args"), expected_output=case.get("expected_output"),
                          display=case.get("display"), hidden=case.get("hidden", False))
    questions.session.commit()
    audit_service.record("question.create", user=user, resource=str(question.id))
    return question


def update_question(user, question_id, data: dict):
    question = questions.get_or_404(question_id)
    assessment = assessments.get_or_404(question.assessment_id)
    _ensure_owner(user, assessment)
    data.pop("test_cases", None)
    questions.update(question, **data)
    audit_service.record("question.update", user=user, resource=str(question.id))
    return question


def delete_question(user, question_id):
    question = questions.get_or_404(question_id)
    assessment = assessments.get_or_404(question.assessment_id)
    _ensure_owner(user, assessment)
    questions.delete(question)
    audit_service.record("question.delete", user=user, resource=str(question_id))
