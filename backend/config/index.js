const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'tally_fish_super_secure_jwt_secret_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL,
  pg: {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5444,
    user: process.env.PGUSER || 'enterprisedb',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'tally_fish_dev',
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@indofishmeal.com',
  },
};
