"""Environment-driven configuration for SemanticGuard AI.

Secrets are read from environment variables (loaded from ``.env`` locally, or
injected from Azure Key Vault / App Service settings in production).
"""
from __future__ import annotations

import os
from datetime import timedelta

from dotenv import load_dotenv
from sqlalchemy.pool import StaticPool

load_dotenv()


def _bool(key: str, default: bool = False) -> bool:
    return os.getenv(key, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except (TypeError, ValueError):
        return default


class BaseConfig:
    APP_NAME = os.getenv("APP_NAME", "SemanticGuard AI")
    API_PREFIX = os.getenv("API_PREFIX", "/api/v1")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://semanticguard:semanticguard@localhost:5432/semanticguard",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = _bool("SQLALCHEMY_ECHO", False)
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 280}

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=_int("JWT_ACCESS_TOKEN_MINUTES", 30))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=_int("JWT_REFRESH_TOKEN_DAYS", 14))
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_BLACKLIST_ENABLED = True

    # Redis / Celery
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

    # Rate limiting (defaults to in-memory; set to redis://... in production)
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "200 per minute")
    RATELIMIT_HEADERS_ENABLED = True

    # Mail
    MAIL_SERVER = os.getenv("MAIL_SERVER", "localhost")
    MAIL_PORT = _int("MAIL_PORT", 587)
    MAIL_USE_TLS = _bool("MAIL_USE_TLS", True)
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER", "no-reply@semanticservices.rw")
    MAIL_SUPPRESS_SEND = _bool("MAIL_SUPPRESS_SEND", False)
    EMAIL_OTP_TTL_MINUTES = _int("EMAIL_OTP_TTL_MINUTES", 10)
    # When no SMTP provider is configured, accounts can be activated without an
    # email round-trip. Enable this in environments that cannot deliver email.
    AUTH_AUTO_VERIFY_EMAIL = _bool("AUTH_AUTO_VERIFY_EMAIL", False)

    # SendGrid (Dynamic Template email — registration OTP verification)
    SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
    SENDGRID_OTP_TEMPLATE_ID = os.getenv(
        "SENDGRID_OTP_TEMPLATE_ID", "d-dc510639f0b542638e8ba33ea84d7059"
    )
    # Must be a verified single sender / authenticated domain in SendGrid.
    SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "no-reply@semanticservices.rw")
    SENDGRID_FROM_NAME = os.getenv("SENDGRID_FROM_NAME", APP_NAME)
    # Minimum seconds a user must wait between OTP resend requests.
    OTP_RESEND_COOLDOWN_SECONDS = _int("OTP_RESEND_COOLDOWN_SECONDS", 60)

    # SMS (Africa's Talking)
    AT_USERNAME = os.getenv("AT_USERNAME", "sandbox")
    AT_API_KEY = os.getenv("AT_API_KEY")
    # Leave blank for sandbox; set to your approved alphanumeric/short code in prod.
    AT_SENDER_ID = os.getenv("AT_SENDER_ID") or None
    # Also deliver MFA one-time codes by SMS (in addition to email).
    MFA_SMS_ENABLED = _bool("MFA_SMS_ENABLED", True)
    # When a user has no phone on file, MFA codes fall back to this number.
    MFA_SMS_FALLBACK_NUMBER = os.getenv("MFA_SMS_FALLBACK_NUMBER")
    PROCTORING_SMS_ALERT_ENABLED = _bool("PROCTORING_SMS_ALERT_ENABLED", True)
    PROCTORING_SMS_RECIPIENT = os.getenv("PROCTORING_SMS_RECIPIENT")
    # Minimum seconds between proctoring SMS of the same kind for one session,
    # so a single candidate cannot trigger an SMS storm to the recruiter.
    PROCTORING_SMS_COOLDOWN_SECONDS = _int("PROCTORING_SMS_COOLDOWN_SECONDS", 120)

    # Storage
    STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local")
    STORAGE_LOCAL_PATH = os.getenv("STORAGE_LOCAL_PATH", "./var/uploads")
    AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    # Blob endpoint for managed-identity access (preferred; no account key needed).
    AZURE_STORAGE_ACCOUNT_URL = os.getenv("AZURE_STORAGE_ACCOUNT_URL")
    AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "evidence")
    MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
    MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
    MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
    MINIO_BUCKET = os.getenv("MINIO_BUCKET", "evidence")

    # Real-time
    SOCKETIO_MESSAGE_QUEUE = os.getenv("SOCKETIO_MESSAGE_QUEUE") or None
    # Defaults to threading so the app always boots; set to "eventlet" in prod.
    SOCKETIO_ASYNC_MODE = os.getenv("SOCKETIO_ASYNC_MODE", "threading")
    AZURE_WEBPUBSUB_CONNECTION_STRING = os.getenv("AZURE_WEBPUBSUB_CONNECTION_STRING")

    # Azure
    AZURE_KEY_VAULT_URI = os.getenv("AZURE_KEY_VAULT_URI")
    APPLICATIONINSIGHTS_CONNECTION_STRING = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")

    # Security
    BCRYPT_ROUNDS = _int("BCRYPT_ROUNDS", 12)
    MFA_ISSUER = os.getenv("MFA_ISSUER", "SemanticGuard AI")
    MAX_LOGIN_ATTEMPTS = _int("MAX_LOGIN_ATTEMPTS", 5)
    ACCOUNT_LOCK_MINUTES = _int("ACCOUNT_LOCK_MINUTES", 15)
    MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 50)
    MAX_CONTENT_LENGTH = MAX_UPLOAD_MB * 1024 * 1024
    ALLOWED_UPLOAD_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "mp4", "webm", "wav", "mp3"}

    DEBUG = False
    TESTING = False


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class TestingConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")
    # Keep a single shared in-memory connection so schema/data persist across the test session.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)
    RATELIMIT_ENABLED = False
    RATELIMIT_STORAGE_URI = "memory://"
    MAIL_SUPPRESS_SEND = True
    MFA_SMS_ENABLED = False
    # Keep tests hermetic: never reach the real SendGrid API.
    SENDGRID_API_KEY = None
    SOCKETIO_MESSAGE_QUEUE = None
    SOCKETIO_ASYNC_MODE = "threading"


class ProductionConfig(BaseConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PREFERRED_URL_SCHEME = "https"


_CONFIG_MAP = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name: str | None = None) -> type[BaseConfig]:
    name = (name or os.getenv("FLASK_ENV", "development")).lower()
    return _CONFIG_MAP.get(name, DevelopmentConfig)
