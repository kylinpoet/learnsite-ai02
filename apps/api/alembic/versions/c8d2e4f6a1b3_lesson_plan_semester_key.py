"""lesson plan semester key

Revision ID: c8d2e4f6a1b3
Revises: b7c1d2e3f4a5
Create Date: 2026-10-31 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8d2e4f6a1b3'
# 与本工作区的班级届别改造（c8d2e4f6a9b1）串成单链，避免两个 head 让
# init_db 的 ensure_alembic_stamp 报 MultipleHeads。
down_revision: Union[str, Sequence[str], None] = 'c8d2e4f6a9b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 学期标识列可空：历史学案先留空，由 init_db.ensure_runtime_schema 按
    # assigned_date 回填，避免在迁移里写业务日期规则。
    with op.batch_alter_table('lesson_plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('semester_key', sa.String(length=16), nullable=True))
        batch_op.create_index(
            op.f('ix_lesson_plans_semester_key'),
            ['semester_key'],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('lesson_plans', schema=None) as batch_op:
        batch_op.drop_index(op.f('ix_lesson_plans_semester_key'))
        batch_op.drop_column('semester_key')
