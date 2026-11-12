const app = require('./app');
const config = require('./config');
const db = require('./db');
const { initNotificationListeners } = require('./notifications');

const PORT = config.port || 3000;

async function startServer() {
  try {
    // Register background event listeners (Web Push, etc.)
    initNotificationListeners();

    // Test PostgreSQL database connectivity on boot
    const dbTest = await db.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(
      `[Database] Connected successfully to PostgreSQL "${dbTest.rows[0].db_name}" at ${dbTest.rows[0].current_time}`
    );

    // Auto-heal schema: Ensure legacy unique constraint on (entry_id, fish_name) is dropped to support multi-lot entries
    try {
      await db.query('ALTER TABLE entry_rates DROP CONSTRAINT IF EXISTS uq_entry_rates_entry_fish');
    } catch (patchErr) {
      console.warn('[Database] Schema auto-heal notice:', patchErr.message);
    }

    // Auto-heal schema: Monotonic slip numbering across all days per branch
    try {
      await db.query('ALTER TABLE entries DROP CONSTRAINT IF EXISTS uq_entries_branch_date_sl_no');
      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'uq_entries_branch_sl_no'
          ) THEN
            ALTER TABLE entries ADD CONSTRAINT uq_entries_branch_sl_no UNIQUE (branch_id, daily_sl_no);
          END IF;
        END $$;
      `);
    } catch (patchErr) {
      console.warn('[Database] Schema auto-heal notice for slip numbering:', patchErr.message);
    }

    // Auto-initialize Hybrid RBAC system roles and permission policies
    const { initRbac } = require('./db/initRbac');
    await initRbac();

    app.listen(PORT, () => {
      console.log(`[Server] Tally Fish Backend API running on port ${PORT} (${config.nodeEnv})`);
      console.log(`[Server] Health check available at http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('[Startup Error] Failed to connect to database or start server:', err.message);
    process.exit(1);
  }
}

startServer();

