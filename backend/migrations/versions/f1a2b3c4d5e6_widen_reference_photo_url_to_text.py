"""widen reference_photo_url to Text to support base64 face images

Revision ID: f1a2b3c4d5e6
Revises: e8a2c4f6b913
Create Date: 2026-08-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e8a2c4f6b913'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('candidate_profiles', schema=None) as batch_op:
        batch_op.alter_column('reference_photo_url',
                              existing_type=sa.String(length=512),
                              type_=sa.Text(),
                              existing_nullable=True)


def downgrade():
    with op.batch_alter_table('candidate_profiles', schema=None) as batch_op:
        batch_op.alter_column('reference_photo_url',
                              existing_type=sa.Text(),
                              type_=sa.String(length=512),
                              existing_nullable=True)
