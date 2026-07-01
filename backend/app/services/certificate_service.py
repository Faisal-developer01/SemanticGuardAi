"""Certificate and offer-letter generation.

Passing candidates are automatically issued a completion **certificate** and an
**offer letter**. Both are rendered to PDF with ReportLab, branded with the
Semantic Services Rwanda logo and official stamp/signature, and carry a QR code
that links to the public verification endpoint. Generated PDFs are cached on
disk and can be downloaded or emailed as attachments.
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from flask import current_app

from app.models.enums import CredentialType
from app.repositories import credentials as credentials_repo

# ReportLab
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing

ISSUER_NAME = "Semantic Services Rwanda Ltd"

# Brand palette
_NAVY = HexColor("#0f172a")
_PRIMARY = HexColor("#0ea5e9")
_GOLD = HexColor("#b8860b")
_SLATE = HexColor("#475569")
_MUTED = HexColor("#94a3b8")


# ─── asset + storage resolution ──────────────────────────────────────────────

def _assets_dir() -> Path:
    """Directory holding the logo and stamp/signature images (public/img)."""
    configured = current_app.config.get("BRAND_ASSETS_DIR")
    if configured:
        return Path(configured)
    # backend/app/services/certificate_service.py -> repo root is parents[3]
    return Path(__file__).resolve().parents[3] / "public" / "img"


def _logo_path() -> Path | None:
    p = _assets_dir() / "Logo-semantic.png"
    return p if p.exists() else None


def _stamp_path() -> Path | None:
    p = _assets_dir() / "stamp&signature.png"
    return p if p.exists() else None


def _storage_dir() -> Path:
    base = Path(current_app.instance_path) / "credentials"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── number / token generation ───────────────────────────────────────────────

def _prefix(credential_type: CredentialType) -> str:
    return "CERT" if credential_type == CredentialType.certificate else "OFFER"


def _generate_number(credential_type: CredentialType) -> str:
    """Human-readable unique number, e.g. ``SSR-CERT-2026-000042``."""
    year = _now().year
    prefix = _prefix(credential_type)
    for _ in range(20):
        seq = credentials_repo.session.query(credentials_repo.model).filter(
            credentials_repo.model.type == credential_type
        ).count() + 1
        candidate = f"SSR-{prefix}-{year}-{seq:06d}"
        if not credentials_repo.get_by_number(candidate):
            return candidate
        # Extremely unlikely collision (concurrent issue) — fall back to random.
        candidate = f"SSR-{prefix}-{year}-{secrets.randbelow(1_000_000):06d}"
        if not credentials_repo.get_by_number(candidate):
            return candidate
    return f"SSR-{prefix}-{year}-{secrets.token_hex(4).upper()}"


def _verify_url(token: str) -> str:
    base = (current_app.config.get("FRONTEND_ORIGIN") or "").rstrip("/")
    return f"{base}/verify/{token}"


# ─── drawing helpers ─────────────────────────────────────────────────────────

def _qr_drawing(data: str, size: float) -> Drawing:
    widget = qr.QrCodeWidget(data)
    b = widget.getBounds()
    w = (b[2] - b[0]) or 1
    h = (b[3] - b[1]) or 1
    d = Drawing(size, size, transform=[size / w, 0, 0, size / h, 0, 0])
    d.add(widget)
    return d


def _draw_image_fit(c: canvas.Canvas, path: Path, x: float, y: float, max_w: float, max_h: float, anchor: str = "sw") -> None:
    """Draw an image scaled to fit within (max_w, max_h) preserving aspect ratio."""
    try:
        reader = ImageReader(str(path))
        iw, ih = reader.getSize()
    except Exception:
        return
    if not iw or not ih:
        return
    scale = min(max_w / iw, max_h / ih)
    w, h = iw * scale, ih * scale
    if anchor == "n":  # centered horizontally on x, top at y
        draw_x, draw_y = x - w / 2, y - h
    elif anchor == "s":  # centered horizontally on x, bottom at y
        draw_x, draw_y = x - w / 2, y
    else:  # "sw"
        draw_x, draw_y = x, y
    c.drawImage(reader, draw_x, draw_y, width=w, height=h, mask="auto", preserveAspectRatio=True)


# ─── certificate ─────────────────────────────────────────────────────────────

def _render_certificate(cred) -> bytes:
    buf = BytesIO()
    page = landscape(A4)
    width, height = page
    c = canvas.Canvas(buf, pagesize=page)

    # Outer decorative border
    c.setStrokeColor(_PRIMARY)
    c.setLineWidth(3)
    c.rect(12 * mm, 12 * mm, width - 24 * mm, height - 24 * mm)
    c.setStrokeColor(_GOLD)
    c.setLineWidth(1)
    c.rect(15 * mm, 15 * mm, width - 30 * mm, height - 30 * mm)

    center = width / 2

    # Logo
    logo = _logo_path()
    if logo:
        _draw_image_fit(c, logo, center, height - 26 * mm, 48 * mm, 24 * mm, anchor="n")

    c.setFillColor(_NAVY)
    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(center, height - 58 * mm, "CERTIFICATE OF COMPLETION")

    c.setFillColor(_PRIMARY)
    c.setLineWidth(1.5)
    c.line(center - 45 * mm, height - 62 * mm, center + 45 * mm, height - 62 * mm)

    c.setFillColor(_SLATE)
    c.setFont("Helvetica", 13)
    c.drawCentredString(center, height - 74 * mm, "This is to certify that")

    c.setFillColor(_NAVY)
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(center, height - 88 * mm, cred.candidate_name)

    c.setFillColor(_SLATE)
    c.setFont("Helvetica", 13)
    c.drawCentredString(center, height - 100 * mm, "has successfully completed the assessment")

    c.setFillColor(_NAVY)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(center, height - 111 * mm, f"\u201c{cred.title}\u201d")

    # Metrics row
    issued = cred.issued_at or _now()
    metrics = []
    if cred.percentage is not None:
        metrics.append(f"Score: {cred.percentage:.0f}%")
    if cred.integrity_score is not None:
        metrics.append(f"Integrity Score: {cred.integrity_score:.0f}%")
    metrics.append(f"Date: {issued.strftime('%d %B %Y')}")
    c.setFillColor(_SLATE)
    c.setFont("Helvetica", 12)
    c.drawCentredString(center, height - 124 * mm, "     |     ".join(metrics))

    # Stamp & signature (bottom-left area)
    stamp = _stamp_path()
    if stamp:
        _draw_image_fit(c, stamp, 40 * mm, 24 * mm, 55 * mm, 34 * mm, anchor="s")
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawCentredString(67 * mm, 20 * mm, "Authorized Signature & Official Stamp")

    # QR (bottom-right)
    qr_size = 30 * mm
    qr_x = width - 30 * mm - qr_size
    qr_y = 22 * mm
    renderPDF.draw(_qr_drawing(_verify_url(cred.verification_token), qr_size), c, qr_x, qr_y)
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 4 * mm, "Scan to verify")

    # Certificate number + issuer footer
    c.setFillColor(_SLATE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(30 * mm, 34 * mm, f"Certificate No: {cred.number}")
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawCentredString(center, 17 * mm, f"Issued by {ISSUER_NAME}")

    c.showPage()
    c.save()
    return buf.getvalue()


# ─── offer letter ────────────────────────────────────────────────────────────

def _default_offer_body(cred) -> str:
    position = cred.position or "the offered position"
    return (
        f"We are pleased to offer you the position of {position} at {ISSUER_NAME}. "
        "This offer follows your successful completion of our recruitment assessment, "
        "during which you demonstrated the competencies and integrity we value.\n\n"
        "Joining instructions:\n"
        "1. Confirm your acceptance by replying to this letter within 7 days.\n"
        "2. Bring a valid national ID and your academic/professional certificates on your first day.\n"
        "3. Report to the Human Resources office at 08:30 AM on your agreed start date.\n\n"
        "We look forward to welcoming you to the team and to a productive working relationship."
    )


def _wrap(c: canvas.Canvas, text: str, font: str, size: float, max_w: float) -> list[str]:
    c.setFont(font, size)
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph.strip():
            lines.append("")
            continue
        words = paragraph.split(" ")
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            if c.stringWidth(trial, font, size) <= max_w:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def _render_offer_letter(cred) -> bytes:
    buf = BytesIO()
    page = A4
    width, height = page
    c = canvas.Canvas(buf, pagesize=page)
    left = 25 * mm
    right = width - 25 * mm
    content_w = right - left

    # Letterhead
    logo = _logo_path()
    if logo:
        _draw_image_fit(c, logo, left, height - 32 * mm, 42 * mm, 20 * mm, anchor="sw")
    c.setFillColor(_NAVY)
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(right, height - 20 * mm, ISSUER_NAME)
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawRightString(right, height - 25 * mm, "Kigali, Rwanda")
    c.drawRightString(right, height - 29 * mm, "www.semantic.rw")

    c.setStrokeColor(_PRIMARY)
    c.setLineWidth(1.2)
    c.line(left, height - 37 * mm, right, height - 37 * mm)

    issued = cred.issued_at or _now()
    y = height - 48 * mm
    c.setFillColor(_SLATE)
    c.setFont("Helvetica", 10)
    c.drawString(left, y, f"Date: {issued.strftime('%d %B %Y')}")
    c.drawRightString(right, y, f"Ref: {cred.number}")

    y -= 12 * mm
    c.setFillColor(_NAVY)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(left, y, "OFFER OF EMPLOYMENT")

    y -= 10 * mm
    c.setFillColor(_NAVY)
    c.setFont("Helvetica", 11)
    c.drawString(left, y, f"Dear {cred.candidate_name},")

    # Body
    y -= 9 * mm
    body = cred.body or _default_offer_body(cred)
    for line in _wrap(c, body, "Helvetica", 11, content_w):
        if line == "":
            y -= 4 * mm
            continue
        c.setFillColor(_SLATE)
        c.setFont("Helvetica", 11)
        c.drawString(left, y, line)
        y -= 6.2 * mm
        if y < 70 * mm:  # avoid colliding with signature block
            break

    # Signature + stamp
    sig_y = 45 * mm
    c.setFillColor(_NAVY)
    c.setFont("Helvetica", 11)
    c.drawString(left, sig_y + 24 * mm, "Yours sincerely,")
    stamp = _stamp_path()
    if stamp:
        _draw_image_fit(c, stamp, left, sig_y, 55 * mm, 26 * mm, anchor="sw")
    c.setStrokeColor(_SLATE)
    c.setLineWidth(0.8)
    c.line(left, sig_y - 2 * mm, left + 55 * mm, sig_y - 2 * mm)
    c.setFillColor(_SLATE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, sig_y - 7 * mm, "Human Resources Department")
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(left, sig_y - 11 * mm, ISSUER_NAME)

    # QR verification (bottom-right)
    qr_size = 26 * mm
    qr_x = right - qr_size
    qr_y = 20 * mm
    renderPDF.draw(_qr_drawing(_verify_url(cred.verification_token), qr_size), c, qr_x, qr_y)
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 4 * mm, "Scan to verify")

    c.showPage()
    c.save()
    return buf.getvalue()


# ─── public API ──────────────────────────────────────────────────────────────

def render_pdf(cred) -> bytes:
    if cred.type == CredentialType.certificate:
        return _render_certificate(cred)
    return _render_offer_letter(cred)


def _persist_pdf(cred) -> str:
    data = render_pdf(cred)
    filename = f"{cred.number}.pdf"
    path = _storage_dir() / filename
    path.write_bytes(data)
    return str(path)


def get_pdf_bytes(cred) -> bytes:
    """Return the credential PDF, reading the cached file or regenerating it."""
    if cred.file_path and os.path.exists(cred.file_path):
        try:
            return Path(cred.file_path).read_bytes()
        except OSError:
            pass
    data = render_pdf(cred)
    try:
        path = _storage_dir() / f"{cred.number}.pdf"
        path.write_bytes(data)
        cred.file_path = str(path)
        credentials_repo.session.commit()
    except Exception:  # noqa: BLE001 - caching is best-effort
        credentials_repo.session.rollback()
    return data


def download_filename(cred) -> str:
    kind = "Certificate" if cred.type == CredentialType.certificate else "Offer-Letter"
    safe_name = "".join(ch for ch in cred.candidate_name if ch.isalnum() or ch in " -_").strip().replace(" ", "-")
    return f"{kind}-{safe_name}-{cred.number}.pdf"


def issue(session, credential_type: CredentialType, *, position: str | None = None, body: str | None = None):
    """Issue (or return the already-issued) credential for a session.

    Idempotent: a session yields at most one certificate and one offer letter.
    """
    existing = credentials_repo.find_issued(session.id, credential_type)
    if existing:
        return existing

    candidate = getattr(session, "candidate", None)
    assessment = getattr(session, "assessment", None)
    profile = getattr(candidate, "candidate_profile", None) if candidate else None

    candidate_name = getattr(candidate, "full_name", None) or "Candidate"
    assessment_title = getattr(assessment, "title", None) or "Assessment"
    resolved_position = position or getattr(assessment, "position", None) or getattr(profile, "position", None)
    department = getattr(profile, "department", None)

    token = secrets.token_urlsafe(24)
    number = _generate_number(credential_type)

    cred = credentials_repo.create(
        type=credential_type,
        number=number,
        verification_token=token,
        candidate_id=session.candidate_id,
        assessment_id=session.assessment_id,
        session_id=session.id,
        candidate_name=candidate_name,
        title=assessment_title if credential_type == CredentialType.certificate else (resolved_position or assessment_title),
        position=resolved_position,
        department=department,
        integrity_score=getattr(session, "integrity_score", None),
        score=getattr(session, "score", None),
        percentage=getattr(session, "percentage", None),
        body=body,
        issued_at=_now(),
    )
    try:
        cred.file_path = _persist_pdf(cred)
        credentials_repo.session.commit()
    except Exception:  # noqa: BLE001 - defer generation to first download if it fails
        credentials_repo.session.rollback()
    return cred


def issue_for_passed_session(session) -> list:
    """Auto-issue a certificate and offer letter for a candidate who passed."""
    issued = [
        issue(session, CredentialType.certificate),
        issue(session, CredentialType.offer_letter),
    ]
    return issued


def verify(token: str) -> dict:
    """Public verification payload for a QR-code scan. Never raises."""
    cred = credentials_repo.get_by_token(token) if token else None
    if not cred:
        return {"valid": False, "issuer": ISSUER_NAME, "revoked": False}
    return {
        "valid": not cred.revoked,
        "type": cred.type.value if cred.type else None,
        "number": cred.number,
        "candidateName": cred.candidate_name,
        "title": cred.title,
        "position": cred.position,
        "integrityScore": cred.integrity_score,
        "issuedAt": cred.issued_at.isoformat() if cred.issued_at else None,
        "revoked": bool(cred.revoked),
        "issuer": ISSUER_NAME,
    }
