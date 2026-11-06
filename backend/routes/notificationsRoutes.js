const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const notificationsController = require('../controllers/notificationsController');

/**
 * @route   GET /api/notifications/vapid-key
 * @desc    Get server VAPID public key for browser push registration
 * @access  Public / Authenticated
 */
router.get('/vapid-key', notificationsController.getVapidKey);

/**
 * @route   POST /api/notifications/subscribe
 * @desc    Register or update client device push subscription linked to (user_id, branch_id)
 * @access  Authenticated
 */
router.post('/subscribe', authenticateToken, notificationsController.subscribe);

module.exports = router;

