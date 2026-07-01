"""Assessment, question, session, alert, evidence, notification schemas."""
from __future__ import annotations

from marshmallow import EXCLUDE, Schema, fields, validate

from app.models.enums import (
    AlertSeverity,
    AlertType,
    AssessmentStatus,
    CodingLanguage,
    QuestionDifficulty,
    QuestionType,
)
from app.schemas.common import CamelCaseSchema, UTCDateTime


# ─── Assessment ──────────────────────────────────────────────────────────────

class AssessmentSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    title = fields.Str(required=True, validate=validate.Length(min=3, max=255))
    description = fields.Str(allow_none=True)
    position = fields.Str(allow_none=True)
    recruiter_id = fields.Str(dump_only=True)
    duration_minutes = fields.Int(load_default=60, validate=validate.Range(min=1, max=600))
    start_time = UTCDateTime(allow_none=True)
    end_time = UTCDateTime(allow_none=True)
    status = fields.Function(lambda o: o.status.value if o.status else None, dump_only=True)
    risk_threshold = fields.Float(load_default=60.0)
    pass_mark = fields.Float(load_default=50.0)
    shuffle_questions = fields.Bool(load_default=True)
    monitor_face_detection = fields.Bool(load_default=True)
    monitor_eye_tracking = fields.Bool(load_default=True)
    monitor_phone_detection = fields.Bool(load_default=True)
    monitor_tab_switch = fields.Bool(load_default=True)
    monitor_audio_detection = fields.Bool(load_default=False)
    monitor_suspicious_movement = fields.Bool(load_default=True)
    total_questions = fields.Int(dump_only=True)
    created_at = UTCDateTime(dump_only=True)


class AssessmentStatusSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    status = fields.Str(required=True, validate=validate.OneOf([s.value for s in AssessmentStatus]))


# ─── Question ────────────────────────────────────────────────────────────────

class TestCaseSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    args = fields.List(fields.Raw(), allow_none=True)
    expected_output = fields.Str(allow_none=True)
    display = fields.Str(allow_none=True)
    hidden = fields.Bool(load_default=False)
    order = fields.Int(load_default=0)


class QuestionSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    assessment_id = fields.Str(dump_only=True)
    text = fields.Str(required=True, validate=validate.Length(min=1))
    type = fields.Str(required=True, validate=validate.OneOf([t.value for t in QuestionType]))
    marks = fields.Float(load_default=1.0)
    order = fields.Int(load_default=0)
    difficulty = fields.Str(
        load_default="medium", validate=validate.OneOf([d.value for d in QuestionDifficulty])
    )
    required = fields.Bool(load_default=True)
    # Normalized options: emitted from the question_options table (falling back
    # to legacy JSON options) and accepted as a list of objects on write.
    options = fields.Method("dump_options", deserialize="load_options", allow_none=True)
    # correct_answer is load-only so it is never leaked to candidates
    correct_answer = fields.Str(allow_none=True, load_only=True)
    language = fields.Str(allow_none=True, validate=validate.OneOf([c.value for c in CodingLanguage]))
    languages = fields.List(fields.Str(), allow_none=True)
    entry_point = fields.Str(allow_none=True)
    starter_code = fields.Str(allow_none=True)
    starter_codes = fields.Dict(allow_none=True)
    test_cases = fields.Nested(TestCaseSchema, many=True, allow_none=True)

    def dump_options(self, obj):
        rows = getattr(obj, "option_rows", None)
        if rows:
            return [
                {
                    "id": str(o.id),
                    "text": o.text,
                    "isCorrect": bool(o.is_correct),
                    "explanation": o.explanation,
                    "order": o.order,
                }
                for o in rows
            ]
        legacy = getattr(obj, "options", None)
        if legacy:
            return [{"text": str(s)} for s in legacy]
        return None

    def load_options(self, value):
        if not isinstance(value, list):
            return []
        parsed = []
        for i, o in enumerate(value):
            if isinstance(o, str):
                parsed.append({"text": o, "is_correct": False, "explanation": None, "order": i})
            elif isinstance(o, dict):
                parsed.append({
                    "text": o.get("text", ""),
                    "is_correct": bool(o.get("isCorrect", o.get("is_correct", False))),
                    "explanation": o.get("explanation"),
                    "order": o.get("order", i),
                })
        return parsed


class QuestionPublicSchema(QuestionSchema):
    """Variant served to candidates — strips answers & hidden test cases."""

    correct_answer = fields.Constant(None, dump_only=True)

    def dump(self, obj, **kwargs):  # type: ignore[override]
        data = super().dump(obj, **kwargs)
        if isinstance(data, dict):
            if data.get("testCases"):
                data["testCases"] = [tc for tc in data["testCases"] if not tc.get("hidden")]
            if data.get("options"):
                # Never reveal which option is correct (or its explanation) to candidates.
                data["options"] = [
                    {"id": o.get("id"), "text": o.get("text")} for o in data["options"]
                ]
        return data


# ─── Session & answers ───────────────────────────────────────────────────────

class AnswerSubmitSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    question_id = fields.Str(required=True, data_key="questionId")
    response = fields.Str(allow_none=True)
    selected_language = fields.Str(allow_none=True, data_key="selectedLanguage")
    keystroke_stats = fields.Dict(load_default=None, data_key="keystrokeStats")


class SessionSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    assessment_id = fields.Str(dump_only=True)
    assessment_title = fields.Function(
        lambda o: getattr(o.assessment, "title", None) if getattr(o, "assessment", None) else None,
        dump_only=True,
    )
    candidate_id = fields.Str(dump_only=True)
    candidate_name = fields.Function(
        lambda o: getattr(o.candidate, "full_name", None) if getattr(o, "candidate", None) else None,
        dump_only=True,
    )
    candidate_email = fields.Function(
        lambda o: getattr(o.candidate, "email", None) if getattr(o, "candidate", None) else None,
        dump_only=True,
    )
    started_at = UTCDateTime(dump_only=True, allow_none=True)
    submitted_at = UTCDateTime(dump_only=True, allow_none=True)
    status = fields.Function(lambda o: o.status.value if o.status else None, dump_only=True)
    score = fields.Float(dump_only=True, allow_none=True)
    max_score = fields.Float(dump_only=True)
    percentage = fields.Float(dump_only=True, allow_none=True)
    passed = fields.Bool(dump_only=True, allow_none=True)
    grading_status = fields.Str(dump_only=True, allow_none=True)
    integrity_score = fields.Float(dump_only=True)
    risk_score = fields.Float(dump_only=True)
    risk_level = fields.Function(lambda o: o.risk_level.value if o.risk_level else None, dump_only=True)
    tab_switch_count = fields.Int(dump_only=True)
    looking_away_count = fields.Int(dump_only=True)
    face_not_detected_count = fields.Int(dump_only=True)
    live_status = fields.Dict(dump_only=True, allow_none=True)
    monitoring_enabled = fields.Bool(data_key="monitoringEnabled")
    device_fingerprint = fields.Str(dump_only=True, allow_none=True)
    device_info = fields.Dict(dump_only=True, allow_none=True)
    ip_address = fields.Str(dump_only=True, allow_none=True)
    created_at = UTCDateTime(dump_only=True)


class SessionStartSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    assessment_id = fields.Str(required=True, data_key="assessmentId")
    device_fingerprint = fields.Str(load_default=None, data_key="deviceFingerprint")
    device_info = fields.Dict(load_default=None, data_key="deviceInfo")


# ─── Integrity events / alerts / evidence ────────────────────────────────────

class IntegrityEventSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    type = fields.Str(required=True, validate=validate.OneOf([t.value for t in AlertType]))
    severity = fields.Str(load_default="low", validate=validate.OneOf([s.value for s in AlertSeverity]))
    confidence = fields.Float(load_default=0.0)
    occurred_at = UTCDateTime(load_default=None, data_key="occurredAt")
    payload = fields.Dict(load_default=None)


class AlertSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    session_id = fields.Str(dump_only=True)
    assessment_id = fields.Str(dump_only=True)
    candidate_id = fields.Str(dump_only=True)
    type = fields.Function(lambda o: o.type.value if o.type else None, dump_only=True)
    severity = fields.Function(lambda o: o.severity.value if o.severity else None, dump_only=True)
    description = fields.Str(allow_none=True)
    risk_score = fields.Float(dump_only=True)
    occurred_at = UTCDateTime(dump_only=True)
    reviewed = fields.Bool(dump_only=True)
    reviewed_at = UTCDateTime(dump_only=True, allow_none=True)
    resolution_note = fields.Str(allow_none=True)


class AlertReviewSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    resolution_note = fields.Str(load_default=None, data_key="resolutionNote")


class EvidenceSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    session_id = fields.Str(dump_only=True)
    alert_id = fields.Str(dump_only=True, allow_none=True)
    type = fields.Function(lambda o: o.type.value if o.type else None, dump_only=True)
    url = fields.Str(dump_only=True, allow_none=True)
    content_type = fields.Str(dump_only=True, allow_none=True)
    size_bytes = fields.Int(dump_only=True, allow_none=True)
    captured_at = UTCDateTime(dump_only=True, allow_none=True)
    created_at = UTCDateTime(dump_only=True)


# ─── Notifications & audit ───────────────────────────────────────────────────

class NotificationSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    title = fields.Str(required=True)
    message = fields.Str(required=True)
    type = fields.Function(lambda o: o.type.value if o.type else None, dump_only=True)
    read = fields.Bool(dump_only=True)
    link = fields.Str(allow_none=True)
    created_at = UTCDateTime(dump_only=True)


class AuditLogSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    user_id = fields.Str(dump_only=True, allow_none=True)
    user_name = fields.Str(dump_only=True, allow_none=True)
    user_role = fields.Function(
        lambda o: o.user_role.value if o.user_role else None, dump_only=True
    )
    action = fields.Str(dump_only=True)
    resource = fields.Str(dump_only=True, allow_none=True)
    status = fields.Function(lambda o: o.status.value if o.status else None, dump_only=True)
    ip_address = fields.Str(dump_only=True, allow_none=True)
    details = fields.Str(dump_only=True, allow_none=True)
    created_at = UTCDateTime(dump_only=True)
