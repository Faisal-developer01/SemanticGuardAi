"""add device fingerprint columns to assessment_sessions

Revision ID: 9d4e7b2a6c81
Revises: 7c2f9a4b1d3e
Create Date: 2026-07-01 11:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = '9d4e7b2a6c81'
down_revision = '7c2f9a4b1d3e'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('assessment_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('device_fingerprint', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('device_info', sa.JSON(), nullable=True))
        batch_op.create_index(batch_op.f('ix_assessment_sessions_device_fingerprint'), ['device_fingerprint'], unique=False)


def downgrade():
    with op.batch_alter_table('assessment_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_assessment_sessions_device_fingerprint'))
        batch_op.drop_column('device_info')
        batch_op.drop_column('device_fingerprint')
