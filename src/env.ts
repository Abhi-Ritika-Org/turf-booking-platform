// Small shim to expose Vite's import.meta.env values via `process.env`.
// This lets existing code reference `process.env.KEY_NAME` as the user requested.

const mapped: Record<string, string | undefined> = {
  API_BASE: import.meta.env.VITE_API_BASE,
  RAZORPAY_KEY_ID: import.meta.env.VITE_RAZORPAY_KEY_ID,
  APP_NAME: import.meta.env.VITE_APP_NAME,
};

// Ensure `process.env` exists on globalThis and merge any existing values.
const globalWithProcess = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
globalWithProcess.process = globalWithProcess.process ?? { env: {} };
Object.assign(globalWithProcess.process.env, mapped);

export const env = globalWithProcess.process.env;

export default env;
