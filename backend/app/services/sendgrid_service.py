"""Transactional email via SendGrid Dynamic Templates.

Used to deliver the registration one-time verification code (OTP). The code is
never baked into HTML here — it is passed to SendGrid as ``dynamic_template_data``
so the template owns all presentation. Delivery happens inline on a daemon thread
so the request never blocks on the SendGrid API; when SendGrid is not configured
the call is a logged no-op so the rest of the app keeps working.

Security:
- The SendGrid API key is read from server-side config only (never exposed to the
  frontend).
- The OTP itself is generated, hashed and expired by ``auth_service``; this module
  only transports the plaintext code to the user's inbox.
"""
from __future__ import annotations

import threading

from flask import current_app

# The official SDK is optional at import time so the app still boots without it.
try:  # pragma: no cover - import guard
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
except Exception:  # noqa: BLE001
    SendGridAPIClient = None  # type: ignore
    Mail = None  # type: ignore


def send_template_email(to_email: str, template_id: str, dynamic_data: dict) -> bool:
    """Send a single Dynamic Template email. Returns ``True`` when accepted by SendGrid."""
    api_key = current_app.config.get("SENDGRID_API_KEY")
    from_email = current_app.config.get("SENDGRID_FROM_EMAIL")
    from_name = current_app.config.get("SENDGRID_FROM_NAME")

    if not api_key or SendGridAPIClient is None or Mail is None:
        current_app.logger.warning(
            "SendGrid not configured (SENDGRID_API_KEY/SDK missing); email to %s not sent.",
            to_email,
        )
        # Dev convenience: surface the data so OTP flows remain testable locally.
        if current_app.debug:
            current_app.logger.warning("[DEV] SendGrid template %s to %s: %s", template_id, to_email, dynamic_data)
        return False

    if not template_id:
        current_app.logger.error("SENDGRID_OTP_TEMPLATE_ID is not set; cannot send template email.")
        return False

    message = Mail(from_email=(from_email, from_name), to_emails=to_email)
    message.template_id = template_id
    message.dynamic_template_data = dynamic_data

    try:
        client = SendGridAPIClient(api_key)
        response = client.send(message)
        accepted = 200 <= response.status_code < 300
        if accepted:
            current_app.logger.info("SendGrid email accepted for %s (status %s)", to_email, response.status_code)
        else:
            current_app.logger.error(
                "SendGrid rejected email for %s (status %s): %s",
                to_email,
                response.status_code,
                getattr(response, "body", b""),
            )
        return accepted
    except Exception:  # noqa: BLE001 - never break the request because email failed
        current_app.logger.exception("Failed to send SendGrid email to %s", to_email)
        return False


def send_otp_email(user_id: str, otp: str) -> bool:
    """Build and send the registration OTP using the configured dynamic template."""
    from app.repositories import users

    user = users.get(user_id)
    if not user:
        return False

    ttl = current_app.config.get("EMAIL_OTP_TTL_MINUTES", 10)
    template_id = current_app.config.get("SENDGRID_OTP_TEMPLATE_ID")
    dynamic_data = {
        # Primary variable required by the template.
        "otp": otp,
        # Extra context the template may optionally use.
        "name": user.full_name,
        "app_name": current_app.config.get("APP_NAME", "SemanticGuard AI"),
        "ttl_minutes": ttl,
    }
    sent = send_template_email(user.email, template_id, dynamic_data)
    if not sent and current_app.debug:
        current_app.logger.warning("[DEV] Registration OTP for %s: %s", user.email, otp)
    return sent


def deliver_otp(user_id: str, otp: str) -> None:
    """Queue an OTP email for inline delivery on a daemon thread."""
    app = current_app._get_current_object()

    def _run() -> None:
        with app.app_context():
            try:
                send_otp_email(user_id, otp)
            except Exception:  # noqa: BLE001
                app.logger.exception("Inline SendGrid OTP delivery failed")

    threading.Thread(target=_run, daemon=True, name="sendgrid-otp").start()
