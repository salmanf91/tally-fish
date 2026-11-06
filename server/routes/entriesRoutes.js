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

// Create entry: Staff or Office (Validates party, vehicle, fish_types, computes net_kg)
router.post(
  '/',
  requireBranchRole(['staff', 'billingAdmin', 'staffAdmin', 'owner']),
  entriesController.createEntry
);

// Get single entry details
router.get(
  '/:id',
  requireBranchRole(),
  entriesController.getEntryById
);

// Update entry (Enforces rate locking: strictly blocks staff if rates are set)
router.put(
  '/:id',
  requireBranchRole(),
  entriesController.updateEntry
);

// =============================================================================
// RATES (/api/entries/:id/rates)
// =============================================================================

// Set rates: Office only (billingAdmin, staffAdmin, owner)
router.post(
  '/:id/rates',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  ratesController.setEntryRates
);

// Get entry rates: Office only (billingAdmin, staffAdmin, owner)
router.get(
  '/:id/rates',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  ratesController.getEntryRates
);

module.exports = router;
