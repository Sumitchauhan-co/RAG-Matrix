import { CheckCircle2, CircleAlert, CircleX, Info } from 'lucide-react';

import type { Notification } from '../types/notification';

interface NotificationItemProps {
	notification: Notification;
	onRead: (id: number) => void;
}

const notificationIcons = {
	info: Info,
	success: CheckCircle2,
	warning: CircleAlert,
	error: CircleX,
};

export function NotificationItem({
	notification,
	onRead,
}: NotificationItemProps) {
	const Icon = notificationIcons[notification.type] ?? Info;

	return (
		<button
			type="button"
			onClick={() => {
				if (!notification.is_read) {
					onRead(notification.id);
				}
			}}
			className={`w-full border-b border-slate-200 p-4 text-left transition-colors last:border-b-0 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 ${
				!notification.is_read
					? 'bg-indigo-50 dark:bg-indigo-950/40'
					: 'bg-white dark:bg-slate-900'
			}`}
		>
			<div className="flex items-start gap-3">
				<div className="mt-0.5 shrink-0">
					<Icon className="size-5 text-muted-foreground" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-2">
						<p
							className={`flex-1 text-sm ${
								!notification.is_read ? 'font-semibold' : 'font-medium'
							}`}
						>
							{notification.title}
						</p>

						{!notification.is_read && (
							<span
								aria-label="Unread"
								className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
							/>
						)}
					</div>

					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{notification.message}
					</p>

					<p className="mt-2 text-xs text-muted-foreground">
						{new Date(notification.created_at).toLocaleString()}
					</p>
				</div>
			</div>
		</button>
	);
}
