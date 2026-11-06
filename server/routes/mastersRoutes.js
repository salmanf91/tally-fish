const express = require('express');
const router = express.Router();
const mastersController = require('../controllers/mastersController');
const { authenticateToken, requireBranchRole } = require('../middleware/auth');

// All master routes require token authentication
router.use(authenticateToken);

// =============================================================================
// PARTIES (/api/masters/parties)
// =============================================================================
// List parties (accessible to all authenticated roles for current branch)
router.get(
  '/parties',
  requireBranchRole(),
  mastersController.listParties
);

// Quick-create by Staff on the fly OR curated creation by Admin
router.post(
  '/parties',
  requireBranchRole(['staff', 'admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  mastersController.createParty
);

// Curation/updating by Admin or Billing
router.put(
  '/parties/:id',
  requireBranchRole(['admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  mastersController.updateParty
);

// Full merging by Admin
router.post(
  '/parties/merge',
  requireBranchRole(['admin', 'staffAdmin', 'owner']),
  mastersController.mergeParties
);

// =============================================================================
// VEHICLES (/api/masters/vehicles)
// =============================================================================
// List vehicles
router.get(
  '/vehicles',
  requireBranchRole(),
  mastersController.listVehicles
);

// Quick-create by Staff on the fly OR curated creation by Admin
router.post(
  '/vehicles',
  requireBranchRole(['staff', 'admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  mastersController.createVehicle
);

// Curation/updating by Admin or Billing
router.put(
  '/vehicles/:id',
  requireBranchRole(['admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  mastersController.updateVehicle
);

// Full merging by Admin
router.post(
  '/vehicles/merge',
  requireBranchRole(['admin', 'staffAdmin', 'owner']),
  mastersController.mergeVehicles
);

// =============================================================================
// FISH TYPES (/api/masters/fish-types)
// =============================================================================
// List fish types
router.get(
  '/fish-types',
  requireBranchRole(),
  mastersController.listFishTypes
);

// Quick-create by Staff on the fly OR curated creation by Admin
router.post(
  '/fish-types',
  requireBranchRole(['staff', 'admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  mastersController.createFishType
);

// Curation/updating by Admin or Billing
router.put(
  '/fish-types/:id',
  requireBranchRole(['admin', 'staffAdmin', 'owner', 'billing', 'billingAdmin']),
  mastersController.updateFishType
);

// Full merging by Admin
router.post(
  '/fish-types/merge',
  requireBranchRole(['admin', 'staffAdmin', 'owner']),
  mastersController.mergeFishTypes
);

module.exports = router;
