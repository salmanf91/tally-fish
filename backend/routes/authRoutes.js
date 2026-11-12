const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireBranchRole } = require('../middleware/auth');

// Public route: Authenticate with username and 4-digit PIN
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticateToken, authController.getCurrentUser);
router.get('/branches', authenticateToken, authController.listBranches);

// User administration: Accessible to owner and billingAdmin
router.get(
  '/users',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin']),
  authController.listUsers
);

router.post(
  '/users',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin']),
  authController.createUser
);

router.put(
  '/users/:id',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin']),
  authController.updateUser
);

router.delete(
  '/users/:id',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin']),
  authController.deleteUser
);

router.post(
  '/reset-pin',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin']),
  authController.resetUserPin
);

// =============================================================================
// ROLES & HYBRID RBAC (/api/auth/roles & /api/auth/permissions)
// =============================================================================
router.get(
  '/roles',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin', 'roles:manage', 'accounts:manage']),
  authController.listRoles
);

router.get(
  '/permissions',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin', 'roles:manage', 'accounts:manage']),
  authController.listPermissions
);

router.post(
  '/roles',
  authenticateToken,
  requireBranchRole(['owner', 'roles:manage']),
  authController.createRole
);

router.put(
  '/roles/:id',
  authenticateToken,
  requireBranchRole(['owner', 'roles:manage']),
  authController.updateRole
);

router.delete(
  '/roles/:id',
  authenticateToken,
  requireBranchRole(['owner', 'roles:manage']),
  authController.deleteRole
);

module.exports = router;
