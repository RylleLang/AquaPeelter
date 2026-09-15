import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../context/ThemeContext';
import { CycleSummary } from '../types';

interface CycleSummaryViewProps {
  summary: CycleSummary;
  C: ThemeColors;
  compact?: boolean;   // smaller rows for list cards
}

interface Row {
  key: 'ph' | 'turbidity' | 'tds';
  label: string;
  unit: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  pre?: number | null;
  post?: number | null;
  change?: number | null;   // % (positive = reduced / improved)
  decimals: number;
  isReduction: boolean;     // turbidity/TDS: lower is better; pH: change only
}

const fmt = (v: number | null | undefined, d: number) =>
  v === null || v === undefined || Number.isNaN(v) ? '--' : v.toFixed(d);

/**
 * Renders pre-filter → post-filter averages for pH, turbidity and TDS with the
 * percentage reduction the backend computed. Works for a completed cycle's
 * `summary` and for the /compare endpoint mapped to the same shape.
 */
export default function CycleSummaryView({ summary, C, compact = false }: CycleSummaryViewProps) {
  const pre = summary.preFilter ?? {};
  const post = summary.postFilter ?? {};

  const rows: Row[] = [
    { key: 'turbidity', label: 'Turbidity', unit: 'NTU', icon: 'eye', color: C.turbidity, pre: pre.avgTurbidity, post: post.avgTurbidity, change: summary.turbidityReduction, decimals: 1, isReduction: true },
    { key: 'tds', label: 'TDS', unit: 'ppm', icon: 'beaker', color: C.tds, pre: pre.avgTds, post: post.avgTds, change: summary.tdsReduction, decimals: 0, isReduction: true },
    { key: 'ph', label: 'pH', unit: '', icon: 'flask', color: C.ph, pre: pre.avgPh, post: post.avgPh, change: summary.phImprovement, decimals: 2, isReduction: false },
  ];

  const hasData = rows.some((r) => r.pre != null || r.post != null);
  if (!hasData) {
    return (
      <Text style={{ color: C.muted, fontSize: 12, fontStyle: 'italic' }}>
        No pre/post readings were recorded for this cycle.
      </Text>
    );
  }

  const size = compact ? 12 : 14;

  return (
    <View style={{ gap: compact ? 8 : 12 }}>
      {rows.map((r) => {
        const change = r.change ?? null;
        // Turbidity/TDS: positive % = reduced (good). pH: show signed change, neutral colour.
        const good = r.isReduction ? change !== null && change > 0 : null;
        const badgeColor = good === null ? C.muted : good ? C.success : C.danger;
        const changeText =
          change === null
            ? '--'
            : r.isReduction
              ? `${change > 0 ? '−' : '+'}${Math.abs(change).toFixed(1)}%`
              : `${change > 0 ? '−' : '+'}${Math.abs(change).toFixed(1)}%`;

        return (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: compact ? 26 : 32, height: compact ? 26 : 32, borderRadius: 8, backgroundColor: r.color + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={r.icon} size={compact ? 13 : 16} color={r.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: size, fontWeight: '700', color: C.text }}>{r.label}</Text>
              <Text style={{ fontSize: compact ? 11 : 12, color: C.muted, marginTop: 1 }}>
                {fmt(r.pre, r.decimals)} → {fmt(r.post, r.decimals)} {r.unit}
              </Text>
            </View>
            <View style={{ backgroundColor: badgeColor + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, minWidth: 64, alignItems: 'center' }}>
              <Text style={{ fontSize: compact ? 11 : 12, fontWeight: '800', color: badgeColor }}>{changeText}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
