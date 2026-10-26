from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class NotificationType(str, Enum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


class DevicePlatform(str, Enum):
    WEB = "web"
    APP = "app"
    ANDROID = "android"


class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: Optional[int] = Field(
        default=None,
        primary_key=True,
    )

    user_id: int = Field(
        foreign_key="user.id",
        index=True,
        nullable=False,
    )

    title: str = Field(
        min_length=1,
        max_length=150,
        nullable=False,
    )

    message: str = Field(
        min_length=1,
        max_length=1000,
        nullable=False,
    )

    type: NotificationType = Field(
        default=NotificationType.INFO,
        nullable=False,
    )

    is_read: bool = Field(
        default=False,
        nullable=False,
        index=True,
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


class NotificationDevice(SQLModel, table=True):
    __tablename__ = "notification_devices"

    id: Optional[int] = Field(
        default=None,
        primary_key=True,
    )

    user_id: int = Field(
        foreign_key="user.id",
        index=True,
        nullable=False,
    )

    token: str = Field(
        min_length=1,
        max_length=4096,
        unique=True,
        index=True,
        nullable=False,
    )

    platform: DevicePlatform = Field(
        nullable=False,
    )

    is_active: bool = Field(
        default=True,
        nullable=False,
        index=True,
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    last_seen_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------


class NotificationCreate(SQLModel):
    title: str = Field(
        min_length=1,
        max_length=150,
    )

    message: str = Field(
        min_length=1,
        max_length=1000,
    )

    type: NotificationType = NotificationType.INFO


class DeviceRegister(SQLModel):
    token: str = Field(
        min_length=1,
        max_length=4096,
    )

    platform: DevicePlatform

    firebase_project_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=200,
    )


class DeviceUnregister(SQLModel):
    token: str = Field(
        min_length=1,
        max_length=4096,
    )


class NotificationRead(SQLModel):
    id: int
    title: str
    message: str
    type: NotificationType
    is_read: bool
    created_at: datetime


class NotificationDeviceRead(SQLModel):
    id: int
    platform: DevicePlatform
    is_active: bool
    created_at: datetime
    last_seen_at: datetime
