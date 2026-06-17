"""Centralized error handling with consistent JSON envelopes."""
from __future__ import annotations

from flask import Flask, jsonify
from marshmallow import ValidationError
from werkzeug.exceptions import HTTPException


class APIError(Exception):
    """Base application error mapped to a JSON response."""

    status_code = 400
    error_code = "bad_request"

    def __init__(self, message: str, status_code: int | None = None, error_code: str | None = None, payload: dict | None = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if error_code is not None:
            self.error_code = error_code
        self.payload = payload or {}


class NotFoundError(APIError):
    status_code = 404
    error_code = "not_found"


class UnauthorizedError(APIError):
    status_code = 401
    error_code = "unauthorized"


class ForbiddenError(APIError):
    status_code = 403
    error_code = "forbidden"


class ConflictError(APIError):
    status_code = 409
    error_code = "conflict"


class RateLimitError(APIError):
    status_code = 429
    error_code = "rate_limited"


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(APIError)
    def handle_api_error(err: APIError):
        body = {"error": err.error_code, "message": err.message}
        if err.payload:
            body["details"] = err.payload
        return jsonify(body), err.status_code

    @app.errorhandler(ValidationError)
    def handle_validation_error(err: ValidationError):
        return jsonify(error="validation_error", message="Invalid input", details=err.messages), 422

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        return jsonify(error=err.name.lower().replace(" ", "_"), message=err.description), err.code or 500

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):  # pragma: no cover
        app.logger.exception("Unhandled exception: %s", err)
        message = str(err) if app.debug else "An unexpected error occurred"
        return jsonify(error="internal_server_error", message=message), 500
