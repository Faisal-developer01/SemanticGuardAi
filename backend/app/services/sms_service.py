"""SMS delivery via Africa's Talking.

Used to deliver one-time MFA verification codes (and short alerts) to a user's
phone. Delivery happens inline on a daemon thread so the request never blocks on
the SMS gateway. When Africa's Talking is not configured the call is a no-op that
is logged, so the rest of the app keeps working.
"""
from __future__ import annotations

import threading
import time

from flask import current_app

# The official SDK is optional at import time so the app still boots without it.
try:  # pragma: no cover - import guard
    import africastalking  # type: ignore
except Exception:  # noqa: BLE001
    africastalking = None  # type: ignore


# ─── proctoring SMS gating + throttle ────────────────────────────────────────

# Per-key timestamp of the last proctoring SMS, so repeated events from one
# candidate cannot flood the recruiter's phone. Keyed by "{session_id}:{kind}".
_sms_throttle_lock = threading.Lock()
_sms_last_sent: dict[str, float] = {}

# Alert types that always warrant an SMS to the recruiter (subject to cooldown),
# in addition to any high/critical severity alert.
_SMS_ALERT_TYPES = {
    "phone_detected", "multiple_faces", "identity_mismatch", "object_detected",
    "face_not_detected", "tab_switch", "browser_unfocused", "devtools_open",
    "clipboard_attempt", "multiple_tabs",
}


def _sms_allowed(key: str) -> bool:
    """Return ``True`` at most once per cooldown window for a given key."""
    cooldown = current_app.config.get("PROCTORING_SMS_COOLDOWN_SECONDS", 120)
    now = time.time()
    with _sms_throttle_lock:
        if now - _sms_last_sent.get(key, 0.0) < cooldown:
            return False
        _sms_last_sent[key] = now
        return True


def _alert_warrants_sms(alert) -> bool:
    if alert is None:
        return False
    severity = alert.severity.value if alert.severity else "low"
    atype = alert.type.value if alert.type else ""
    return severity in ("high", "critical") or atype in _SMS_ALERT_TYPES


def _normalise_msisdn(number: str) -> str:
    """Return a phone number in international +E.164 form where possible."""
    number = (number or "").strip().replace(" ", "").replace("-", "")
    if not number:
        return number
    if number.startswith("+"):
        return number
    if number.startswith("00"):
        return "+" + number[2:]
    # Bare local Rwandan number (e.g. 0787947046) -> +250787947046.
    if number.startswith("0") and len(number) == 10:
        return "+250" + number[1:]
    return "+" + number


def _resolve_recipient(user_phone: str | None) -> str | None:
    """Pick the destination: the user's own phone, else the configured fallback."""
    fallback = current_app.config.get("MFA_SMS_FALLBACK_NUMBER")
    target = (user_phone or "").strip() or (fallback or "").strip()
    if not target:
        return None
    return _normalise_msisdn(target)


def send_sms(to: str | None, message: str) -> bool:
    """Send a single SMS. Returns ``True`` when handed to the gateway."""
    recipient = _resolve_recipient(to)
    if not recipient:
        current_app.logger.info("No SMS recipient available; skipped SMS: %s", message[:40])
        return False

    username = current_app.config.get("AT_USERNAME")
    api_key = current_app.config.get("AT_API_KEY")
    if not api_key or africastalking is None:
        current_app.logger.warning(
            "Africa's Talking not configured (AT_API_KEY/SDK missing); SMS to %s not sent.",
            recipient,
        )
        # Dev convenience: surface the message so SMS-based flows remain testable.
        if current_app.debug:
            current_app.logger.warning("[DEV] SMS to %s: %s", recipient, message)
        return False

    try:
        africastalking.initialize(username, api_key)
        sms = africastalking.SMS
        sender = current_app.config.get("AT_SENDER_ID") or None
        # Sandbox accounts must omit the senderId; only pass it when set.
        if sender:
            response = sms.send(message, [recipient], sender)
        else:
            response = sms.send(message, [recipient])
        current_app.logger.info("SMS sent to %s: %s", recipient, response)
        return True
    except Exception:  # noqa: BLE001 - never break the request because SMS failed
        current_app.logger.exception("Failed to send SMS to %s", recipient)
        return False


def send_mfa_code_sms(user_id: str, code: str) -> bool:
    """Build and send the MFA one-time code by SMS to the user's phone."""
    from app.repositories import users

    user = users.get(user_id)
    if not user:
        return False
    app_name = current_app.config.get("APP_NAME", "SemanticGuard AI")
    ttl = current_app.config.get("EMAIL_OTP_TTL_MINUTES", 10)
    message = f"{code} is your {app_name} verification code. It expires in {ttl} minutes. Do not share it."
    return send_sms(user.phone, message)


def deliver_mfa_code(user_id: str, code: str) -> None:
    """Queue an MFA code SMS for inline delivery on a daemon thread."""
    if not current_app.config.get("MFA_SMS_ENABLED", False):
        return
    app = current_app._get_current_object()

    def _run() -> None:
        with app.app_context():
            try:
                send_mfa_code_sms(user_id, code)
            except Exception:  # noqa: BLE001
                app.logger.exception("Inline SMS delivery failed for MFA code")

    threading.Thread(target=_run, daemon=True, name="sms-mfa").start()


def send_proctoring_alert_sms(session, alert) -> bool:
    """Build and send a proctoring alert SMS to the recruiter or admin."""
    recipient = None
    assessment = session.assessment
    if assessment and assessment.recruiter:
        recipient = assessment.recruiter.phone
    
    if not recipient:
        recipient = current_app.config.get("PROCTORING_SMS_RECIPIENT")
        
    if not recipient:
        current_app.logger.warning("No recipient phone number configured for proctoring alerts.")
        return False
        
    candidate_name = session.candidate.full_name if session.candidate else "A candidate"
    assessment_title = assessment.title if assessment else "assessment"
    alert_desc = alert.description if alert else "integrity issue"
    severity = alert.severity.value if alert else "unknown"
    
    message = f"[PROCTORING ALERT] Candidate {candidate_name} flagged for: {alert_desc} (Severity: {severity}) in assessment '{assessment_title}'."
    return send_sms(recipient, message)


def deliver_proctoring_alert(session, alert) -> None:
    """Queue a proctoring alert SMS, gated by severity and a per-type cooldown."""
    if not current_app.config.get("PROCTORING_SMS_ALERT_ENABLED", False):
        return
    if not _alert_warrants_sms(alert):
        return
    atype = alert.type.value if alert and alert.type else "alert"
    if not _sms_allowed(f"{session.id}:{atype}"):
        return
    app = current_app._get_current_object()

    def _run() -> None:
        with app.app_context():
            try:
                send_proctoring_alert_sms(session, alert)
            except Exception:
                app.logger.exception("Inline SMS delivery failed for proctoring alert")

    threading.Thread(target=_run, daemon=True, name="sms-proctoring").start()


def send_high_risk_sms(session) -> bool:
    """Notify the recruiter that a candidate crossed the integrity risk threshold."""
    assessment = session.assessment
    recipient = None
    if assessment and assessment.recruiter:
        recipient = assessment.recruiter.phone
    if not recipient:
        recipient = current_app.config.get("PROCTORING_SMS_RECIPIENT")
    if not recipient:
        current_app.logger.warning("No recipient phone number configured for high-risk alerts.")
        return False
    candidate_name = session.candidate.full_name if session.candidate else "A candidate"
    assessment_title = assessment.title if assessment else "assessment"
    message = (
        f"[HIGH RISK] {candidate_name} exceeded the integrity risk threshold "
        f"(risk score {int(session.risk_score or 0)}) in '{assessment_title}'. Review recommended."
    )
    return send_sms(recipient, message)


def deliver_high_risk_alert(session) -> None:
    """Queue a one-off high-risk SMS for the session (cooldown-guarded)."""
    if not current_app.config.get("PROCTORING_SMS_ALERT_ENABLED", False):
        return
    if not _sms_allowed(f"{session.id}:__high_risk__"):
        return
    app = current_app._get_current_object()

    def _run() -> None:
        with app.app_context():
            try:
                send_high_risk_sms(session)
            except Exception:
                app.logger.exception("Inline SMS delivery failed for high-risk alert")

    threading.Thread(target=_run, daemon=True, name="sms-highrisk").start()


def send_offline_alert_sms(session) -> bool:
    """Build and send a candidate offline notification SMS to the recruiter/admin."""
    recipient = None
    assessment = session.assessment
    if assessment and assessment.recruiter:
        recipient = assessment.recruiter.phone
        
    if not recipient:
        recipient = current_app.config.get("PROCTORING_SMS_RECIPIENT")
        
    if not recipient:
        current_app.logger.warning("No recipient phone number configured for proctoring offline alerts.")
        return False
        
    candidate_name = session.candidate.full_name if session.candidate else "A candidate"
    assessment_title = assessment.title if assessment else "assessment"
    
    message = f"[PROCTORING NOTICE] Candidate {candidate_name} went offline / closed browser during assessment '{assessment_title}'."
    return send_sms(recipient, message)


def deliver_offline_alert(session) -> None:
    """Queue a candidate offline alert SMS for inline delivery on a daemon thread."""
    if not current_app.config.get("PROCTORING_SMS_ALERT_ENABLED", False):
        return
    if not _sms_allowed(f"{session.id}:__offline__"):
        return
    app = current_app._get_current_object()

    def _run() -> None:
        with app.app_context():
            try:
                send_offline_alert_sms(session)
            except Exception:
                app.logger.exception("Inline SMS delivery failed for offline alert")

    threading.Thread(target=_run, daemon=True, name="sms-offline").start()

