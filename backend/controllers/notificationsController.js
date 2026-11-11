const db = require('../db');
const { saveSubscription, getVapidPublicKey, sendPushNotification } = require('../notifications');

/**
 * GET /api/notifications/vapid-key
 * Returns the VAPID public key for browser push subscription
 */
function getVapidKey(req, res) {
  const publicKey = getVapidPublicKey();

  if (!publicKey) {
    return res.status(500).json({
      success: false,
      error: 'VAPID public key is not configured on server',
    });
  }

  return res.status(200).json({
    success: true,
    publicKey,
    data: {
      publicKey,
    },
  });
}

/**
 * POST /api/notifications/subscribe
 * Register or update device push subscription linked to (user_id, branch_id)
 */
async function subscribe(req, res, next) {
  try {
    const userId = req.user ? req.user.id : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required to register push subscription',
      });
    }

    // Branch ID may come from X-Branch-ID header (via middleware), request body, or query
    const branchId =
      req.branchId ||
      req.body.branch_id ||
      (req.headers['x-branch-id'] ? req.headers['x-branch-id'].trim() : null) ||
      null;

    // Handle standard browser PushSubscription JSON or flattened fields
    const body = req.body || {};
    const subObj = body.subscription || body;

    const endpoint = subObj.endpoint || body.endpoint;
    let p256dhKey = null;
    let authKey = null;

    if (subObj.keys) {
      p256dhKey = subObj.keys.p256dh;
      authKey = subObj.keys.auth;
    } else {
      p256dhKey = body.p256dh_key || body.p256dh;
      authKey = body.auth_key || body.auth;
    }

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Push subscription endpoint is required',
      });
    }

    if (!p256dhKey || !authKey) {
      return res.status(400).json({
        success: false,
        error: 'Subscription cryptographic keys (p256dh, auth) are required',
      });
    }

    const saved = await saveSubscription({
      userId,
      branchId,
      endpoint,
      p256dhKey,
      authKey,
    });

    return res.status(201).json({
      success: true,
      message: 'Push subscription registered successfully',
      data: saved,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/notifications/test
 * Sends a test push alert to the logged-in user's registered phone/device subscriptions
 */
async function sendTestNotification(req, res, next) {
  try {
    const userId = req.user ? req.user.id : null;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const subRes = await db.query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5',
      [userId]
    );

    if (subRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active push subscription found for this account. Tap "Enable Real-time Web Push Alerts" on your phone first.',
      });
    }

    const delay = parseInt(req.body.delaySeconds, 10) || 0;

    const payload = {
      title: 'Tally Fish Notification Test',
      body: '🔔 Owner alert test! Your phone lock screen and notification bar alerts are operational.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'test-notification',
      data: {
        type: 'TEST_ALERT',
        url: '/',
        timestamp: new Date().toISOString(),
      },
    };

    const dispatch = async () => {
      for (const sub of subRes.rows) {
        try {
          await sendPushNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
            },
            payload
          );
        } catch (sendErr) {
          console.warn('[WebPush Test] Failed sending to endpoint:', sendErr.message);
        }
      }
    };

    if (delay > 0) {
      setTimeout(dispatch, delay * 1000);
      return res.status(200).json({
        success: true,
        message: `Test alert will be sent in ${delay} seconds. Lock your phone screen now!`,
      });
    } else {
      await dispatch();
      return res.status(200).json({
        success: true,
        message: 'Test notification dispatched to your phone!',
      });
    }
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getVapidKey,
  subscribe,
  sendTestNotification,
};

