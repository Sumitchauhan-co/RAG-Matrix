import json
import logging
import time

import firebase_admin
from firebase_admin import credentials, exceptions, messaging

from app.common.utils.config import FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT

logger = logging.getLogger(__name__)


def initialize_firebase() -> None:
    """
    Initialize Firebase Admin SDK once per application process.
    """

    if firebase_admin._apps:
        return

    if not FIREBASE_SERVICE_ACCOUNT:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT is not configured")

    try:
        service_account = json.loads(FIREBASE_SERVICE_ACCOUNT)
        service_account_project_id = service_account.get("project_id")

        if not FIREBASE_PROJECT_ID:
            raise RuntimeError("FIREBASE_PROJECT_ID is not configured")

        if service_account_project_id != FIREBASE_PROJECT_ID:
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT project does not match FIREBASE_PROJECT_ID"
            )

        credential = credentials.Certificate(service_account)

        firebase_admin.initialize_app(
            credential,
            options={"projectId": FIREBASE_PROJECT_ID},
        )

        logger.info(
            "notification.firebase_initialized project_id=%s",
            FIREBASE_PROJECT_ID,
        )

    except json.JSONDecodeError as exc:
        logger.exception("notification.firebase_invalid_credentials")
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT contains invalid JSON") from exc

    except Exception:
        logger.exception("notification.firebase_initialization_failed")
        raise


def send_push_notification(
    *,
    token: str,
    title: str,
    message: str,
    notification_type: str,
) -> str:
    """
    Send a push notification through Firebase Cloud Messaging.

    Raises:
        firebase_admin.exceptions.FirebaseError:
            When Firebase rejects the message.
    """

    initialize_firebase()

    firebase_message = messaging.Message(
        # This is an FCM registration token, not a Firebase Installation ID.
        token=token,
        data={
            "title": title,
            "body": message,
            "type": notification_type,
            "url": "/dashboard",
        },
    )

    for attempt in range(3):
        try:
            message_id = messaging.send(firebase_message)
            logger.info(
                "notification.push_sent token=%s message_id=%s",
                token[:12],
                message_id,
            )
            return message_id
        except (
            exceptions.UnavailableError,
            exceptions.DeadlineExceededError,
            exceptions.ResourceExhaustedError,
            exceptions.InternalError,
        ):
            if attempt == 2:
                logger.exception(
                    "notification.push_failed token=%s",
                    token[:12],
                )
                raise

            retry_delay = 0.5 * (2**attempt)
            logger.warning(
                "notification.push_retry token=%s attempt=%s delay_seconds=%s",
                token[:12],
                attempt + 1,
                retry_delay,
            )
            time.sleep(retry_delay)

    raise RuntimeError("Push notification retry loop exited unexpectedly.")
