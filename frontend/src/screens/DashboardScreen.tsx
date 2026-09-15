import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDevice } from '../context/DeviceContext';
import { useAuth } from '../context/AuthContext';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { notify } from '../utils/notifications';
import { configAPI } from '../api/client';

// Define the shape of the WiFi network objects
interface Network {
    ssid: string;
    rssi?: number;
    open?: boolean;
}

interface SensorCardProps {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: number | null;
    unit: string;
    color: string;
    status?: string;
    C: ThemeColors;
}

const formatTime = (secs: number): string => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
};

function SensorCard({ icon, label, value, unit, color, status, C }: SensorCardProps) {
    return (
        <View style={{
            flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 16,
            alignItems: 'center', borderWidth: 1, borderColor: C.border,
        }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Ionicons name={icon} size={20} color={color} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color }}>
                {value !== null ? value : '--'}
            </Text>
            <Text style={{ fontSize: 10, color, fontWeight: '600', marginTop: 1 }}>{unit}</Text>
            <Text style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{label}</Text>
            {status ? (
                <View style={{ marginTop: 8, backgroundColor: color + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, color, fontWeight: '700' }}>{status}</Text>
                </View>
            ) : null}
        </View>
    )
}

// Signal strength icon based on RSSI
const signalIcon = (rssi?: number): React.ComponentProps<typeof Ionicons>['name'] => {
    if (rssi === undefined) return 'wifi-outline';
    if (rssi >= -50) return 'cellular';
    if (rssi >= -70) return 'wifi';
    return 'wifi-outline';
};

export default function DashboardScreen() {
    const { deviceState, sensorData, esp32Online, loading, startCycle, pauseCycle } = useDevice();
    const { user, logout } = useAuth();
    const { colors: C, isDark, toggleTheme } = useTheme();

    const { cycleRunning, cycleProgress, elapsedSeconds, filterHealthPct, filterCycleCount } = deviceState;
    const { ph, turbidity, tds } = sensorData;

    // WiFi modal state
    const [wifiModal, setWifiModal]       = useState<boolean>(false);
    const [scanning, setScanning]         = useState<boolean>(false);
    const [networks, setNetworks]         = useState<Network[]>([]);
    const [selectedNet, setSelectedNet]   = useState<Network | null>(null);
    const [password, setPassword]         = useState<string>('');
    const [showPass, setShowPass]         = useState<boolean>(false);
    const [wifiLoading, setWifiLoading]   = useState<boolean>(false);
    
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (ph !== null && (ph < 6.5 || ph > 8.5)) notify.phAlert(ph);
        if (turbidity !== null && turbidity > 100) notify.highTurbidity(turbidity);
    }, [ph, turbidity]);

    // Clean up polling when modal closes
    useEffect(() => {
        if (!wifiModal) {
            if (pollRef.current) clearInterval(pollRef.current);
            setNetworks([]);
            setSelectedNet(null);
            setPassword('');
            setScanning(false);
        }
    }, [wifiModal]);

    const handleScan = async () => {
        setScanning(true);
        setNetworks([]);
        setSelectedNet(null);
        try {
            await configAPI.requestWifiScan();
            // Poll every 3s for results (ESP32 scans and uploads within ~10s)
            pollRef.current = setInterval(async () => {
                const res = await configAPI.getWifiScanResults();
                if (res.data?.ready && res.data.networks?.length > 0) {
                if (pollRef.current) clearInterval(pollRef.current);
                setNetworks(res.data.networks);
                setScanning(false);
                }
            }, 3000);

            // Stop polling after 30s if no result
            setTimeout(() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setScanning(false);
            }, 30000);

        } catch {
            setScanning(false);
            Alert.alert('Error', 'Could not request scan. Make sure ESP32 is online.');
        }
    };

    const handleConnect = async () => {
        if (!selectedNet) return Alert.alert('Select a network first.');
        setWifiLoading(true);
        try {
            await configAPI.updateWifi(selectedNet.ssid, password);
            Alert.alert('Success', `WiFi credentials sent!\nESP32 will reconnect to "${selectedNet.ssid}" shortly.`);
            setWifiModal(false);
        } catch {
            Alert.alert('Error', 'Failed to update WiFi. Try again.');
        } finally {
            setWifiLoading(false);
        }
    };

    const phStatus    = ph === null ? '' : ph >= 6.5 && ph <= 8.5 ? 'Normal' : 'Alert';
    const phColor     = ph === null ? C.muted : ph >= 6.5 && ph <= 8.5 ? C.success : C.danger;
    const tdsColor    = tds === null ? C.muted : tds <= 500 ? C.success : tds <= 1000 ? C.warning : C.danger;
    const turbColor   = turbidity === null ? C.muted : turbidity <= 50 ? C.success : turbidity <= 100 ? C.warning : C.danger;
    const filterBarColor = filterHealthPct > 50 ? C.success : filterHealthPct > 20 ? C.warning : C.danger;

    const card = {
        backgroundColor: C.card, borderRadius: 18, padding: 18,
        marginBottom: 14, borderWidth: 1, borderColor: C.border,
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

                {/* ── Header ── */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <View>
                        <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500' }}>Welcome back,</Text>
                        <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, marginTop: 2 }}>
                            {user?.name?.split(' ')[0] || 'User'}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        {/* ESP32 Online Indicator */}
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            backgroundColor: esp32Online ? C.success + '20' : C.danger + '20',
                            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                            borderWidth: 1, borderColor: esp32Online ? C.success + '40' : C.danger + '40',
                        }}>
                            <View style={{
                                width: 8, height: 8, borderRadius: 4,
                                backgroundColor: esp32Online ? C.success : C.danger,
                            }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: esp32Online ? C.success : C.danger }}>
                                {esp32Online ? 'Online' : 'Offline'}
                            </Text>
                        </View>

                        <TouchableOpacity onPress={() => setWifiModal(true)} style={{
                            width: 42, height: 42, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Ionicons name="wifi" size={20} color={C.primary} />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={toggleTheme} style={{
                            width: 42, height: 42, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={C.muted} />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={logout} style={{
                            width: 42, height: 42, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Ionicons name="log-out-outline" size={20} color={C.muted} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Cycle Control ── */}
                <View style={card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>Filtration Cycle</Text>
                        <View style={{ backgroundColor: cycleRunning ? C.success + '20' : C.border + '40', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: cycleRunning ? C.success : C.muted }}>
                                {cycleRunning ? 'RUNNING' : 'IDLE'}
                            </Text>
                        </View>
                    </View>

                    <Text style={{ fontSize: 52, fontWeight: '800', color: C.primary, textAlign: 'center', letterSpacing: 2 }}>
                        {formatTime(elapsedSeconds)}
                    </Text>

                    <View style={{ marginTop: 16, marginBottom: 8 }}>
                        <View style={{ height: 8, backgroundColor: C.border, borderRadius: 8, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${cycleProgress}%`, backgroundColor: C.primary, borderRadius: 8 }} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                        <Text style={{ color: C.muted, fontSize: 12 }}>Progress</Text>
                        <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>{cycleProgress.toFixed(0)}%</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={{
                            flexDirection: 'row', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8
                        }} onPress={cycleRunning ? pauseCycle : startCycle} disabled={loading}>
                        <Ionicons name={cycleRunning ? 'pause-circle' : 'play-circle'} size={22} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                            {cycleRunning ? 'Pause Cycle' : 'Start Cycle'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ── Sensor Readings ── */}
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    Live Sensor Data
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <SensorCard icon="flask" label="pH Level" value={ph} unit="pH" color={phColor} status={phStatus} C={C} />
                    <SensorCard icon="eye" label="Turbidity" value={turbidity} unit="NTU" color={turbColor} C={C} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                    <SensorCard icon="beaker" label="TDS" value={tds} unit="ppm" color={tdsColor} C={C} />
                    <SensorCard icon="water" label="Water Level" value={null} unit="%" color={C.waterLevel || C.muted} status="Sensor pending" C={C} />
                </View>

                {/* ── Filter Health ── */}
                <View style={card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: filterBarColor + '20', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="leaf" size={18} color={filterBarColor} />
                            </View>
                            <View>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Bio-Filter Health</Text>
                                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Banana Peel Adsorbent</Text>
                            </View>
                        </View>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: filterBarColor }}>{filterHealthPct}%</Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: C.border, borderRadius: 8, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${filterHealthPct}%`, backgroundColor: filterBarColor, borderRadius: 8 }} />
                    </View>
                    <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{filterCycleCount} cycles used</Text>
                    {filterHealthPct <= 20 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.alertBg, padding: 12, borderRadius: 12, marginTop: 12, gap: 8, borderWidth: 1, borderColor: C.danger + '40' }}>
                        <Ionicons name="warning" size={16} color={C.warning} />
                        <Text style={{ color: C.warning, fontSize: 13, flex: 1, fontWeight: '500' }}>
                            Filter replacement recommended soon.
                        </Text>
                        </View>
                    )}
                </View>

            </ScrollView>

            {/* ── WiFi Modal (Android-style network list) ── */}
            <Modal visible={wifiModal} animationType="slide" transparent onRequestClose={() => setWifiModal(false)}>
                <View style={{ flex: 1, backgroundColor: C.modalOverlay, justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.border, maxHeight: '85%' }}>

                        {/* Modal Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 12 }}>
                            <View>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>ESP32 WiFi</Text>
                                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Select a network to connect</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setWifiModal(false)}
                                style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Ionicons name="close" size={18} color={C.muted} />
                            </TouchableOpacity>
                        </View>

                        {/* Scan Button */}
                        <View style={{ paddingHorizontal: 24, marginBottom: 8 }}>
                            <TouchableOpacity
                                onPress={handleScan}
                                disabled={scanning}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.inputBg, borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: C.border }}
                            >
                                {scanning
                                    ? <ActivityIndicator size="small" color={C.primary} />
                                    : <Ionicons name="search" size={16} color={C.primary} />
                                }
                                <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>
                                    {scanning ? 'Scanning...' : 'Scan for Networks'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Network List */}
                        {networks.length > 0 && (
                            <FlatList
                                data={networks}
                                keyExtractor={(item, i) => item.ssid + i.toString()}
                                style={{ maxHeight: 260, paddingHorizontal: 24 }}
                                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.border }} />}
                                renderItem={({ item }) => {
                                    const isSelected = selectedNet?.ssid === item.ssid;
                                    return (
                                        <TouchableOpacity
                                        onPress={() => { setSelectedNet(item); setPassword(''); }}
                                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 }}
                                        >
                                        <Ionicons name={signalIcon(item.rssi)} size={20} color={isSelected ? C.primary : C.muted} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: isSelected ? C.primary : C.text, fontWeight: isSelected ? '700' : '500', fontSize: 15 }}>
                                            {item.ssid}
                                            </Text>
                                            <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                                            {item.open ? 'Open' : 'Secured'} · {item.rssi} dBm
                                            </Text>
                                        </View>
                                        {item.open
                                            ? <Ionicons name="lock-open-outline" size={16} color={C.muted} />
                                            : <Ionicons name="lock-closed-outline" size={16} color={C.muted} />}
                                        {isSelected && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        )}

                        {/* Password + Connect (shown when network is selected and secured) */}
                        {selectedNet && !selectedNet.open && (
                            <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
                                <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    Password for "{selectedNet.ssid}"
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, marginBottom: 14 }}>
                                    <TextInput
                                        style={{ flex: 1, paddingVertical: 14, color: C.text, fontSize: 15 }}
                                        placeholder="Enter password"
                                        placeholderTextColor={C.muted}
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPass}
                                        autoCapitalize="none"
                                    />
                                    <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                                        <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Manual SSID fallback */}
                        {networks.length === 0 && !scanning && (
                            <View style={{ paddingHorizontal: 24, marginTop: 4 }}>
                                <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
                                    Or enter WiFi name manually
                                </Text>
                                <TextInput
                                    placeholder="WiFi Name (SSID)"
                                    placeholderTextColor={C.muted}
                                    onChangeText={(v) => setSelectedNet({ ssid: v, open: false })}
                                    autoCapitalize="none" 
                                    style={{
                                        backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border,
                                        borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                                        color: C.text, fontSize: 15, marginBottom: 10
                                    }}
                                />
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, marginBottom: 14 }}>
                                    <TextInput
                                        style={{ flex: 1, paddingVertical: 14, color: C.text, fontSize: 15 }}
                                        placeholder="Password"
                                        placeholderTextColor={C.muted}
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPass}
                                        autoCapitalize="none"
                                    />
                                    <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                                        <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Connect Button */}
                        {selectedNet?.ssid && (
                            <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
                                <TouchableOpacity onPress={handleConnect} disabled={wifiLoading} style={{
                                    backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center'
                                }}>
                                    {wifiLoading ? 
                                        <ActivityIndicator color="#fff" />
                                        :
                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                                            Connect to "{selectedNet.ssid}"
                                        </Text>
                                    }
                                </TouchableOpacity>
                            </View>
                        )}

                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}