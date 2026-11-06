const { saveSubscription, getVapidPublicKey } = require('../notifications');

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

module.exports = {
  getVapidKey,
  subscribe,
};

