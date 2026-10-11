import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { deviceAPI, sensorAPI } from '../api/client';
import { useAuth } from './AuthContext';
import { CycleStatus, CycleSummary, StoredDevice } from '../types';
import { storage } from '../utils/storage';

export interface DeviceState {
  isOn: boolean;
  cycleStatus: CycleStatus;
  cycleRunning: boolean;
  cycleProgress: number;
  elapsedSeconds: number;
  filterCycleCount: number;
  filterHealthPct: number;
}

export interface SensorData {
  ph: number | null;
  turbidity: number | null;
  tds: number | null;
  timestamp: string | null;
}

interface DeviceContextType {
  deviceState: DeviceState;
  sensorData: SensorData;
  esp32Online: boolean;
  loading: boolean;
  connectedDevice: StoredDevice | null;
  setConnectedDevice: (device: StoredDevice | null) => Promise<void>;
  togglePower: () => Promise<void>;
  startCycle: () => Promise<void>;
  pauseCycle: () => Promise<void>;
  completeCycle: () => Promise<CycleSummary>;
  fetchState: () => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);
const POLL_INTERVAL_MS = 5000;

export const DeviceProvider = ({ children }: { children: ReactNode }) => {
  const { user, isGuest } = useAuth();
  
  const [connectedDevice, setConnectedDeviceState] = useState<StoredDevice | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState>({
    isOn: false,
    cycleStatus: 'idle',
    cycleRunning: false,
    cycleProgress: 0,
    elapsedSeconds: 0,
    filterCycleCount: 0,
    filterHealthPct: 100,
  });
  
  const [sensorData, setSensorData] = useState<SensorData>({
    ph: null,
    turbidity: null,
    tds: null,
    timestamp: null,
  });
  
  const [esp32Online, setEsp32Online] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to persist connected device
  const setConnectedDevice = async (device: StoredDevice | null) => {
    setConnectedDeviceState(device);
    if (device) {
      await storage.setItem('last_esp32_device', JSON.stringify(device));
    }
  };

  // Helper: Create direct Axios instance for ESP32 in Guest Mode
  const getLocalClient = useCallback(() => {
    if (!connectedDevice?.ip) return null;
    return axios.create({
      baseURL: `http://${connectedDevice.ip}`,
      timeout: 3000,
    });
  }, [connectedDevice?.ip]);

  // --- Unified Fetch State (Cloud or Local) ---
  const fetchState = useCallback(async () => {
    try {
      if (user && !isGuest) {
        // ── Cloud Mode ──
        const [stateRes, sensorRes] = await Promise.all([
          deviceAPI.getState(),
          sensorAPI.getLatest(),
        ]);

        const state = stateRes.data?.data;
        if (state) {
          const status: CycleStatus = state.cycleStatus ?? 'idle';
          const startedAt: string | undefined = state.activeCycleId?.startedAt;
          setDeviceState((prev) => ({
            ...prev,
            isOn: state.isPoweredOn ?? prev.isOn,
            cycleStatus: status,
            cycleRunning: status === 'running',
            elapsedSeconds:
              status === 'running' && startedAt
                ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
                : status === 'paused'
                  ? prev.elapsedSeconds
                  : 0,
            filterHealthPct: state.filterHealthPercent ?? prev.filterHealthPct,
            filterCycleCount: state.cyclesSinceLastService ?? prev.filterCycleCount,
          }));
        }

        const postFilter = sensorRes.data?.data?.postFilter;
        const ts = postFilter?.timestamp ?? null;
        setSensorData({
          ph: postFilter?.ph ?? null,
          turbidity: postFilter?.turbidity ?? null,
          tds: postFilter?.tds ?? null,
          timestamp: ts,
        });
        setEsp32Online(ts ? (Date.now() - new Date(ts).getTime()) < 30000 : false);

      } else if (isGuest && connectedDevice) {
        // ── Local Guest Mode (Direct to ESP32 Web Server) ──
        const local = getLocalClient();
        if (!local) return;

        const [stateRes, sensorRes] = await Promise.all([
          local.get('/api/state'),
          local.get('/api/sensors'),
        ]);

        const state = stateRes.data;
        if (state) {
          const status: CycleStatus = state.cycleStatus ?? 'idle';
          setDeviceState((prev) => ({
            ...prev,
            isOn: state.isOn ?? prev.isOn,
            cycleStatus: status,
            cycleRunning: status === 'running',
            elapsedSeconds: state.elapsedSeconds ?? prev.elapsedSeconds,
            filterHealthPct: state.filterHealthPct ?? prev.filterHealthPct,
            filterCycleCount: state.filterCycleCount ?? prev.filterCycleCount,
          }));
        }

        const sensor = sensorRes.data;
        if (sensor) {
          setSensorData({
            ph: sensor.ph ?? null,
            turbidity: sensor.turbidity ?? null,
            tds: sensor.tds ?? null,
            timestamp: new Date().toISOString(),
          });
        }
        setEsp32Online(true);
      }
    } catch {
      if (isGuest) setEsp32Online(false);
    }
  }, [user, isGuest, connectedDevice, getLocalClient]);

  // Activate Polling for Cloud OR Guest Mode
  useEffect(() => {
    const shouldPoll = Boolean((user && !isGuest) || (isGuest && connectedDevice));
    if (!shouldPoll) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    fetchState();
    pollRef.current = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, isGuest, connectedDevice, fetchState]);

  // Local Cycle Elapsed Seconds Timer
  useEffect(() => {
    if (deviceState.cycleRunning) {
      timerRef.current = setInterval(() => {
        setDeviceState((prev) => ({ ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [deviceState.cycleRunning]);

  // --- Dual-Engine Device Controls ---
  const togglePower = async () => {
    setLoading(true);
    try {
      if (user && !isGuest) {
        const { data } = await deviceAPI.toggle(!deviceState.isOn);
        setDeviceState((prev) => ({ ...prev, ...data }));
      } else {
        const local = getLocalClient();
        if (local) {
          const { data } = await local.post('/api/power', { state: !deviceState.isOn });
          setDeviceState((prev) => ({ ...prev, isOn: data.isOn }));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const startCycle = async () => {
    setLoading(true);
    try {
      if (user && !isGuest) {
        const { data } = await deviceAPI.startCycle();
        const status: CycleStatus = data?.data?.cycleStatus ?? 'running';
        setDeviceState((prev) => ({
          ...prev,
          cycleStatus: status,
          cycleRunning: status === 'running',
          elapsedSeconds: 0,
        }));
      } else {
        const local = getLocalClient();
        if (local) {
          await local.post('/api/cycle/start');
          setDeviceState((prev) => ({ ...prev, cycleStatus: 'running', cycleRunning: true, elapsedSeconds: 0 }));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const pauseCycle = async () => {
    setLoading(true);
    try {
      if (user && !isGuest) {
        const { data } = await deviceAPI.pauseCycle();
        const status: CycleStatus = data?.data?.cycleStatus ?? 'paused';
        setDeviceState((prev) => ({
          ...prev,
          cycleStatus: status,
          cycleRunning: status === 'running',
        }));
      } else {
        const local = getLocalClient();
        if (local) {
          const nextStatus = deviceState.cycleRunning ? 'paused' : 'running';
          await local.post('/api/cycle/pause', { status: nextStatus });
          setDeviceState((prev) => ({ ...prev, cycleStatus: nextStatus, cycleRunning: nextStatus === 'running' }));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const completeCycle = async (): Promise<CycleSummary> => {
    setLoading(true);
    try {
      if (user && !isGuest) {
        const { data } = await deviceAPI.completeCycle();
        setDeviceState((prev) => ({
          ...prev,
          cycleStatus: 'completed',
          cycleRunning: false,
          elapsedSeconds: 0,
        }));
        fetchState();
        return (data?.data?.summary ?? {}) as CycleSummary;
      } else {
        const local = getLocalClient();
        let summary: CycleSummary = { durationSeconds: deviceState.elapsedSeconds } as CycleSummary;
        if (local) {
          const { data } = await local.post('/api/cycle/complete');
          summary = data.summary ?? summary;
        }
        setDeviceState((prev) => ({ ...prev, cycleStatus: 'completed', cycleRunning: false, elapsedSeconds: 0 }));
        return summary;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DeviceContext.Provider
      value={{
        deviceState,
        sensorData,
        esp32Online,
        loading,
        connectedDevice,
        setConnectedDevice,
        togglePower,
        startCycle,
        pauseCycle,
        completeCycle,
        fetchState,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
};

export const useDevice = () => {
  const context = useContext(DeviceContext);
  if (!context) throw new Error('useDevice must be used within a DeviceProvider');
  return context;
};