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

module.exports = router;
