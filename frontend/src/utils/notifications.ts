import Constants, {ExecutionEnvironment} from 'expo-constants';
import { Platform } from 'react-native';

// Check if the app is currently running in 'Expo Go' for testing
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getNotifications = (): typeof import('expo-notifications') | null => {
  if (isExpoGo) return null;
  return require('expo-notifications');
};

export const registerForPushNotifications = async (): Promise<string | null> => {
  // Try to get Notifications Library object and check for success, otherwise Return
  const Notifications = getNotifications();
  if (!Notifications) return null;

  // Try to get Device Library object
  const Device: typeof import('expo-device') = require('expo-device');

  // Describe push notififications characteristics when app is ON-SCREEN
  // By default, push notifications are muted when app is on the foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Check if app is running on a real device instead of an emulator
  if (!Device.isDevice) return null;

  // Check for existing push notification permissions on device for the app
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  
  // If permissions are not 'granted', trigger OS permission popup, only works for first launch
  // if permissions are denied, results after first launch is automatically DENIED
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  // If permissions are DENIED or UNDETERMINED, discontinue
  if (finalStatus !== 'granted') return null;

  // If app is running on Android, set a notification channel for compliance
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('aquapeelter-alerts', {
      name: 'AquaPeelter Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00D4FF',
    });
  }

  // Request the actual push token from Apple/Google via Expo services
  try {
    const pushTokenData = await Notifications.getExpoPushTokenAsync();
    return pushTokenData.data;
  } catch {
    return null;
  }
};

/**
 * Function to send push notifications on user device.
**/
export const sendLocalNotification = async (
  title: string, 
  body: string, 
  data: Record<string, unknown> = {}
): Promise<void> => { // Comment
  // Try to get Notifications Library object and check for success, otherwise Return
  const Notifications = getNotifications();
  if (!Notifications) return;
  
  // Trigger notifications IMMEDIATELY using given information
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null,
  });
};

// ---MAIN---
// List common notifications for easy reference and invoke
export const notify = {
  cycleComplete: () => sendLocalNotification(
    'Filtration Complete',
    'The laundry wastewater filtration cycle has finished.'
  ),
  filterReplace: (cyclesLeft: number) => sendLocalNotification(
    'Filter Replacement Required',
    `Banana peel bio-adsorbent filter needs replacement. ${cyclesLeft} cycle(s) remaining.`
  ),
  deviceOn: () => sendLocalNotification(
    'AquaPeelter ON',
    'Filtration device is now active.'
  ),
  deviceOff: () => sendLocalNotification(
    'AquaPeelter OFF',
    'Filtration device has been switched off.'
  ),
  highTurbidity: (ntu: number) => sendLocalNotification(
    'High Turbidity Alert',
    `Turbidity reading: ${ntu} NTU — exceeds safe threshold.`
  ), phAlert: (ph: number) => sendLocalNotification(
    'pH Level Alert',
    `pH reading: ${ph} — outside acceptable range (6.5–8.5).`
  ),
};