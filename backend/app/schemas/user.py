"""User, profile, and auth-related schemas."""
from __future__ import annotations

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from app.models.enums import UserRole, UserStatus
from app.schemas.common import CamelCaseSchema

PASSWORD_RULE = validate.Length(min=8, max=128)


class CandidateProfileSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    candidate_code = fields.Str(dump_only=True)
    department = fields.Str(allow_none=True)
    position = fields.Str(allow_none=True)
    experience_years = fields.Int(load_default=0)
    integrity_score = fields.Float(dump_only=True)
    total_assessments = fields.Int(dump_only=True)
    passed_assessments = fields.Int(dump_only=True)
    reference_photo_url = fields.Str(dump_only=True, allow_none=True)


class RecruiterProfileSchema(CamelCaseSchema):
    id = fields.Str(dump_only=True)
    recruiter_code = fields.Str(dump_only=True)
    department = fields.Str(allow_none=True)
    total_assessments_created = fields.Int(dump_only=True)


class UserSchema(CamelCaseSchema):
    """Safe public representation of a user."""

    id = fields.Str(dump_only=True)
    full_name = fields.Str(required=True, validate=validate.Length(min=2, max=150))
    email = fields.Email(required=True)
    phone = fields.Str(allow_none=True)
    role = fields.Method("get_role", deserialize="load_role", data_key="role")
    status = fields.Function(lambda o: o.status.value if o.status else None, dump_only=True)
    avatar_url = fields.Str(allow_none=True)
    mfa_enabled = fields.Bool(dump_only=True)
    mfa_method = fields.Str(dump_only=True)
    email_verified = fields.Bool(dump_only=True)
    last_login_at = fields.DateTime(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)
    candidate_profile = fields.Nested(CandidateProfileSchema, dump_only=True, allow_none=True)
    recruiter_profile = fields.Nested(RecruiterProfileSchema, dump_only=True, allow_none=True)

    def get_role(self, obj):
        return obj.role_name.value if getattr(obj, "role_name", None) else None

    def load_role(self, value):
        try:
            return UserRole(value)
        except ValueError as exc:
            raise ValidationError("Invalid role") from exc


class UserCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    full_name = fields.Str(required=True, data_key="fullName", validate=validate.Length(min=2, max=150))
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=PASSWORD_RULE, load_only=True)
    phone = fields.Str(load_default=None)
    role = fields.Str(load_default="candidate", validate=validate.OneOf([r.value for r in UserRole]))
    department = fields.Str(load_default=None)
    position = fields.Str(load_default=None)


class UserUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    full_name = fields.Str(data_key="fullName", validate=validate.Length(min=2, max=150))
    phone = fields.Str(allow_none=True)
    avatar_url = fields.Str(data_key="avatarUrl", allow_none=True)
    status = fields.Str(validate=validate.OneOf([s.value for s in UserStatus]))


# ─── Auth payloads ────────────────────────────────────────────────────────────

class LoginSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=True)
    password = fields.Str(required=True, load_only=True)
    mfa_code = fields.Str(load_default=None, data_key="mfaCode")


class RegisterSchema(UserCreateSchema):
    pass


class RefreshSchema(Schema):
    class Meta:
        unknown = EXCLUDE


class PasswordChangeSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    current_password = fields.Str(required=True, data_key="currentPassword", load_only=True)
    new_password = fields.Str(required=True, data_key="newPassword", validate=PASSWORD_RULE, load_only=True)


class PasswordResetRequestSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=True)


class PasswordResetSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    token = fields.Str(required=True)
    new_password = fields.Str(required=True, data_key="newPassword", validate=PASSWORD_RULE, load_only=True)


class MFAVerifySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    code = fields.Str(required=True, validate=validate.Length(equal=6))


class MFASetupSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    method = fields.Str(load_default="totp", validate=validate.OneOf(["totp", "email"]))


class EmailVerifySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    token = fields.Str(required=True)


user_schema = UserSchema()
users_schema = UserSchema(many=True)
