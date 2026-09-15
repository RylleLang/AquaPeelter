import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { deviceAPI } from '../api/client';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import CycleSummaryView from '../components/CycleSummaryView';
import { CyclesResponse, FiltrationCycle } from '../types';

const PAGE_SIZE = 20;

const formatDuration = (secs?: number | null): string => {
  if (secs === null || secs === undefined) return '--';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

interface CycleCardProps {
  cycle: FiltrationCycle;
  C: ThemeColors;
}

function CycleCard({ cycle, C }: CycleCardProps) {
  const STATUS: Record<FiltrationCycle['status'], { label: string; color: string }> = {
    running:   { label: 'RUNNING',   color: C.success },
    paused:    { label: 'PAUSED',    color: C.warning },
    completed: { label: 'COMPLETED', color: C.primary },
    aborted:   { label: 'ABORTED',   color: C.danger },
  };
  const status = STATUS[cycle.status];
  const showSummary = cycle.status === 'completed' && cycle.summary;

  return (
    <View style={{
      backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: status.color,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: status.color + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: status.color }}>#{cycle.cycleNumber}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{formatDate(cycle.startedAt)}</Text>
            <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Duration {formatDuration(cycle.durationSeconds)}
            </Text>
          </View>
        </View>
        <View style={{ backgroundColor: status.color + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: status.color }}>{status.label}</Text>
        </View>
      </View>

      {showSummary ? (
        <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
          <CycleSummaryView summary={cycle.summary!} C={C} compact />
        </View>
      ) : cycle.status === 'aborted' ? (
        <Text style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Cycle was stopped before completion.</Text>
      ) : null}
    </View>
  );
}

export default function CyclesScreen() {
  const { colors: C } = useTheme();

  const [cycles, setCycles] = useState<FiltrationCycle[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (skip: number) => {
    const res = await deviceAPI.getCycles({ limit: PAGE_SIZE, skip });
    const body = res.data as CyclesResponse;
    return body;
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const body = await load(0);
      setCycles(body.data);
      setTotal(body.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load cycles');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || cycles.length >= total) return;
    setLoadingMore(true);
    try {
      const body = await load(cycles.length);
      setCycles((prev) => [...prev, ...body.data]);
      setTotal(body.total);
    } catch {
      // keep what we have; user can pull to refresh
    } finally {
      setLoadingMore(false);
    }
  }, [load, loadingMore, cycles.length, total]);

  useEffect(() => { refresh(); }, [refresh]);

  const completed = cycles.filter((c) => c.status === 'completed' && c.summary);
  const avgReduction = (key: 'turbidityReduction' | 'tdsReduction') => {
    const vals = completed.map((c) => c.summary?.[key]).filter((v): v is number => typeof v === 'number');
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '--';
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <FlatList
        data={cycles}
        keyExtractor={(c) => c._id}
        renderItem={({ item }) => <CycleCard cycle={item} C={C} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refresh(); }} tintColor={C.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>History</Text>
                <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, marginTop: 2 }}>Filtration Cycles</Text>
              </View>
              <TouchableOpacity
                onPress={() => { setRefreshing(true); refresh(); }}
                style={{ width: 42, height: 42, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="refresh" size={20} color={C.primary} />
              </TouchableOpacity>
            </View>

            {/* Overall performance across loaded completed cycles */}
            {completed.length > 0 && (
              <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Average removal · {completed.length} completed cycle{completed.length === 1 ? '' : 's'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: C.turbidity + '18', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.turbidity + '35' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: C.turbidity }}>{avgReduction('turbidityReduction')}%</Text>
                    <Text style={{ fontSize: 11, color: C.turbidity, fontWeight: '600', marginTop: 2 }}>Turbidity</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: C.tds + '18', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.tds + '35' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: C.tds }}>{avgReduction('tdsReduction')}%</Text>
                    <Text style={{ fontSize: 11, color: C.tds, fontWeight: '600', marginTop: 2 }}>TDS</Text>
                  </View>
                </View>
              </View>
            )}

            {total > 0 && (
              <Text style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                Showing {cycles.length} of {total}
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ alignItems: 'center', paddingVertical: 80, gap: 14 }}>
              <ActivityIndicator color={C.primary} size="large" />
              <Text style={{ color: C.muted, fontSize: 13 }}>Loading cycles...</Text>
            </View>
          ) : error ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
              <Ionicons name="cloud-offline-outline" size={32} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>{error}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>Pull down to retry.</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
              <View style={{ width: 70, height: 70, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="repeat-outline" size={32} color={C.muted} />
              </View>
              <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>No filtration cycles yet.</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>Start one from the Dashboard.</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} /> : null
        }
      />
    </SafeAreaView>
  );
}
