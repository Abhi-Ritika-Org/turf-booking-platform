/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE?: string;
	readonly VITE_RAZORPAY_KEY_ID?: string;
	readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// Script-scope declaration (this file has no imports/exports), so it augments the global Window directly.
interface Window {
	Razorpay?: new (options: Record<string, unknown>) => { open: () => void; close: () => void };
}
