import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function firebaseMessagingConfigPlugin(): Plugin {
	let configSource = 'self.RAG_FIREBASE_CONFIG = {};';

	return {
		name: 'firebase-messaging-config',
		configResolved(config) {
			const env = loadEnv(config.mode, config.envDir, 'VITE_');
			const firebaseConfig = {
				apiKey: env.VITE_FIREBASE_API_KEY,
				authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
				projectId: env.VITE_FIREBASE_PROJECT_ID,
				storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
				messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
				appId: env.VITE_FIREBASE_APP_ID,
			};
			configSource = `self.RAG_FIREBASE_CONFIG = ${JSON.stringify(firebaseConfig)};`;
		},
		configureServer(server) {
			server.middlewares.use('/firebase-messaging-config.js', (_req, res) => {
				res.setHeader('Content-Type', 'application/javascript');
				res.end(configSource);
			});
		},
		generateBundle() {
			this.emitFile({
				type: 'asset',
				fileName: 'firebase-messaging-config.js',
				source: configSource,
			});
		},
	};
}

export default defineConfig({
	plugins: [react(), tailwindcss(), firebaseMessagingConfigPlugin()],
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, './src'),
		},
	},
	build: {
		chunkSizeWarningLimit: 600,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('node_modules')) {
						// Core React runtime dependencies
						if (
							id.includes('react/') ||
							id.includes('react-dom/') ||
							id.includes('react-router')
						) {
							return 'vendor-core';
						}
						// Heavy animation library
						if (id.includes('framer-motion')) {
							return 'vendor-motion';
						}
						// Charting libraries
						if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
							return 'vendor-charts';
						}
						// Icon library
						if (id.includes('lucide-react')) {
							return 'vendor-icons';
						}
						// UI Utilities (Radix, clsx, tailwind-merge, etc.)
						if (
							id.includes('@radix-ui') ||
							id.includes('clsx') ||
							id.includes('tailwind-merge')
						) {
							return 'vendor-ui';
						}
						// Fallback for all other third-party npm packages
						return 'vendor-misc';
					}
				},
			},
		},
	},
});
