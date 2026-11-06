const webpush = require('web-push');
const config = require('../config');
const db = require('../db');

// Configure VAPID details if keys are present
let isVapidConfigured = false;

if (config.vapid.publicKey && config.vapid.privateKey) {
  try {
    webpush.setVapidDetails(
      config.vapid.subject,
      config.vapid.publicKey,
      config.vapid.privateKey
    );
    isVapidConfigured = true;
    console.log('[WebPush] VAPID details configured successfully.');
  } catch (err) {
    console.error('[WebPush] Error setting VAPID details:', err.message);
  }
} else {
  console.warn('[WebPush] WARNING: VAPID keys not configured in environment.');
}

/**
 * Automatically delete a stale subscription from PostgreSQL (HTTP 410 Gone or 404 Not Found)
 * @param {string} endpoint - The target push endpoint URL
 */
async function deleteSubscriptionByEndpoint(endpoint) {
  try {
    const result = await db.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 RETURNING id, user_id, branch_id',
      [endpoint]
    );
    if (result.rowCount > 0) {
      console.log(`[WebPush] Removed stale push subscription (endpoint: ${endpoint.substring(0, 45)}...)`);
    }
    return result.rowCount;
  } catch (err) {
    console.error(`[WebPush] Error deleting stale subscription for endpoint ${endpoint}:`, err.message);
    throw err;
  }
}

/**
 * Send a web push notification to a subscription
 * Handles HTTP 410 / 404 responses by automatically pruning stale subscriptions from PostgreSQL
 *
 * @param {object} subscription - { endpoint, p256dh_key, auth_key } or Web Push Subscription
 * @param {object|string} payload - Notification payload (JSON object or string)
 * @returns {Promise<{success: boolean, stale?: boolean, error?: string, statusCode?: number}>}
 */
async function sendPushNotification(subscription, payload) {
  if (!isVapidConfigured) {
    console.warn('[WebPush] Skipping notification dispatch: VAPID details not configured');
    return { success: false, error: 'VAPID details not configured' };
  }

  const endpoint = subscription.endpoint;
  const p256dh = subscription.p256dh_key || (subscription.keys && subscription.keys.p256dh);
  const auth = subscription.auth_key || (subscription.keys && subscription.keys.auth);

  if (!endpoint || !p256dh || !auth) {
    console.error('[WebPush] Invalid subscription object: missing endpoint or keys');
    return { success: false, error: 'Invalid subscription object' };
  }

  const pushSubscription = {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  };

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  try {
    const response = await webpush.sendNotification(pushSubscription, payloadString);
    return {
      success: true,
      statusCode: response.statusCode,
    };
  } catch (err) {
    const statusCode = err.statusCode || (err.response && err.response.statusCode);

    // HTTP 410 Gone or HTTP 404 Not Found: subscription is expired or unsubscribed
    if (statusCode === 410 || statusCode === 404) {
      console.warn(`[WebPush] Subscription expired or not found (${statusCode}). Pruning from database...`);
      await deleteSubscriptionByEndpoint(endpoint);
      return {
        success: false,
        stale: true,
        statusCode,
        error: `Subscription expired (${statusCode}) and pruned from database`,
      };
    }

    console.error(`[WebPush] Push dispatch failed (status ${statusCode || 'unknown'}):`, err.message);
    return {
      success: false,
      stale: false,
      statusCode,
      error: err.message,
    };
  }
}

module.exports = {
  webpush,
  isVapidConfigured: () => isVapidConfigured,
  deleteSubscriptionByEndpoint,
  sendPushNotification,
};

