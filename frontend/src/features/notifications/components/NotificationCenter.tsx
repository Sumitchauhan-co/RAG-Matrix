import { useCallback } from 'react';
import { useNotifications } from '../hooks/useNotification';
import { usePushNotifications } from '../hooks/usePushNotification';
import { NotificationBell } from './NotificationBell';
import { NotificationPanel } from './NotificationPanel';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'; // Standard Shadcn import

export function NotificationCenter() {
	const {
		notifications,
		unreadCount,
		loading,
		error,
		refetch,
		markAsRead,
		markAllAsRead,
	} = useNotifications();

	const handleNotificationReceived = useCallback(() => {
		void refetch();
	}, [refetch]);

	const {
		permission,
		isRegistering,
		isRegistered,
		error: pushError,
		enableNotifications,
		disableNotifications,
	} = usePushNotifications(handleNotificationReceived);

	return (
		<Popover
			onOpenChange={(open) => {
				if (open) {
					void refetch();
				}
			}}
		>
			<PopoverTrigger>
				<div>
					<NotificationBell
						unreadCount={unreadCount}
						expanded={false} // Handled automatically by Popover state
						onClick={() => {}} // PopoverTrigger handles toggle automatically
					/>
				</div>
			</PopoverTrigger>

			<PopoverContent
				align="end"
				className="w-[calc(100vw-2rem)] max-w-96 p-0 overflow-hidden"
			>
				<NotificationPanel
					notifications={notifications}
					loading={loading}
					error={error}
					onRetry={() => void refetch()}
					onRead={(id) => void markAsRead(id)}
					onMarkAllRead={() => void markAllAsRead()}
					pushPermission={permission}
					pushRegistered={isRegistered}
					pushRegistering={isRegistering}
					pushError={pushError}
					onEnablePush={() => void enableNotifications()}
					onDisablePush={() => void disableNotifications()}
				/>
			</PopoverContent>
		</Popover>
	);
}
