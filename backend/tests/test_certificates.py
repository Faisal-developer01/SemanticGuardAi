"""Certificate branding, printable layout, cache upgrades, and download ownership."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
from types import SimpleNamespace

import pytest
from reportlab.lib.pagesizes import A4, landscape

from app.extensions import db
from app.models.credential import Credential
from app.models.enums import CredentialType, UserRole, UserStatus
from app.services import certificate_service as service


@pytest.fixture
def credential(candidate, monkeypatch, tmp_path):
    monkeypatch.setattr(service, "_storage_dir", lambda: tmp_path)
    cred = Credential(
        type=CredentialType.certificate,
        number="SSR-CERT-2026-000042",
        verification_token="certificate-verification-test",
        candidate_id=candidate.id,
        candidate_name=candidate.full_name,
        title="Web Technology & Software Engineering",
        percentage=87,
        integrity_score=96,
        issued_at=datetime(2026, 10, 7, tzinfo=timezone.utc),
    )
    db.session.add(cred)
    db.session.commit()
    return cred


def test_certificate_embeds_supplied_logo_stamp_and_verification(app, credential, monkeypatch):
    monkeypatch.setitem(app.config, "FRONTEND_ORIGIN", "https://assessment.example")
    data = service.render_pdf(credential)
    assert data.startswith(b"%PDF-")
    assert len(re.findall(rb"/Type\s*/Page\b", data)) == 1
    assert data.count(b"/Subtype /Image") == 4  # Two RGBA images and their alpha masks.
    assert data.count(b"/SMask") == 2
    assert b"https://assessment.example/verify/certificate-verification-test" in data
    bounds = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]", data)
    assert bounds is not None
    assert tuple(float(value) for value in bounds.groups()) == pytest.approx(landscape(A4), abs=0.01)
    assert b"SSR-CERT-2026-000042" in data


@pytest.mark.parametrize("name,title", [
    ("Candidate & Partner <Developer>", "Research & Development <Web Engineering>"),
    ("W" * 160, "W" * 200),
])
def test_long_and_xml_sensitive_details_fit_one_page(credential, name, title):
    credential.candidate_name = name
    credential.title = title
    data = service.render_pdf(credential)
    assert len(re.findall(rb"/Type\s*/Page\b", data)) == 1


def test_deployed_asset_resolution_uses_vite_images(app, monkeypatch, tmp_path):
    source = service._assets_dir()
    deployed = tmp_path / "dist" / "img"
    deployed.mkdir(parents=True)
    for name in ("Logo-semantic.png", "stamp&signature.png"):
        shutil.copyfile(source / name, deployed / name)
    monkeypatch.setattr(service, "__file__", str(tmp_path / "backend" / "app" / "services" / "certificate_service.py"))
    assert service._assets_dir() == deployed
    assert service._logo_path().is_file()
    assert service._stamp_path().is_file()
    monkeypatch.setitem(app.config, "BRAND_ASSETS_DIR", str(source))
    assert service._assets_dir() == source


def test_missing_branding_fails_explicitly_instead_of_creating_an_unsigned_certificate(app, credential, monkeypatch, tmp_path):
    monkeypatch.setitem(app.config, "BRAND_ASSETS_DIR", str(tmp_path))
    with pytest.raises(FileNotFoundError, match="logo and signature/stamp"):
        service.render_pdf(credential)


def test_old_cached_certificate_is_upgraded_without_changing_issued_details(credential, tmp_path):
    old = tmp_path / f"{credential.number}.pdf"
    old.write_bytes(b"old-unbranded-pdf")
    credential.file_path = str(old)
    issued_at, number, token = credential.issued_at, credential.number, credential.verification_token
    data = service.get_pdf_bytes(credential)
    assert data.startswith(b"%PDF-")
    assert Path(credential.file_path).name == f"{number}-semantic-v3.pdf"
    assert Path(credential.file_path).read_bytes() == data
    assert old.read_bytes() == b"old-unbranded-pdf"
    assert (credential.issued_at, credential.number, credential.verification_token) == (issued_at, number, token)


def test_current_certificate_cache_is_reused(credential, monkeypatch):
    expected = service.get_pdf_bytes(credential)
    def unexpected_render(_cred):
        pytest.fail("Current branded PDF should be reused")
    monkeypatch.setattr(service, "render_pdf", unexpected_render)
    assert service.get_pdf_bytes(credential) == expected

@pytest.mark.parametrize("origin,expected", [
    ("https://assessment.example/", "https://assessment.example/verify/token"),
    ("http://assessment.example,https://assessment.example", "https://assessment.example/verify/token"),
    ("http://localhost:5173", "http://localhost:5173/verify/token"),
])
def test_verification_uses_one_valid_origin_and_prefers_https(app, monkeypatch, origin, expected):
    monkeypatch.setitem(app.config, "FRONTEND_ORIGIN", origin)
    assert service._verify_url("token") == expected


@pytest.mark.parametrize("origin", ["", "not-a-url", "https://assessment.example/#fragment"])
def test_invalid_verification_origin_is_reported(app, monkeypatch, origin):
    monkeypatch.setitem(app.config, "FRONTEND_ORIGIN", origin)
    with pytest.raises(ValueError, match="FRONTEND_ORIGIN"):
        service._verify_url("token")


def test_offer_letter_cached_download_remains_unchanged(credential, tmp_path):
    credential.type = CredentialType.offer_letter
    path = tmp_path / f"{credential.number}.pdf"
    path.write_bytes(b"existing-offer-letter")
    credential.file_path = str(path)
    assert service.get_pdf_bytes(credential) == b"existing-offer-letter"
    assert service._pdf_filename(credential) == f"{credential.number}.pdf"


def test_candidate_download_contains_branding_and_keeps_verification(client, candidate, auth_header, credential):
    headers = auth_header(client, "candidate@test.rw")
    response = client.get(f"/api/v1/certificates/{credential.id}/download", headers=headers)
    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert response.data.count(b"/Subtype /Image") == 4
    assert "attachment;" in response.headers["Content-Disposition"]
    verified = client.get(f"/api/v1/certificates/verify/{credential.verification_token}").get_json()
    assert verified["valid"] is True
    assert verified["number"] == credential.number
    assert verified["candidateName"] == candidate.full_name


def test_certificate_issuance_queues_email(candidate, credential, monkeypatch):
    from app.services import email_service, notification_service, session_service

    deliveries = []
    monkeypatch.setattr(service, "issue_for_passed_session", lambda session: [credential])
    monkeypatch.setattr(email_service, "deliver", lambda *args: deliveries.append(args))
    monkeypatch.setattr(notification_service, "create", lambda **kwargs: None)
    session = SimpleNamespace(candidate_id=candidate.id)

    session_service._issue_credentials(session)

    assert deliveries == [("credential", str(candidate.id), [str(credential.id)])]


def test_credential_email_attaches_certificate_pdf(candidate, credential, monkeypatch):
    from app.services import email_service

    messages = []

    def capture_email(to, subject, html_body, text_body, attachments, **kwargs):
        messages.append((to, attachments))
        return True

    monkeypatch.setattr(email_service, "send_email", capture_email)

    assert email_service.send_credential_email(str(candidate.id), [str(credential.id)]) is True
    assert len(messages) == 1
    recipient, attachments = messages[0]
    assert recipient == candidate.email
    assert len(attachments) == 1
    filename, mimetype, data = attachments[0]
    assert filename == service.download_filename(credential)
    assert mimetype == "application/pdf"
    assert data.startswith(b"%PDF-")


def test_thread_email_delivery_bypasses_broker(app, candidate, credential, monkeypatch):
    from app import tasks
    from app.services import email_service

    queued = []
    sent = []
    monkeypatch.setitem(app.config, "EMAIL_DELIVERY_MODE", "thread")
    monkeypatch.setattr(tasks.send_credential_email, "delay", lambda *args: queued.append(args))
    monkeypatch.setitem(email_service._SENDERS, "credential", lambda *args: sent.append(args))
    monkeypatch.setattr(email_service.threading, "Thread", lambda **kwargs: SimpleNamespace(start=kwargs["target"]))

    email_service.deliver("credential", str(candidate.id), [str(credential.id)])

    assert queued == []
    assert sent == [(str(candidate.id), [str(credential.id)])]


@pytest.fixture
def review_session(candidate, recruiter, monkeypatch):
    from app.models import Assessment, AssessmentSession, Answer, Question
    from app.models.enums import SessionStatus, QuestionType
    from app.services import email_service

    deliveries = []
    monkeypatch.setattr(email_service, "deliver", lambda *args: deliveries.append(args))
    assessment = Assessment(title="Manual grading", recruiter_id=recruiter.id, pass_mark=50)
    db.session.add(assessment)
    db.session.flush()
    question = Question(assessment_id=assessment.id, text="Explain your answer", type=QuestionType.short_answer, marks=10)
    session = AssessmentSession(assessment_id=assessment.id, candidate_id=candidate.id,
                                status=SessionStatus.completed, grading_status="processing", max_score=10, passed=False)
    db.session.add_all([question, session])
    db.session.flush()
    answer = Answer(session_id=session.id, question_id=question.id, response="Candidate response")
    db.session.add(answer)
    candidate.candidate_profile.total_assessments = 1
    db.session.commit()
    return session, answer, deliveries


def test_review_requires_all_manual_marks(review_session, recruiter):
    from app.errors import ConflictError
    from app.services.session_service import finalize_review

    session, _answer, deliveries = review_session
    with pytest.raises(ConflictError):
        finalize_review(recruiter, str(session.id), {"decision": "accept", "marks": {}})
    assert session.grading_status == "processing"
    assert deliveries == []


def test_finalized_pass_queues_certificate_email(review_session, recruiter, monkeypatch, tmp_path):
    from app.services.session_service import finalize_review

    monkeypatch.setattr(service, "_storage_dir", lambda: tmp_path)
    session, answer, deliveries = review_session
    finalize_review(recruiter, str(session.id), {"decision": "accept", "marks": {str(answer.id): 8}})
    assert session.grading_status == "graded"
    assert session.passed
    assert session.percentage == 80
    credentials = Credential.query.all()
    assert len(credentials) == 2
    credential_delivery = next(delivery for delivery in deliveries if delivery[0] == "credential")
    assert credential_delivery[1] == str(session.candidate_id)
    assert set(credential_delivery[2]) == {str(credential.id) for credential in credentials}
    assert session.candidate.candidate_profile.passed_assessments == 1


def test_issuance_retries_duplicate_number(credential, review_session, monkeypatch, tmp_path):
    monkeypatch.setattr(service, "_storage_dir", lambda: tmp_path)
    numbers = iter([credential.number, "SSR-CERT-2026-000043"])
    monkeypatch.setattr(service, "_generate_number", lambda credential_type: next(numbers))
    session, _answer, _deliveries = review_session

    issued = service.issue(session, CredentialType.certificate)

    assert issued.number == "SSR-CERT-2026-000043"
    assert Credential.query.count() == 2
    assert service.issue(session, CredentialType.certificate).id == issued.id
    assert service.get_pdf_bytes(issued).startswith(b"%PDF-")


def test_exhausted_number_collisions_leave_database_usable(credential, review_session, monkeypatch):
    monkeypatch.setattr(service, "_generate_number", lambda credential_type: credential.number)
    session, _answer, _deliveries = review_session

    with pytest.raises(RuntimeError, match="unique credential number"):
        service.issue(session, CredentialType.certificate)

    assert Credential.query.count() == 1
    assert session.grading_status == "processing"


def test_submission_recovers_number_collision(client, auth_header, credential, review_session, monkeypatch, tmp_path):
    from app.models.enums import SessionStatus, QuestionType

    session, answer, deliveries = review_session
    session.status = SessionStatus.in_progress
    question = session.assessment.questions[0]
    question.type = QuestionType.multiple_choice
    question.correct_answer = "correct"
    answer.response = "correct"
    db.session.commit()
    monkeypatch.setattr(service, "_storage_dir", lambda: tmp_path)
    numbers = iter([credential.number, "SSR-CERT-2026-000043", "SSR-OFFER-2026-000001"])
    monkeypatch.setattr(service, "_generate_number", lambda credential_type: next(numbers))

    response = client.post(f"/api/v1/sessions/{session.id}/submit", headers=auth_header(client, "candidate@test.rw"))

    assert response.status_code == 200
    assert response.get_json()["gradingStatus"] == "graded"
    assert response.get_json()["passed"] is True
    assert Credential.query.count() == 3
    assert any(delivery[0] == "credential" for delivery in deliveries)


def test_candidate_can_email_existing_pdf(client, app, auth_header, credential, monkeypatch):
    from app.services import email_service

    messages = []
    monkeypatch.setitem(app.config, "MAIL_SUPPRESS_SEND", False)
    monkeypatch.setitem(app.config, "MAIL_SERVER", "smtp.example.com")
    monkeypatch.setattr(email_service.mail, "send", lambda message: messages.append(message))

    response = client.post(f"/api/v1/certificates/{credential.id}/email", headers=auth_header(client, "candidate@test.rw"))

    assert response.status_code == 200
    assert len(messages) == 1
    assert messages[0].recipients == [credential.candidate.email]
    assert len(messages[0].attachments) == 1
    assert messages[0].attachments[0].data.startswith(b"%PDF-")
    assert Credential.query.count() == 1


def test_email_rejection_is_reported(client, auth_header, credential, monkeypatch):
    from app.services import email_service

    monkeypatch.setattr(email_service, "send_credential_email", lambda *args, **kwargs: False)
    response = client.post(f"/api/v1/certificates/{credential.id}/email", headers=auth_header(client, "candidate@test.rw"))
    assert response.status_code == 502
    assert "could not be emailed" in response.get_json()["message"]


@pytest.mark.parametrize("failure, expected_code", [
    ("authentication", "email_authentication_failed"),
    ("sender", "email_sender_rejected"),
    ("recipient", "email_recipient_rejected"),
    ("data", "email_message_rejected"),
    ("tls", "email_tls_failed"),
    ("timeout", "email_connection_timeout"),
    ("connection", "email_connection_failed"),
    ("unknown", "email_delivery_failed"),
])
def test_email_failure_is_categorized_without_leaking_provider_details(client, app, auth_header, credential, monkeypatch, failure, expected_code):
    import smtplib
    import ssl
    from app.services import email_service

    private_detail = "private-provider-detail"
    failures = {
        "authentication": smtplib.SMTPAuthenticationError(535, private_detail.encode()),
        "sender": smtplib.SMTPSenderRefused(550, private_detail.encode(), "sender@example.com"),
        "recipient": smtplib.SMTPRecipientsRefused({"recipient@example.com": (550, private_detail.encode())}),
        "data": smtplib.SMTPDataError(554, private_detail.encode()),
        "tls": ssl.SSLError(private_detail),
        "timeout": TimeoutError(private_detail),
        "connection": ConnectionRefusedError(private_detail),
        "unknown": RuntimeError(private_detail),
    }

    def reject(message):
        raise failures[failure]

    monkeypatch.setitem(app.config, "MAIL_SUPPRESS_SEND", False)
    monkeypatch.setitem(app.config, "MAIL_SERVER", "smtp.example.com")
    monkeypatch.setattr(email_service.mail, "send", reject)
    response = client.post(f"/api/v1/certificates/{credential.id}/email", headers=auth_header(client, "candidate@test.rw"))

    assert response.status_code == 502
    assert response.get_json()["error"] == expected_code
    assert private_detail not in response.get_data(as_text=True)
    assert email_service.send_credential_email(str(credential.candidate_id), [str(credential.id)]) is False


@pytest.mark.parametrize("suppressed, expected_code", [(True, "email_disabled"), (False, "email_not_configured")])
def test_email_configuration_failure_is_reported(client, app, auth_header, credential, monkeypatch, suppressed, expected_code):
    from app.services import email_service

    monkeypatch.setitem(app.config, "MAIL_SUPPRESS_SEND", suppressed)
    monkeypatch.setitem(app.config, "MAIL_SERVER", "localhost")
    monkeypatch.setitem(app.config, "MAIL_USERNAME", None)
    monkeypatch.setattr(email_service.mail, "send", lambda message: pytest.fail("SMTP must not be called"))
    response = client.post(f"/api/v1/certificates/{credential.id}/email", headers=auth_header(client, "candidate@test.rw"))

    assert response.status_code == 502
    assert response.get_json()["error"] == expected_code


def test_revoked_document_cannot_be_emailed(client, auth_header, credential):
    credential.revoked = True
    db.session.commit()
    response = client.post(f"/api/v1/certificates/{credential.id}/email", headers=auth_header(client, "candidate@test.rw"))
    assert response.status_code == 409


def test_finalized_fail_queues_result_email(review_session, recruiter):
    from app.services.session_service import finalize_review

    session, answer, deliveries = review_session
    finalize_review(recruiter, str(session.id), {"decision": "accept", "marks": {str(answer.id): 2}})
    assert not session.passed
    assert Credential.query.count() == 0
    assert len(deliveries) == 1
    kind, recipient, subject, message = deliveries[0]
    assert kind == "notification"
    assert recipient == str(session.candidate_id)
    assert subject == "Assessment result finalized"
    assert "did not pass" in message


def test_candidate_cannot_finalize_own_result(review_session, candidate):
    from app.errors import ForbiddenError
    from app.services.session_service import finalize_review

    session, _answer, deliveries = review_session
    with pytest.raises(ForbiddenError):
        finalize_review(candidate, str(session.id), {"decision": "reject"})
    assert deliveries == []


def test_processing_result_does_not_send_email(review_session):
    from app.services.session_service import notify_final_result

    session, _answer, deliveries = review_session
    notify_final_result(session)
    assert deliveries == []
    assert Credential.query.count() == 0


def test_another_candidate_cannot_download_a_certificate(client, auth_header, credential):
    from app.models import User
    from app.security import hash_password
    other = User(
        full_name="Other Candidate", email="other-certificate@test.rw",
        password_hash=hash_password("Password123"), role_name=UserRole.candidate,
        status=UserStatus.active, email_verified=True,
    )
    db.session.add(other)
    db.session.commit()
    headers = auth_header(client, "other-certificate@test.rw")
    response = client.get(f"/api/v1/certificates/{credential.id}/download", headers=headers)
    assert response.status_code == 403
    response = client.post(f"/api/v1/certificates/{credential.id}/email", headers=headers)
    assert response.status_code == 403
