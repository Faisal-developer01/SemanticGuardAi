"""Add verified WhatsApp contacts and persistent delivery records."""
from alembic import op
import sqlalchemy as sa
from app.models.base import GUID

revision = "a4d8e9f10234"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("whatsapp_phone", sa.String(16), nullable=True))
        batch.add_column(sa.Column("whatsapp_opt_in", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch.add_column(sa.Column("whatsapp_verified_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("whatsapp_token_hash", sa.String(64), nullable=True))
        batch.add_column(sa.Column("whatsapp_token_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_unique_constraint("uq_users_whatsapp_phone", ["whatsapp_phone"])
    op.create_table(
        "whatsapp_deliveries",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dedup_key", sa.String(160), unique=True, nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("provider_id", sa.String(255), unique=True, nullable=True),
        sa.Column("error_code", sa.String(80), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider_timestamp", sa.Integer(), nullable=True),
    )
    op.create_index("ix_whatsapp_deliveries_status", "whatsapp_deliveries", ["status"])


def downgrade():
    op.drop_table("whatsapp_deliveries")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_whatsapp_phone", type_="unique")
        for column in ("whatsapp_token_expires_at", "whatsapp_token_hash", "whatsapp_verified_at", "whatsapp_opt_in", "whatsapp_phone"):
            batch.drop_column(column)