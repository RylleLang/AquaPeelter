import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { useDevice } from '../context/DeviceContext';
import { sensorAPI, maintenanceAPI } from '../api/client';

type FilterType = 'All' | 'Sensors' | 'Maintenance' | 'Cycle';
const FILTERS: FilterType[] = ['All', 'Sensors', 'Maintenance', 'Cycle'];

export interface Alert {
  id: string;
  type: 'sensor' | 'maintenance' | 'cycle';
  severity: 'warning' | 'danger';
  icon: string;
  title: string;
  desc: string;
  time: string;
  color: string;
}

interface Reading {
  ph: number | null;
  turbidity: number | null;
  tds: number | null;
  createdAt?: string;
  timestamp?: string;
}

interface MaintenanceTask {
  _id: string;
  type: string;
  notes: string;
  acknowledged: boolean;
  createdAt: string;
}

function deriveAlerts(
  readings: Reading[], 
  maintenance: MaintenanceTask[], 
  deviceState: { filterHealthPct: number }
): Alert[] {
  const alerts: Alert[] = [];

  readings.forEach((r) => {
    const t = r.createdAt || r.timestamp || new Date().toISOString();
    if (r.ph !== null && r.ph < 6.5)
      alerts.push({ id: `ph-low-${t}`, type: 'sensor', severity: 'warning', icon: 'flask', title: 'Low pH Level', desc: `pH dropped to ${r.ph.toFixed(2)} — below safe range (6.5–8.5)`, time: t, color: '#7C3AED' });
    if (r.ph !== null && r.ph > 8.5)
      alerts.push({ id: `ph-high-${t}`, type: 'sensor', severity: 'warning', icon: 'flask', title: 'High pH Level', desc: `pH rose to ${r.ph.toFixed(2)} — above safe range (6.5–8.5)`, time: t, color: '#7C3AED' });
    if (r.turbidity !== null && r.turbidity > 100)
      alerts.push({ id: `turb-${t}`, type: 'sensor', severity: 'danger', icon: 'eye', title: 'High Turbidity', desc: `Turbidity at ${r.turbidity.toFixed(1)} NTU — exceeds 100 NTU limit`, time: t, color: '#0284C7' });
    if (r.tds !== null && r.tds > 500)
      alerts.push({ id: `tds-${t}`, type: 'sensor', severity: r.tds > 1000 ? 'danger' : 'warning', icon: 'beaker', title: r.tds > 1000 ? 'Critical TDS Level' : 'Elevated TDS', desc: `TDS at ${r.tds.toFixed(0)} ppm — safe limit is 500 ppm`, time: t, color: '#0891B2' });
  });

  maintenance.forEach((m) => {
    if (!m.acknowledged)
      alerts.push({ id: `maint-${m._id}`, type: 'maintenance', severity: 'warning', icon: 'construct', title: 'Maintenance Required', desc: `${m.type.replace(/_/g, ' ')} — ${m.notes}`, time: m.createdAt, color: '#D97706' });
  });

  if (deviceState.filterHealthPct <= 20)
    alerts.push({ id: 'filter-critical', type: 'maintenance', severity: 'danger', icon: 'leaf', title: 'Filter Replacement Needed', desc: `Bio-filter health at ${deviceState.filterHealthPct}% — replacement recommended immediately`, time: new Date().toISOString(), color: '#DC2626' });
  else if (deviceState.filterHealthPct <= 50)
    alerts.push({ id: 'filter-low', type: 'maintenance', severity: 'warning', icon: 'leaf', title: 'Filter Health Low', desc: `Bio-filter at ${deviceState.filterHealthPct}% — plan replacement soon`, time: new Date().toISOString(), color: '#D97706' });

  // Strict TS requires .getTime() for mathematical date subtraction
  return alerts.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

interface AlertCardProps {
  alert: Alert;
  C: ThemeColors;
}

function AlertCard({ alert, C }: AlertCardProps) {
  const timeStr = new Date(alert.time).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  
  const bgColor  = alert.severity === 'danger' ? C.danger + '12' : C.warning + '12';
  const bdColor  = alert.severity === 'danger' ? C.danger + '40' : C.warning + '40';
  const lblColor = alert.severity === 'danger' ? C.danger : C.warning;
  
  // Cast constructed string to the strict Ionicons definition map
  const iconName = `${alert.icon}-outline` as React.ComponentProps<typeof Ionicons>['name'];

  return (
    <View style={{
      backgroundColor: C.card, borderRadius: 14, padding: 16,
      marginBottom: 10, borderWidth: 1, borderColor: C.border,
      borderLeftWidth: 4, borderLeftColor: lblColor,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bgColor, borderWidth: 1, borderColor: bdColor, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
          <Ionicons name={iconName} size={18} color={lblColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, flex: 1 }}>{alert.title}</Text>
            <View style={{ backgroundColor: bgColor, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: bdColor, marginLeft: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: lblColor, textTransform: 'uppercase' }}>
                {alert.severity}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: C.muted, lineHeight: 19 }}>{alert.desc}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
            <Ionicons name="time-outline" size={12} color={C.muted} />
            <Text style={{ fontSize: 11, color: C.muted }}>{timeStr}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const { colors: C } = useTheme();
  const { deviceState, esp32Online } = useDevice();
  
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 86400000).toISOString(); // last 24h

      const [histRes, maintRes] = await Promise.all([
        sensorAPI.getHistory({ startDate, endDate, limit: 100 }),
        maintenanceAPI.getAll(),
      ]);

      const readings = histRes.data?.data || [];
      const maintenance = maintRes.data?.data || [];
      setAlerts(deriveAlerts(readings, maintenance, deviceState));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.warn('Alerts fetch error:', errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceState]);

  useEffect(() => { 
    fetchAlerts(); 
  }, [fetchAlerts]);

  const filtered = alerts.filter((a) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Sensors') return a.type === 'sensor';
    if (activeFilter === 'Maintenance') return a.type === 'maintenance';
    if (activeFilter === 'Cycle') return a.type === 'cycle';
    return true;
  });

  const dangerCount = alerts.filter((a) => a.severity === 'danger').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={() => fetchAlerts(true)} 
            tintColor={C.primary} 
          />
        }
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>System</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>Alerts</Text>
              {dangerCount > 0 && (
                <View style={{ backgroundColor: C.danger, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{dangerCount}</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => fetchAlerts()}
            style={{ width: 42, height: 42, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="refresh" size={20} color={C.primary} />
          </TouchableOpacity>
        </View>

        {/* ESP32 Status Banner */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: esp32Online ? C.primary + '12' : C.danger + '12',
          borderRadius: 12, padding: 14, marginBottom: 18,
          borderWidth: 1, borderColor: esp32Online ? C.primary + '30' : C.danger + '30',
        }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: esp32Online ? C.primary : C.danger }} />
          <Text style={{ color: esp32Online ? C.primary : C.danger, fontWeight: '700', fontSize: 13 }}>
            ESP32 {esp32Online ? 'Online — Device is connected and sending data' : 'Offline — No data received in the last 30 seconds'}
          </Text>
        </View>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {FILTERS.map((f) => {
              const count = f === 'All' ? alerts.length
                : alerts.filter((a) => a.type === f.toLowerCase()).length;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setActiveFilter(f)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: activeFilter === f ? C.primary : C.card,
                    borderWidth: 1, borderColor: activeFilter === f ? C.primary : C.border,
                  }}
                >
                  <Text style={{ color: activeFilter === f ? '#fff' : C.muted, fontSize: 13, fontWeight: '600' }}>{f}</Text>
                  {count > 0 && (
                    <View style={{ backgroundColor: activeFilter === f ? 'rgba(255,255,255,0.25)' : C.primary + '20', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ color: activeFilter === f ? '#fff' : C.primary, fontSize: 11, fontWeight: '700' }}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Alert List */}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 14 }}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={{ color: C.muted, fontSize: 13 }}>Checking for alerts...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 14 }}>
            <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: C.primary + '15', borderWidth: 1, borderColor: C.primary + '30', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-circle" size={36} color={C.primary} />
            </View>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>All Clear</Text>
            <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>
              No alerts for this filter.{'\n'}Pull down to refresh.
            </Text>
          </View>
        ) : (
          filtered.map((alert) => <AlertCard key={alert.id} alert={alert} C={C} />)
        )}

      </ScrollView>
    </SafeAreaView>
  );
}