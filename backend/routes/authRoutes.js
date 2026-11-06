const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireBranchRole } = require('../middleware/auth');

// Public route: Authenticate with username and 4-digit PIN
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticateToken, authController.getCurrentUser);

// User administration: Accessible to owner, billingAdmin, and staffAdmin
router.post(
  '/users',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  authController.createUser
);

router.post(
  '/reset-pin',
  authenticateToken,
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  authController.resetUserPin
);

module.exports = router;
