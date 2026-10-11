import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Modal, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { isNetworkError } from '../api/client';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// For page views
import PagerView from 'react-native-pager-view'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { StoredDevice } from '../types';
import { useDevice } from '../context/DeviceContext';
import { storage } from '../utils/storage';
import { RootStackParamList } from '../navigation/AppNavigator';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

type LoginScreenProps = {
  navigation: LoginScreenNavigationProp;
};

type Mode = 'login' | 'register';

export default function LoginScreen({ navigation }: LoginScreenProps) {
  // Initialize ref for Onboarding/Login Pages handler
  const pagerRef = useRef<PagerView>(null);
  const [ currentPage, setCurrentPage ] = useState(0); // Hold current page index in PagerView

  const { login, register, loginAsGuest } = useAuth();
  const { colors: C, isDark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPass, setShowPass] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Handle guest mode pages
  const [pastDevice, setPastDevice] = useState<StoredDevice | null>(null);
  const [showReconnectModal, setShowReconnectModal] = useState<boolean>(false);
  const [showMethodModal, setShowMethodModal] = useState<boolean>(false);
  const { setConnectedDevice } = useDevice();

  const handleGuestPress = async () => {
    const saved = await storage.getItem('last_esp32_device');
    if (saved) {
      try {
        const parsed: StoredDevice = JSON.parse(saved);
        setPastDevice(parsed);
        setShowReconnectModal(true);
        return;
      } catch {
        // JSON parse error -> proceed to fresh discovery
      }
    }
    setShowMethodModal(true);
  };

  const handleReconnect = async () => {
    if (!pastDevice) return;
    setLoading(true);
    try {
      // Quick 2s health check ping to verify device is still at this IP
      await axios.get(`http://${pastDevice.ip}/api/state`, { timeout: 2000 });
      await setConnectedDevice(pastDevice);
      await loginAsGuest();
      setShowReconnectModal(false);
    } catch {
      Alert.alert(
        'Device Unreachable',
        `Could not reach ${pastDevice.name || 'Filtration Unit'} at ${pastDevice.ip}. Please scan again.`,
        [{ text: 'Find New Device', onPress: () => { setShowReconnectModal(false); setShowMethodModal(true); } }]
      );
    } finally {
      setLoading(false);
    }
  };

  /** Change pages on the Onboarding/Login Screen using index (number) */
  const goToPage = (index: number) => {
    pagerRef.current?.setPage(index);
  }

  /** Handle form field text change. Outputs a void function to call recommended for onTextChange event.*/
  const set = (key: keyof typeof form) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    setError('');

    // For Login/Register, if there are missing fields, display an error.
    if (!form.email || !form.password) {
      return setError('Email and password are required.');
    }

    // For Register, if missing a Full Name, display an error
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
    <View className='flex-1'>
      
      <PagerView className='z-0' style={{ flex: 1, backgroundColor: C.bg }}
        scrollEnabled={false}
        initialPage={0}
        onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
        ref={pagerRef}
      >
        {/* Page #1: Onboarding/Intro (View) */}
        <View className='pt-10 relative' key={0}>
          <Text className='text-4xl text-center mt-20 font-semibold' style={{color: C.text}}>Get Started!</Text>
          <Text className='text-lg text-center my-4 mx-10 leading-1' style={{ color: C.muted }}>
            Lorem ipsum dolor sit amet, consectetuer adipiscing elit
          </Text>

          {/* Ask for two options: (1) Continue as Guest, (2) Log in with an account*/}
          <View className='absolute w-full inset-x-0 bottom-16 px-8 gap-4'>
            {/* Button 1: Continue as Guest */}
            <TouchableOpacity className='rounded-2xl py-5 items-center border'
              style={{ borderColor: C.muted }} onPress={handleGuestPress} disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: C.muted, fontWeight: '800', fontSize: 16 }}>
                  Continue as Guest
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity className='rounded-2xl py-5 items-center'
              style={{ backgroundColor: C.primary }} onPress={() => goToPage(1)} disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  Log In with an Account
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {/* Page #2: Login/Register (ScrollView) */}
        <ScrollView key={1}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          

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

            {/* User Credential Fields --> KeyboardAvoidingView */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            </KeyboardAvoidingView>
          </View>

          <Text style={{ color: C.muted, textAlign: 'center', fontSize: 11, marginTop: 28 }}>
            Powered by ESP32 · ISO/IEC 25010
          </Text>
        </ScrollView>
      </PagerView>

      {/* Connection Method Selection Modal */}
      <Modal visible={showMethodModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8 }}>Connect to Device</Text>
            
            <TouchableOpacity
              onPress={() => {
                setShowMethodModal(false);
                navigation.navigate('WifiDiscovery'); // <-- Routes to the Radar Screen
              }}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border, gap: 14 }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="wifi" size={22} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Local Network (WiFi)</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>Broadcast search on current Wi-Fi</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowMethodModal(false)} style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: C.muted, fontWeight: '600', fontSize: 14 }}>Return</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reconnect Prompt Modal */}
      <Modal visible={showReconnectModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', backgroundColor: C.card, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Saved Device Found</Text>
            <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 8, marginBottom: 20 }}>
              Would you like to reconnect to {pastDevice?.name || 'the unit'} at {pastDevice?.ip}?
            </Text>
            <View style={{ width: '100%', gap: 10 }}>
              <TouchableOpacity onPress={handleReconnect} style={{ backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Reconnect</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowReconnectModal(false); setShowMethodModal(true); }} style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: C.muted, fontSize: 15, fontWeight: '700' }}>Try Another Device</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>




      {/* Theme toggle */}
      <TouchableOpacity onPress={toggleTheme} className='absolute w-16 h-16 rounded-full top-6 right-6 items-center justify-center' style={{
        backgroundColor: C.card, borderWidth: 1, borderColor: C.border
      }}>
        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={C.muted} />
      </TouchableOpacity>
      
      {/* Go Back (ONLY decrements page index number) */}
      { (currentPage > 0) && (
        <Animated.View entering={ FadeIn.duration(200) } exiting={ FadeOut.duration(200) } className='absolute top-6 left-6 z-10'>
          <TouchableOpacity onPress={() => {if (currentPage > 0) goToPage(currentPage - 1)}}
            className=' w-16 h-16 rounded-full items-center justify-center'
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}
            disabled={loading}
          >
            <Ionicons name='arrow-back-outline' size={20} color={C.muted} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}