import { Bell } from 'lucide-react';

interface NotificationBellProps {
	unreadCount: number;
	expanded: boolean;
	onClick: () => void;
}

export function NotificationBell({
	unreadCount,
	expanded,
	onClick,
}: NotificationBellProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-expanded={expanded}
			aria-controls="notification-panel"
			aria-haspopup="dialog"
			className="relative inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label={
				unreadCount > 0
					? `${unreadCount} unread notifications`
					: 'Notifications'
			}
			title="Notifications"
		>
			<Bell className="size-5" />

			{unreadCount > 0 && (
				<span
					aria-hidden="true"
					className="absolute right-0 top-0 flex min-h-4 min-w-4 -translate-y-1/4 translate-x-1/4 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground"
				>
					{unreadCount > 99 ? '99+' : unreadCount}
				</span>
			)}
		</button>
	);
}
