import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { DeviceProvider } from '../context/DeviceContext';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import AlertsScreen from '../screens/AlertsScreen';
import MaintenanceScreen from '../screens/MaintenanceScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_CONFIG = {
  Dashboard:   { active: 'water',         inactive: 'water-outline',         label: 'Dashboard' },
  Analytics:   { active: 'stats-chart',   inactive: 'stats-chart-outline',   label: 'Analytics' },
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
        tabBarActiveTintColor:   C.primary,
        tabBarInactiveTintColor: C.muted,
        tabBarLabel: ({ focused, color }) => (
          <Text style={{ fontSize: 10, fontWeight: focused ? '700' : '500', color, marginTop: 2 }}>
            {TAB_CONFIG[route.name].label}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => (
          <Ionicons
            name={focused ? TAB_CONFIG[route.name].active : TAB_CONFIG[route.name].inactive}
            size={22}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard"   component={DashboardScreen} />
      <Tab.Screen name="Analytics"   component={AnalyticsScreen} />
      <Tab.Screen name="Alerts"      component={AlertsScreen} />
      <Tab.Screen name="Maintenance" component={MaintenanceScreen} />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const { user, loading } = useAuth();
  const { colors: C, isDark } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
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
};

export default AppNavigator;
