import { deleteToken, getToken, onMessage } from 'firebase/messaging';

import { getFirebaseMessaging } from '@/lib/firebase';

import {
	registerNotificationDevice,
	unregisterNotificationDevice,
} from './api';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

function getDevicePlatform(): 'web' | 'app' {
	const isStandalone =
		window.matchMedia('(display-mode: standalone)').matches ||
		('standalone' in navigator &&
			Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
	const isTrustedWebActivity = document.referrer.startsWith('android-app://');

	return isStandalone || isTrustedWebActivity ? 'app' : 'web';
}

export async function registerWebPush(
	requestPermission = false,
): Promise<string | null> {
	if (!('Notification' in window)) {
		return null;
	}

	let permission = Notification.permission;

	if (permission === 'default' && requestPermission) {
		permission = await Notification.requestPermission();
	}

	if (permission !== 'granted') {
		return null;
	}

	if (!VAPID_KEY) {
		throw new Error('VITE_FIREBASE_VAPID_KEY is missing.');
	}

	if (!('serviceWorker' in navigator) || !window.isSecureContext) {
		throw new Error('Web push requires service workers on a secure origin.');
	}

	const messaging = await getFirebaseMessaging();
	if (!messaging) {
		throw new Error('Firebase Messaging is not supported in this browser.');
	}

	const serviceWorkerRegistration = await navigator.serviceWorker.ready;
	const token = await getToken(messaging, {
		vapidKey: VAPID_KEY,
		serviceWorkerRegistration,
	});

	if (!token) {
		throw new Error('Firebase did not return a web-push registration token.');
	}

	await registerNotificationDevice(token, getDevicePlatform());

	return token;
}

export async function setupForegroundNotifications(
	onNotification: (payload: {
		title?: string;
		body?: string;
		url?: string;
	}) => void,
): Promise<() => void> {
	const messaging = await getFirebaseMessaging();
	if (!messaging) {
		throw new Error('Firebase Messaging is not supported in this browser.');
	}

	return onMessage(messaging, (payload) => {
		const title =
			payload.notification?.title ??
			payload.data?.title ??
			'RAG Matrix';

		const body =
			payload.notification?.body ??
			payload.data?.body ??
			'Your evaluation has completed.';

		onNotification({
			title,
			body,
			url: payload.data?.url,
		});

		if (Notification.permission === 'granted') {
			const notification = new Notification(title, {
				body,
				icon: '/favicon-192x192.png',
				tag: payload.data?.notification_id ?? `rag-matrix-${Date.now()}`,
			});

			notification.onclick = () => {
				window.focus();
				if (payload.data?.url) {
					const target = new URL(payload.data.url, window.location.origin);
					if (target.origin === window.location.origin) {
						window.location.assign(target.href);
					}
				}
				notification.close();
			};
		}
	});
}

export async function unregisterWebPush(): Promise<void> {
	if (!('Notification' in window) || Notification.permission !== 'granted') {
		return;
	}

	const messaging = await getFirebaseMessaging();
	if (!messaging) {
		throw new Error('Firebase Messaging is not supported in this browser.');
	}

	if (!VAPID_KEY) {
		throw new Error('VITE_FIREBASE_VAPID_KEY is missing.');
	}

	const serviceWorkerRegistration = await navigator.serviceWorker.ready;
	const token = await getToken(messaging, {
		vapidKey: VAPID_KEY,
		serviceWorkerRegistration,
	});
	if (token) {
		await unregisterNotificationDevice(token);
	}

	await deleteToken(messaging);
}
