"""implement notification

Revision ID: db4241ac5603
Revises: aaca6b7a8f6e
Create Date: 2026-09-29 00:13:34.917217

"""
from typing import Sequence, Union

from alembic import op

from app.module.notification.model import Notification, NotificationDevice

# revision identifiers, used by Alembic.
revision: str = 'db4241ac5603'
down_revision: Union[str, Sequence[str], None] = 'aaca6b7a8f6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    Notification.__table__.create(bind=bind, checkfirst=True)
    NotificationDevice.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    NotificationDevice.__table__.drop(bind=bind, checkfirst=True)
    Notification.__table__.drop(bind=bind, checkfirst=True)
