importScripts(
	'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js',
);

importScripts(
	'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js',
);

importScripts('/firebase-messaging-config.js');

if (
	!self.RAG_FIREBASE_CONFIG?.apiKey ||
	!self.RAG_FIREBASE_CONFIG?.projectId ||
	!self.RAG_FIREBASE_CONFIG?.messagingSenderId ||
	!self.RAG_FIREBASE_CONFIG?.appId
) {
	throw new Error('Firebase Messaging configuration is incomplete.');
}

firebase.initializeApp(self.RAG_FIREBASE_CONFIG);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
	const title =
		payload.data?.title ??
		payload.notification?.title ??
		'RAG Matrix';

	const options = {
		body:
			payload.data?.body ??
			payload.notification?.body ??
			'You have a new notification.',

		data: {
			...payload.data,
			url: payload.data?.url ?? '/dashboard',
		},

		icon: '/favicon-192x192.png',
		badge: '/favicon-192x192.png',
	};

	self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const target = new URL(event.notification.data?.url ?? '/dashboard', self.location.origin);
	if (target.origin !== self.location.origin) {
		return;
	}

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			const existingClient = clients.find((client) => 'focus' in client);
			if (existingClient && 'focus' in existingClient) {
				return existingClient.focus().then(() => existingClient.navigate(target.href));
			}

			return self.clients.openWindow(target.href);
		}),
	);
});

const CACHE = 'rag-matrix-offline';
const offlineFallbackPage = '/offline.html';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.add(offlineFallbackPage))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
	if (event.request.mode !== 'navigate') {
		return;
	}

	event.respondWith(
		fetch(event.request).catch(async () => {
			const cache = await caches.open(CACHE);
			const fallback = await cache.match(offlineFallbackPage);
			if (!fallback) {
				throw new Error('Offline fallback page is not available in cache.');
			}
			return fallback;
		}),
	);
});
