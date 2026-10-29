"""visibility flags and student portrait templates

Revision ID: b7c1d2e3f4a5
Revises: f89120c20bd3
Create Date: 2026-10-29 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'f89120c20bd3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('lesson_plans', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default=sa.false())
        )

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true())
        )

    op.create_table(
        'portrait_templates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_staff_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('config_json', sa.Text(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['owner_staff_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_portrait_templates_owner_staff_id'),
        'portrait_templates',
        ['owner_staff_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_portrait_templates_owner_staff_id'), table_name='portrait_templates')
    op.drop_table('portrait_templates')

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('is_active')

    with op.batch_alter_table('lesson_plans', schema=None) as batch_op:
        batch_op.drop_column('is_hidden')
