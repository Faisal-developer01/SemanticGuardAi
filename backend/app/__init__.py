"""Application factory for SemanticGuard AI."""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask, jsonify

from app.config import get_config
from app.extensions import cors, db, jwt, limiter, mail, migrate, socketio


def create_app(config_name: str | None = None) -> Flask:
    project_root = Path(__file__).resolve().parents[2]
    app = Flask(
        __name__,
        static_folder=str(project_root / "dist"),
        template_folder=str(project_root / "dist"),
    )
    config = get_config(config_name)
    app.config.from_object(config)

    _load_keyvault_secrets(app)
    _init_extensions(app)
    _register_jwt_callbacks(app)
    _register_blueprints(app)
    _register_error_handlers(app)
    _register_security_headers(app)
    _register_cli(app)
    _configure_logging(app)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_spa(path: str):
        if path and (Path(app.static_folder) / path).exists():
            return app.send_static_file(path)
        return app.send_static_file("index.html")

    @app.get("/health")
    def health():  # pragma: no cover - trivial
        return jsonify(status="ok", app=app.config["APP_NAME"]), 200

    @app.get(f"{app.config['API_PREFIX']}/meta")
    def meta():
        return jsonify(
            name=app.config["APP_NAME"],
            api_prefix=app.config["API_PREFIX"],
            operator="Semantic Services Rwanda",
        )

    return app


def _init_extensions(app: Flask) -> None:
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": [app.config["FRONTEND_ORIGIN"]]}},
        supports_credentials=True,
    )
    socketio.init_app(
        app,
        cors_allowed_origins=[app.config["FRONTEND_ORIGIN"]],
        message_queue=app.config.get("SOCKETIO_MESSAGE_QUEUE"),
        async_mode=app.config.get("SOCKETIO_ASYNC_MODE", "threading"),
    )
    # Import registers the @socketio.on(...) handlers (connect / monitoring rooms).
    from app import realtime  # noqa: F401


def _register_jwt_callbacks(app: Flask) -> None:
    from app.models import TokenBlocklist

    @jwt.token_in_blocklist_loader
    def is_revoked(_jwt_header, jwt_payload) -> bool:
        jti = jwt_payload["jti"]
        return db.session.query(TokenBlocklist.id).filter_by(jti=jti).first() is not None

    @jwt.expired_token_loader
    def expired(_h, _p):
        return jsonify(error="token_expired", message="Token has expired"), 401

    @jwt.invalid_token_loader
    def invalid(reason):
        return jsonify(error="invalid_token", message=str(reason)), 401

    @jwt.unauthorized_loader
    def missing(reason):
        return jsonify(error="authorization_required", message=str(reason)), 401


def _register_blueprints(app: Flask) -> None:
    try:
        from app.api import register_blueprints

        register_blueprints(app)
    except ImportError:
        app.logger.warning("API blueprints not yet available; skipping registration.")


def _register_error_handlers(app: Flask) -> None:
    from app.errors import register_error_handlers

    register_error_handlers(app)


def _register_security_headers(app: Flask) -> None:
    @app.after_request
    def set_secure_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-XSS-Protection", "1; mode=block")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(self), microphone=(self), geolocation=()"
        )
        if not app.debug:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


def _register_cli(app: Flask) -> None:
    try:
        from app.cli import register_cli

        register_cli(app)
    except ImportError:
        pass


def _configure_logging(app: Flask) -> None:
    level = logging.DEBUG if app.debug else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    conn = app.config.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if conn:
        try:
            from opencensus.ext.azure.log_exporter import AzureLogHandler

            app.logger.addHandler(AzureLogHandler(connection_string=conn))
            app.logger.info("Application Insights logging enabled.")
        except Exception as exc:  # pragma: no cover - optional dependency
            app.logger.warning("Could not enable App Insights logging: %s", exc)


def _load_keyvault_secrets(app: Flask) -> None:
    """Load secrets from Azure Key Vault when AZURE_KEY_VAULT_URI is configured."""
    vault_uri = app.config.get("AZURE_KEY_VAULT_URI")
    if not vault_uri:
        return
    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient

        client = SecretClient(vault_url=vault_uri, credential=DefaultAzureCredential())
        mapping = {
            "SECRET_KEY": "secret-key",
            "JWT_SECRET_KEY": "jwt-secret-key",
            "SQLALCHEMY_DATABASE_URI": "database-url",
            "MAIL_PASSWORD": "mail-password",
            "AT_API_KEY": "africastalking-api-key",
            "AZURE_STORAGE_CONNECTION_STRING": "storage-connection-string",
        }
        for config_key, secret_name in mapping.items():
            try:
                app.config[config_key] = client.get_secret(secret_name).value
            except Exception:
                continue
        app.logger.info("Loaded secrets from Azure Key Vault.")
    except Exception as exc:  # pragma: no cover - optional dependency
        app.logger.warning("Key Vault load skipped: %s", exc)
