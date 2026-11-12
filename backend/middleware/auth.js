const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

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
 * Middleware: Enforces branch context and exact role authorization
 * Reads the X-Branch-ID header and verifies user's role against allowedRoles
 * Directly checks explicit roles: 'staff', 'staffAdmin', 'owner', 'billingAdmin'
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
        SELECT ubr.role, b.is_active as branch_active, r.name as role_name, r.permissions
        FROM user_branch_roles ubr
        JOIN branches b ON b.id = ubr.branch_id
        LEFT JOIN roles r ON r.id = ubr.role
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

      const { role: userRole, branch_active, role_name, permissions: rawPermissions } = roleResult.rows[0];

      if (!branch_active) {
        return res.status(403).json({
          success: false,
          error: 'The requested branch is currently deactivated',
        });
      }

      const userPermissions = Array.isArray(rawPermissions)
        ? rawPermissions
        : typeof rawPermissions === 'string'
        ? JSON.parse(rawPermissions)
        : userRole === 'owner'
        ? ['*']
        : [];

      // Hybrid RBAC evaluation:
      // Allowed if:
      // 1. userRole === 'owner' (wildcard authority)
      // 2. OR userPermissions contains '*'
      // 3. OR allowedRoles includes userRole (backward compatibility with legacy role strings)
      // 4. OR allowedRoles matches any permission key assigned to the user
      if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
        const hasAccess =
          userRole === 'owner' ||
          userPermissions.includes('*') ||
          allowedRoles.includes(userRole) ||
          allowedRoles.some((reqPerm) => userPermissions.includes(reqPerm));

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error: `Access denied. Role "${role_name || userRole}" is not authorized for this action.`,
          });
        }
      }

      // Attach branch and RBAC context to request
      req.branchId = branchId;
      req.currentRole = userRole;
      req.roleName = role_name || userRole;
      req.userPermissions = userPermissions;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware: Requires a specific granular permission for the active branch
 */
function requirePermission(requiredPermission) {
  return requireBranchRole([requiredPermission]);
}

module.exports = {
  authenticateToken,
  requireBranchRole,
  requirePermission,
};
