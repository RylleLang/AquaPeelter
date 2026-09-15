import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Lazy-load SecureStore to avoid module-level native access
const getSecureStore = (): typeof import('expo-secure-store') | null => {
  if (Platform.OS === 'web') return null;
  return require('expo-secure-store');
};

export const storage = {
  setItem: async (key: string, value: string): Promise<void> => {
    const SecureStore = getSecureStore();
    if (SecureStore) {
      return SecureStore.setItemAsync(key, value);
    }
    return AsyncStorage.setItem(key, value);
  },
  
  getItem: async (key: string): Promise<string | null> => {
    const SecureStore = getSecureStore();
    if (SecureStore) {
      return SecureStore.getItemAsync(key);
    }
    return AsyncStorage.getItem(key);
  },
  
  deleteItem: async (key: string): Promise<void> => {
    const SecureStore = getSecureStore();
    if (SecureStore) {
      return SecureStore.deleteItemAsync(key);
    }
    return AsyncStorage.removeItem(key);
  },
};