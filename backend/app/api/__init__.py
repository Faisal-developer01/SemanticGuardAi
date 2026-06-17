"""API blueprint registry.

Blueprints are registered here as they are implemented (Step 2+). Keeping the
registrar isolated lets the app factory import it without circular imports.
"""
from __future__ import annotations

from flask import Flask


def register_blueprints(app: Flask) -> None:
    prefix = app.config["API_PREFIX"]
    registered: list[str] = []

    # Each block is guarded so partial implementation never breaks startup.
    try:
        from app.api.auth import bp as auth_bp

        app.register_blueprint(auth_bp, url_prefix=f"{prefix}/auth")
        registered.append("auth")
    except ImportError:
        pass

    for module_name, segment in [
        ("users", "users"),
        ("assessments", "assessments"),
        ("questions", "questions"),
        ("sessions", "sessions"),
        ("alerts", "alerts"),
        ("evidence", "evidence"),
        ("notifications", "notifications"),
        ("audit", "audit-logs"),
        ("reports", "reports"),
        ("settings", "settings"),
    ]:
        try:
            module = __import__(f"app.api.{module_name}", fromlist=["bp"])
            app.register_blueprint(module.bp, url_prefix=f"{prefix}/{segment}")
            registered.append(module_name)
        except ImportError:
            continue

    app.logger.info("Registered API blueprints: %s", ", ".join(registered) or "none")
