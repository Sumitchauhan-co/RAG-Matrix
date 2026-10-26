import { getMessaging, isSupported } from 'firebase/messaging';
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

export async function getFirebaseMessaging() {
	const requiredConfig = [
		firebaseConfig.apiKey,
		firebaseConfig.projectId,
		firebaseConfig.messagingSenderId,
		firebaseConfig.appId,
	];
	if (requiredConfig.some((value) => !value)) {
		throw new Error('Firebase Messaging configuration is incomplete.');
	}

	const supported = await isSupported();

	if (!supported) {
		return null;
	}

	return getMessaging(firebaseApp);
}
