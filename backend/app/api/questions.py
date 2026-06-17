"""Standalone question API (update/delete by id)."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import ok, parse
from app.schemas import QuestionSchema
from app.services import assessment_service
from app.services.rbac import current_user, recruiter_required

bp = Blueprint("questions", __name__)

_schema = QuestionSchema()


@bp.put("/<uuid:question_id>")
@jwt_required()
@recruiter_required
def update_question(question_id):
    data = parse(QuestionSchema(), partial=True)
    question = assessment_service.update_question(current_user(), str(question_id), data)
    return ok(_schema.dump(question))


@bp.delete("/<uuid:question_id>")
@jwt_required()
@recruiter_required
def delete_question(question_id):
    assessment_service.delete_question(current_user(), str(question_id))
    return ok({"message": "Question deleted"})
