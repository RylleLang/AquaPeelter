import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

const C = { muted: '#718096', border: '#1A3050', bg: '#0A1628' };

export interface DataPoint {
  value: number;
  timestamp?: string;
}

interface LineChartProps {
  data?: DataPoint[];
  color?: string;
  unit?: string;
  height?: number;
  label?: string;
}

export default function LineChart({ 
  data = [], 
  color = '#00D4FF', 
  unit = '', 
  height = 120, 
  label = '' 
}: LineChartProps) {
  if (!data.length) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.empty}>No data</Text>
      </View>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 300;
  const H = height - 24;
  const step = W / (values.length - 1 || 1);

  // Build SVG-free polyline using absolutely positioned views
  const points = values.map((v, i) => ({
    x: i * step,
    y: H - ((v - min) / range) * H,
    value: v,
  }));

  return (
    <View style={[styles.container, { height: height + 24 }]}>
      {/* Y-axis labels */}
      <View style={styles.yAxis}>
        <Text style={styles.yLabel}>{max.toFixed(1)}</Text>
        <Text style={styles.yLabel}>{((max + min) / 2).toFixed(1)}</Text>
        <Text style={styles.yLabel}>{min.toFixed(1)}</Text>
      </View>

      {/* Chart area */}
      <View style={[styles.chartArea, { height }]}>
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((t) => (
          <View key={t} style={[styles.gridLine, { top: t * H }]} />
        ))}

        {/* Line segments between points */}
        {points.slice(0, -1).map((p, i) => {
          const next = points[i + 1];
          const dx = next.x - p.x;
          const dy = next.y - p.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                width: length,
                height: 2,
                backgroundColor: color,
                opacity: 0.85,
                // Cast required as older @types/react-native definitions 
                // sometimes lag behind native transformOrigin support
                transformOrigin: 'left center' as any,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}

        {/* Dots */}
        {points.map((p, i) => (
          <View
            key={i}
            style={[styles.dot, { left: p.x - 4, top: p.y - 4, backgroundColor: color }]}
          />
        ))}
      </View>

      {/* Latest value badge */}
      <View style={[styles.badge, { borderColor: color }]}>
        <Text style={[styles.badgeText, { color }]}>
          {values[values.length - 1]?.toFixed(2)} {unit}
        </Text>
        <Text style={styles.badgeLabel}>Latest</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  yAxis: { width: 38, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, height: '100%' },
  yLabel: { fontSize: 9, color: C.muted },
  chartArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: C.border, opacity: 0.5 },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  empty: { color: C.muted, fontSize: 13, textAlign: 'center', flex: 1 },
  badge: { position: 'absolute', top: 0, right: 0, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.bg, alignItems: 'center' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  badgeLabel: { fontSize: 9, color: C.muted },
});