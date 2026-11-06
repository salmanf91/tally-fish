const eventBus = require('./eventBus');
const {
  webpush,
  isVapidConfigured,
  sendPushNotification,
  deleteSubscriptionByEndpoint,
} = require('./webPush');
const {
  saveSubscription,
  getVapidPublicKey,
  getActiveBranchAdminSubscriptions,
  notifyAdminsOnEntryCreated,
  initNotificationListeners,
} = require('./notificationService');

module.exports = {
  eventBus,
  webpush,
  isVapidConfigured,
  sendPushNotification,
  deleteSubscriptionByEndpoint,
  saveSubscription,
  getVapidPublicKey,
  getActiveBranchAdminSubscriptions,
  notifyAdminsOnEntryCreated,
  initNotificationListeners,
};

