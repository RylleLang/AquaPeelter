import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';

// Suppress known Expo Go SDK 53+ limitation — remote push not supported in Expo Go
const _origError = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' && 
    args[0].includes('expo-notifications') && 
    args[0].includes('Expo Go')
  ) {
    return;
  }
  _origError(...args);
};

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotifications } from './src/utils/notifications';

export default function App() {
  const [fontsLoaded] = useFonts(Ionicons.font);

  useEffect(() => {
    registerForPushNotifications()
      .then((token: string | null) => {
        if (token) console.log('Expo Push Token:', token);
      })
      .catch((err: unknown) => {
        console.warn('Push registration failed:', err);
      });
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00D4FF" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}