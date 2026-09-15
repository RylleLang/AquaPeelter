import axios, { InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { storage } from '../utils/storage'; // Note: Ensure this uses expo-secure-store for tokens
import { MaintenanceForm, MaintenanceRecord } from '../types';

// Access base public URL from .env file
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

// TODO: This should be dynamic per user, not hardcoded globally.
const DEVICE_ID = 'esp32-aquafilter-001';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

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
  
  getHistory: (params: { startDate?: string; endDate?: string; limit?: number }) => 
    client.get(`/sensors/${DEVICE_ID}/history`, { params }),
  
  getStats: (params: { startDate?: string; endDate?: string; limit?: number }) => 
    client.get(`/sensors/${DEVICE_ID}/averages`, { params }),
};

// --- Device Control ---
export const deviceAPI = {
  getState: () => 
    client.get(`/device/${DEVICE_ID}/state`),
  
  toggle: (on: boolean) => 
    client.patch(`/device/${DEVICE_ID}/power`, { isPoweredOn: on }),
  
  startCycle: () => 
    client.post(`/device/${DEVICE_ID}/cycle/start`),
  
  pauseCycle: () => 
    client.patch(`/device/${DEVICE_ID}/cycle/pause`),
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