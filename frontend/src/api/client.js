import axios from 'axios';
import { storage } from '../utils/storage';

const BASE_URL = 'https://aquafilter.onrender.com/api';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
client.interceptors.request.use(async (config) => {
  const token = await storage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response error handler
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await storage.deleteItem('authToken');
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
export const authAPI = {
  login: (email, password) => client.post('/auth/login', { email, password }),
  register: (name, email, password) => client.post('/auth/register', { name, email, password }),
  me: () => client.get('/auth/me'),
  savePushToken: (token) => client.post('/auth/push-token', { token }),
  removePushToken: (token) => client.delete('/auth/push-token', { data: { token } }),
};

const DEVICE_ID = 'esp32-aquafilter-001';

// --- Sensor / Telemetry ---
export const sensorAPI = {
  getLatest: () => client.get(`/sensors/${DEVICE_ID}/latest`),
  getHistory: (params) => client.get(`/sensors/${DEVICE_ID}/history`, { params }),
  getStats: (params) => client.get(`/sensors/${DEVICE_ID}/averages`, { params }),
};

// --- Device Control ---
export const deviceAPI = {
  getState: () => client.get(`/device/${DEVICE_ID}/state`),
  toggle: (on) => client.patch(`/device/${DEVICE_ID}/power`, { isPoweredOn: on }),
  startCycle: () => client.post(`/device/${DEVICE_ID}/cycle/start`),
  pauseCycle: () => client.patch(`/device/${DEVICE_ID}/cycle/pause`),
};

// --- Config / WiFi ---
export const configAPI = {
  requestWifiScan: ()         => client.post(`/config/wifi-scan-request/${DEVICE_ID}`),
  getWifiScanResults: ()      => client.get(`/config/wifi-scan-results/${DEVICE_ID}`),
  updateWifi: (ssid, password) => client.post('/config/wifi', { deviceId: DEVICE_ID, ssid, password }),
};

// --- Maintenance ---
export const maintenanceAPI = {
  getAll: () => client.get(`/maintenance/${DEVICE_ID}`),
  create: (record) => client.post(`/maintenance/${DEVICE_ID}`, record),
  acknowledge: (id) => client.patch(`/maintenance/${DEVICE_ID}/${id}/acknowledge`),
};

export default client;
