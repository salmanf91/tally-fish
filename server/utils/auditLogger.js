const db = require('../db');

/**
 * Persists an immutable audit log record to audit_logs
 *
 * @param {Object} params
 * @param {string} [params.actorId] - User UUID who performed the action
 * @param {string} [params.branchId] - Branch UUID context
 * @param {string} params.action - Categorical action name (e.g. 'MERGE_PARTIES', 'PIN_RESET')
 * @param {string} [params.entityType] - e.g. 'parties', 'vehicles', 'entries'
 * @param {string} [params.entityId] - Target entity UUID
 * @param {Object} [params.diffs] - Object containing { old: ..., new: ... } or metadata
 * @param {string} [params.ipAddress] - Request IP address
 * @param {Object} [client] - Optional pg transaction client
 */
async function recordAuditLog(
  { actorId, branchId, action, entityType, entityId, diffs = {}, ipAddress },
  client = null
) {
  const runner = client || db;
  const sql = `
    INSERT INTO audit_logs (
      id,
      actor_id,
      branch_id,
      action,
      entity_type,
      entity_id,
      diffs,
      ip_address,
      created_at
    ) VALUES (
      gen_random_uuid(),
      $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP
    ) RETURNING id;
  `;

  const values = [
    actorId || null,
    branchId || null,
    action,
    entityType || null,
    entityId || null,
    JSON.stringify(diffs),
    ipAddress || null,
  ];

  const res = await runner.query(sql, values);
  return res.rows[0];
}

module.exports = {
  recordAuditLog,
};
