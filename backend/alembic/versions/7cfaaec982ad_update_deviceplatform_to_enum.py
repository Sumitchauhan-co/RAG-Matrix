"""Ensure the APP notification device platform exists.

Revision ID: 7cfaaec982ad
Revises: ea82e7bd6dc6
Create Date: 2026-10-27 03:06:54.072352

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '7cfaaec982ad'
down_revision: Union[str, Sequence[str], None] = 'ea82e7bd6dc6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE deviceplatform ADD VALUE IF NOT EXISTS 'APP'")


def downgrade() -> None:
    pass
