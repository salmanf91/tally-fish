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

// Quick-create on the fly
router.post(
  '/parties',
  requireBranchRole(['staffAdmin', 'billingAdmin', 'owner']),
  mastersController.createParty
);

// Curation/updating by office
router.put(
  '/parties/:id',
  requireBranchRole(['billingAdmin', 'owner']),
  mastersController.updateParty
);

// Full merging (billingAdmin and owner)
router.post(
  '/parties/merge',
  requireBranchRole(['billingAdmin', 'owner']),
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

// Quick-create on the fly
router.post(
  '/vehicles',
  requireBranchRole(['staffAdmin', 'billingAdmin', 'owner']),
  mastersController.createVehicle
);

// Curation/updating by office
router.put(
  '/vehicles/:id',
  requireBranchRole(['billingAdmin', 'owner']),
  mastersController.updateVehicle
);

// Full merging
router.post(
  '/vehicles/merge',
  requireBranchRole(['billingAdmin', 'owner']),
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

// Quick-create on the fly
router.post(
  '/fish-types',
  requireBranchRole(['staffAdmin', 'billingAdmin', 'owner']),
  mastersController.createFishType
);

// Curation/updating by office
router.put(
  '/fish-types/:id',
  requireBranchRole(['billingAdmin', 'owner']),
  mastersController.updateFishType
);

// Full merging
router.post(
  '/fish-types/merge',
  requireBranchRole(['billingAdmin', 'owner']),
  mastersController.mergeFishTypes
);

module.exports = router;
