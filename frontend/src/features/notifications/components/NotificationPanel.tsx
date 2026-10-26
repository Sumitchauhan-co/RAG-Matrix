import { Bell, CheckCheck } from 'lucide-react';

import type { Notification } from '../types/notification';
import { NotificationItem } from './NotificationItem';

interface NotificationPanelProps {
	notifications: Notification[];
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	onRead: (id: number) => void;
	onMarkAllRead: () => void;
	pushPermission: NotificationPermission | 'unsupported';
	pushRegistered: boolean;
	pushRegistering: boolean;
	pushError: string | null;
	onEnablePush: () => void;
	onDisablePush: () => void;
}

export function NotificationPanel({
	notifications,
	loading,
	error,
	onRetry,
	onRead,
	onMarkAllRead,
	pushPermission,
	pushRegistered,
	pushRegistering,
	pushError,
	onEnablePush,
	onDisablePush,
}: NotificationPanelProps) {
	const hasUnread = notifications.some((notification) => !notification.is_read);

	return (
		<div
			id="notification-panel"
			role="dialog"
			aria-label="Notifications"
			className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-2rem)] max-w-96 overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-900 shadow-2xl shadow-slate-950/20 ring-1 ring-slate-950/5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-black/50 dark:ring-white/10"
		>
			{/* Header */}
			<div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
				<div className="flex items-center gap-2">
					<Bell className="size-4 text-muted-foreground" />

					<h2 className="text-sm font-semibold">Notifications</h2>

					{hasUnread && (
						<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
							{
								notifications.filter((notification) => !notification.is_read)
									.length
							}
						</span>
					)}
				</div>

				{hasUnread && (
					<button
						type="button"
						onClick={onMarkAllRead}
						className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
					>
						<CheckCheck className="size-3.5" />
						Mark all as read
					</button>
				)}
			</div>

			<div className="border-b border-slate-200 bg-indigo-50/80 px-4 py-3 dark:border-slate-700 dark:bg-indigo-950/50">
				{pushPermission === 'unsupported' ? (
					<p className="text-xs text-muted-foreground">
						Push notifications are not supported in this browser or app context.
					</p>
				) : pushPermission === 'denied' ? (
					<p className="text-xs text-muted-foreground">
						Notifications are blocked. Allow them in your browser or app
						settings, then return here.
					</p>
				) : pushRegistered ? (
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
							This device is set up to receive push notifications.
						</p>
						<button
							type="button"
							onClick={onDisablePush}
							disabled={pushRegistering}
							className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-60"
						>
							Disable
						</button>
					</div>
				) : (
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
							Get notified when your evaluations finish.
						</p>
						<button
							type="button"
							onClick={onEnablePush}
							disabled={pushRegistering}
							className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
						>
							{pushRegistering
								? 'Please wait...'
								: pushPermission === 'granted'
									? 'Set up this device'
									: 'Enable notifications'}
						</button>
					</div>
				)}
				{pushError && (
					<p
						role="alert"
						className="mt-2 text-xs text-destructive"
					>
						{pushError}
					</p>
				)}
			</div>

			{/* Notifications */}
			<div className="max-h-[28rem] overflow-y-auto">
				{loading ? (
					<div className="flex flex-col items-center justify-center px-6 py-12 text-center">
						<div className="mb-3 size-5 animate-spin rounded-full border-2 border-muted border-t-primary" />

						<p className="text-sm text-muted-foreground">
							Loading notifications...
						</p>
					</div>
				) : error ? (
					<div className="px-6 py-8 text-center">
						<p
							role="alert"
							className="text-sm text-destructive"
						>
							{error}
						</p>
						<button
							type="button"
							onClick={onRetry}
							className="mt-3 text-sm font-medium text-primary hover:underline"
						>
							Try again
						</button>
					</div>
				) : notifications.length === 0 ? (
					<div className="flex flex-col items-center justify-center px-6 py-12 text-center">
						<div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
							<Bell className="size-5 text-muted-foreground" />
						</div>

						<p className="text-sm font-medium">You're all caught up</p>

						<p className="mt-1 text-xs text-muted-foreground">
							No new notifications right now.
						</p>
					</div>
				) : (
					notifications.map((notification) => (
						<NotificationItem
							key={notification.id}
							notification={notification}
							onRead={onRead}
						/>
					))
				)}
			</div>
		</div>
	);
}
