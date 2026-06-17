"""Common schema helpers: camelCase output, pagination query parsing."""
from __future__ import annotations

import re

from marshmallow import EXCLUDE, Schema, fields

_first_cap = re.compile(r"(.)([A-Z][a-z]+)")
_all_cap = re.compile(r"([a-z0-9])([A-Z])")


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class CamelCaseSchema(Schema):
    """Serializes snake_case attributes to camelCase keys (frontend-friendly)
    and accepts both forms on input."""

    class Meta:
        unknown = EXCLUDE

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = to_camel(field_obj.data_key or field_name)


class PaginationQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    page = fields.Int(load_default=1)
    per_page = fields.Int(load_default=20, data_key="perPage")
    search = fields.Str(load_default=None)
    sort_by = fields.Str(load_default=None, data_key="sortBy")
    sort_dir = fields.Str(load_default="desc", data_key="sortDir")
