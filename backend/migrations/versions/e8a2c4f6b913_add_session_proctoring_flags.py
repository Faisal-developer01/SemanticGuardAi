"""add proctoring flag columns to assessment_sessions

Adds the monitoring/flagging columns that exist on the AssessmentSession model
but were never captured in a migration: ``monitoring_enabled``, ``flagged``,
``flagged_reason`` and ``flagged_at``. Their absence causes
``sqlite3.OperationalError: no such column: assessment_sessions.monitoring_enabled``
whenever a session is queried or serialized.

Revision ID: e8a2c4f6b913
Revises: d7b3f9c2a814
Create Date: 2026-07-01 19:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'e8a2c4f6b913'
down_revision = 'd7b3f9c2a814'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('assessment_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('monitoring_enabled', sa.Boolean(), server_default='true', nullable=False))
        batch_op.add_column(sa.Column('flagged', sa.Boolean(), server_default='false', nullable=False))
        batch_op.add_column(sa.Column('flagged_reason', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('flagged_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index(batch_op.f('ix_assessment_sessions_flagged'), ['flagged'], unique=False)


def downgrade():
    with op.batch_alter_table('assessment_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_assessment_sessions_flagged'))
        batch_op.drop_column('flagged_at')
        batch_op.drop_column('flagged_reason')
        batch_op.drop_column('flagged')
        batch_op.drop_column('monitoring_enabled')
