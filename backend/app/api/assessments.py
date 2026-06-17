"""Assessment & nested question API."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import created, ok, paginated, pagination_args, parse, query_param
from app.models.enums import UserRole
from app.schemas import (
    AssessmentSchema,
    AssessmentStatusSchema,
    QuestionPublicSchema,
    QuestionSchema,
)
from app.services import assessment_service
from app.services.rbac import current_user, recruiter_required

bp = Blueprint("assessments", __name__)

_assessment_schema = AssessmentSchema()
_question_schema = QuestionSchema()
_question_public = QuestionPublicSchema()


@bp.get("")
@jwt_required()
def list_assessments():
    args = pagination_args()
    page = assessment_service.list_assessments(
        current_user(), **args, status=query_param("status")
    )
    return paginated(page, _assessment_schema.dump)


@bp.post("")
@jwt_required()
@recruiter_required
def create_assessment():
    data = parse(AssessmentSchema())
    assessment = assessment_service.create_assessment(current_user(), data)
    return created(_assessment_schema.dump(assessment))


@bp.get("/<uuid:assessment_id>")
@jwt_required()
def get_assessment(assessment_id):
    return ok(_assessment_schema.dump(assessment_service.get_assessment(str(assessment_id))))


@bp.put("/<uuid:assessment_id>")
@jwt_required()
@recruiter_required
def update_assessment(assessment_id):
    data = parse(AssessmentSchema(), partial=True)
    assessment = assessment_service.update_assessment(current_user(), str(assessment_id), data)
    return ok(_assessment_schema.dump(assessment))


@bp.patch("/<uuid:assessment_id>/status")
@jwt_required()
@recruiter_required
def change_status(assessment_id):
    data = parse(AssessmentStatusSchema())
    assessment = assessment_service.change_status(current_user(), str(assessment_id), data["status"])
    return ok(_assessment_schema.dump(assessment))


@bp.delete("/<uuid:assessment_id>")
@jwt_required()
@recruiter_required
def delete_assessment(assessment_id):
    assessment_service.delete_assessment(current_user(), str(assessment_id))
    return ok({"message": "Assessment deleted"})


# ─── Nested questions ────────────────────────────────────────────────────────

@bp.get("/<uuid:assessment_id>/questions")
@jwt_required()
def list_questions(assessment_id):
    user = current_user()
    rows = assessment_service.list_questions(str(assessment_id), include_answers=False)
    # Candidates receive the answer-stripped variant.
    schema = _question_public if user.role_name == UserRole.candidate else _question_schema
    return ok([schema.dump(q) for q in rows])


@bp.post("/<uuid:assessment_id>/questions")
@jwt_required()
@recruiter_required
def add_question(assessment_id):
    data = parse(QuestionSchema())
    question = assessment_service.add_question(current_user(), str(assessment_id), data)
    return created(_question_schema.dump(question))
