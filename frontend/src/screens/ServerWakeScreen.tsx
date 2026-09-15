import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const AUTO_RETRY_MS = 15000;

/**
 * Shown when the backend cannot be reached at launch. The hosted API (Render free
 * tier) sleeps after idle and needs 30–60 s to wake, so we keep retrying instead of
 * dropping the user to the login screen with a misleading error.
 */
export default function ServerWakeScreen() {
  const { serverStatus, retryConnection } = useAuth();
  const { colors: C } = useTheme();
  const [attempt, setAttempt] = useState<number>(1);
  const [seconds, setSeconds] = useState<number>(0);
  const busy = serverStatus === 'checking';
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const retry = async () => {
    if (busy) return;
    setAttempt((a) => a + 1);
    await retryConnection();
  };

  // Elapsed counter + automatic retry while unreachable
  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    const auto = setInterval(retry, AUTO_RETRY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(auto);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          {busy ? (
            <ActivityIndicator size="large" color={C.primary} />
          ) : (
            <Ionicons name="cloud-offline-outline" size={38} color={C.muted} />
          )}
        </View>

        <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' }}>
          {busy ? 'Connecting to server…' : 'Server not reachable'}
        </Text>
        <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 10, lineHeight: 21 }}>
          The AquaPeelter server sleeps when idle and can take up to a minute to wake up.
          We'll keep trying automatically.
        </Text>

        <View style={{ flexDirection: 'row', gap: 16, marginTop: 22 }}>
          <Text style={{ fontSize: 12, color: C.muted }}>Attempt {attempt}</Text>
          <Text style={{ fontSize: 12, color: C.muted }}>{seconds}s elapsed</Text>
        </View>

        <TouchableOpacity
          onPress={retry}
          disabled={busy}
          style={{
            marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: busy ? C.border : C.primary, borderRadius: 14,
            paddingVertical: 14, paddingHorizontal: 28,
          }}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
            {busy ? 'Checking…' : 'Retry now'}
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 28 }}>
          Still failing after a few minutes? Check your internet connection.
        </Text>
      </View>
    </SafeAreaView>
  );
}
