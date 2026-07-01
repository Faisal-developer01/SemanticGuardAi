"""add grading_status to assessment_sessions

Revision ID: c5a9e1f7b402
Revises: b3f1c8e2d5a7
Create Date: 2026-07-01 13:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c5a9e1f7b402'
down_revision = 'b3f1c8e2d5a7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('assessment_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('grading_status', sa.String(length=20), nullable=True))


def downgrade():
    with op.batch_alter_table('assessment_sessions', schema=None) as batch_op:
        batch_op.drop_column('grading_status')
