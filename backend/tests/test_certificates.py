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

    def capture_email(to, subject, html_body, text_body, attachments):
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
