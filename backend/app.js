const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { inputSanitizer } = require('./middleware/sanitizer');

const app = express();

// Trust reverse proxy (Nginx) for accurate client IP identification in rate limiters
app.set('trust proxy', 1);

// =============================================================================
// POLICY 3, 4, 5 — HTTP SECURITY HEADERS, HSTS, CSP & CLICKJACKING PROTECTION
// =============================================================================
app.use(
  helmet({
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' }, // Clickjacking protection (X-Frame-Options: DENY)
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'connect-src': [
          "'self'",
          'http://localhost:*',
          'ws://localhost:*',
          'http://127.0.0.1:*',
          'ws://127.0.0.1:*',
          'https://*.googleapis.com',
          'https://fcm.googleapis.com',
        ],
        'img-src': ["'self'", 'data:', 'blob:'],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
      },
    },
  })
);

// =============================================================================
// POLICY 2 — RESTRICTED CORS POLICY
// =============================================================================
const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  ...envOrigins,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (mobile native PWA, automated test-api.js, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS security policy.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-ID', 'x-branch-id'],
};
app.use(cors(corsOptions));

// =============================================================================
// POLICY 1 — RATE LIMITING (GLOBAL & AUTH)
// =============================================================================
const isTestEnv = process.env.NODE_ENV === 'test';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 5000 : 200, // Max requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 1000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts from this IP, please try again after 15 minutes.',
  },
});

// Apply global rate limiter to all API endpoints
app.use('/api', globalLimiter);
// Apply strict limiter to auth login endpoint
app.use('/api/auth/login', authLimiter);

// =============================================================================
// POLICY 6 — NO-CACHE HEADERS ON API RESPONSES (CWE-525)
// =============================================================================
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Standard body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// =============================================================================
// POLICY 7 — GLOBAL INPUT SANITIZATION & LENGTH LIMITING
// =============================================================================
app.use(inputSanitizer);

// Mount all API endpoints
app.use('/api', apiRoutes);

// Fallback for unmatched routes (Express 5 compatible)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler (Policy 9)
app.use(errorHandler);

module.exports = app;
