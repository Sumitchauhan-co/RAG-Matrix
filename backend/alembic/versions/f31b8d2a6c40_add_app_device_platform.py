"""Add app as a notification device platform."""

from typing import Sequence, Union

from alembic import op

revision: str = "f31b8d2a6c40"
down_revision: Union[str, Sequence[str], None] = "c7e4a19b2f60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE deviceplatform ADD VALUE IF NOT EXISTS 'APP'")


def downgrade() -> None:
    pass
