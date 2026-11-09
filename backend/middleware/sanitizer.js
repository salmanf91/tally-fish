/**
 * Global Input Sanitizer & Length Limiter Middleware
 * Policy 7 — Strips HTML/script tags and rejects values > 2048 chars
 */
const MAX_FIELD_LENGTH = 2048;

function sanitizeValue(val) {
  if (typeof val === 'string') {
    return val.replace(/<[^>]*>?/gm, '');
  }
  return val;
}

function checkAndSanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      if (val.length > MAX_FIELD_LENGTH) {
        const err = new Error(`Payload field "${key}" exceeds max length of ${MAX_FIELD_LENGTH} characters.`);
        err.statusCode = 413;
        throw err;
      }
      obj[key] = sanitizeValue(val);
    } else if (typeof val === 'object' && val !== null) {
      checkAndSanitize(val);
    }
  }
  return obj;
}

function inputSanitizer(req, res, next) {
  try {
    if (req.body) checkAndSanitize(req.body);
    if (req.query) checkAndSanitize(req.query);
    if (req.params) checkAndSanitize(req.params);
    next();
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: err.message,
    });
  }
}

module.exports = {
  inputSanitizer,
  MAX_FIELD_LENGTH,
};
