import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { sensorAPI } from '../api/client';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import LineChart from '../components/LineChart';

type Range = '1h' | '6h' | '24h' | '7d';
type SensorField = 'ph' | 'turbidity' | 'tds';

const RANGES: Range[] = ['1h', '6h', '24h', '7d'];

interface Reading {
  ph?: number;
  turbidity?: number;
  tds?: number;
  createdAt?: string;
  timestamp?: string;
}

interface Stats {
  avgPh?: number;
  avgTurbidity?: number;
  avgTds?: number;
}

interface StatBadgeProps {
  label: string;
  value?: string | number | null;
  unit?: string;
  color: string;
  C: ThemeColors;
}

function StatBadge({ label, value, unit, color, C }: StatBadgeProps) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View style={{ backgroundColor: color + '18', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: color + '35' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color }}>
          {value ?? '--'}
        </Text>
        <Text style={{ fontSize: 11, color, fontWeight: '600', marginTop: 2 }}>{unit || 'pH'}</Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 11, marginTop: 8, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { colors: C } = useTheme();
  
  const [range, setRange] = useState<Range>('24h');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const rangeToMs: Record<Range, number> = { 
    '1h': 3600000, 
    '6h': 21600000, 
    '24h': 86400000, 
    '7d': 604800000 
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - (rangeToMs[range] || 86400000)).toISOString();

      const [histRes, statRes] = await Promise.all([
        sensorAPI.getHistory({ startDate, endDate, limit: 50 }),
        sensorAPI.getStats({ startDate, endDate }),
      ]);
      
      setReadings(histRes.data?.data || []);
      setStats(statRes.data?.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.warn('Analytics fetch error:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { 
    fetchData(); 
  }, [fetchData]);

  const toChartData = (field: SensorField) =>
    [...readings].reverse().map((r) => ({ 
      value: r[field] ?? 0, 
      timestamp: r.createdAt || r.timestamp || '' 
    }));

  const card = {
    backgroundColor: C.card, borderRadius: 18, padding: 18,
    marginBottom: 14, borderWidth: 1, borderColor: C.border,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Monitoring</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, marginTop: 2 }}>Water Analytics</Text>
          </View>
          <TouchableOpacity
            onPress={fetchData}
            style={{ width: 42, height: 42, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="refresh" size={20} color={C.primary} />
          </TouchableOpacity>
        </View>

        {/* Range Selector */}
        <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 4, marginBottom: 18, borderWidth: 1, borderColor: C.border }}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10,
                backgroundColor: range === r ? C.primary : 'transparent',
                alignItems: 'center',
              }}
              onPress={() => setRange(r)}
            >
              <Text style={{ color: range === r ? '#fff' : C.muted, fontSize: 13, fontWeight: '700' }}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 80, gap: 14 }}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={{ color: C.muted, fontSize: 13 }}>Loading sensor data...</Text>
          </View>
        ) : (
          <>
            {/* Stats Summary */}
            {stats && (
              <View style={card}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                  Summary · {range}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <StatBadge label="Avg pH" value={stats.avgPh?.toFixed(2)} unit="pH" color={C.ph} C={C} />
                  <StatBadge label="Turbidity" value={stats.avgTurbidity?.toFixed(1)} unit="NTU" color={C.turbidity} C={C} />
                  <StatBadge label="TDS" value={stats.avgTds?.toFixed(0)} unit="ppm" color={C.tds} C={C} />
                </View>
              </View>
            )}

            {/* pH Chart */}
            <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.ph + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flask" size={16} color={C.ph} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>pH Level</Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Safe range: 6.5 – 8.5</Text>
                </View>
                <View style={{ backgroundColor: C.ph + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: C.ph, fontSize: 11, fontWeight: '700' }}>pH</Text>
                </View>
              </View>
              <LineChart data={toChartData('ph')} color={C.ph} unit="" height={130} />
            </View>

            {/* Turbidity Chart */}
            <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.turbidity + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="eye" size={16} color={C.turbidity} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Turbidity</Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Safe range: ≤ 50 NTU</Text>
                </View>
                <View style={{ backgroundColor: C.turbidity + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: C.turbidity, fontSize: 11, fontWeight: '700' }}>NTU</Text>
                </View>
              </View>
              <LineChart data={toChartData('turbidity')} color={C.turbidity} unit="NTU" height={130} />
            </View>

            {/* TDS Chart */}
            <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.tds + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="beaker" size={16} color={C.tds} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Total Dissolved Solids</Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Safe range: ≤ 500 ppm</Text>
                </View>
                <View style={{ backgroundColor: C.tds + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: C.tds, fontSize: 11, fontWeight: '700' }}>ppm</Text>
                </View>
              </View>
              <LineChart data={toChartData('tds')} color={C.tds} unit="ppm" height={130} />
            </View>

            {!readings.length && (
              <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
                <View style={{ width: 70, height: 70, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="stats-chart-outline" size={32} color={C.muted} />
                </View>
                <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>No sensor data for this range.</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>Try a different time range.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}