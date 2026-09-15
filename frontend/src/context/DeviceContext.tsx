import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { deviceAPI, sensorAPI } from '../api/client';
import { useAuth } from './AuthContext';

export interface DeviceState {
  isOn: boolean;
  cycleRunning: boolean;
  cycleProgress: number;      // 0–100%
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
  togglePower: () => Promise<void>;
  startCycle: () => Promise<void>;
  pauseCycle: () => Promise<void>;
  fetchState: () => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

const POLL_INTERVAL_MS = 5000; // 5s real-time polling

export const DeviceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  
  const [deviceState, setDeviceState] = useState<DeviceState>({
    isOn: false,
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

  // --- Polling ---
  const fetchState = useCallback(async () => {
    try {
      const [stateRes, sensorRes] = await Promise.all([
        deviceAPI.getState(),
        sensorAPI.getLatest(),
      ]);

      // Map backend DeviceState fields → frontend shape
      const state = stateRes.data?.data;
      if (state) {
        setDeviceState((prev) => ({
          ...prev,
          isOn: state.isPoweredOn ?? prev.isOn,
          cycleRunning: state.cycleStatus === 'running',
          filterHealthPct: state.filterHealthPercent ?? prev.filterHealthPct,
          filterCycleCount: state.cyclesSinceLastService ?? prev.filterCycleCount,
        }));
      }

      // Backend returns { data: { preFilter, postFilter } } — use postFilter for dashboard
      const postFilter = sensorRes.data?.data?.postFilter;
      const ts = postFilter?.timestamp ?? null;
      setSensorData({
        ph: postFilter?.ph ?? null,
        turbidity: postFilter?.turbidity ?? null,
        tds: postFilter?.tds ?? null,
        timestamp: ts,
      });
      // ESP32 is online if last reading was within 30 seconds
      setEsp32Online(ts ? (Date.now() - new Date(ts).getTime()) < 30000 : false);
    } catch {
      // silent — network blip handled by interceptor
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchState();
    pollRef.current = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, fetchState]);

  // --- Local elapsed timer ---
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

  // --- Controls ---
  const togglePower = async () => {
    setLoading(true);
    try {
      const { data } = await deviceAPI.toggle(!deviceState.isOn);
      setDeviceState((prev) => ({ ...prev, ...data }));
    } finally {
      setLoading(false);
    }
  };

  const startCycle = async () => {
    setLoading(true);
    try {
      const { data } = await deviceAPI.startCycle();
      const state = data?.data;
      setDeviceState((prev) => ({
        ...prev,
        cycleRunning: state?.cycleStatus === 'running',
        filterHealthPct: state?.filterHealthPercent ?? prev.filterHealthPct,
        filterCycleCount: state?.cyclesSinceLastService ?? prev.filterCycleCount,
        elapsedSeconds: 0,
      }));
    } finally {
      setLoading(false);
    }
  };

  const pauseCycle = async () => {
    setLoading(true);
    try {
      const { data } = await deviceAPI.pauseCycle();
      const state = data?.data;
      setDeviceState((prev) => ({
        ...prev,
        cycleRunning: state?.cycleStatus === 'running',
        filterHealthPct: state?.filterHealthPercent ?? prev.filterHealthPct,
        filterCycleCount: state?.cyclesSinceLastService ?? prev.filterCycleCount,
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DeviceContext.Provider
      value={{ deviceState, sensorData, esp32Online, loading, togglePower, startCycle, pauseCycle, fetchState }}
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