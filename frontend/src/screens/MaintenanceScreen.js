import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { maintenanceAPI } from '../api/client';
import { useDevice } from '../context/DeviceContext';
import { useTheme } from '../context/ThemeContext';

const TYPE_ICONS = {
  filter_replacement: 'leaf',
  filter_cleaning: 'sparkles',
  system_inspection: 'search',
  repair: 'build',
  other: 'ellipsis-horizontal',
};

const TYPES = ['filter_replacement', 'filter_cleaning', 'system_inspection', 'repair', 'other'];

const RecordCard = ({ record, onAck, C }) => {
  const TYPE_COLORS = {
    filter_replacement: C.warning, filter_cleaning: C.primary,
    system_inspection: C.success, repair: C.danger, other: C.muted,
  };
  const color = TYPE_COLORS[record.type] || C.muted;
  const icon = TYPE_ICONS[record.type] || 'ellipsis-horizontal';
  const dateStr = new Date(record.createdAt).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <View style={{
      backgroundColor: C.card, borderRadius: 14, padding: 16,
      marginBottom: 10, borderWidth: 1, borderColor: C.border,
      borderLeftWidth: 4, borderLeftColor: color,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={15} color={color} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {record.type.replace(/_/g, ' ')}
          </Text>
        </View>
        {!record.acknowledged ? (
          <TouchableOpacity
            style={{ backgroundColor: C.primary + '20', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.primary + '40' }}
            onPress={() => onAck(record._id)}
          >
            <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>Acknowledge</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.success + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Ionicons name="checkmark-circle" size={13} color={C.success} />
            <Text style={{ color: C.success, fontSize: 11, fontWeight: '700' }}>Done</Text>
          </View>
        )}
      </View>
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 21 }}>{record.notes}</Text>
      <Text style={{ color: C.muted, fontSize: 11, marginTop: 10 }}>{dateStr}</Text>
    </View>
  );
};

export default function MaintenanceScreen() {
  const { deviceState } = useDevice();
  const { colors: C } = useTheme();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ type: 'filter_replacement', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const TYPE_COLORS = {
    filter_replacement: C.warning, filter_cleaning: C.primary,
    system_inspection: C.success, repair: C.danger, other: C.muted,
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await maintenanceAPI.getAll();
      setRecords(data.data || []);
    } catch (err) {
      console.warn('Maintenance fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleAck = async (id) => {
    try {
      await maintenanceAPI.acknowledge(id);
      setRecords((prev) => prev.map((r) => r._id === id ? { ...r, acknowledged: true } : r));
    } catch {
      Alert.alert('Error', 'Could not acknowledge record.');
    }
  };

  const handleSubmit = async () => {
    if (!form.notes.trim()) return Alert.alert('Validation', 'Please enter maintenance notes.');
    setSubmitting(true);
    try {
      const { data } = await maintenanceAPI.create(form);
      setRecords((prev) => [data.data, ...prev]);
      setModalVisible(false);
      setForm({ type: 'filter_replacement', notes: '' });
    } catch {
      Alert.alert('Error', 'Could not save maintenance record.');
    } finally {
      setSubmitting(false);
    }
  };

  const pending = records.filter((r) => !r.acknowledged);
  const completed = records.filter((r) => r.acknowledged);
  const filterBarColor = deviceState.filterHealthPct > 50 ? C.success : deviceState.filterHealthPct > 20 ? C.warning : C.danger;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>History</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, marginTop: 2 }}>Maintenance</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', gap: 6 }}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Log</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Health Banner */}
        <View style={{
          backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 20,
          borderWidth: 1, borderColor: deviceState.filterHealthPct <= 20 ? C.danger + '40' : C.border,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: filterBarColor + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="leaf" size={22} color={filterBarColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>Banana Peel Bio-Filter</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
                {deviceState.filterHealthPct}% remaining · {deviceState.filterCycleCount} cycles
              </Text>
            </View>
            {deviceState.filterHealthPct <= 20 && (
              <Ionicons name="warning" size={20} color={C.danger} />
            )}
          </View>
          <View style={{ height: 6, backgroundColor: C.border, borderRadius: 6, overflow: 'hidden', marginTop: 14 }}>
            <View style={{ height: '100%', width: `${deviceState.filterHealthPct}%`, backgroundColor: filterBarColor, borderRadius: 6 }} />
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Pending</Text>
                  <View style={{ backgroundColor: C.warning + '20', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: C.warning, fontSize: 11, fontWeight: '700' }}>{pending.length}</Text>
                  </View>
                </View>
                {pending.map((r) => <RecordCard key={r._id} record={r} onAck={handleAck} C={C} />)}
              </>
            )}

            {completed.length > 0 && (
              <>
                <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: pending.length > 0 ? 8 : 0 }}>
                  Completed
                </Text>
                {completed.map((r) => <RecordCard key={r._id} record={r} onAck={handleAck} C={C} />)}
              </>
            )}

            {records.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
                <View style={{ width: 70, height: 70, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="construct-outline" size={32} color={C.muted} />
                </View>
                <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>No maintenance records yet.</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>Tap "Log" to create one.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Add Record Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: C.modalOverlay, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Log Maintenance</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={18} color={C.muted} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderWidth: 1, borderColor: form.type === t ? TYPE_COLORS[t] : C.border,
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                    backgroundColor: form.type === t ? TYPE_COLORS[t] + '20' : C.inputBg,
                  }}
                  onPress={() => setForm((f) => ({ ...f, type: t }))}
                >
                  <Ionicons name={TYPE_ICONS[t]} size={14} color={form.type === t ? TYPE_COLORS[t] : C.muted} />
                  <Text style={{ color: form.type === t ? TYPE_COLORS[t] : C.muted, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>
                    {t.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Notes</Text>
            <TextInput
              style={{
                backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border,
                borderRadius: 14, padding: 14, color: C.text, fontSize: 14,
                minHeight: 100, marginBottom: 20, textAlignVertical: 'top',
              }}
              placeholder="Describe the maintenance performed..."
              placeholderTextColor={C.muted}
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity
              style={{ backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Save Record</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
