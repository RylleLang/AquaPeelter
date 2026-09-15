import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { deviceAPI, sensorAPI } from '../api/client';
import { useAuth } from './AuthContext';
import { CycleStatus, CycleSummary } from '../types';

export interface DeviceState {
  isOn: boolean;
  cycleStatus: CycleStatus;   // idle | running | paused | completed
  cycleRunning: boolean;      // derived: cycleStatus === 'running'
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
  pauseCycle: () => Promise<void>;          // toggles running <-> paused
  completeCycle: () => Promise<CycleSummary>;
  fetchState: () => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

const POLL_INTERVAL_MS = 5000; // 5s real-time polling

export const DeviceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  
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
        const status: CycleStatus = state.cycleStatus ?? 'idle';
        // activeCycleId is populated with startedAt, so elapsed time survives app reloads
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
      const status: CycleStatus = data?.data?.cycleStatus ?? 'running';
      setDeviceState((prev) => ({
        ...prev,
        cycleStatus: status,
        cycleRunning: status === 'running',
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
      const status: CycleStatus = data?.data?.cycleStatus ?? 'paused';
      setDeviceState((prev) => ({
        ...prev,
        cycleStatus: status,
        cycleRunning: status === 'running',
      }));
    } finally {
      setLoading(false);
    }
  };

  // Ends the active cycle (running or paused). The backend aggregates the cycle's
  // pre/post readings and returns the summary; filter health is refreshed by the next poll.
  const completeCycle = async (): Promise<CycleSummary> => {
    setLoading(true);
    try {
      const { data } = await deviceAPI.completeCycle();
      setDeviceState((prev) => ({
        ...prev,
        cycleStatus: 'completed',
        cycleRunning: false,
        elapsedSeconds: 0,
      }));
      fetchState();
      return (data?.data?.summary ?? {}) as CycleSummary;
    } finally {
      setLoading(false);
    }
  };

  return (
    <DeviceContext.Provider
      value={{ deviceState, sensorData, esp32Online, loading, togglePower, startCycle, pauseCycle, completeCycle, fetchState }}
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