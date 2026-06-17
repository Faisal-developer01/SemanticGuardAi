"""Repository layer — generic data-access with pagination, search, sort, filter.

Implements the Repository pattern: services depend on repositories, never on the
SQLAlchemy session directly. Each concrete repository subclasses ``BaseRepository``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Generic, Sequence, TypeVar

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.orm import Query

from app.extensions import db

T = TypeVar("T")


@dataclass
class Page(Generic[T]):
    """A paginated result set."""

    items: Sequence[T]
    total: int
    page: int
    per_page: int

    @property
    def pages(self) -> int:
        return (self.total + self.per_page - 1) // self.per_page if self.per_page else 0

    def to_dict(self, serializer) -> dict:
        return {
            "items": [serializer(i) for i in self.items],
            "meta": {
                "total": self.total,
                "page": self.page,
                "per_page": self.per_page,
                "pages": self.pages,
                "has_next": self.page < self.pages,
                "has_prev": self.page > 1,
            },
        }


class BaseRepository(Generic[T]):
    model: type[T]

    def __init__(self, model: type[T] | None = None):
        if model is not None:
            self.model = model

    # ─── reads ────────────────────────────────────────────────────────────────
    @property
    def session(self):
        return db.session

    def get(self, entity_id) -> T | None:
        return self.session.get(self.model, entity_id)

    def get_or_404(self, entity_id) -> T:
        from app.errors import NotFoundError

        obj = self.get(entity_id)
        if obj is None:
            raise NotFoundError(f"{self.model.__name__} not found")
        return obj

    def find_one(self, **filters) -> T | None:
        return self.session.execute(select(self.model).filter_by(**filters)).scalar_one_or_none()

    def exists(self, **filters) -> bool:
        return self.session.query(
            self.session.query(self.model).filter_by(**filters).exists()
        ).scalar()

    def all(self) -> list[T]:
        return list(self.session.execute(select(self.model)).scalars().all())

    def base_query(self) -> Query:
        return self.session.query(self.model)

    # ─── search / sort / filter / paginate ──────────────────────────────────────
    search_fields: tuple[str, ...] = ()

    def paginate(
        self,
        *,
        page: int = 1,
        per_page: int = 20,
        search: str | None = None,
        sort_by: str | None = None,
        sort_dir: str = "desc",
        filters: dict[str, Any] | None = None,
        query: Query | None = None,
    ) -> Page[T]:
        page = max(1, int(page or 1))
        per_page = min(max(1, int(per_page or 20)), 200)

        q = query if query is not None else self.base_query()

        # Equality filters (skip None values)
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                column = getattr(self.model, key, None)
                if column is not None:
                    q = q.filter(column == value)

        # Free-text search across declared columns (case-insensitive)
        if search and self.search_fields:
            term = f"%{search.strip()}%"
            clauses = [
                getattr(self.model, field).ilike(term)
                for field in self.search_fields
                if getattr(self.model, field, None) is not None
            ]
            if clauses:
                q = q.filter(or_(*clauses))

        total = q.with_entities(func.count()).order_by(None).scalar() or 0

        # Sorting
        sort_column = getattr(self.model, sort_by, None) if sort_by else None
        if sort_column is None:
            sort_column = getattr(self.model, "created_at", None)
        if sort_column is not None:
            q = q.order_by(asc(sort_column) if sort_dir == "asc" else desc(sort_column))

        items = q.limit(per_page).offset((page - 1) * per_page).all()
        return Page(items=items, total=total, page=page, per_page=per_page)

    # ─── writes ──────────────────────────────────────────────────────────────
    def add(self, obj: T, *, commit: bool = True) -> T:
        self.session.add(obj)
        self._flush(commit)
        return obj

    def create(self, *, commit: bool = True, **data) -> T:
        obj = self.model(**data)  # type: ignore[call-arg]
        return self.add(obj, commit=commit)

    def update(self, obj: T, *, commit: bool = True, **data) -> T:
        for key, value in data.items():
            if value is not None or hasattr(obj, key):
                setattr(obj, key, value)
        self._flush(commit)
        return obj

    def delete(self, obj: T, *, commit: bool = True) -> None:
        self.session.delete(obj)
        self._flush(commit)

    def _flush(self, commit: bool) -> None:
        if commit:
            self.session.commit()
        else:
            self.session.flush()
