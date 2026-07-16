const { Expo } = require('expo-server-sdk');
const logger = require('../config/logger');

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

/**
 * NotificationService — Sends push notifications via Expo Push API.
 *
 * All notification functions accept an array of Expo push tokens and
 * a message payload. Invalid tokens are automatically pruned.
 */

/**
 * Sends push notification messages in batched chunks (Expo limit: 100/batch).
 * @param {string[]} tokens - Expo push tokens
 * @param {Object} message - { title, body, data }
 */
const sendPushNotification = async (tokens, { title, body, data = {} }) => {
  const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));

  if (validTokens.length === 0) {
    logger.warn('sendPushNotification: No valid Expo push tokens provided');
    return;
  }

  const messages = validTokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'aquapeelter-alerts',
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const receipts = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      receipts.push(...ticketChunk);
    } catch (err) {
      logger.error(`Push notification send error: ${err.message}`);
    }
  }

  return receipts;
};

// -------------------------------------------------------------------
// NAMED NOTIFICATION EVENTS
// -------------------------------------------------------------------

const notifyCycleStarted = (tokens, cycleNumber) =>
  sendPushNotification(tokens, {
    title: 'Filtration Started',
    body: `Cycle #${cycleNumber} is now running.`,
    data: { event: 'cycle_started', cycleNumber },
  });

const notifyCycleCompleted = (tokens, cycleNumber, durationSeconds) => {
  const mins = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;
  return sendPushNotification(tokens, {
    title: 'Filtration Complete',
    body: `Cycle #${cycleNumber} finished in ${mins}m ${secs}s. Water is ready.`,
    data: { event: 'cycle_completed', cycleNumber, durationSeconds },
  });
};

const notifyCyclePaused = (tokens, cycleNumber) =>
  sendPushNotification(tokens, {
    title: 'Filtration Paused',
    body: `Cycle #${cycleNumber} has been paused.`,
    data: { event: 'cycle_paused', cycleNumber },
  });

const notifyFilterReplacement = (tokens, filterHealthPercent) =>
  sendPushNotification(tokens, {
    title: 'Filter Replacement Required',
    body: `Your banana peel bio-adsorbent filter is at ${filterHealthPercent}% capacity. Replace it to maintain filtration quality.`,
    data: { event: 'filter_replacement_needed', filterHealthPercent },
  });

const notifyDeviceOffline = (tokens, deviceId) =>
  sendPushNotification(tokens, {
    title: 'Device Offline',
    body: `Device ${deviceId} has not responded. Check your connection.`,
    data: { event: 'device_offline', deviceId },
  });

const notifyDeviceOnline = (tokens, deviceId) =>
  sendPushNotification(tokens, {
    title: 'Device Online',
    body: `Device ${deviceId} is back online.`,
    data: { event: 'device_online', deviceId },
  });

const notifyWaterQualityAlert = (tokens, { ph, turbidity, tds }) =>
  sendPushNotification(tokens, {
    title: 'Water Quality Alert',
    body: `Abnormal readings detected — pH: ${ph}, Turbidity: ${turbidity} NTU, TDS: ${tds} ppm. Inspect the system.`,
    data: { event: 'quality_alert', ph, turbidity, tds },
  });

module.exports = {
  sendPushNotification,
  notifyCycleStarted,
  notifyCycleCompleted,
  notifyCyclePaused,
  notifyFilterReplacement,
  notifyDeviceOffline,
  notifyDeviceOnline,
  notifyWaterQualityAlert,
};
