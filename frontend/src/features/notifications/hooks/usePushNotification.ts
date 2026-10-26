import { useCallback, useEffect, useRef, useState } from 'react';

import {
	registerWebPush,
	setupForegroundNotifications,
	unregisterWebPush,
} from '../firebase';

type PushPermission = NotificationPermission | 'unsupported';
const PUSH_DISABLED_KEY = 'rag-matrix-push-disabled';

function hasPushOptedOut(): boolean {
	return window.localStorage.getItem(PUSH_DISABLED_KEY) === 'true';
}

export function usePushNotifications(
	onNotificationReceived: () => void,
) {
	const [permission, setPermission] = useState<PushPermission>(() =>
		'Notification' in window ? Notification.permission : 'unsupported',
	);
	const [isRegistering, setIsRegistering] = useState(false);
	const [isRegistered, setIsRegistered] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isRegisteredRef = useRef(false);
	const isRegisteringRef = useRef(false);
	const notificationReceivedRef = useRef(onNotificationReceived);

	useEffect(() => {
		notificationReceivedRef.current = onNotificationReceived;
	}, [onNotificationReceived]);

	const registerGrantedPermission = useCallback(async () => {
		if (
			!('Notification' in window) ||
			Notification.permission !== 'granted' ||
			hasPushOptedOut() ||
			isRegisteredRef.current ||
			isRegisteringRef.current
		) {
			return;
		}

		isRegisteringRef.current = true;
		try {
			await registerWebPush();
			isRegisteredRef.current = true;
			setIsRegistered(true);
			setError(null);
		} catch (registrationError) {
			console.error('Failed to register this device for push notifications:', registrationError);
			isRegisteredRef.current = false;
			setIsRegistered(false);
			setError(
				registrationError instanceof Error
					? registrationError.message
					: 'Push notifications could not be registered on this device.',
			);
		} finally {
			isRegisteringRef.current = false;
		}
	}, []);

	const enableNotifications = useCallback(async () => {
		if (isRegisteringRef.current) {
			return false;
		}

		isRegisteringRef.current = true;
		setIsRegistering(true);
		setError(null);
		try {
			window.localStorage.removeItem(PUSH_DISABLED_KEY);
			const token = await registerWebPush(true);
			setPermission(
				'Notification' in window ? Notification.permission : 'unsupported',
			);
			if (!token) {
				if ('Notification' in window && Notification.permission === 'denied') {
					setError('Notifications are blocked. Allow them in your browser or app settings, then try again.');
				}
				return false;
			}

			isRegisteredRef.current = true;
			setIsRegistered(true);
			return true;
		} catch (registrationError) {
			console.error('Failed to enable push notifications:', registrationError);
			setError(
				registrationError instanceof Error
					? registrationError.message
					: 'Push notifications could not be enabled.',
			);
			return false;
		} finally {
			isRegisteringRef.current = false;
			setIsRegistering(false);
		}
	}, []);

	const disableNotifications = useCallback(async () => {
		if (isRegisteringRef.current) {
			return false;
		}

		isRegisteringRef.current = true;
		setIsRegistering(true);
		setError(null);
		try {
			window.localStorage.setItem(PUSH_DISABLED_KEY, 'true');
			await unregisterWebPush();
			isRegisteredRef.current = false;
			setIsRegistered(false);
			return true;
		} catch (unregisterError) {
			window.localStorage.removeItem(PUSH_DISABLED_KEY);
			console.error('Failed to disable push notifications on this device:', unregisterError);
			setError(
				unregisterError instanceof Error
					? unregisterError.message
					: 'Push notifications could not be disabled on this device.',
			);
			return false;
		} finally {
			isRegisteringRef.current = false;
			setIsRegistering(false);
		}
	}, []);

	useEffect(() => {
		let unsubscribe: (() => void) | undefined;
		let active = true;

		const setup = async () => {
			if (!('Notification' in window)) {
				return;
			}

			try {
				const cleanup = await setupForegroundNotifications(() => {
					notificationReceivedRef.current();
				});
				if (active) {
					unsubscribe = cleanup;
				} else {
					cleanup();
				}
			} catch (setupError) {
				console.error('Failed to set up foreground push notifications:', setupError);
			}

			void registerGrantedPermission();
		};

		void setup();

		return () => {
			active = false;
			unsubscribe?.();
		};
	}, [registerGrantedPermission]);

	useEffect(() => {
		const updatePermission = () => {
			if (!('Notification' in window)) {
				setPermission('unsupported');
				return;
			}

			setPermission(Notification.permission);
			if (
				Notification.permission === 'granted' &&
				!hasPushOptedOut()
			) {
				void registerGrantedPermission();
			} else {
				isRegisteredRef.current = false;
				setIsRegistered(false);
			}
		};

		window.addEventListener('focus', updatePermission);
		document.addEventListener('visibilitychange', updatePermission);
		return () => {
			window.removeEventListener('focus', updatePermission);
			document.removeEventListener('visibilitychange', updatePermission);
		};
	}, [registerGrantedPermission]);

	return {
		permission,
		isRegistering,
		isRegistered,
		error,
		enableNotifications,
		disableNotifications,
	};
}
