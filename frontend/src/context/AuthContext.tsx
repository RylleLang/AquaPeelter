import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage } from '../utils/storage';
import { authAPI } from '../api/client';
import { registerForPushNotifications } from '../utils/notifications';

// Define a User profile
export interface User {
  id: string;
  name: string;
  email: string;
}

// Define payload structure for Authentication and initialize empty container
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextType | null>(null);

// 
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Define current user profile loaded, or null at start (default)
  const [user, setUser] = useState<User | null>(null);
  // Define state of the app when processing authentication, default to 'loading' at launch
  const [loading, setLoading] = useState<boolean>(true);

  const register = async (name: string, email: string, password: string) => {
    // Register new user and get token string
    const { data } = await authAPI.register(name, email, password);
    await storage.setItem('authToken', data.token);
    setUser(data.user);
  };

  const syncPushToken = async () => {
    // Get push notifications token for the user device, and store locally and in the cloud
    const pushToken = await registerForPushNotifications();
    if (pushToken) {
      await storage.setItem('pushToken', pushToken);
      await authAPI.savePushToken(pushToken).catch(() => {});
    }
  };

  // On app launch, rehydrate session
  useEffect(() => {
    const rehydrate = async () => {
      try {
        const token = await storage.getItem('authToken');
        if (token) {
          const { data } = await authAPI.me();
          setUser(data.user);
          syncPushToken();
        }
      } catch {
        await storage.deleteItem('authToken');
      } finally {
        setLoading(false);
      }
    };
    rehydrate();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await authAPI.login(email, password);
    await storage.setItem('authToken', data.token);
    setUser(data.user);
    syncPushToken();
  };

  const logout = async () => {
    const pushToken = await storage.getItem('pushToken');
    if (pushToken) {
      await authAPI.removePushToken(pushToken).catch(() => {});
      await storage.deleteItem('pushToken');
    }
    await storage.deleteItem('authToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};