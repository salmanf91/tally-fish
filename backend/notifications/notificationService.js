const db = require('../db');
const config = require('../config');
const eventBus = require('./eventBus');
const { sendPushNotification, deleteSubscriptionByEndpoint } = require('./webPush');

/**
 * Register or update a device Web Push subscription
 * Linked to (user_id, branch_id)
 *
 * @param {object} params
 * @param {string} params.userId - User UUID
 * @param {string|null} params.branchId - Branch UUID (optional or null for multi-branch/owner)
 * @param {string} params.endpoint - Web Push endpoint URL
 * @param {string} params.p256dhKey - Client public key
 * @param {string} params.authKey - Client auth secret
 * @returns {Promise<object>} Stored subscription record
 */
async function saveSubscription({ userId, branchId, endpoint, p256dhKey, authKey }) {
  if (!endpoint || !p256dhKey || !authKey) {
    throw new Error('endpoint, p256dhKey, and authKey are required');
  }

  const query = `
    INSERT INTO push_subscriptions (
      id, user_id, branch_id, endpoint, p256dh_key, auth_key, updated_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP
    )
    ON CONFLICT (endpoint)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      branch_id = EXCLUDED.branch_id,
      p256dh_key = EXCLUDED.p256dh_key,
      auth_key = EXCLUDED.auth_key,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, user_id, branch_id, endpoint, created_at, updated_at;
  `;

  const result = await db.query(query, [
    userId,
    branchId || null,
    endpoint,
    p256dhKey,
    authKey,
  ]);

  return result.rows[0];
}

/**
 * Get active VAPID public key
 */
function getVapidPublicKey() {
  return config.vapid.publicKey;
}

/**
 * Find all active subscriptions for Admins ('billingAdmin', 'owner') assigned to a specific branch
 *
 * @param {string} branchId - Target branch UUID
 * @returns {Promise<Array<object>>} List of subscriptions
 */
async function getActiveBranchAdminSubscriptions(branchId) {
  const query = `
    SELECT DISTINCT
      ps.id,
      ps.user_id,
      ps.branch_id,
      ps.endpoint,
      ps.p256dh_key,
      ps.auth_key,
      u.username,
      ubr.role
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    JOIN user_branch_roles ubr ON ubr.user_id = u.id AND ubr.branch_id = $1
    WHERE u.is_active = true
      AND ubr.role IN ('billingAdmin', 'owner')
      AND (ps.branch_id = $1 OR ps.branch_id IS NULL);
  `;

  const result = await db.query(query, [branchId]);
  return result.rows;
}

/**
 * Build rich push payload for entry:created event
 *
 * @param {object} entry - Created entry record with boxes
 * @returns {object} JSON payload for client service worker
 */
function buildEntryCreatedPayload(entry) {
  const dailySlNo = entry.daily_sl_no || 'N/A';
  const party = entry.party_name || 'Vendor';
  const vehicle = entry.vehicle_no || 'Vehicle';
  const netKg = Number(entry.net_kg) || 0;

  // Summarize fish species from boxes if available
  let speciesSummary = '';
  if (Array.isArray(entry.boxes) && entry.boxes.length > 0) {
    speciesSummary = entry.boxes
      .map((b) => `${b.fish_name} (${b.box_count}b)`)
      .join(', ');
  }

  const title = `New Entry #${dailySlNo} - ${party}`;
  const bodyText = `${netKg.toLocaleString()} kg | ${vehicle}${
    speciesSummary ? ` | ${speciesSummary}` : ''
  } - Awaiting Rate Fixing`;

  return {
    title,
    body: bodyText,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: `entry-${entry.id}`,
    data: {
      type: 'ENTRY_CREATED',
      entryId: entry.id,
      branchId: entry.branch_id,
      dailySlNo: entry.daily_sl_no,
      partyName: entry.party_name,
      vehicleNo: entry.vehicle_no,
      netKg: entry.net_kg,
      status: entry.status,
      createdAt: entry.created_at,
      url: `/entries/${entry.id}`,
    },
  };
}

/**
 * Notify all active Admins assigned to the entry's branch
 *
 * @param {object} entry - The newly created entry
 * @returns {Promise<{dispatched: number, successCount: number, failureCount: number, results: Array}>}
 */
async function notifyAdminsOnEntryCreated(entry) {
  if (!entry || !entry.branch_id) {
    console.warn('[WebPush] Cannot dispatch notification: missing entry or branch_id');
    return { dispatched: 0, successCount: 0, failureCount: 0, results: [] };
  }

  try {
    const subscriptions = await getActiveBranchAdminSubscriptions(entry.branch_id);

    if (subscriptions.length === 0) {
      console.log(
        `[WebPush] No active admin push subscriptions found for branch ${entry.branch_id}.`
      );
      return { dispatched: 0, successCount: 0, failureCount: 0, results: [] };
    }

    console.log(
      `[WebPush] Dispatching entry:created notification to ${subscriptions.length} admin subscription(s)...`
    );

    const payload = buildEntryCreatedPayload(entry);

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const sendResult = await sendPushNotification(sub, payload);
        return {
          subscriptionId: sub.id,
          userId: sub.user_id,
          username: sub.username,
          role: sub.role,
          ...sendResult,
        };
      })
    );

    let successCount = 0;
    let failureCount = 0;

    const mappedResults = results.map((r) => {
      if (r.status === 'fulfilled') {
        if (r.value.success) successCount++;
        else failureCount++;
        return r.value;
      } else {
        failureCount++;
        return { success: false, error: r.reason?.message || 'Unknown error' };
      }
    });

    console.log(
      `[WebPush] Dispatched ${subscriptions.length} notifications: ${successCount} successful, ${failureCount} failed.`
    );

    return {
      dispatched: subscriptions.length,
      successCount,
      failureCount,
      results: mappedResults,
    };
  } catch (err) {
    console.error('[WebPush] Error handling entry:created notification:', err.message);
    throw err;
  }
}

/**
 * Initialize event listeners for background push notifications
 */
function initNotificationListeners() {
  eventBus.on('entry:created', async (entry) => {
    try {
      await notifyAdminsOnEntryCreated(entry);
    } catch (err) {
      // Non-blocking catch to ensure background notifications never crash the server
      console.error('[WebPush:Listener] Error in entry:created event listener:', err.message);
    }
  });

  console.log('[WebPush] Event listener registered for "entry:created".');
}

module.exports = {
  saveSubscription,
  getVapidPublicKey,
  getActiveBranchAdminSubscriptions,
  buildEntryCreatedPayload,
  notifyAdminsOnEntryCreated,
  initNotificationListeners,
  deleteSubscriptionByEndpoint,
};

