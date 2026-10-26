import logging
from datetime import datetime, timezone

from firebase_admin import exceptions as firebase_exceptions
from sqlmodel import Session, select

from app.module.notification.model import (
    DeviceRegister,
    Notification,
    NotificationCreate,
    NotificationDevice,
)

from app.module.notification.provider import (
    send_push_notification,
)

logger = logging.getLogger(__name__)


class NotificationService:

    # ------------------------------------------------------------------
    # Device registration
    # ------------------------------------------------------------------

    @staticmethod
    def register_device(
        session: Session,
        user_id: int,
        data: DeviceRegister,
    ) -> NotificationDevice:

        existing = session.exec(
            select(NotificationDevice).where(
                NotificationDevice.token == data.token,
            )
        ).first()

        now = datetime.now(timezone.utc)

        if existing:
            existing.user_id = user_id
            existing.platform = data.platform
            existing.is_active = True
            existing.last_seen_at = now

            session.add(existing)
            session.commit()
            session.refresh(existing)

            logger.info(
                "notification.device_registered user_id=%s device_id=%s platform=%s",
                user_id,
                existing.id,
                data.platform.value,
            )

            return existing

        device = NotificationDevice(
            user_id=user_id,
            token=data.token,
            platform=data.platform,
            is_active=True,
            last_seen_at=now,
        )

        session.add(device)
        session.commit()
        session.refresh(device)

        logger.info(
            "notification.device_created user_id=%s device_id=%s platform=%s",
            user_id,
            device.id,
            data.platform.value,
        )

        return device

    @staticmethod
    def deactivate_device(
        session: Session,
        user_id: int,
        token: str,
    ) -> bool:
        device = session.exec(
            select(NotificationDevice).where(
                NotificationDevice.user_id == user_id,
                NotificationDevice.token == token,
                NotificationDevice.is_active,
            )
        ).first()

        if device is None:
            return False

        device.is_active = False
        session.add(device)
        session.commit()
        return True

    # ------------------------------------------------------------------
    # Create notification
    # ------------------------------------------------------------------

    @staticmethod
    def create(
        session: Session,
        user_id: int,
        data: NotificationCreate,
        *,
        send_push: bool = True,
    ) -> Notification:

        notification = Notification(
            user_id=user_id,
            title=data.title,
            message=data.message,
            type=data.type,
        )

        session.add(notification)
        session.commit()
        session.refresh(notification)

        logger.info(
            "notification.created notification_id=%s user_id=%s type=%s",
            notification.id,
            user_id,
            notification.type.value,
        )

        if send_push:
            NotificationService._send_to_user_devices(
                session=session,
                user_id=user_id,
                notification=notification,
            )

        return notification

    # ------------------------------------------------------------------
    # Send push notification to all user's devices
    # ------------------------------------------------------------------

    @staticmethod
    def _send_to_user_devices(
        session: Session,
        user_id: int,
        notification: Notification,
    ) -> None:

        devices = session.exec(
            select(NotificationDevice).where(
                NotificationDevice.user_id == user_id,
                NotificationDevice.is_active,
            )
        ).all()

        if not devices:
            logger.info(
                "notification.no_active_devices user_id=%s",
                user_id,
            )
            return

        for device in devices:

            try:
                send_push_notification(
                    token=device.token,
                    title=notification.title,
                    message=notification.message,
                    notification_type=notification.type.value,
                )

                device.last_seen_at = datetime.now(timezone.utc)

                session.add(device)
                session.commit()

            except firebase_exceptions.FirebaseError as exc:

                logger.warning(
                    "notification.push_delivery_failed user_id=%s device_id=%s error=%s",
                    user_id,
                    device.id,
                    str(exc),
                )

                if NotificationService._is_invalid_token_error(exc):
                    device.is_active = False

                    session.add(device)
                    session.commit()

            except Exception:

                logger.exception(
                    "notification.push_unexpected_error user_id=%s device_id=%s",
                    user_id,
                    device.id,
                )

    # ------------------------------------------------------------------
    # Determine whether an FCM token is no longer valid
    # ------------------------------------------------------------------

    @staticmethod
    def _is_invalid_token_error(
        error: Exception,
    ) -> bool:

        if type(error).__name__ in {
            "UnregisteredError",
            "InvalidRegistrationError",
        }:
            return True

        error_message = str(error).lower()

        invalid_token_errors = (
            "unregistered",
            "notregistered",
            "registration-token-not-registered",
            "invalid registration token",
            "not a valid fcm registration token",
        )

        return any(error_text in error_message for error_text in invalid_token_errors)

    # ------------------------------------------------------------------
    # Get user notifications
    # ------------------------------------------------------------------

    @staticmethod
    def get_user_notifications(
        session: Session,
        user_id: int,
        unread_only: bool = False,
    ) -> list[Notification]:

        statement = (
            select(Notification)
            .where(
                Notification.user_id == user_id,
            )
            .order_by(Notification.created_at.desc())
        )

        if unread_only:
            statement = statement.where(Notification.is_read == False)

        return list(session.exec(statement).all())

    # ------------------------------------------------------------------
    # Mark notification as read
    # ------------------------------------------------------------------

    @staticmethod
    def mark_as_read(
        session: Session,
        user_id: int,
        notification_id: int,
    ) -> Notification | None:

        notification = session.exec(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        ).first()

        if notification is None:
            return None

        if not notification.is_read:
            notification.is_read = True

            session.add(notification)
            session.commit()
            session.refresh(notification)

        return notification

    # ------------------------------------------------------------------
    # Mark all as read
    # ------------------------------------------------------------------

    @staticmethod
    def mark_all_as_read(
        session: Session,
        user_id: int,
    ) -> int:

        notifications = list(
            session.exec(
                select(Notification).where(
                    Notification.user_id == user_id,
                    Notification.is_read == False,
                )
            ).all()
        )

        if not notifications:
            return 0

        for notification in notifications:
            notification.is_read = True
            session.add(notification)

        session.commit()

        return len(notifications)
