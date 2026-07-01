"""Celery tasks for asynchronous email delivery.

These wrap :mod:`app.services.email_service`. The application calls
``email_service.deliver(...)`` which prefers ``<task>.delay()`` when a broker is
available and otherwise sends inline, so these tasks are optional in dev.
"""
from __future__ import annotations

from celery_app import celery
from app.services import email_service


@celery.task(name="email.send_verification", bind=True, max_retries=3, default_retry_delay=30)
def send_verification_email(self, user_id: str, token: str) -> bool:
    try:
        return email_service.send_verification_email(user_id, token)
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc)


@celery.task(name="email.send_password_reset", bind=True, max_retries=3, default_retry_delay=30)
def send_password_reset_email(self, user_id: str, token: str) -> bool:
    try:
        return email_service.send_password_reset_email(user_id, token)
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc)


@celery.task(name="email.send_mfa_code", bind=True, max_retries=3, default_retry_delay=15)
def send_mfa_code_email(self, user_id: str, code: str) -> bool:
    try:
        return email_service.send_mfa_code_email(user_id, code)
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc)


@celery.task(name="email.send_notification", bind=True, max_retries=3, default_retry_delay=30)
def send_notification_email(self, user_id: str, subject: str, message: str) -> bool:
    try:
        return email_service.send_notification_email(user_id, subject, message)
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc)


@celery.task(name="email.send_credential", bind=True, max_retries=3, default_retry_delay=30)
def send_credential_email(self, user_id: str, credential_ids: list[str]) -> bool:
    try:
        return email_service.send_credential_email(user_id, credential_ids)
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc)
