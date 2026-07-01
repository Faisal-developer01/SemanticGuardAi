"""add keystroke_stats and code_analysis to answers

Revision ID: b3f1c8e2d5a7
Revises: 9d4e7b2a6c81
Create Date: 2026-07-01 12:15:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b3f1c8e2d5a7'
down_revision = '9d4e7b2a6c81'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('answers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('keystroke_stats', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('code_analysis', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('answers', schema=None) as batch_op:
        batch_op.drop_column('code_analysis')
        batch_op.drop_column('keystroke_stats')
