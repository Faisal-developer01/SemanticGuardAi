"""Session lifecycle service: start, answer, submit, grade."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from flask import request

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.models import AssessmentSession
from app.models.enums import (
    AlertType,
    AssessmentStatus,
    QuestionType,
    SessionStatus,
    UserRole,
)
from app.repositories import answers, assessments, questions, sessions
from app.services import audit_service, risk_engine


def _now() -> datetime:
    return datetime.now(timezone.utc)


def start_session(candidate, assessment_id):
    assessment = assessments.get_or_404(assessment_id)
    if assessment.status not in (AssessmentStatus.active, AssessmentStatus.upcoming):
        raise ConflictError("Assessment is not open for attempts")

    existing = sessions.active_for(assessment_id, candidate.id)
    if existing:
        return existing  # resume in-progress attempt

    max_score = sum(q.marks for q in assessment.questions)
    session = sessions.create(
        assessment_id=assessment_id,
        candidate_id=candidate.id,
        status=SessionStatus.in_progress,
        started_at=_now(),
        max_score=max_score,
        ip_address=request.headers.get("X-Forwarded-For", request.remote_addr) if request else None,
        user_agent=request.headers.get("User-Agent") if request else None,
    )
    audit_service.record("session.start", user=candidate, resource=str(session.id))
    return session


def _ensure_participant(user, session):
    if user.role_name in (UserRole.admin, UserRole.recruiter):
        return
    if session.candidate_id != user.id:
        raise ForbiddenError("Not your session")


def get_session(user, session_id):
    session = sessions.get_or_404(session_id)
    _ensure_participant(user, session)
    return session


def save_answer(candidate, session_id, question_id, response, selected_language=None):
    session = sessions.get_or_404(session_id)
    if session.candidate_id != candidate.id:
        raise ForbiddenError("Not your session")
    if session.status != SessionStatus.in_progress:
        raise ConflictError("Session is no longer active")
    questions.get_or_404(question_id)
    return answers.upsert(
        session_id, question_id, response=response, selected_language=selected_language
    )


def _grade_answer(question, answer) -> tuple[bool | None, float]:
    """Auto-grade objective questions. Coding/short-answer scored as provided
    (coding test results may already be attached by the runner)."""
    if question.type in (QuestionType.multiple_choice, QuestionType.true_false):
        correct = (answer.response or "").strip().lower() == (question.correct_answer or "").strip().lower()
        return correct, question.marks if correct else 0.0
    if question.type == QuestionType.coding and answer.test_results:
        passed = answer.test_results.get("passed", 0)
        total = answer.test_results.get("total", 0) or 1
        ratio = passed / total
        return ratio == 1.0, round(question.marks * ratio, 2)
    return None, 0.0  # short-answer awaits manual review


def submit_session(candidate, session_id):
    session = sessions.get_or_404(session_id)
    if session.candidate_id != candidate.id:
        raise ForbiddenError("Not your session")
    if session.status != SessionStatus.in_progress:
        raise ConflictError("Session already submitted")

    assessment = assessments.get_or_404(session.assessment_id)
    question_map = {str(q.id): q for q in assessment.questions}
    total_awarded = 0.0
    for answer in answers.for_session(session.id):
        question = question_map.get(str(answer.question_id))
        if not question:
            continue
        is_correct, awarded = _grade_answer(question, answer)
        answer.is_correct = is_correct
        answer.awarded_marks = awarded
        total_awarded += awarded

    session.score = round(total_awarded, 2)
    session.percentage = round((total_awarded / session.max_score) * 100, 2) if session.max_score else 0.0
    session.passed = session.percentage >= assessment.pass_mark
    session.submitted_at = _now()
    session.status = (
        SessionStatus.flagged if session.risk_score >= assessment.risk_threshold else SessionStatus.completed
    )

    # Update candidate aggregates.
    if candidate.candidate_profile:
        profile = candidate.candidate_profile
        profile.total_assessments += 1
        if session.passed:
            profile.passed_assessments += 1
        # Rolling integrity average.
        prior = profile.integrity_score * (profile.total_assessments - 1)
        profile.integrity_score = round((prior + session.integrity_score) / profile.total_assessments, 2)

    sessions.session.commit()
    audit_service.record(
        "session.submit", user=candidate, resource=str(session.id),
        details=f"score={session.score} risk={session.risk_score}",
    )
    return session


def ingest_event(user, session_id, event_type: str, confidence: float = 0.0,
                 severity: str | None = None, occurred_at=None, payload: dict | None = None):
    session = sessions.get_or_404(session_id)
    _ensure_participant(user, session)
    if session.status != SessionStatus.in_progress:
        raise ConflictError("Session is no longer active")
    from app.models.enums import AlertSeverity

    event, alert = risk_engine.record_event(
        session, AlertType(event_type), confidence=confidence,
        severity=AlertSeverity(severity) if severity else None,
        occurred_at=occurred_at, payload=payload,
    )
    if alert is not None:
        from app.services import notification_service

        notification_service.notify_alert(session, alert)
    return session, event, alert


def update_live_status(user, session_id, status: dict):
    """Persist the candidate's latest AI-monitoring snapshot (heartbeat)."""
    session = sessions.get_or_404(session_id)
    if session.candidate_id != user.id:
        raise ForbiddenError("Not your session")
    if session.status != SessionStatus.in_progress:
        raise ConflictError("Session is no longer active")
    session.live_status = status
    sessions.session.commit()
    return session


def active_sessions():
    """All in-progress sessions, most recently started first (for monitoring)."""
    return (
        sessions.base_query()
        .filter(AssessmentSession.status == SessionStatus.in_progress)
        .order_by(AssessmentSession.started_at.desc())
        .all()
    )
