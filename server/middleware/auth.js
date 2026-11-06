const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

/**
 * Standardizes role names between API aliases and database values
 * Matches 'staffAdmin', 'owner', 'admin' -> 'admin'
 * Matches 'billingAdmin', 'billing' -> 'billing'
 * Matches 'staff' -> 'staff'
 */
const CANONICAL_ROLE_MAP = {
  staffadmin: 'admin',
  owner: 'admin',
  admin: 'admin',
  billingadmin: 'billing',
  billing: 'billing',
  staff: 'staff',
};

function normalizeRole(role) {
  if (!role) return '';
  const key = String(role).trim().toLowerCase();
  return CANONICAL_ROLE_MAP[key] || key;
}

/**
 * Middleware: Verifies JWT token and attaches authenticated user to req.user
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication token required (Bearer <token>)',
    });
  }

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token',
      });
    }
    req.user = user;
    next();
  });
}

/**
 * Middleware: Enforces branch context and role requirements
 * Reads the X-Branch-ID header and verifies user's role against allowedRoles
 *
 * Example: requireBranchRole(['staffAdmin', 'owner', 'billingAdmin'])
 *
 * @param {Array<string>} [allowedRoles=[]] - Allowed roles for this endpoint
 */
function requireBranchRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required before branch authorization',
        });
      }

      // Read branch ID from header (case-insensitive) or query/body fallback safely
      const branchId =
        req.headers['x-branch-id'] ||
        req.headers['x-branch-id'.toLowerCase()] ||
        (req.query && req.query.branch_id) ||
        (req.body && req.body.branch_id);

      if (!branchId) {
        return res.status(400).json({
          success: false,
          error: 'X-Branch-ID header is required for this operation',
        });
      }

      // Check if user has an active role in this branch
      const roleResult = await db.query(
        `
        SELECT ubr.role, b.is_active as branch_active
        FROM user_branch_roles ubr
        JOIN branches b ON b.id = ubr.branch_id
        WHERE ubr.user_id = $1 AND ubr.branch_id = $2
        `,
        [req.user.id, branchId]
      );

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'User does not have access permissions for the requested branch',
        });
      }

      const { role: userRole, branch_active } = roleResult.rows[0];

      if (!branch_active) {
        return res.status(403).json({
          success: false,
          error: 'The requested branch is currently deactivated',
        });
      }

      // Check role authorization if specific roles were specified
      if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
        const canonicalUserRole = normalizeRole(userRole);
        const canonicalAllowed = allowedRoles.map(normalizeRole);

        const hasPermission =
          canonicalAllowed.includes(canonicalUserRole) ||
          allowedRoles.includes(userRole);

        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            error: `Access denied. Role "${userRole}" is not authorized for this action. Allowed: [${allowedRoles.join(', ')}]`,
          });
        }
      }

      // Attach branch context to request
      req.branchId = branchId;
      req.currentRole = userRole;
      req.canonicalRole = normalizeRole(userRole);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  authenticateToken,
  requireBranchRole,
  normalizeRole,
};
