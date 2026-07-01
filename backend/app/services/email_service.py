"""Transactional email delivery (Flask-Mail).

All user-facing email — verification, password reset, MFA one-time codes and
generic notifications — is sent to the address the user registered with (e.g.
their personal Gmail). Delivery prefers the Celery worker; when no broker is
reachable it falls back to sending inline on a background thread so the feature
still works in local development without Redis/Celery running.
"""
from __future__ import annotations

import threading

from flask import current_app, render_template_string
from flask_mail import Message

from app.extensions import mail

# ─── HTML shell ────────────────────────────────────────────────────────────────

_BASE_TEMPLATE = """\
<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#0ea5e9;border-radius:12px 12px 0 0;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.3px;">{{ app_name }}</span>
      </div>
      <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px;border:1px solid #e2e8f0;border-top:0;">
        <h1 style="margin:0 0 12px;font-size:20px;">{{ title }}</h1>
        <p style="margin:0 0 16px;line-height:1.6;">Hi {{ name }},</p>
        {{ body | safe }}
        <p style="margin:24px 0 0;font-size:12px;color:#64748b;line-height:1.6;">
          If you did not expect this email you can safely ignore it.<br/>
          &copy; {{ app_name }} — Semantic Services Rwanda.
        </p>
      </div>
    </div>
  </body>
</html>
"""


def _render(title: str, name: str, body_html: str) -> str:
    return render_template_string(
        _BASE_TEMPLATE,
        app_name=current_app.config.get("APP_NAME", "SemanticGuard AI"),
        title=title,
        name=name,
        body=body_html,
    )


def _frontend(path: str) -> str:
    base = current_app.config.get("FRONTEND_ORIGIN", "").rstrip("/")
    return f"{base}{path}"


# ─── Low-level send ─────────────────────────────────────────────────────────────

def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
    attachments: list[tuple[str, str, bytes]] | None = None,
) -> bool:
    """Send a single email. Returns ``True`` when handed to the mail server.

    ``attachments`` is a list of ``(filename, mimetype, data)`` tuples.
    """
    if current_app.config.get("MAIL_SUPPRESS_SEND"):
        current_app.logger.info("MAIL_SUPPRESS_SEND active; skipped email to %s (%s)", to, subject)
        return False
    if not current_app.config.get("MAIL_USERNAME") and current_app.config.get("MAIL_SERVER") in (None, "localhost"):
        current_app.logger.warning(
            "SMTP not configured (MAIL_USERNAME/MAIL_SERVER); email to %s not sent: %s", to, subject
        )
        return False

    msg = Message(subject=subject, recipients=[to], html=html_body, body=text_body or "")
    for filename, mimetype, data in attachments or []:
        msg.attach(filename=filename, content_type=mimetype, data=data)
    try:
        mail.send(msg)
        current_app.logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception:  # noqa: BLE001 - never break the request because mail failed
        current_app.logger.exception("Failed to send email to %s: %s", to, subject)
        return False


# ─── Content builders + senders (called by Celery tasks or inline) ──────────────

def send_verification_email(user_id: str, token: str) -> bool:
    from app.repositories import users

    user = users.get(user_id)
    if not user:
        return False
    link = _frontend(f"/verify-email?token={token}")
    body = (
        f'<p style="margin:0 0 16px;line-height:1.6;">Welcome aboard! Confirm your email address to activate '
        f"your account and start receiving notifications.</p>"
        f'<p style="margin:0 0 24px;"><a href="{link}" '
        f'style="background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;'
        f'font-weight:600;display:inline-block;">Verify my email</a></p>'
        f'<p style="margin:0;font-size:13px;color:#475569;word-break:break-all;">Or paste this link: {link}</p>'
    )
    html = _render("Verify your email", user.full_name, body)
    return send_email(user.email, "Verify your SemanticGuard AI account", html, f"Verify your email: {link}")


def send_password_reset_email(user_id: str, token: str) -> bool:
    from app.repositories import users

    user = users.get(user_id)
    if not user:
        return False
    link = _frontend(f"/reset-password?token={token}")
    body = (
        f'<p style="margin:0 0 16px;line-height:1.6;">We received a request to reset your password. '
        f"This link expires in 1 hour.</p>"
        f'<p style="margin:0 0 24px;"><a href="{link}" '
        f'style="background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;'
        f'font-weight:600;display:inline-block;">Reset my password</a></p>'
        f'<p style="margin:0;font-size:13px;color:#475569;word-break:break-all;">Or paste this link: {link}</p>'
    )
    html = _render("Reset your password", user.full_name, body)
    return send_email(user.email, "Reset your SemanticGuard AI password", html, f"Reset your password: {link}")


def send_mfa_code_email(user_id: str, code: str) -> bool:
    from app.repositories import users

    user = users.get(user_id)
    if not user:
        return False
    ttl = current_app.config.get("EMAIL_OTP_TTL_MINUTES", 10)
    body = (
        f'<p style="margin:0 0 16px;line-height:1.6;">Use this one-time verification code to finish signing in. '
        f"It expires in {ttl} minutes.</p>"
        f'<div style="margin:0 0 8px;font-size:34px;font-weight:800;letter-spacing:10px;color:#0f172a;'
        f'background:#f1f5f9;border-radius:10px;padding:18px 0;text-align:center;">{code}</div>'
        f'<p style="margin:16px 0 0;font-size:13px;color:#475569;">Never share this code with anyone.</p>'
    )
    html = _render("Your verification code", user.full_name, body)
    sent = send_email(user.email, f"{code} is your SemanticGuard AI code", html, f"Your code is {code}")
    # Dev convenience: when SMTP isn't configured, surface the code in the log so
    # the email-MFA flow is testable locally. Never logged in production.
    if not sent and current_app.debug:
        current_app.logger.warning("[DEV] Email MFA code for %s: %s", user.email, code)
    return sent


def send_notification_email(user_id: str, subject: str, message: str) -> bool:
    from app.repositories import users

    user = users.get(user_id)
    if not user:
        return False
    body = f'<p style="margin:0;line-height:1.6;">{message}</p>'
    html = _render(subject, user.full_name, body)
    return send_email(user.email, subject, html, message)


def send_credential_email(user_id: str, credential_ids: list[str]) -> bool:
    """Email the candidate their certificate and/or offer letter as PDF attachments."""
    from app.repositories import credentials as credentials_repo
    from app.repositories import users
    from app.services import certificate_service

    user = users.get(user_id)
    if not user:
        return False

    attachments: list[tuple[str, str, bytes]] = []
    labels: list[str] = []
    for cid in credential_ids or []:
        cred = credentials_repo.get(cid)
        if not cred:
            continue
        try:
            data = certificate_service.get_pdf_bytes(cred)
        except Exception:  # noqa: BLE001 - skip an attachment that fails to render
            current_app.logger.exception("Failed to render credential PDF %s", cid)
            continue
        attachments.append((certificate_service.download_filename(cred), "application/pdf", data))
        labels.append("Completion Certificate" if cred.type.value == "certificate" else "Offer Letter")

    if not attachments:
        return False

    items = "".join(f"<li>{label}</li>" for label in labels)
    body = (
        '<p style="margin:0 0 16px;line-height:1.6;">Congratulations on passing your assessment! '
        "Please find the following document(s) attached to this email:</p>"
        f'<ul style="margin:0 0 16px;line-height:1.8;">{items}</ul>'
        '<p style="margin:0;line-height:1.6;">Each document includes a QR code you can scan to verify its authenticity.</p>'
    )
    html = _render("Your certificate & offer letter", user.full_name, body)
    return send_email(
        user.email,
        "Congratulations — your certificate & offer letter",
        html,
        "Congratulations on passing your assessment. Your documents are attached.",
        attachments=attachments,
    )


# ─── Delivery dispatcher (Celery preferred, inline thread fallback) ─────────────

# Maps a logical name to (celery task attribute, local sender function).
_SENDERS = {
    "verification": send_verification_email,
    "password_reset": send_password_reset_email,
    "mfa_code": send_mfa_code_email,
    "notification": send_notification_email,
    "credential": send_credential_email,
}


def deliver(kind: str, *args) -> None:
    """Queue an email for delivery. Tries the Celery worker first, then falls
    back to sending inline on a daemon thread so requests never block on SMTP."""
    fn = _SENDERS[kind]

    # 1) Try the Celery worker (production path).
    try:
        from app import tasks

        task = getattr(tasks, f"send_{kind}_email", None) or getattr(tasks, f"send_{kind}", None)
        if task is not None:
            task.delay(*args)
            return
    except Exception:  # noqa: BLE001 - broker unavailable, fall through to inline
        current_app.logger.debug("Celery unavailable for '%s' email; sending inline.", kind)

    # 2) Inline background thread bound to the current app context.
    app = current_app._get_current_object()

    def _run() -> None:
        with app.app_context():
            try:
                fn(*args)
            except Exception:  # noqa: BLE001
                app.logger.exception("Inline email delivery failed for '%s'", kind)

    threading.Thread(target=_run, daemon=True, name=f"email-{kind}").start()
