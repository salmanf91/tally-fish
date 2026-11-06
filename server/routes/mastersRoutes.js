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

// Quick-create by Staff on the fly OR curated creation by office
router.post(
  '/parties',
  requireBranchRole(['staff', 'billingAdmin', 'staffAdmin', 'owner']),
  mastersController.createParty
);

// Curation/updating by office
router.put(
  '/parties/:id',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  mastersController.updateParty
);

// Full merging (accessible to owner, billingAdmin, and staffAdmin)
router.post(
  '/parties/merge',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
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

// Quick-create by Staff on the fly OR curated creation by office
router.post(
  '/vehicles',
  requireBranchRole(['staff', 'billingAdmin', 'staffAdmin', 'owner']),
  mastersController.createVehicle
);

// Curation/updating by office
router.put(
  '/vehicles/:id',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  mastersController.updateVehicle
);

// Full merging
router.post(
  '/vehicles/merge',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
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

// Quick-create by Staff on the fly OR curated creation by office
router.post(
  '/fish-types',
  requireBranchRole(['staff', 'billingAdmin', 'staffAdmin', 'owner']),
  mastersController.createFishType
);

// Curation/updating by office
router.put(
  '/fish-types/:id',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  mastersController.updateFishType
);

// Full merging
router.post(
  '/fish-types/merge',
  requireBranchRole(['owner', 'billingAdmin', 'staffAdmin']),
  mastersController.mergeFishTypes
);

module.exports = router;
