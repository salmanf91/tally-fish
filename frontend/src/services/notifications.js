import { api } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if the current browser/device is currently subscribed to push notifications
 */
export async function checkPushSubscription() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Request notification permission and subscribe to VAPID Web Push
 * @param {string} branchId
 */
export async function subscribeToPush(branchId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web Push Notifications are not supported by this browser.');
  }

  // Request browser permission explicitly
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied. Please allow notifications in browser settings.');
  }

  // Fetch VAPID Public Key from server
  const keyRes = await api.get('/notifications/vapid-key');
  const vapidKey = keyRes.publicKey || keyRes.data?.publicKey;
  if (!vapidKey) {
    throw new Error('Server VAPID public key could not be retrieved.');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  const subJson = sub.toJSON();
  await api.post('/notifications/subscribe', {
    endpoint: subJson.endpoint,
    keys: subJson.keys,
    branch_id: branchId,
  });

  return true;
}

/**
 * Update PWA App Icon Badge on Phone Home Screen
 * @param {number} count
 */
export function setAppBadgeCount(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
}

