const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireBranchRole } = require('../middleware/auth');

// Public route: Authenticate with username and 4-digit PIN
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticateToken, authController.getCurrentUser);

// Admin user administration
router.post(
  '/users',
  authenticateToken,
  requireBranchRole(['admin', 'staffAdmin', 'owner']),
  authController.createUser
);

router.post(
  '/reset-pin',
  authenticateToken,
  requireBranchRole(['admin', 'staffAdmin', 'owner']),
  authController.resetUserPin
);

module.exports = router;

