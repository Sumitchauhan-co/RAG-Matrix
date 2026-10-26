from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.common.db.database import get_session
from app.common.utils.config import FIREBASE_PROJECT_ID
from app.module.auth.model import User
from app.module.auth.route import get_current_user

from app.module.notification.model import (
    DeviceRegister,
    DeviceUnregister,
    NotificationDeviceRead,
    NotificationRead,
)

from app.module.notification.provider import initialize_firebase
from app.module.notification.service import (
    NotificationService,
)

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


@router.get(
    "",
    response_model=list[NotificationRead],
)
def get_notifications(
    unread_only: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return NotificationService.get_user_notifications(
        session=session,
        user_id=current_user.id,
        unread_only=unread_only,
    )


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationRead,
)
def mark_notification_as_read(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    notification = NotificationService.mark_as_read(
        session=session,
        user_id=current_user.id,
        notification_id=notification_id,
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    return notification


@router.patch(
    "/read-all",
)
def mark_all_notifications_as_read(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    count = NotificationService.mark_all_as_read(
        session=session,
        user_id=current_user.id,
    )

    return {
        "message": "All notifications marked as read",
        "count": count,
    }


@router.post(
    "/devices",
    response_model=NotificationDeviceRead,
)
def register_device(
    data: DeviceRegister,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not FIREBASE_PROJECT_ID:
        raise HTTPException(
            status_code=503,
            detail="Push notifications are not configured on the server.",
        )

    if (
        data.firebase_project_id
        and data.firebase_project_id != FIREBASE_PROJECT_ID
    ):
        raise HTTPException(
            status_code=400,
            detail="The device Firebase project does not match the server.",
        )

    try:
        initialize_firebase()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail="Push notifications are not configured correctly on the server.",
        ) from exc

    return NotificationService.register_device(
        session=session,
        user_id=current_user.id,
        data=data,
    )


@router.delete(
    "/devices/current",
)
def unregister_device(
    data: DeviceUnregister,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    deactivated = NotificationService.deactivate_device(
        session=session,
        user_id=current_user.id,
        token=data.token,
    )
    return {"deactivated": deactivated}
