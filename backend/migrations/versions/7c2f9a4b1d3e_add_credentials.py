"""add credentials table (certificates and offer letters)

Revision ID: 7c2f9a4b1d3e
Revises: 235aa82d3cae
Create Date: 2026-07-01 09:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
import app.models.base


revision = '7c2f9a4b1d3e'
down_revision = '235aa82d3cae'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'credentials',
        sa.Column('type', sa.Enum('certificate', 'offer_letter', name='credential_type'), nullable=False),
        sa.Column('number', sa.String(length=40), nullable=False),
        sa.Column('verification_token', sa.String(length=64), nullable=False),
        sa.Column('candidate_id', app.models.base.GUID(), nullable=False),
        sa.Column('assessment_id', app.models.base.GUID(), nullable=True),
        sa.Column('session_id', app.models.base.GUID(), nullable=True),
        sa.Column('candidate_name', sa.String(length=160), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('position', sa.String(length=160), nullable=True),
        sa.Column('department', sa.String(length=160), nullable=True),
        sa.Column('integrity_score', sa.Float(), nullable=True),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('percentage', sa.Float(), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('file_path', sa.String(length=400), nullable=True),
        sa.Column('revoked', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        sa.Column('revoked_reason', sa.String(length=200), nullable=True),
        sa.Column('id', app.models.base.GUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['assessment_id'], ['assessments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['candidate_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['assessment_sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('credentials', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_credentials_type'), ['type'], unique=False)
        batch_op.create_index(batch_op.f('ix_credentials_number'), ['number'], unique=True)
        batch_op.create_index(batch_op.f('ix_credentials_verification_token'), ['verification_token'], unique=True)
        batch_op.create_index(batch_op.f('ix_credentials_candidate_id'), ['candidate_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_credentials_assessment_id'), ['assessment_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_credentials_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_credentials_revoked'), ['revoked'], unique=False)


def downgrade():
    with op.batch_alter_table('credentials', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_credentials_revoked'))
        batch_op.drop_index(batch_op.f('ix_credentials_session_id'))
        batch_op.drop_index(batch_op.f('ix_credentials_assessment_id'))
        batch_op.drop_index(batch_op.f('ix_credentials_candidate_id'))
        batch_op.drop_index(batch_op.f('ix_credentials_verification_token'))
        batch_op.drop_index(batch_op.f('ix_credentials_number'))
        batch_op.drop_index(batch_op.f('ix_credentials_type'))
    op.drop_table('credentials')
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        sa.Enum(name='credential_type').drop(bind, checkfirst=True)
