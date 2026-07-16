import Constants from 'expo-constants';

// expo-notifications remote push was removed from Expo Go SDK 53+.
// Only load the module in production/development builds.
const isExpoGo = Constants.appOwnership === 'expo';

const getNotifications = () => {
  if (isExpoGo) return null;
  return require('expo-notifications');
};

export const registerForPushNotifications = async () => {
  const Notifications = getNotifications();
  if (!Notifications) return null;

  const Device = require('expo-device');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const { Platform } = require('react-native');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('aquapeelter-alerts', {
      name: 'AquaPeelter Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00D4FF',
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    return null;
  }
};

export const sendLocalNotification = async (title, body, data = {}) => {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null,
  });
};

export const notify = {
  cycleComplete: () => sendLocalNotification('Filtration Complete ✅', 'The laundry wastewater filtration cycle has finished.'),
  filterReplace: (cyclesLeft) => sendLocalNotification('Filter Replacement Required ⚠️', `Banana peel bio-adsorbent filter needs replacement. ${cyclesLeft} cycle(s) remaining.`),
  deviceOn: () => sendLocalNotification('AquaPeelter ON 💧', 'Filtration device is now active.'),
  deviceOff: () => sendLocalNotification('AquaPeelter OFF', 'Filtration device has been switched off.'),
  highTurbidity: (ntu) => sendLocalNotification('High Turbidity Alert ⚠️', `Turbidity reading: ${ntu} NTU — exceeds safe threshold.`),
  phAlert: (ph) => sendLocalNotification('pH Level Alert ⚠️', `pH reading: ${ph} — outside acceptable range (6.5–8.5).`),
};
