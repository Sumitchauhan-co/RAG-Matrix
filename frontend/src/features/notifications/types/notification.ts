export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type DevicePlatform = 'web' | 'app' | 'android';

export interface Notification {
	id: number;
	title: string;
	message: string;
	type: NotificationType;
	is_read: boolean;
	created_at: string;
}

export interface NotificationDevice {
	id: number;
	platform: DevicePlatform;
	is_active: boolean;
	created_at: string;
	last_seen_at: string;
}
