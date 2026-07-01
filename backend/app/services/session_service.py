"""Session lifecycle service: start, answer, submit, grade."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from flask import request

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.models import AssessmentSession
from app.models.enums import (
    AlertSeverity,
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


def _aware(dt: datetime | None) -> datetime | None:
    """Coerce a (possibly naive) timestamp to an aware UTC datetime."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def start_session(candidate, assessment_id, device_fingerprint=None, device_info=None):
    assessment = assessments.get_or_404(assessment_id)
    if assessment.status not in (AssessmentStatus.active, AssessmentStatus.upcoming):
        raise ConflictError("Assessment is not open for attempts")

    # Enforce the scheduled time window: candidates may only start within
    # [start_time, end_time). Before the start time the assessment is locked;
    # once the window has elapsed it is closed permanently (a past assessment).
    now = _now()
    start_at = _aware(assessment.start_time)
    if start_at and now < start_at:
        raise ConflictError("This assessment has not started yet")
    if assessment.is_expired:
        raise ConflictError("This assessment has expired and is no longer available")

    existing = sessions.active_for(assessment_id, candidate.id)
    if existing:
        # Resuming an attempt: flag if it is being resumed from a different device.
        if device_fingerprint:
            if existing.device_fingerprint and existing.device_fingerprint != device_fingerprint:
                _flag_device_anomaly(
                    existing, "device_mismatch",
                    "Assessment resumed from a different device than it was started on",
                    {"previous": existing.device_fingerprint, "current": device_fingerprint},
                )
            elif not existing.device_fingerprint:
                existing.device_fingerprint = device_fingerprint
                existing.device_info = device_info
                sessions.session.commit()
            _detect_multiple_logins(existing, candidate, device_fingerprint)
        return existing  # resume in-progress attempt

    # Enforce single-attempt policy: a candidate cannot retake an assessment they
    # have already submitted (completed, flagged, or abandoned).
    prior = (
        sessions.base_query()
        .filter(
            AssessmentSession.assessment_id == assessment_id,
            AssessmentSession.candidate_id == candidate.id,
            AssessmentSession.status != SessionStatus.in_progress,
        )
        .first()
    )
    if prior:
        raise ConflictError("You have already completed this assessment. Retakes are not allowed.")

    max_score = sum(q.marks for q in assessment.questions)
    session = sessions.create(
        assessment_id=assessment_id,
        candidate_id=candidate.id,
        status=SessionStatus.in_progress,
        started_at=_now(),
        max_score=max_score,
        ip_address=request.headers.get("X-Forwarded-For", request.remote_addr) if request else None,
        user_agent=request.headers.get("User-Agent") if request else None,
        device_fingerprint=device_fingerprint,
        device_info=device_info,
    )
    audit_service.record("session.start", user=candidate, resource=str(session.id))
    if device_fingerprint:
        _detect_multiple_logins(session, candidate, device_fingerprint)
    return session


def _flag_device_anomaly(session, reason: str, description: str, extra: dict) -> None:
    """Raise a high-severity integrity alert for a device/login anomaly."""
    payload = {"reason": reason, **extra}
    _event, alert = risk_engine.record_event(
        session, AlertType.identity_mismatch,
        confidence=0.9, severity=AlertSeverity.high, payload=payload,
    )
    if alert is not None:
        alert.description = description
        sessions.session.commit()
    try:
        from app.realtime import broadcast_event

        broadcast_event(session, alert)
    except Exception:  # noqa: BLE001 - realtime is best-effort
        pass


def _detect_multiple_logins(session, candidate, fingerprint: str) -> None:
    """Alert if the candidate has another active attempt on a different device."""
    others = (
        sessions.base_query()
        .filter(
            AssessmentSession.candidate_id == candidate.id,
            AssessmentSession.status == SessionStatus.in_progress,
            AssessmentSession.id != session.id,
            AssessmentSession.device_fingerprint.isnot(None),
            AssessmentSession.device_fingerprint != fingerprint,
        )
        .all()
    )
    if others:
        _flag_device_anomaly(
            session, "multiple_sessions",
            "Concurrent assessment sessions detected from multiple devices for this candidate",
            {"otherSessions": [str(o.id) for o in others], "current": fingerprint},
        )


def _ensure_participant(user, session):
    if user.role_name in (UserRole.admin, UserRole.recruiter):
        return
    if session.candidate_id != user.id:
        raise ForbiddenError("Not your session")


def get_session(user, session_id):
    session = sessions.get_or_404(session_id)
    _ensure_participant(user, session)
    _auto_close_if_expired(session)
    return session


def get_risk_breakdown(user, session_id):
    """AI explainability: per-signal weighted breakdown of a session's risk.

    Restricted to recruiters/admins — it exposes the internal scoring weights
    that candidates should not see while an attempt is in progress.
    """
    from app.services import risk_engine

    if user.role_name not in (UserRole.recruiter, UserRole.admin):
        raise ForbiddenError("Only recruiters and admins can view the risk breakdown")

    session = sessions.get_or_404(session_id)
    data = risk_engine.breakdown(session)

    candidate = getattr(session, "candidate", None)
    assessment = getattr(session, "assessment", None)
    data.update({
        "candidateId": str(session.candidate_id),
        "candidateName": getattr(candidate, "full_name", None) or "Candidate",
        "assessmentId": str(session.assessment_id),
        "assessmentTitle": getattr(assessment, "title", None) or "Assessment",
        "status": session.status.value if session.status else None,
        "passed": session.passed,
        "percentage": session.percentage,
        "riskThreshold": getattr(assessment, "risk_threshold", None),
        "tabSwitchCount": session.tab_switch_count,
        "lookingAwayCount": session.looking_away_count,
        "faceNotDetectedCount": session.face_not_detected_count,
        "flagged": bool(getattr(session, "flagged", False)),
        "startedAt": session.started_at.isoformat() if session.started_at else None,
        "submittedAt": session.submitted_at.isoformat() if session.submitted_at else None,
    })
    return data


def get_code_integrity(user, session_id) -> list:
    """Recruiter-facing coding plagiarism / AI-generated-code report."""
    from app.services import plagiarism_service

    if user.role_name not in (UserRole.recruiter, UserRole.admin):
        raise ForbiddenError("Only recruiters and admins can view code integrity")
    session = sessions.get_or_404(session_id)
    return plagiarism_service.session_report(session)


def save_answer(candidate, session_id, question_id, response, selected_language=None, keystroke_stats=None):
    session = sessions.get_or_404(session_id)
    if session.candidate_id != candidate.id:
        raise ForbiddenError("Not your session")
    # Auto-submit if the assessment window expired mid-attempt, then reject the
    # late answer so candidates cannot continue past the deadline.
    _auto_close_if_expired(session)
    if session.status != SessionStatus.in_progress:
        raise ConflictError("Session is no longer active")
    q = questions.get_or_404(question_id)
    
    test_results = None
    if q.type == QuestionType.coding and response:
        from app.services import code_runner_service
        # Synchronously run grading runner
        test_results = code_runner_service.grade_coding_question(
            code=response,
            language=selected_language or q.language.value,
            entry_point=q.entry_point,
            test_cases=q.test_cases
        )

    return answers.upsert(
        session_id,
        question_id,
        response=response,
        selected_language=selected_language,
        test_results=test_results,
        keystroke_stats=keystroke_stats,
    )


def _grade_answer(question, answer) -> tuple[bool | None, float]:
    """Auto-grade objective questions. Coding/short-answer scored as provided
    (coding test results may already be attached by the runner)."""
    if question.type == QuestionType.multiple_choice:
        return _grade_mcq(question, answer)
    if question.type == QuestionType.true_false:
        correct = (answer.response or "").strip().lower() == (question.correct_answer or "").strip().lower()
        return correct, question.marks if correct else 0.0
    if question.type == QuestionType.coding and answer.test_results:
        passed = answer.test_results.get("passed", 0)
        total = answer.test_results.get("total", 0) or 1
        ratio = passed / total
        return ratio == 1.0, round(question.marks * ratio, 2)
    return None, 0.0  # short-answer awaits manual review


def _grade_mcq(question, answer) -> tuple[bool | None, float]:
    """Grade a multiple-choice answer against the normalized option rows,
    falling back to the legacy ``correct_answer`` string for old questions or
    options that were supplied without an explicit correct flag."""
    response = (answer.response or "").strip()
    rows = getattr(question, "option_rows", None)
    correct = next((o for o in rows if o.is_correct), None) if rows else None
    if correct is not None:
        ok = response == (correct.text or "").strip()
        return ok, question.marks if ok else 0.0
    # No flagged-correct option row — use the question's correct_answer string.
    ok = response.lower() == (question.correct_answer or "").strip().lower()
    return ok, question.marks if ok else 0.0


def submit_session(candidate, session_id):
    session = sessions.get_or_404(session_id)
    if session.candidate_id != candidate.id:
        raise ForbiddenError("Not your session")
    if session.status != SessionStatus.in_progress:
        raise ConflictError("Session already submitted")
    return _finalize_session(session, candidate)


def _finalize_session(session, candidate):
    """Grade every recorded answer and close the session. Unanswered questions
    score zero, so a session submitted early (or auto-submitted when the
    assessment window expires) is graded on the progress made so far."""
    assessment = assessments.get_or_404(session.assessment_id)
    question_map = {str(q.id): q for q in assessment.questions}
    total_awarded = 0.0
    manual_review_pending = False
    for answer in answers.for_session(session.id):
        question = question_map.get(str(answer.question_id))
        if not question:
            continue
        is_correct, awarded = _grade_answer(question, answer)
        answer.is_correct = is_correct
        answer.awarded_marks = awarded
        total_awarded += awarded
        # Short-answer responses can't be auto-graded — they await recruiter review.
        if question.type == QuestionType.short_answer and answer.response and is_correct is None:
            manual_review_pending = True

    session.score = round(total_awarded, 2)
    session.percentage = round((total_awarded / session.max_score) * 100, 2) if session.max_score else 0.0
    session.passed = session.percentage >= assessment.pass_mark
    session.submitted_at = _now()
    flagged = session.risk_score >= assessment.risk_threshold
    session.status = SessionStatus.flagged if flagged else SessionStatus.completed
    # Result pipeline state consumed by the candidate result screen.
    session.grading_status = (
        "under_review" if flagged else ("processing" if manual_review_pending else "graded")
    )

    # Update candidate aggregates.
    if candidate and candidate.candidate_profile:
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

    # Analyze coding answers for plagiarism / AI-generated code (best-effort).
    try:
        from app.services import plagiarism_service

        plagiarism_service.analyze_session(session)
    except Exception:  # noqa: BLE001
        from flask import current_app

        current_app.logger.exception("Code integrity analysis failed for session %s", session.id)

    # Passing candidates are automatically issued a completion certificate and an
    # offer letter, then emailed both as PDF attachments. Never let credential
    # issuance break submission.
    if session.passed:
        try:
            _issue_credentials(session)
        except Exception:  # noqa: BLE001
            from flask import current_app

            current_app.logger.exception("Credential issuance failed for session %s", session.id)

    return session


def _issue_credentials(session) -> None:
    from app.models.enums import NotificationType
    from app.services import certificate_service, email_service, notification_service

    creds = certificate_service.issue_for_passed_session(session)
    cred_ids = [str(c.id) for c in creds if c]
    if not cred_ids:
        return
    email_service.deliver("credential", str(session.candidate_id), cred_ids)
    try:
        notification_service.create(
            user_id=str(session.candidate_id),
            title="Certificate & offer letter issued",
            message="Congratulations on passing! Your completion certificate and offer letter are ready to download.",
            type=NotificationType.success,
            link="/candidate/certificates",
        )
    except Exception:  # noqa: BLE001 - notification is best-effort
        pass


def _auto_close_if_expired(session):
    """If an in-progress session's assessment window has elapsed, automatically
    submit and grade it so the candidate is scored on the progress made before
    the deadline passed."""
    if session.status != SessionStatus.in_progress:
        return session
    assessment = assessments.get_or_404(session.assessment_id)
    if assessment.is_expired:
        return _finalize_session(session, session.candidate)
    return session


def auto_close_expired_for_candidate(candidate):
    """Sweep a candidate's in-progress sessions and finalize any whose
    assessment window has expired (e.g. the browser was closed before the
    deadline). Keeps the candidate portal in sync with the time policy."""
    for session in sessions.for_candidate(candidate.id).filter(
        AssessmentSession.status == SessionStatus.in_progress
    ).all():
        _auto_close_if_expired(session)


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
        
        # Trigger proctoring alert SMS
        from app.services.sms_service import deliver_proctoring_alert
        deliver_proctoring_alert(session, alert)

    # Real-time flagging check if risk score exceeds assessment's risk threshold
    assessment = session.assessment
    if assessment and session.risk_score >= assessment.risk_threshold and not session.flagged:
        session.flagged = True
        session.flagged_reason = f"Risk score ({session.risk_score}) exceeded threshold ({assessment.risk_threshold})"
        session.flagged_at = _now()
        sessions.session.commit()
        # Notify the recruiter of the high-risk crossing (push + SMS), once.
        try:
            from app.services import notification_service
            from app.services.sms_service import deliver_high_risk_alert

            notification_service.notify_high_risk(session)
            deliver_high_risk_alert(session)
        except Exception:  # noqa: BLE001 - notification is best-effort
            pass

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


def toggle_monitoring(user, session_id: str, enabled: bool) -> AssessmentSession:
    """Toggle whether AI monitoring/proctoring is active for a session."""
    session = sessions.get_or_404(session_id)
    assessment = session.assessment
    
    # Check permissions: user must be recruiter or admin, and if recruiter, must own the assessment
    if not user or user.role_name.value not in ("recruiter", "admin"):
        raise ForbiddenError("Only recruiters and administrators can toggle monitoring")
    if user.role_name.value == "recruiter" and assessment and str(assessment.recruiter_id) != str(user.id):
        raise ForbiddenError("You do not have permission to modify this session's monitoring status")

        
    session.monitoring_enabled = enabled
    sessions.session.commit()
    return session

