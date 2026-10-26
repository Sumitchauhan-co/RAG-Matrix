import api from '@/api/axios';
import type {
	DevicePlatform,
	Notification,
	NotificationDevice,
} from './types/notification';

export async function getNotifications(
	unreadOnly = false,
): Promise<Notification[]> {
	const response = await api.get<Notification[]>('/notifications', {
		params: {
			unread_only: unreadOnly,
		},
	});

	return response.data;
}

export async function markNotificationAsRead(
	notificationId: number,
): Promise<Notification> {
	const response = await api.patch<Notification>(
		`/notifications/${notificationId}/read`,
	);

	return response.data;
}

export async function markAllNotificationsAsRead(): Promise<{
	message: string;
	count: number;
}> {
	const response = await api.patch('/notifications/read-all');

	return response.data;
}

export async function registerNotificationDevice(
	token: string,
	platform: DevicePlatform,
): Promise<NotificationDevice> {
	const response = await api.post<NotificationDevice>(
		'/notifications/devices',
		{
			token,
			platform,
			firebase_project_id: import.meta.env.VITE_FIREBASE_PROJECT_ID,
		},
	);

	return response.data;
}

export async function unregisterNotificationDevice(token: string): Promise<void> {
	await api.delete('/notifications/devices/current', {
		data: { token },
	});
}
