import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage } from '../utils/storage';
import { authAPI, isNetworkError, pingServer } from '../api/client';
import { registerForPushNotifications } from '../utils/notifications';

// Define a User profile
export interface User {
  id: string;
  name: string;
  email: string;
}

// Define payload structure for Authentication and initialize empty container
export type ServerStatus = 'checking' | 'online' | 'unreachable';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  serverStatus: ServerStatus;
  retryConnection: () => Promise<void>;
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
  // Backend reachability — the hosted API sleeps when idle and takes up to a minute to wake
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');

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

  // On app launch, rehydrate session. A network failure must NOT log the user out —
  // only a rejected token (401) does. The interceptor already clears the token on 401.
  const rehydrate = async () => {
    try {
      const token = await storage.getItem('authToken');
      if (token) {
        const { data } = await authAPI.me();
        setUser(data.user);
        syncPushToken();
      }
      setServerStatus('online');
    } catch (err) {
      if (isNetworkError(err)) {
        setServerStatus('unreachable');
      } else {
        setServerStatus('online');
        await storage.deleteItem('authToken');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    rehydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called by the "Connecting to server" screen: wait for /health, then retry the session.
  const retryConnection = async () => {
    setServerStatus('checking');
    const awake = await pingServer();
    if (!awake) {
      setServerStatus('unreachable');
      return;
    }
    await rehydrate();
  };

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
    <AuthContext.Provider value={{ user, loading, serverStatus, retryConnection, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};