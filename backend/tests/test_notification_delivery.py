from sqlalchemy import create_engine
from sqlmodel import Session, SQLModel, select

from app.module.auth.model import User
from app.module.notification.model import (
    DevicePlatform,
    Notification,
    NotificationDevice,
    NotificationType,
)
from app.module.notification import service
from app.module.notification.service import NotificationService
from app.module.notification import provider


def test_deactivate_device_only_affects_owning_user():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        session.add(User(id=1, email="owner@example.com"))
        session.add(User(id=2, email="other@example.com"))
        session.add(
            NotificationDevice(
                user_id=1,
                token="fcm-token",
                platform=DevicePlatform.WEB,
            )
        )
        session.commit()

        assert not NotificationService.deactivate_device(
            session,
            user_id=2,
            token="fcm-token",
        )
        assert NotificationService.deactivate_device(
            session,
            user_id=1,
            token="fcm-token",
        )

        device = session.exec(select(NotificationDevice)).one()
        assert not device.is_active


def test_push_payload_is_data_only_for_service_worker(monkeypatch):
    sent_messages = []
    monkeypatch.setattr(provider, "initialize_firebase", lambda: None)
    monkeypatch.setattr(
        provider.messaging,
        "send",
        lambda message: sent_messages.append(message) or "message-id",
    )

    message_id = provider.send_push_notification(
        token="fcm-token",
        title="Evaluation completed",
        message="Your evaluation has finished.",
        notification_type="success",
    )

    assert message_id == "message-id"
    assert sent_messages[0].token == "fcm-token"
    assert sent_messages[0].notification is None
    assert sent_messages[0].data == {
        "title": "Evaluation completed",
        "body": "Your evaluation has finished.",
        "type": "success",
        "url": "/dashboard",
    }


def test_push_retries_transient_firebase_errors(monkeypatch):
    sent_messages = []
    retry_delays = []
    attempts = 0

    def send(message):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise provider.exceptions.UnavailableError("temporarily unavailable")
        sent_messages.append(message)
        return "message-id"

    monkeypatch.setattr(provider, "initialize_firebase", lambda: None)
    monkeypatch.setattr(provider.messaging, "send", send)
    monkeypatch.setattr(provider.time, "sleep", retry_delays.append)

    result = provider.send_push_notification(
        token="fcm-token",
        title="Evaluation completed",
        message="Your evaluation has finished.",
        notification_type="success",
    )

    assert result == "message-id"
    assert retry_delays == [0.5]
    assert len(sent_messages) == 1


def test_unregistered_fcm_token_is_detected():
    error = provider.messaging.UnregisteredError("NotRegistered")
    assert NotificationService._is_invalid_token_error(error)


def test_delivery_deactivates_unregistered_device(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)

    def reject_token(**_kwargs):
        raise provider.messaging.UnregisteredError("NotRegistered")

    monkeypatch.setattr(service, "send_push_notification", reject_token)

    with Session(engine) as session:
        user = User(email="owner@example.com")
        session.add(user)
        session.commit()
        session.refresh(user)
        device = NotificationDevice(
            user_id=user.id,
            token="expired-token",
            platform=DevicePlatform.WEB,
        )
        notification = Notification(
            user_id=user.id,
            title="Evaluation complete",
            message="The evaluation finished.",
            type=NotificationType.SUCCESS,
        )
        session.add_all([device, notification])
        session.commit()

        NotificationService._send_to_user_devices(
            session,
            user.id,
            notification,
        )

        session.refresh(device)
        assert not device.is_active
