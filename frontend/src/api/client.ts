import axios, { InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { storage } from '../utils/storage'; // Note: Ensure this uses expo-secure-store for tokens
import { MaintenanceForm, MaintenanceRecord } from '../types';

export type SamplePoint = 'pre-filter' | 'post-filter';

// Deployed backend (Render) by default. For local backend testing only, create an
// untracked frontend/.env with EXPO_PUBLIC_API_URL=http://<laptop-ip>:5000/api.
// Do not change the default — see CLAUDE.md barrier B5.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://aquafilter.onrender.com/api';

// Single-device prototype. Override with EXPO_PUBLIC_DEVICE_ID in an untracked
// frontend/.env to view the synthetic demo device (`esp32-demo-001`, see
// backend/scripts/seed-demo.js) — never point the real device id at demo data.
// TODO: This should be dynamic per user, not hardcoded globally.
const DEVICE_ID = process.env.EXPO_PUBLIC_DEVICE_ID || 'esp32-aquafilter-001';

// 20 s: long enough for a Render free-tier cold start to answer once it is awake,
// short enough that a genuinely dead connection is reported promptly.
const REQUEST_TIMEOUT_MS = 20000;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/** True when the request never got an HTTP response (timeout, DNS, offline, server asleep). */
export const isNetworkError = (err: unknown): boolean =>
  axios.isAxiosError(err) && !err.response;

/**
 * Wakes the backend. Render's free tier sleeps after idle and takes 30–60 s to boot;
 * /health is the cheapest endpoint and needs no auth. Resolves true when reachable.
 */
export const pingServer = async (timeoutMs = 60000): Promise<boolean> => {
  try {
    const res = await axios.get(`${BASE_URL.replace(/\/api\/?$/, '')}/health`, { timeout: timeoutMs });
    return res.status === 200;
  } catch {
    return false;
  }
};

// Attach JWT token to every request
client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await storage.getItem('authToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response error handler
client.interceptors.response.use(
  // On Fulfill
  (response: AxiosResponse) => response,
  // On Rejected
  async (error) => {
    if (error.response?.status === 401) {
      await storage.deleteItem('authToken');
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
// We can import the User interface from AuthContext later to strongly type this
export const authAPI = {
  login: (email: string, password: string) =>
    client.post('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    client.post('/auth/register', { name, email, password }),

  me: () => client.get('/auth/me'),

  savePushToken: (token: string) =>
    client.post('/auth/push-token', { token }),

  removePushToken: (token: string) =>
    client.delete('/auth/push-token', { data: { token } }),
};

// --- Sensor / Telemetry ---
export const sensorAPI = {
  getLatest: () =>
    client.get(`/sensors/${DEVICE_ID}/latest`),

  getHistory: (params: { startDate?: string; endDate?: string; limit?: number; samplePoint?: SamplePoint }) =>
    client.get(`/sensors/${DEVICE_ID}/history`, { params }),

  getStats: (params: { startDate?: string; endDate?: string; samplePoint?: SamplePoint }) =>
    client.get(`/sensors/${DEVICE_ID}/averages`, { params }),

  // Pre-filter vs post-filter averages + % improvement for a date range
  compare: (params: { startDate: string; endDate: string }) =>
    client.get(`/sensors/${DEVICE_ID}/compare`, { params }),
};

// --- Device Control ---
export const deviceAPI = {
  getState: () =>
    client.get(`/device/${DEVICE_ID}/state`),

  toggle: (on: boolean) =>
    client.patch(`/device/${DEVICE_ID}/power`, { isPoweredOn: on }),

  startCycle: () =>
    client.post(`/device/${DEVICE_ID}/cycle/start`),

  // Toggles running <-> paused
  pauseCycle: () =>
    client.patch(`/device/${DEVICE_ID}/cycle/pause`),

  // Ends the active cycle; response carries the computed summary
  completeCycle: () =>
    client.post(`/device/${DEVICE_ID}/cycle/complete`),

  getCycles: (params: { limit?: number; skip?: number } = {}) =>
    client.get(`/device/${DEVICE_ID}/cycles`, { params }),
};

// --- Config / WiFi ---
export const configAPI = {
  requestWifiScan: () =>
    client.post(`/config/wifi-scan-request/${DEVICE_ID}`),

  getWifiScanResults: () =>
    client.get(`/config/wifi-scan-results/${DEVICE_ID}`),

  updateWifi: (ssid: string, password: string) =>
    client.post('/config/wifi', { deviceId: DEVICE_ID, ssid, password }),
};

// --- Maintenance ---
export const maintenanceAPI = {
  getAll: () =>
    client.get(`/maintenance/${DEVICE_ID}`),

  create: (record: MaintenanceForm) =>
    client.post(`/maintenance/${DEVICE_ID}`, record),

  acknowledge: (id: string) =>
    client.patch(`/maintenance/${DEVICE_ID}/${id}/acknowledge`),
};

export default client;