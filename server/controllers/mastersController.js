const db = require('../db');
const { recordAuditLog } = require('../utils/auditLogger');

// =============================================================================
// PARTIES CONTROLLER
// =============================================================================

/**
 * GET /api/masters/parties
 * List parties accessible to the current branch (branch-specific + global company-wide)
 */
async function listParties(req, res, next) {
  try {
    const branchId = req.branchId;
    const { q, is_active } = req.query;

    let sql = `
      SELECT id, branch_id, name, code, phone, is_active, created_at, updated_at
      FROM parties
      WHERE (branch_id = $1 OR branch_id IS NULL)
    `;
    const params = [branchId];

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      sql += ` AND is_active = $${params.length}`;
    }

    if (q) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }

    sql += ` ORDER BY name ASC`;

    const result = await db.query(sql, params);
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/masters/parties
 * Quick-creation by Staff on the fly OR curated creation by Admin
 */
async function createParty(req, res, next) {
  try {
    const { name, code, phone, branch_id, is_active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Party name is required' });
    }

    // If staff creates: automatically scope to current branch
    // If admin creates: allow global (null) or specified branch
    const effectiveBranchId =
      req.currentRole === 'staffAdmin'
        ? req.branchId
        : branch_id !== undefined
        ? branch_id
        : req.branchId;

    const result = await db.query(
      `
      INSERT INTO parties (id, branch_id, name, code, phone, is_active)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        effectiveBranchId || null,
        name.trim(),
        code ? code.trim() : null,
        phone ? phone.trim() : null,
        is_active !== undefined ? is_active : true,
      ]
    );

    const newParty = result.rows[0];

    await recordAuditLog({
      actorId: req.user.id,
      branchId: req.branchId,
      action: 'MASTER_PARTY_CREATED',
      entityType: 'parties',
      entityId: newParty.id,
      diffs: { new: newParty, created_by_role: req.currentRole },
      ipAddress: req.ip,
    });

    return res.status(201).json({ success: true, data: newParty });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: `A party with name "${req.body.name}" already exists for this branch/scope`,
      });
    }
    next(err);
  }
}

/**
 * PUT /api/masters/parties/:id
 * Full curation by Admin / Billing
 */
async function updateParty(req, res, next) {
  try {
    const { id } = req.params;
    const { name, code, phone, branch_id, is_active } = req.body;

    const existingRes = await db.query('SELECT * FROM parties WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }
    const oldParty = existingRes.rows[0];

    const result = await db.query(
      `
      UPDATE parties
      SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        phone = COALESCE($3, phone),
        branch_id = CASE WHEN $4 IS NOT NULL THEN $4 ELSE branch_id END,
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
      `,
      [
        name ? name.trim() : null,
        code !== undefined ? (code ? code.trim() : null) : null,
        phone !== undefined ? (phone ? phone.trim() : null) : null,
        branch_id,
        is_active,
        id,
      ]
    );

    const updatedParty = result.rows[0];

    await recordAuditLog({
      actorId: req.user.id,
      branchId: req.branchId,
      action: 'MASTER_PARTY_UPDATED',
      entityType: 'parties',
      entityId: id,
      diffs: { old: oldParty, new: updatedParty },
      ipAddress: req.ip,
    });

    return res.status(200).json({ success: true, data: updatedParty });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Another party with this name already exists in the same scope',
      });
    }
    next(err);
  }
}

/**
 * POST /api/masters/parties/merge
 * Full curation / merging by Admin: Merges duplicate parties into a canonical target party
 */
async function mergeParties(req, res, next) {
  try {
    const { sourcePartyId, targetPartyId } = req.body;

    if (!sourcePartyId || !targetPartyId) {
      return res.status(400).json({
        success: false,
        error: 'Both sourcePartyId and targetPartyId are required for merge',
      });
    }

    if (sourcePartyId === targetPartyId) {
      return res.status(400).json({
        success: false,
        error: 'Source and target parties cannot be the same',
      });
    }

    const mergeResult = await db.withTransaction(async (client) => {
      // Verify both parties exist
      const sourceRes = await client.query('SELECT * FROM parties WHERE id = $1', [sourcePartyId]);
      const targetRes = await client.query('SELECT * FROM parties WHERE id = $1', [targetPartyId]);

      if (sourceRes.rows.length === 0 || targetRes.rows.length === 0) {
        throw new Error('One or both parties not found for merge');
      }

      const sourceParty = sourceRes.rows[0];
      const targetParty = targetRes.rows[0];

      // Reassign entries referencing source to target
      const entriesUpdated = await client.query(
        'UPDATE entries SET party_id = $1, party_name = $2 WHERE party_id = $3 RETURNING id',
        [targetParty.id, targetParty.name, sourceParty.id]
      );

      // Reassign vehicles referencing source to target
      const vehiclesUpdated = await client.query(
        'UPDATE vehicles SET party_id = $1 WHERE party_id = $2 RETURNING id',
        [targetParty.id, sourceParty.id]
      );

      // Mark source party inactive
      await client.query(
        'UPDATE parties SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [sourceParty.id]
      );

      // Immutable audit log
      await recordAuditLog(
        {
          actorId: req.user.id,
          branchId: req.branchId,
          action: 'MASTER_PARTY_MERGED',
          entityType: 'parties',
          entityId: targetParty.id,
          diffs: {
            sourceParty: sourceParty,
            targetParty: targetParty,
            reassigned_entries: entriesUpdated.rows.length,
            reassigned_vehicles: vehiclesUpdated.rows.length,
          },
          ipAddress: req.ip,
        },
        client
      );

      return {
        sourceParty,
        targetParty,
        reassignedEntries: entriesUpdated.rows.length,
        reassignedVehicles: vehiclesUpdated.rows.length,
      };
    }, { actorId: req.user.id, branchId: req.branchId });

    return res.status(200).json({
      success: true,
      message: `Successfully merged "${mergeResult.sourceParty.name}" into "${mergeResult.targetParty.name}".`,
      data: mergeResult,
    });
  } catch (err) {
    next(err);
  }
}

// =============================================================================
// VEHICLES CONTROLLER
// =============================================================================

/**
 * GET /api/masters/vehicles
 */
async function listVehicles(req, res, next) {
  try {
    const branchId = req.branchId;
    const { q, party_id, is_active } = req.query;

    let sql = `
      SELECT v.id, v.branch_id, v.vehicle_no, v.party_id, p.name as party_name,
             v.notes, v.is_active, v.created_at, v.updated_at
      FROM vehicles v
      LEFT JOIN parties p ON p.id = v.party_id
      WHERE (v.branch_id = $1 OR v.branch_id IS NULL)
    `;
    const params = [branchId];

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      sql += ` AND v.is_active = $${params.length}`;
    }

    if (party_id) {
      params.push(party_id);
      sql += ` AND v.party_id = $${params.length}`;
    }

    if (q) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (v.vehicle_no ILIKE $${params.length} OR p.name ILIKE $${params.length})`;
    }

    sql += ` ORDER BY v.vehicle_no ASC`;

    const result = await db.query(sql, params);
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/masters/vehicles
 * Quick-creation by Staff on the fly OR curated creation by Admin
 */
async function createVehicle(req, res, next) {
  try {
    const { vehicle_no, party_id, notes, branch_id, is_active } = req.body;

    if (!vehicle_no || !vehicle_no.trim()) {
      return res.status(400).json({ success: false, error: 'vehicle_no is required' });
    }

    const effectiveBranchId =
      req.currentRole === 'staffAdmin'
        ? req.branchId
        : branch_id !== undefined
        ? branch_id
        : req.branchId;

    const result = await db.query(
      `
      INSERT INTO vehicles (id, branch_id, vehicle_no, party_id, notes, is_active)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        effectiveBranchId || null,
        vehicle_no.trim().toUpperCase(),
        party_id || null,
        notes || null,
        is_active !== undefined ? is_active : true,
      ]
    );

    const newVehicle = result.rows[0];

    await recordAuditLog({
      actorId: req.user.id,
      branchId: req.branchId,
      action: 'MASTER_VEHICLE_CREATED',
      entityType: 'vehicles',
      entityId: newVehicle.id,
      diffs: { new: newVehicle, created_by_role: req.currentRole },
      ipAddress: req.ip,
    });

    return res.status(201).json({ success: true, data: newVehicle });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: `Vehicle number "${req.body.vehicle_no}" already exists in this scope`,
      });
    }
    next(err);
  }
}

/**
 * PUT /api/masters/vehicles/:id
 */
async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    const { vehicle_no, party_id, notes, branch_id, is_active } = req.body;

    const existingRes = await db.query('SELECT * FROM vehicles WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    const oldVehicle = existingRes.rows[0];

    const result = await db.query(
      `
      UPDATE vehicles
      SET
        vehicle_no = COALESCE($1, vehicle_no),
        party_id = CASE WHEN $2 IS NOT NULL THEN $2 ELSE party_id END,
        notes = COALESCE($3, notes),
        branch_id = CASE WHEN $4 IS NOT NULL THEN $4 ELSE branch_id END,
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
      `,
      [
        vehicle_no ? vehicle_no.trim().toUpperCase() : null,
        party_id,
        notes,
        branch_id,
        is_active,
        id,
      ]
    );

    const updatedVehicle = result.rows[0];

    await recordAuditLog({
      actorId: req.user.id,
      branchId: req.branchId,
      action: 'MASTER_VEHICLE_UPDATED',
      entityType: 'vehicles',
      entityId: id,
      diffs: { old: oldVehicle, new: updatedVehicle },
      ipAddress: req.ip,
    });

    return res.status(200).json({ success: true, data: updatedVehicle });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Another vehicle with this registration number already exists',
      });
    }
    next(err);
  }
}

/**
 * POST /api/masters/vehicles/merge
 * Admin only: Merges duplicate vehicles
 */
async function mergeVehicles(req, res, next) {
  try {
    const { sourceVehicleId, targetVehicleId } = req.body;

    if (!sourceVehicleId || !targetVehicleId) {
      return res.status(400).json({
        success: false,
        error: 'Both sourceVehicleId and targetVehicleId are required for merge',
      });
    }

    if (sourceVehicleId === targetVehicleId) {
      return res.status(400).json({
        success: false,
        error: 'Source and target vehicles cannot be the same',
      });
    }

    const mergeResult = await db.withTransaction(async (client) => {
      const sourceRes = await client.query('SELECT * FROM vehicles WHERE id = $1', [sourceVehicleId]);
      const targetRes = await client.query('SELECT * FROM vehicles WHERE id = $1', [targetVehicleId]);

      if (sourceRes.rows.length === 0 || targetRes.rows.length === 0) {
        throw new Error('One or both vehicles not found for merge');
      }

      const sourceVehicle = sourceRes.rows[0];
      const targetVehicle = targetRes.rows[0];

      // Update entries referencing source to target
      const entriesUpdated = await client.query(
        'UPDATE entries SET vehicle_id = $1, vehicle_no = $2 WHERE vehicle_id = $3 RETURNING id',
        [targetVehicle.id, targetVehicle.vehicle_no, sourceVehicle.id]
      );

      // Deactivate source vehicle
      await client.query(
        'UPDATE vehicles SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [sourceVehicle.id]
      );

      await recordAuditLog(
        {
          actorId: req.user.id,
          branchId: req.branchId,
          action: 'MASTER_VEHICLE_MERGED',
          entityType: 'vehicles',
          entityId: targetVehicle.id,
          diffs: {
            sourceVehicle,
            targetVehicle,
            reassigned_entries: entriesUpdated.rows.length,
          },
          ipAddress: req.ip,
        },
        client
      );

      return {
        sourceVehicle,
        targetVehicle,
        reassignedEntries: entriesUpdated.rows.length,
      };
    }, { actorId: req.user.id, branchId: req.branchId });

    return res.status(200).json({
      success: true,
      message: `Successfully merged vehicle "${mergeResult.sourceVehicle.vehicle_no}" into "${mergeResult.targetVehicle.vehicle_no}".`,
      data: mergeResult,
    });
  } catch (err) {
    next(err);
  }
}

// =============================================================================
// FISH TYPES CONTROLLER
// =============================================================================

/**
 * GET /api/masters/fish-types
 */
async function listFishTypes(req, res, next) {
  try {
    const branchId = req.branchId;
    const { q, is_active } = req.query;

    let sql = `
      SELECT id, branch_id, name, code, default_rate, is_active, created_at, updated_at
      FROM fish_types
      WHERE (branch_id = $1 OR branch_id IS NULL)
    `;
    const params = [branchId];

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      sql += ` AND is_active = $${params.length}`;
    }

    if (q) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`;
    }

    sql += ` ORDER BY name ASC`;

    const result = await db.query(sql, params);
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/masters/fish-types
 * Quick-creation by Staff on the fly OR curated creation by Admin
 */
async function createFishType(req, res, next) {
  try {
    const { name, code, default_rate, branch_id, is_active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Fish type name is required' });
    }

    const effectiveBranchId =
      req.currentRole === 'staffAdmin'
        ? req.branchId
        : branch_id !== undefined
        ? branch_id
        : req.branchId;

    const result = await db.query(
      `
      INSERT INTO fish_types (id, branch_id, name, code, default_rate, is_active)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        effectiveBranchId || null,
        name.trim().toUpperCase(),
        code ? code.trim() : null,
        default_rate !== undefined ? default_rate : 0.00,
        is_active !== undefined ? is_active : true,
      ]
    );

    const newFishType = result.rows[0];

    await recordAuditLog({
      actorId: req.user.id,
      branchId: req.branchId,
      action: 'MASTER_FISH_TYPE_CREATED',
      entityType: 'fish_types',
      entityId: newFishType.id,
      diffs: { new: newFishType, created_by_role: req.currentRole },
      ipAddress: req.ip,
    });

    return res.status(201).json({ success: true, data: newFishType });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: `Fish species "${req.body.name}" already exists in this scope`,
      });
    }
    next(err);
  }
}

/**
 * PUT /api/masters/fish-types/:id
 */
async function updateFishType(req, res, next) {
  try {
    const { id } = req.params;
    const { name, code, default_rate, branch_id, is_active } = req.body;

    const existingRes = await db.query('SELECT * FROM fish_types WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Fish type not found' });
    }
    const oldFishType = existingRes.rows[0];

    const result = await db.query(
      `
      UPDATE fish_types
      SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        default_rate = COALESCE($3, default_rate),
        branch_id = CASE WHEN $4 IS NOT NULL THEN $4 ELSE branch_id END,
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
      `,
      [
        name ? name.trim().toUpperCase() : null,
        code !== undefined ? (code ? code.trim() : null) : null,
        default_rate,
        branch_id,
        is_active,
        id,
      ]
    );

    const updatedFishType = result.rows[0];

    await recordAuditLog({
      actorId: req.user.id,
      branchId: req.branchId,
      action: 'MASTER_FISH_TYPE_UPDATED',
      entityType: 'fish_types',
      entityId: id,
      diffs: { old: oldFishType, new: updatedFishType },
      ipAddress: req.ip,
    });

    return res.status(200).json({ success: true, data: updatedFishType });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Another fish species with this name already exists in this scope',
      });
    }
    next(err);
  }
}

/**
 * POST /api/masters/fish-types/merge
 * Admin only: Merges duplicate fish species
 */
async function mergeFishTypes(req, res, next) {
  try {
    const { sourceFishTypeId, targetFishTypeId } = req.body;

    if (!sourceFishTypeId || !targetFishTypeId) {
      return res.status(400).json({
        success: false,
        error: 'Both sourceFishTypeId and targetFishTypeId are required for merge',
      });
    }

    if (sourceFishTypeId === targetFishTypeId) {
      return res.status(400).json({
        success: false,
        error: 'Source and target fish types cannot be the same',
      });
    }

    const mergeResult = await db.withTransaction(async (client) => {
      const sourceRes = await client.query('SELECT * FROM fish_types WHERE id = $1', [sourceFishTypeId]);
      const targetRes = await client.query('SELECT * FROM fish_types WHERE id = $1', [targetFishTypeId]);

      if (sourceRes.rows.length === 0 || targetRes.rows.length === 0) {
        throw new Error('One or both fish types not found for merge');
      }

      const sourceFish = sourceRes.rows[0];
      const targetFish = targetRes.rows[0];

      // Reassign entry_boxes referencing source to target
      const boxesUpdated = await client.query(
        'UPDATE entry_boxes SET fish_type_id = $1, fish_name = $2 WHERE fish_type_id = $3 RETURNING id',
        [targetFish.id, targetFish.name, sourceFish.id]
      );

      // Reassign entry_rates referencing source to target (avoid duplicate fish_name on same entry)
      await client.query(
        `
        UPDATE entry_rates
        SET fish_type_id = $1, fish_name = $2
        WHERE fish_type_id = $3
          AND entry_id NOT IN (SELECT entry_id FROM entry_rates WHERE fish_type_id = $1)
        `,
        [targetFish.id, targetFish.name, sourceFish.id]
      );

      // Deactivate source fish type
      await client.query(
        'UPDATE fish_types SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [sourceFish.id]
      );

      await recordAuditLog(
        {
          actorId: req.user.id,
          branchId: req.branchId,
          action: 'MASTER_FISH_TYPE_MERGED',
          entityType: 'fish_types',
          entityId: targetFish.id,
          diffs: {
            sourceFish,
            targetFish,
            reassigned_boxes: boxesUpdated.rows.length,
          },
          ipAddress: req.ip,
        },
        client
      );

      return {
        sourceFish,
        targetFish,
        reassignedBoxes: boxesUpdated.rows.length,
      };
    }, { actorId: req.user.id, branchId: req.branchId });

    return res.status(200).json({
      success: true,
      message: `Successfully merged fish species "${mergeResult.sourceFish.name}" into "${mergeResult.targetFish.name}".`,
      data: mergeResult,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Parties
  listParties,
  createParty,
  updateParty,
  mergeParties,

  // Vehicles
  listVehicles,
  createVehicle,
  updateVehicle,
  mergeVehicles,

  // Fish Types
  listFishTypes,
  createFishType,
  updateFishType,
  mergeFishTypes,
};

