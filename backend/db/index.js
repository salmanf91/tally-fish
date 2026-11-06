const { Pool, types } = require('pg');
const config = require('../config');

// Month mapping for Redwood date format (DD-Mon-YY)
const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

function parseRedwoodOrIsoDate(val) {
  if (!val) return null;
  // If ISO: 2026-11-06...
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // If Redwood: 06-NOV-26...
  const redwoodMatch = val.match(/^(\d{2})-([A-Za-z]{3})-(\d{2,4})/);
  if (redwoodMatch) {
    const day = redwoodMatch[1];
    const mon = MONTHS[redwoodMatch[2].toUpperCase()] || '01';
    let yr = redwoodMatch[3];
    if (yr.length === 2) yr = `20${yr}`;
    return `${yr}-${mon}-${day}`;
  }

  return val;
}

function parseRedwoodOrIsoTimestamp(val) {
  if (!val) return null;
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  const match = val.match(/^(\d{2})-([A-Za-z]{3})-(\d{2,4})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*([+-]\d{2}(?::?\d{2})?)?/);
  if (match) {
    const day = match[1];
    const mon = MONTHS[match[2].toUpperCase()] || '01';
    let yr = match[3];
    if (yr.length === 2) yr = `20${yr}`;
    const time = match[4];
    const tz = match[5] || 'Z';
    return new Date(`${yr}-${mon}-${day}T${time}${tz}`).toISOString();
  }
  return val;
}

// OID 1082: DATE, OID 1114: TIMESTAMP WITHOUT TIME ZONE (used by entry_date in Redwood DB)
types.setTypeParser(1082, parseRedwoodOrIsoDate);
types.setTypeParser(1114, parseRedwoodOrIsoDate);
// OID 1184: TIMESTAMPTZ (created_at, updated_at)
types.setTypeParser(1184, parseRedwoodOrIsoTimestamp);

const poolConfig = config.databaseUrl
  ? { connectionString: config.databaseUrl }
  : config.pg;

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

/**
 * Execute a query against the pool
 * @param {string} text - SQL statement
 * @param {Array} params - Param values
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire a client from the pool (must be released after use)
 */
const getClient = () => pool.connect();

/**
 * Execute work inside a database transaction with automated rollback/commit
 * @param {Function} callback - (client) => Promise<any>
 * @param {Object} [options] - Optional actor and branch context for audit triggers
 */
const withTransaction = async (callback, options = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (options.actorId) {
      await client.query("SELECT set_config('app.current_actor_id', $1, true)", [
        options.actorId,
      ]);
    }
    if (options.branchId) {
      await client.query("SELECT set_config('app.current_branch_id', $1, true)", [
        options.branchId,
      ]);
    }

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  getClient,
  withTransaction,
};
