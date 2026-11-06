const express = require('express');
const router = express.Router();
const entriesController = require('../controllers/entriesController');
const ratesController = require('../controllers/ratesController');
const { authenticateToken, requireBranchRole } = require('../middleware/auth');

// All entry routes require token authentication
router.use(authenticateToken);

// =============================================================================
// ENTRIES (/api/entries)
// =============================================================================

// List purchase entries for the current branch
router.get(
  '/',
  requireBranchRole(),
  entriesController.getEntries
);

// Create entry: staffAdmin, billingAdmin, or owner (computes net_kg)
router.post(
  '/',
  requireBranchRole(['staffAdmin', 'billingAdmin', 'owner']),
  entriesController.createEntry
);

// Get single entry details
router.get(
  '/:id',
  requireBranchRole(),
  entriesController.getEntryById
);

// Update entry (Enforces rate locking: strictly blocks staffAdmin if rates are set)
router.put(
  '/:id',
  requireBranchRole(),
  entriesController.updateEntry
);

// =============================================================================
// RATES (/api/entries/:id/rates)
// =============================================================================

// Set rates: Office only (billingAdmin, owner)
router.post(
  '/:id/rates',
  requireBranchRole(['billingAdmin', 'owner']),
  ratesController.setEntryRates
);

// Get entry rates: Office only (billingAdmin, owner)
router.get(
  '/:id/rates',
  requireBranchRole(['billingAdmin', 'owner']),
  ratesController.getEntryRates
);

module.exports = router;
