import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Contexts (These will need their own TypeScript interfaces later)
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { DeviceProvider } from '../context/DeviceContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import CyclesScreen from '../screens/CyclesScreen';
import AlertsScreen from '../screens/AlertsScreen';
import MaintenanceScreen from '../screens/MaintenanceScreen';
import ServerWakeScreen from '../screens/ServerWakeScreen';

// 1. Define the parameters for each route in your Stacks and Tabs
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Analytics: undefined;
  Cycles: undefined;
  Alerts: undefined;
  Maintenance: undefined;
};

// 2. Pass the types to your navigator creators
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// 3. Strongly type the TAB_CONFIG so the icons and labels map perfectly to your routes
type TabName = keyof MainTabParamList;
type TabConfig = {
  [key in TabName]: {
    active: React.ComponentProps<typeof Ionicons>['name'];
    inactive: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
  };
};

const TAB_CONFIG: TabConfig = {
  Dashboard:   { active: 'water',         inactive: 'water-outline',         label: 'Dashboard' },
  Analytics:   { active: 'stats-chart',   inactive: 'stats-chart-outline',   label: 'Analytics' },
  Cycles:      { active: 'repeat',        inactive: 'repeat-outline',        label: 'Cycles' },
  Alerts:      { active: 'notifications', inactive: 'notifications-outline', label: 'Alerts' },
  Maintenance: { active: 'construct',     inactive: 'construct-outline',     label: 'Maintenance' },
};

const MainTabs = () => {
  const { colors: C } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.tabBar,
          borderTopColor: C.tabBorder,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.muted,
        tabBarLabel: ({ focused, color }) => (
          <Text style={{ fontSize: 10, fontWeight: focused ? '700' : '500', color, marginTop: 2 }}>
            {TAB_CONFIG[route.name as TabName].label}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => {
          const iconName = focused
            ? TAB_CONFIG[route.name as TabName].active
            : TAB_CONFIG[route.name as TabName].inactive;

          return (
            <Ionicons
              name={iconName}
              size={22}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard"   component={DashboardScreen} />
      <Tab.Screen name="Analytics"   component={AnalyticsScreen} />
      <Tab.Screen name="Cycles"      component={CyclesScreen} />
      <Tab.Screen name="Alerts"      component={AlertsScreen} />
      <Tab.Screen name="Maintenance" component={MaintenanceScreen} />
    </Tab.Navigator>
  );
};

export default function AppNavigator() {
  const { user, loading, serverStatus } = useAuth();
  const { colors: C, isDark } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  // Backend asleep/unreachable: hold the user here with auto-retry instead of
  // dropping them to Login with a misleading "check credentials" error.
  if (serverStatus === 'unreachable') {
    return <ServerWakeScreen />;
  }

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main">
            {() => (
              <DeviceProvider>
                <MainTabs />
              </DeviceProvider>
            )}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}