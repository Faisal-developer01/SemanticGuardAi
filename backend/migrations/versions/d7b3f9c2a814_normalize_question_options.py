"""normalize question options + difficulty/required fields

Revision ID: d7b3f9c2a814
Revises: c5a9e1f7b402
Create Date: 2026-07-01 14:30:00.000000
"""
from alembic import op
import sqlalchemy as sa
import app.models.base


revision = 'd7b3f9c2a814'
down_revision = 'c5a9e1f7b402'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('questions', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'difficulty',
            sa.Enum('easy', 'medium', 'hard', name='question_difficulty'),
            server_default='medium', nullable=False,
        ))
        batch_op.add_column(sa.Column('required', sa.Boolean(), server_default='1', nullable=False))

    op.create_table(
        'question_options',
        sa.Column('question_id', app.models.base.GUID(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('is_correct', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('id', app.models.base.GUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['question_id'], ['questions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('question_options', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_question_options_question_id'), ['question_id'], unique=False)


def downgrade():
    with op.batch_alter_table('question_options', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_question_options_question_id'))
    op.drop_table('question_options')
    with op.batch_alter_table('questions', schema=None) as batch_op:
        batch_op.drop_column('required')
        batch_op.drop_column('difficulty')
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        sa.Enum(name='question_difficulty').drop(bind, checkfirst=True)
