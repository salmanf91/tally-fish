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

// Create entry: Staff or Admin (Validates party, vehicle, fish_types, computes net_kg)
router.post(
  '/',
  requireBranchRole(['staff', 'admin', 'staffAdmin', 'owner']),
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

// Set rates: Admin / Billing only (Enforces locking, calculates weighted averages)
router.post(
  '/:id/rates',
  requireBranchRole(['admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  ratesController.setEntryRates
);

// Get entry rates: Admin / Billing only
router.get(
  '/:id/rates',
  requireBranchRole(['admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  ratesController.getEntryRates
);

module.exports = router;
