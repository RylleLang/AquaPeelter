import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { isNetworkError } from '../api/client';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const { colors: C, isDark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPass, setShowPass] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const set = (key: keyof typeof form) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    setError('');

    if (!form.email || !form.password) {
      return setError('Email and password are required.');
    }
    if (mode === 'register' && !form.name) {
      return setError('Full name is required.');
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        await register(form.name, form.email.trim().toLowerCase(), form.password);
      } else {
        await login(form.email.trim().toLowerCase(), form.password);
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        setError('Cannot reach the server. It may be waking up — please try again in a moment.');
      } else if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Authentication failed. Check credentials.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 15,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme toggle */}
        <TouchableOpacity
          onPress={toggleTheme}
          style={{ position: 'absolute', top: 52, right: 24, padding: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={C.muted} />
        </TouchableOpacity>

        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{ width: 90, height: 90, borderRadius: 28, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Ionicons name="water" size={48} color={C.primary} />
          </View>
          <Text style={{ fontSize: 34, fontWeight: '800', color: C.text, letterSpacing: -0.5 }}>AquaPeelter</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary }} />
            <Text style={{ fontSize: 13, color: C.muted }}>Laundry Wastewater Filtration System</Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary }} />
          </View>
        </View>

        {/* Card */}
        <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: C.border }}>

          {/* Tab switcher */}
          <View style={{ flexDirection: 'row', backgroundColor: C.inputBg, borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {(['login', 'register'] as Mode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: mode === m ? C.primary : 'transparent' }}
                onPress={() => { setMode(m); setError(''); }}
              >
                <Text style={{ color: mode === m ? '#fff' : C.muted, fontWeight: '700', fontSize: 14 }}>
                  {m === 'login' ? 'Sign In' : 'Register'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.alertBg, padding: 12, borderRadius: 10, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: C.danger + '40' }}>
              <Ionicons name="alert-circle" size={16} color={C.danger} />
              <Text style={{ color: C.danger, fontSize: 13, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          {mode === 'register' && (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Full Name</Text>
              <TextInput
                style={inputStyle}
                placeholder="Juan Dela Cruz"
                placeholderTextColor={C.muted}
                value={form.name}
                onChangeText={set('name')}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</Text>
            <TextInput
              style={inputStyle}
              placeholder="you@email.com"
              placeholderTextColor={C.muted}
              value={form.email}
              onChangeText={set('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Password</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="Min. 8 characters"
                placeholderTextColor={C.muted}
                value={form.password}
                onChangeText={set('password')}
                secureTextEntry={!showPass}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPass((v) => !v)}
                style={{ padding: 14, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 12 }}
              >
                <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={C.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={{ color: C.muted, textAlign: 'center', fontSize: 11, marginTop: 28 }}>
          Powered by ESP32 · ISO/IEC 25010
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}