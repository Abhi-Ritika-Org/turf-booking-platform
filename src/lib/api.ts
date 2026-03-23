import axios from 'axios';
import { store } from '@/store';
import { setToken, clearToken, setUserName } from '@/store/authSlice';
import { setUserData, clearUserData } from '@/store/userDataSlice';

const API_BASE = 'http://localhost:8000';

const instance = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});


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
    .then(async (res) => {
      const token = res.data?.access_token as string | undefined;
      if (token) {
        store.dispatch(setToken(token));

        // Keep user profile hydrated after session restoration.
        try {
          const userResponse = await axios.create({ baseURL: API_BASE, withCredentials: true }).get('/api/auth/current-user-data', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const userData = userResponse?.data ?? null;
          store.dispatch(setUserData(userData));

          const fullName = userData && typeof userData === 'object' ? (userData as Record<string, unknown>).full_name : null;
          store.dispatch(setUserName(typeof fullName === 'string' ? fullName : null));
        } catch {
          // Refresh succeeded, so don't fail auth if profile fetch is temporarily unavailable.
          store.dispatch(setUserData(null));
        }

        return token;
      }
      throw new Error('No access token returned from refresh');
    })
    .catch((err) => {
      store.dispatch(clearToken());
      store.dispatch(clearUserData());
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


instance.interceptors.request.use((config) => {
  const accessToken = getAccessToken();
  if (accessToken) {
    const hdrs = (config.headers as any) || {};
    hdrs['Authorization'] = `Bearer ${accessToken}`;
    config.headers = hdrs;
  }
  return config;
});

instance.interceptors.response.use(
  (response) => response,
  (error) => {
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


export default instance;
