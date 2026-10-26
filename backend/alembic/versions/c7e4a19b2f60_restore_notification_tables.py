"""Restore notification tables if an earlier migration removed them."""

from typing import Sequence, Union

from alembic import op

from app.module.notification.model import Notification, NotificationDevice

revision: str = "c7e4a19b2f60"
down_revision: Union[str, Sequence[str], None] = "db4241ac5603"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE deviceplatform ADD VALUE IF NOT EXISTS 'APP'")
    Notification.__table__.create(bind=bind, checkfirst=True)
    NotificationDevice.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    pass
