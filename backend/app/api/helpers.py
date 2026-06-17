"""Shared helpers for API blueprints: request parsing & JSON responses."""
from __future__ import annotations

from flask import jsonify, request

from app.schemas.common import PaginationQuerySchema

_pagination_schema = PaginationQuerySchema()


def body() -> dict:
    return request.get_json(silent=True) or {}


def parse(schema, *, partial: bool = False) -> dict:
    """Validate the JSON body against a Marshmallow schema."""
    return schema.load(body(), partial=partial)


def pagination_args() -> dict:
    return _pagination_schema.load(request.args.to_dict())


def query_param(name: str, default=None):
    return request.args.get(name, default)


def ok(data=None, status: int = 200):
    return jsonify(data if data is not None else {"success": True}), status


def created(data):
    return jsonify(data), 201


def paginated(page, serializer):
    return jsonify(page.to_dict(serializer)), 200
