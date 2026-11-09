/**
 * Upload Security Middleware & Validation Utilities
 * Policy 8 — Multi-layer file upload defense (CWE-434)
 */

const DANGEROUS_PDF_PATTERNS = [
  /\/JS/i,
  /\/JavaScript/i,
  /\/AA/i,
  /\/OpenAction/i,
  /\/Launch/i,
  /\/EmbeddedFile/i,
  /\/XFA/i,
  /\/RichMedia/i,
  /\/SubmitForm/i,
  /\/ImportData/i,
];

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];

/**
 * Filter function for file uploads:
 * Rejects double extensions, unauthorized MIME types, and unsupported extensions
 */
function strictFileFilter(req, file, cb) {
  const originalName = file.originalname || '';
  const parts = originalName.split('.');

  // Dangerous double extension check (e.g. shell.php.jpg)
  if (parts.length > 2) {
    const dangerousExts = ['php', 'js', 'exe', 'sh', 'bat', 'cmd', 'py', 'pl', 'jsp', 'asp', 'cgi'];
    const innerExt = parts[parts.length - 2].toLowerCase();
    if (dangerousExts.includes(innerExt)) {
      return cb(new Error('Dangerous multi-extension detected.'), false);
    }
  }

  const ext = parts.pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`Extension .${ext} is not allowed. Only .jpg, .jpeg, .png, .pdf`), false);
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(`MIME type ${file.mimetype} is not allowed.`), false);
  }

  cb(null, true);
}

/**
 * PDF Content Scanner to detect active scripts / dangerous actions
 */
function scanPdfBuffer(buffer) {
  const content = buffer.toString('latin1');
  for (const pattern of DANGEROUS_PDF_PATTERNS) {
    if (pattern.test(content)) {
      return {
        safe: false,
        threat: pattern.toString(),
      };
    }
  }
  return { safe: true };
}

module.exports = {
  strictFileFilter,
  scanPdfBuffer,
  DANGEROUS_PDF_PATTERNS,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
};

