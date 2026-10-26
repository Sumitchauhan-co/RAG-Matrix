import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
	getNotifications,
	markAllNotificationsAsRead,
	markNotificationAsRead,
} from '../api';
import type { Notification } from '../types/notification';

export function useNotifications() {
	const queryClient = useQueryClient();
	const [actionError, setActionError] = useState<string | null>(null);
	const query = useQuery({
		queryKey: ['notifications'],
		queryFn: () => getNotifications(),
		refetchInterval: 60_000,
		refetchOnWindowFocus: true,
	});
	const notifications = query.data ?? [];

	const unreadCount = notifications.filter(
		(notification) => !notification.is_read,
	).length;

	const error =
		actionError ?? (query.error ? 'Failed to load notifications.' : null);

	const markAsRead = useCallback(
		async (id: number) => {
			setActionError(null);
			try {
				const updated = await markNotificationAsRead(id);

				queryClient.setQueryData<Notification[]>(
					['notifications'],
					(current) =>
						(current ?? []).map((notification) =>
							notification.id === id ? updated : notification,
						),
				);
			} catch (error) {
				console.error('Failed to mark notification as read:', error);
				setActionError('Failed to mark notification as read.');
			}
		},
		[queryClient],
	);

	const markAllAsRead = useCallback(
		async () => {
			setActionError(null);
			try {
				await markAllNotificationsAsRead();

				queryClient.setQueryData<Notification[]>(
					['notifications'],
					(current) =>
						(current ?? []).map((notification) => ({
							...notification,
							is_read: true,
						})),
				);
			} catch (error) {
				console.error('Failed to mark notifications as read:', error);
				setActionError('Failed to mark notifications as read.');
			}
		},
		[queryClient],
	);

	return {
		notifications,
		unreadCount,
		loading: query.isPending,
		error,
		refetch: query.refetch,
		markAsRead,
		markAllAsRead,
	};
}
