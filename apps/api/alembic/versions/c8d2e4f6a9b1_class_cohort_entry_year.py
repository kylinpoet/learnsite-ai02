"""class cohort entry_year and identity key

Revision ID: c8d2e4f6a9b1
Revises: b7c1d2e3f4a5
Create Date: 2026-10-31 09:00:00.000000

班级「跟届走」改造：school_classes 增加 entry_year（入学年份／届），
唯一身份从 class_name 改为 (entry_year, class_no)。

注意：运行时的真实迁移入口是 app/db/init_db.py 的 ensure_runtime_schema
（SQLite 无法就地删除 UNIQUE 约束，那里会重建 school_classes 表），
本 revision 用于 `alembic upgrade head` 的显式迁移路径，两者保持一致。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8d2e4f6a9b1'
down_revision: Union[str, Sequence[str], None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('school_classes', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('entry_year', sa.Integer(), nullable=False, server_default=sa.text('0'))
        )
        batch_op.create_index(
            batch_op.f('ix_school_classes_entry_year'), ['entry_year'], unique=False
        )
        # 身份改为 (届, 班号)：班名里的年级是派生量，会随升班变化，不能作唯一键。
        batch_op.drop_constraint('uq_school_classes_class_name', type_='unique')
        batch_op.create_unique_constraint(
            'uq_school_classes_entry_year_class_no', ['entry_year', 'class_no']
        )

    # 用年级反推入学年份：七年级为当年入学，每高一年级早一年。
    op.execute(
        "UPDATE school_classes "
        "SET entry_year = CAST(strftime('%Y', 'now') AS INTEGER) - (grade_no - 7) "
        "WHERE entry_year = 0"
    )

    # 学生的届别以所属班级为准（历史库里的值来自旧的错误公式）。
    op.execute(
        "UPDATE student_profiles "
        "SET entry_year = ("
        "  SELECT school_classes.entry_year FROM school_classes "
        "  WHERE school_classes.id = student_profiles.class_id"
        ") "
        "WHERE class_id IN (SELECT id FROM school_classes)"
    )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('school_classes', schema=None) as batch_op:
        batch_op.drop_constraint('uq_school_classes_entry_year_class_no', type_='unique')
        batch_op.create_unique_constraint('uq_school_classes_class_name', ['class_name'])
        batch_op.drop_index(batch_op.f('ix_school_classes_entry_year'))
        batch_op.drop_column('entry_year')
