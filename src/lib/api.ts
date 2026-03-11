import axios from 'axios';
import { store } from '@/store';
import { setToken, clearToken } from '@/store/authSlice';

const API_BASE = 'http://localhost:8000';

const instance = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Track in-flight requests to support cancellation
const pendingRequests = new Map<string, AbortController>();

let refreshPromise: Promise<string | null> | null = null;

function getAccessToken() {
  const state: any = store.getState();
  return state?.auth?.token as string | null;
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = axios
    .create({ baseURL: API_BASE, withCredentials: true })
    .post('/api/auth/refresh')
    .then((res) => {
      const token = res.data?.access_token as string | undefined;
      if (token) {
        store.dispatch(setToken(token));
        return token;
      }
      throw new Error('No access token returned from refresh');
    })
    .catch((err) => {
      store.dispatch(clearToken());
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function tryRefreshSession(): Promise<boolean> {
  try {
    const token = await refreshAccessToken();
    return Boolean(token);
  } catch {
    return false;
  }
}

function getRequestKey(config: any) {
  try {
    const method = (config.method || 'get').toLowerCase();
    const url = config.url || '';
    const params = config.params ? JSON.stringify(config.params) : '';
    const data = config.data ? JSON.stringify(config.data) : '';
    return `${method}:${url}?p=${params}&d=${data}`;
  } catch (err) {
    return `${config.method || 'get'}:${config.url}`;
  }
}

instance.interceptors.request.use((config) => {
  const accessToken = getAccessToken();
  if (accessToken) {
    const hdrs = (config.headers as any) || {};
    hdrs['Authorization'] = `Bearer ${accessToken}`;
    config.headers = hdrs;
  }

  // Respect externally-provided AbortSignal
  if (config.signal) return config;

  const key = getRequestKey(config);

  // Cancel previous identical request
  if (pendingRequests.has(key)) {
    try {
      const prev = pendingRequests.get(key);
      prev?.abort();
    } catch (e) {
      // ignore
    }
    pendingRequests.delete(key);
  }

  const controller = new AbortController();
  config.signal = controller.signal;
  pendingRequests.set(key, controller);

  return config;
});

instance.interceptors.response.use(
  (response) => {
    try {
      const key = getRequestKey(response.config);
      pendingRequests.delete(key);
    } catch (e) {
      // ignore
    }
    return response;
  },
  (error) => {
    try {
      const cfg = (error && error.config) || {};
      const key = getRequestKey(cfg);
      pendingRequests.delete(key);
    } catch (e) {
      // ignore
    }

    const status = error?.response?.status;
    const originalRequest: any = error?.config || {};
    const isAuthRefresh = typeof originalRequest?.url === 'string' && originalRequest.url.includes('/auth/refresh');

    if (status === 401 && !originalRequest._retry && !isAuthRefresh) {
      originalRequest._retry = true;
      return refreshAccessToken()
        .then((token) => {
          if (!token) {
            window.location.href = '/login';
            return Promise.reject(error);
          }
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return instance.request(originalRequest);
        })
        .catch((refreshErr) => {
          window.location.href = '/login';
          return Promise.reject(refreshErr);
        });
    }

    return Promise.reject(error);
  }
);

export function cancelAllRequests() {
  for (const [, controller] of pendingRequests) {
    try {
      controller.abort();
    } catch (e) {
      // ignore
    }
  }
  pendingRequests.clear();
}

export default instance;
