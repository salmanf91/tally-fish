const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const mastersRoutes = require('./mastersRoutes');
const entriesRoutes = require('./entriesRoutes');

router.use('/auth', authRoutes);
router.use('/masters', mastersRoutes);
router.use('/entries', entriesRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'tally-fish-backend',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
