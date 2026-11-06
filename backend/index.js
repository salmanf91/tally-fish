const app = require('./app');
const config = require('./config');
const db = require('./db');

const PORT = config.port || 3000;

async function startServer() {
  try {
    // Test PostgreSQL database connectivity on boot
    const dbTest = await db.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(
      `[Database] Connected successfully to PostgreSQL "${dbTest.rows[0].db_name}" at ${dbTest.rows[0].current_time}`
    );

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

