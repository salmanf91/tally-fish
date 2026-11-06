const { Pool } = require('pg');
const config = require('../config');

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
