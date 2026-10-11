import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import dgram from 'react-native-udp';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import { StoredDevice } from '../types';

const BROADCAST_PORT = 8888;
const LISTEN_PORT = 12345;
const PACKET_INTERVAL_MS = 2000; // Safe 2-second interval
const TIMEOUT_SECONDS = 60;

function RadarRing({ delay, color }: { delay: number; color: string }) {
  const ring = useSharedValue(0);

  useEffect(() => {
    ring.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, [ring]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: interpolate(ring.value, [0, 1], [0.3, 2.4]) }],
      opacity: interpolate(ring.value, [0, 0.7, 1], [0.8, 0.3, 0]),
    };
  });

  return (
    <Animated.View
      style={[
        styles.ring,
        { borderColor: color, backgroundColor: color + '15' },
        animatedStyle,
      ]}
    />
  );
}

export default function WifiDiscoveryScreen({ navigation }: any) {
  const { colors: C } = useTheme();
  const { loginAsGuest } = useAuth();
  const { setConnectedDevice } = useDevice();

  const [elapsed, setElapsed] = useState<number>(0);
  const [showTimeoutModal, setShowTimeoutModal] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(true);

  const socketRef = useRef<any>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop socket and all active intervals
  const cleanup = () => {
    if (broadcastTimerRef.current) clearInterval(broadcastTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (socketRef.current) {
      try { socketRef.current.close(); } catch {}
      socketRef.current = null;
    }
  };

    const startDiscovery = () => {
        cleanup();
        setElapsed(0);
        setScanning(true);
        setShowTimeoutModal(false);

        const socket = dgram.createSocket({ type: 'udp4' });
        socketRef.current = socket;

        socket.bind(LISTEN_PORT, (err?: any) => {
            if (err) {
                console.warn('Socket bind error:', err);
                    return;
            }
  
            const sendPacket = () => {
                const payload = 'AQUAPEELTER_DISCOVER';
                socket.send(payload, 0, payload.length, BROADCAST_PORT, '255.255.255.255', (err: any) => {
                    if (err) console.warn('Broadcast send error:', err);
                });
            };

        sendPacket();
        broadcastTimerRef.current = setInterval(sendPacket, PACKET_INTERVAL_MS);
    });

    // Cast to any to bypass the missing type definition for event emitters
    (socket as any).on('message', async (msg: any, rinfo: any) => {
      const response = msg.toString();
      // ESP32 responds: "AQUAPEELTER_ACK:<device_unique_id>"
      if (response.startsWith('AQUAPEELTER_ACK')) {
        const parts = response.split(':');
        const deviceId = parts[1] || 'ESP32_FILTER';
        
        cleanup();
        setScanning(false);

        const newDevice: StoredDevice = {
          deviceId,
          ip: rinfo.address,
          name: 'Filtration Unit',
          lastConnected: new Date().toISOString(),
        };

        await loginAsGuest();
        await setConnectedDevice(newDevice);
        navigation.replace('Dashboard');
      }
    });

    // Elapsed timer and 60-second timeout
    elapsedTimerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= TIMEOUT_SECONDS) {
          cleanup();
          setScanning(false);
          setShowTimeoutModal(true);
          return TIMEOUT_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };

  useEffect(() => {
    startDiscovery();
    return cleanup;
  }, []);

  const formatElapsed = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {/* Top Header / Return Button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 }}>
        <TouchableOpacity
          onPress={() => {
            cleanup();
            navigation.goBack();
          }}
          style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          Device Discovery
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Radar Center Animation Area */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
          {scanning && (
            <>
              <RadarRing delay={0} color={C.primary} />
              <RadarRing delay={800} color={C.primary} />
              <RadarRing delay={1600} color={C.primary} />
            </>
          )}
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 16 }}>
            <Ionicons name="radio" size={32} color="#fff" />
          </View>
        </View>

        <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginTop: 40 }}>
          Searching Network
        </Text>
        <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 }}>
          Listening for responses from your ESP32 bio-filtration unit...
        </Text>

        {/* Elapsed Timer Counter */}
        <View style={{ marginTop: 24, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ color: C.primary, fontSize: 16, fontWeight: '700', letterSpacing: 1 }}>
            {formatElapsed(elapsed)} <Text style={{ color: C.muted, fontSize: 12 }}>/ 01:00</Text>
          </Text>
        </View>
      </View>

      {/* Return button at bottom */}
      <View style={{ padding: 24 }}>
        <TouchableOpacity
          onPress={() => {
            cleanup();
            navigation.goBack();
          }}
          style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ color: C.muted, fontSize: 15, fontWeight: '700' }}>Cancel Search</Text>
        </TouchableOpacity>
      </View>

      {/* Timeout Modal (Shown at 60s) */}
      <Modal visible={showTimeoutModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', backgroundColor: C.card, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.warning + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="time-outline" size={28} color={C.warning} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center' }}>
              Search Timed Out
            </Text>
            <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
              No ESP32 filtration unit answered within 1 minute. Verify that your phone and the ESP32 are connected to the same Wi-Fi access point.
            </Text>

            <View style={{ width: '100%', gap: 10, marginTop: 24 }}>
              <TouchableOpacity
                onPress={startDiscovery}
                style={{ backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Keep Searching</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowTimeoutModal(false);
                  navigation.goBack();
                }}
                style={{ backgroundColor: C.inputBg, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}
              >
                <Text style={{ color: C.muted, fontSize: 15, fontWeight: '700' }}>Return to Options</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
  },
});