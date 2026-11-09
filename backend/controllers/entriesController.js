const db = require('../db');
const {
  calculateNetWeight,
  validateBoxMixPercentages,
  generateNarrativeRemarks,
  calculateWeightedAverageRate,
} = require('../utils/calculations');
const { recordAuditLog } = require('../utils/auditLogger');
const { eventBus } = require('../notifications');

/**
 * POST /api/entries
 * Creates a new purchase entry with boxes and computes net_kg
 */
async function createEntry(req, res, next) {
  try {
    const branchId = req.branchId;
    const actorId = req.user.id;

    const {
      entry_date,
      party_id,
      party_name,
      vehicle_id,
      vehicle_no,
      gross_loaded_kg,
      empty_tare_kg,
      ice_water_kg,
      c_value,
      remarks,
      status,
      boxes,
    } = req.body;

    // Validate weights and compute net_kg
    const loaded = Number(gross_loaded_kg) || 0;
    const empty = Number(empty_tare_kg) || 0;
    const ice = Number(ice_water_kg) || 0;
    const netKg = calculateNetWeight(loaded, empty, ice);

    if (loaded < 0 || empty < 0 || ice < 0) {
      return res.status(400).json({
        success: false,
        error: 'Weight figures cannot be negative',
      });
    }

    if (netKg < 0) {
      return res.status(400).json({
        success: false,
        error: `Net weight cannot be negative. Computed net: ${netKg} kg (Loaded: ${loaded}, Empty: ${empty}, Ice: ${ice})`,
      });
    }

    // Validate boxes
    if (!Array.isArray(boxes) || boxes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one fish box specification is required',
      });
    }

    const boxValidation = validateBoxMixPercentages(boxes);
    if (!boxValidation.valid) {
      return res.status(400).json({
        success: false,
        error: boxValidation.error,
      });
    }

    const targetDate = entry_date ? entry_date : new Date().toISOString().split('T')[0];

    const entryResult = await db.withTransaction(async (client) => {
      // 1. Resolve or validate Party
      let resolvedPartyId = party_id || null;
      let resolvedPartyName = party_name ? party_name.trim() : null;

      if (resolvedPartyId) {
        const partyCheck = await client.query(
          'SELECT id, name FROM parties WHERE id = $1 AND (branch_id = $2 OR branch_id IS NULL)',
          [resolvedPartyId, branchId]
        );
        if (partyCheck.rows.length === 0) {
          throw new Error(`Party ID "${resolvedPartyId}" not found or not accessible to this branch`);
        }
        resolvedPartyName = partyCheck.rows[0].name;
      } else if (resolvedPartyName) {
        // Quick auto-resolve or auto-create party
        const partyLookup = await client.query(
          'SELECT id, name FROM parties WHERE LOWER(name) = LOWER($1) AND (branch_id = $2 OR branch_id IS NULL) LIMIT 1',
          [resolvedPartyName, branchId]
        );
        if (partyLookup.rows.length > 0) {
          resolvedPartyId = partyLookup.rows[0].id;
          resolvedPartyName = partyLookup.rows[0].name;
        } else {
          throw new Error(`Party "${resolvedPartyName}" not found in masters. Please select a registered vendor or create it via Master Data.`);
        }
      } else {
        throw new Error('Either party_id or party_name must be provided');
      }

      // 2. Resolve or validate Vehicle
      let resolvedVehicleId = vehicle_id || null;
      let resolvedVehicleNo = vehicle_no ? vehicle_no.trim().toUpperCase() : null;

      if (resolvedVehicleId) {
        const vehicleCheck = await client.query(
          'SELECT id, vehicle_no FROM vehicles WHERE id = $1 AND (branch_id = $2 OR branch_id IS NULL)',
          [resolvedVehicleId, branchId]
        );
        if (vehicleCheck.rows.length === 0) {
          throw new Error(`Vehicle ID "${resolvedVehicleId}" not found or not accessible to this branch`);
        }
        resolvedVehicleNo = vehicleCheck.rows[0].vehicle_no;
      } else if (resolvedVehicleNo) {
        const vehicleLookup = await client.query(
          'SELECT id, vehicle_no FROM vehicles WHERE LOWER(vehicle_no) = LOWER($1) AND (branch_id = $2 OR branch_id IS NULL) LIMIT 1',
          [resolvedVehicleNo, branchId]
        );
        if (vehicleLookup.rows.length > 0) {
          resolvedVehicleId = vehicleLookup.rows[0].id;
          resolvedVehicleNo = vehicleLookup.rows[0].vehicle_no;
        } else {
          throw new Error(`Vehicle "${resolvedVehicleNo}" not found in masters. Please register the vehicle via Master Data.`);
        }
      } else {
        throw new Error('Either vehicle_id or vehicle_no must be provided');
      }

      // 3. Resolve and validate Fish Types for all boxes
      const validatedBoxes = [];
      for (const box of boxes) {
        let fId = box.fish_type_id || null;
        let fName = box.fish_name ? box.fish_name.trim().toUpperCase() : null;

        if (fId) {
          const fishCheck = await client.query(
            'SELECT id, name FROM fish_types WHERE id = $1 AND (branch_id = $2 OR branch_id IS NULL)',
            [fId, branchId]
          );
          if (fishCheck.rows.length === 0) {
            throw new Error(`Fish Type ID "${fId}" not found in catalog`);
          }
          fName = fishCheck.rows[0].name;
        } else if (fName) {
          const fishLookup = await client.query(
            'SELECT id, name FROM fish_types WHERE LOWER(name) = LOWER($1) AND (branch_id = $2 OR branch_id IS NULL) LIMIT 1',
            [fName, branchId]
          );
          if (fishLookup.rows.length > 0) {
            fId = fishLookup.rows[0].id;
            fName = fishLookup.rows[0].name;
          } else {
            throw new Error(`Fish species "${fName}" not found in catalog. Please select a registered species or add it via Master Data.`);
          }
        } else {
          throw new Error('Fish specification requires fish_type_id or fish_name');
        }

        validatedBoxes.push({
          fish_type_id: fId,
          fish_name: fName,
          box_count: parseInt(box.box_count, 10),
          mix_percentage: parseFloat(box.mix_percentage) || 100.00,
        });
      }

      // 4. Determine next atomic serial number for (branch_id, entry_date)
      const serialRes = await client.query(
        `
        SELECT COALESCE(MAX(daily_sl_no), 0) + 1 AS next_sl_no
        FROM entries
        WHERE branch_id = $1 AND entry_date = $2
        `,
        [branchId, targetDate]
      );
      const dailySlNo = parseInt(serialRes.rows[0].next_sl_no, 10);

      // Generate narrative remarks if not supplied
      const computedRemarks =
        remarks && remarks.trim()
          ? remarks.trim()
          : generateNarrativeRemarks(validatedBoxes);

      const entryStatus = status ? status.toUpperCase() : 'RATE_PENDING';

      // 5. Insert Entry Record
      const insertEntrySql = `
        INSERT INTO entries (
          id, branch_id, entry_date, daily_sl_no,
          party_id, party_name, vehicle_id, vehicle_no,
          gross_loaded_kg, empty_tare_kg, ice_water_kg, net_kg,
          c_value, remarks, status, created_by, updated_by
        ) VALUES (
          gen_random_uuid(), $1, $2, $3,
          $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15, $15
        ) RETURNING *;
      `;
      const entryRes = await client.query(insertEntrySql, [
        branchId,
        targetDate,
        dailySlNo,
        resolvedPartyId,
        resolvedPartyName,
        resolvedVehicleId,
        resolvedVehicleNo,
        loaded,
        empty,
        ice,
        netKg,
        c_value !== undefined ? c_value : null,
        computedRemarks,
        entryStatus,
        actorId,
      ]);

      const newEntry = entryRes.rows[0];

      // 6. Insert Entry Boxes
      const savedBoxes = [];
      for (const box of validatedBoxes) {
        const boxRes = await client.query(
          `
          INSERT INTO entry_boxes (
            id, entry_id, fish_type_id, fish_name, box_count, mix_percentage
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5
          ) RETURNING *;
          `,
          [
            newEntry.id,
            box.fish_type_id,
            box.fish_name,
            box.box_count,
            box.mix_percentage,
          ]
        );
        savedBoxes.push(boxRes.rows[0]);
      }

      // Explicit application audit record
      await recordAuditLog(
        {
          actorId,
          branchId,
          action: 'ENTRY_CREATED',
          entityType: 'entries',
          entityId: newEntry.id,
          diffs: {
            entry: newEntry,
            boxes: savedBoxes,
            computed_net_kg: netKg,
          },
          ipAddress: req.ip,
        },
        client
      );

      return {
        ...newEntry,
        boxes: savedBoxes,
      };
    }, { actorId, branchId });

    // Asynchronously trigger entry:created event for Web Push notification dispatch
    try {
      eventBus.emit('entry:created', entryResult);
    } catch (eventErr) {
      console.error('[EventBus] Error dispatching entry:created event:', eventErr.message);
    }

    return res.status(201).json({
      success: true,
      data: entryResult,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/entries
 * Query purchase entries with role-based rate concealment for Staff
 */
async function getEntries(req, res, next) {
  try {
    const branchId = req.branchId;
    const isStaff = req.currentRole === 'staffAdmin';
    const { startDate, endDate, date, party_id, status, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT e.*,
             COALESCE(json_agg(DISTINCT jsonb_build_object(
               'id', eb.id,
               'fish_type_id', eb.fish_type_id,
               'fish_name', eb.fish_name,
               'box_count', eb.box_count,
               'mix_percentage', eb.mix_percentage
             )) FILTER (WHERE eb.id IS NOT NULL), '[]') as boxes
    `;

    // Only include rates if user is NOT staff (FR-03 & system.md rule)
    if (!isStaff) {
      sql += `,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', er.id,
          'box_id', er.box_id,
          'fish_type_id', er.fish_type_id,
          'fish_name', er.fish_name,
          'rate_per_kg', er.rate_per_kg,
          'rated_by', er.rated_by
        )) FILTER (WHERE er.id IS NOT NULL), '[]') as rates
      `;
    }

    sql += `
      FROM entries e
      LEFT JOIN entry_boxes eb ON eb.entry_id = e.id
    `;

    if (!isStaff) {
      sql += ` LEFT JOIN entry_rates er ON er.entry_id = e.id `;
    }

    sql += ` WHERE e.branch_id = $1 `;
    const params = [branchId];

    if (date) {
      params.push(date);
      sql += ` AND e.entry_date = $${params.length}`;
    } else {
      if (startDate) {
        params.push(startDate);
        sql += ` AND e.entry_date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        sql += ` AND e.entry_date <= $${params.length}`;
      }
    }

    if (party_id) {
      params.push(party_id);
      sql += ` AND e.party_id = $${params.length}`;
    }

    if (status) {
      params.push(status.toUpperCase());
      sql += ` AND e.status = $${params.length}`;
    }

    sql += `
      GROUP BY e.id
      ORDER BY e.entry_date DESC, e.daily_sl_no DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(sql, params);

    const enrichedRows = result.rows.map((row) => {
      if (isStaff || !Array.isArray(row.rates) || row.rates.length === 0) {
        return row;
      }
      const boxes = Array.isArray(row.boxes) ? row.boxes : [];
      const { averageRate } = calculateWeightedAverageRate(boxes, row.rates);
      const netKg = Number(row.net_kg) || 0;
      const totalAmount = Math.round(netKg * averageRate * 100) / 100;
      return {
        ...row,
        average_rate: averageRate,
        total_amount: totalAmount,
      };
    });

    return res.status(200).json({
      success: true,
      count: enrichedRows.length,
      data: enrichedRows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/entries/:id
 */
async function getEntryById(req, res, next) {
  try {
    const { id } = req.params;
    const branchId = req.branchId;
    const isStaff = req.currentRole === 'staffAdmin';

    const entryRes = await db.query(
      'SELECT * FROM entries WHERE id = $1 AND branch_id = $2',
      [id, branchId]
    );

    if (entryRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }

    const entry = entryRes.rows[0];

    const boxesRes = await db.query(
      'SELECT * FROM entry_boxes WHERE entry_id = $1 ORDER BY fish_name ASC',
      [id]
    );
    entry.boxes = boxesRes.rows;

    if (!isStaff) {
      const ratesRes = await db.query(
        'SELECT * FROM entry_rates WHERE entry_id = $1 ORDER BY fish_name ASC',
        [id]
      );
      entry.rates = ratesRes.rows;
    }

    return res.status(200).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/entries/:id
 * Updates an entry while strictly enforcing server-side locking against Staff edits
 */
async function updateEntry(req, res, next) {
  try {
    const { id } = req.params;
    const branchId = req.branchId;
    const isStaff = req.currentRole === 'staffAdmin';
    const actorId = req.user.id;

    // Check entry existence and lock state
    const existingRes = await db.query(
      'SELECT * FROM entries WHERE id = $1 AND branch_id = $2',
      [id, branchId]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }

    const currentEntry = existingRes.rows[0];

    // Check rate existence
    const rateCheck = await db.query(
      'SELECT COUNT(*)::int as count FROM entry_rates WHERE entry_id = $1',
      [id]
    );
    const hasRates = rateCheck.rows[0].count > 0;

    // SERVER-SIDE RATE LOCK ENFORCEMENT:
    // Once an Admin sets a rate or entry is LOCKED, it is strictly locked from Staff edits.
    if (isStaff && (currentEntry.status === 'LOCKED' || hasRates)) {
      // If client attempted a late offline sync, mark status for admin review hold
      if (req.body.is_offline_sync) {
        await db.query("UPDATE entries SET status = 'HOLD_REVIEW' WHERE id = $1", [id]);
        return res.status(409).json({
          success: false,
          error: 'Conflict Detected: Admin has already assigned rates to this entry. Update diverted to "Held for Admin Review".',
          conflict_hold: true,
          status: 'HOLD_REVIEW',
        });
      }

      return res.status(403).json({
        success: false,
        error: 'Locked for Staff: This entry has already been rate-fixed by Admin and cannot be edited.',
      });
    }

    const {
      party_id,
      party_name,
      vehicle_id,
      vehicle_no,
      gross_loaded_kg,
      empty_tare_kg,
      ice_water_kg,
      c_value,
      remarks,
      status,
      boxes,
    } = req.body;

    const loaded = gross_loaded_kg !== undefined ? Number(gross_loaded_kg) : Number(currentEntry.gross_loaded_kg);
    const empty = empty_tare_kg !== undefined ? Number(empty_tare_kg) : Number(currentEntry.empty_tare_kg);
    const ice = ice_water_kg !== undefined ? Number(ice_water_kg) : Number(currentEntry.ice_water_kg);
    const netKg = calculateNetWeight(loaded, empty, ice);

    if (netKg < 0) {
      return res.status(400).json({
        success: false,
        error: `Net weight cannot be negative. (Computed: ${netKg})`,
      });
    }

    const updatedResult = await db.withTransaction(async (client) => {
      let resolvedPartyName = party_name || currentEntry.party_name;
      let resolvedPartyId = party_id !== undefined ? party_id : currentEntry.party_id;

      if (party_id && party_id !== currentEntry.party_id) {
        const partyCheck = await client.query('SELECT name FROM parties WHERE id = $1', [party_id]);
        if (partyCheck.rows.length > 0) {
          resolvedPartyName = partyCheck.rows[0].name;
        }
      }

      let resolvedVehicleNo = vehicle_no || currentEntry.vehicle_no;
      let resolvedVehicleId = vehicle_id !== undefined ? vehicle_id : currentEntry.vehicle_id;

      if (vehicle_id && vehicle_id !== currentEntry.vehicle_id) {
        const vehCheck = await client.query('SELECT vehicle_no FROM vehicles WHERE id = $1', [vehicle_id]);
        if (vehCheck.rows.length > 0) {
          resolvedVehicleNo = vehCheck.rows[0].vehicle_no;
        }
      }

      const updateSql = `
        UPDATE entries
        SET
          party_id = $1,
          party_name = $2,
          vehicle_id = $3,
          vehicle_no = $4,
          gross_loaded_kg = $5,
          empty_tare_kg = $6,
          ice_water_kg = $7,
          net_kg = $8,
          c_value = COALESCE($9, c_value),
          remarks = COALESCE($10, remarks),
          status = COALESCE($11, status),
          updated_by = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13
        RETURNING *;
      `;
      const updateRes = await client.query(updateSql, [
        resolvedPartyId,
        resolvedPartyName,
        resolvedVehicleId,
        resolvedVehicleNo,
        loaded,
        empty,
        ice,
        netKg,
        c_value,
        remarks,
        status,
        actorId,
        id,
      ]);

      const updatedEntry = updateRes.rows[0];

      // Update boxes if provided
      let savedBoxes = [];
      if (Array.isArray(boxes) && boxes.length > 0) {
        const boxValidation = validateBoxMixPercentages(boxes);
        if (!boxValidation.valid) {
          throw new Error(boxValidation.error);
        }

        await client.query('DELETE FROM entry_boxes WHERE entry_id = $1', [id]);

        for (const box of boxes) {
          const boxRes = await client.query(
            `
            INSERT INTO entry_boxes (id, entry_id, fish_type_id, fish_name, box_count, mix_percentage)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
            RETURNING *;
            `,
            [
              id,
              box.fish_type_id || null,
              box.fish_name ? box.fish_name.trim().toUpperCase() : 'FISH',
              parseInt(box.box_count, 10),
              parseFloat(box.mix_percentage) || 100.00,
            ]
          );
          savedBoxes.push(boxRes.rows[0]);
        }
      } else {
        const boxRes = await client.query('SELECT * FROM entry_boxes WHERE entry_id = $1', [id]);
        savedBoxes = boxRes.rows;
      }

      return {
        ...updatedEntry,
        boxes: savedBoxes,
      };
    }, { actorId, branchId });

    return res.status(200).json({
      success: true,
      data: updatedResult,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/entries/sync
 * Batch syncs offline buffered entries and resolves server-lock conflicts
 */
async function syncEntries(req, res, next) {
  try {
    const branchId = req.branchId;
    const actorId = req.user.id;
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        error: 'Payload must include an "entries" array',
      });
    }

    const synced = [];
    const conflicts = [];
    const errors = [];

    for (const item of entries) {
      const tempId = item.tempId || `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      try {
        // Case A: Offline modification to existing entry
        if (item.id) {
          const existingRes = await db.query(
            'SELECT * FROM entries WHERE id = $1 AND branch_id = $2',
            [item.id, branchId]
          );

          if (existingRes.rows.length === 0) {
            errors.push({ tempId, id: item.id, error: 'Entry not found on server' });
            continue;
          }

          const currentEntry = existingRes.rows[0];

          // Check if entry has rates or is LOCKED
          const rateCheck = await db.query(
            'SELECT COUNT(*)::int as count FROM entry_rates WHERE entry_id = $1',
            [item.id]
          );
          const hasRates = rateCheck.rows[0].count > 0;

          if (currentEntry.status === 'LOCKED' || hasRates) {
            // Server-lock conflict: Admin has rated/locked while staff was offline
            await db.query("UPDATE entries SET status = 'HOLD_REVIEW' WHERE id = $1", [item.id]);
            conflicts.push({
              tempId,
              id: item.id,
              status: 'HOLD_REVIEW',
              conflict: true,
              message: 'Held for Admin Review: Admin assigned rates while Staff was offline.',
            });
            continue;
          }

          // Not locked: Proceed with updating existing entry
          const loaded = Number(item.gross_loaded_kg) || Number(currentEntry.gross_loaded_kg);
          const empty = Number(item.empty_tare_kg) || Number(currentEntry.empty_tare_kg);
          const ice = Number(item.ice_water_kg) || Number(currentEntry.ice_water_kg);
          const netKg = calculateNetWeight(loaded, empty, ice);

          const updatedEntry = await db.withTransaction(async (client) => {
            const updateRes = await client.query(
              `
              UPDATE entries
              SET gross_loaded_kg = $1,
                  empty_tare_kg = $2,
                  ice_water_kg = $3,
                  net_kg = $4,
                  remarks = COALESCE($5, remarks),
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $6 AND branch_id = $7
              RETURNING *
              `,
              [loaded, empty, ice, netKg, item.remarks, item.id, branchId]
            );
            return updateRes.rows[0];
          }, { actorId, branchId });

          synced.push({
            tempId,
            id: item.id,
            daily_sl_no: updatedEntry.daily_sl_no,
            status: updatedEntry.status,
            synced: true,
          });
          continue;
        }

        // Case B: Brand new entry created offline
        const loaded = Number(item.gross_loaded_kg) || 0;
        const empty = Number(item.empty_tare_kg) || 0;
        const ice = Number(item.ice_water_kg) || 0;
        const netKg = calculateNetWeight(loaded, empty, ice);

        if (!Array.isArray(item.boxes) || item.boxes.length === 0) {
          errors.push({ tempId, error: 'At least one fish box specification required' });
          continue;
        }

        const targetDate = item.entry_date ? item.entry_date.split('T')[0] : new Date().toISOString().split('T')[0];

        const newEntryRecord = await db.withTransaction(async (client) => {
          // 1. Resolve Party
          let resolvedPartyId = item.party_id || null;
          let resolvedPartyName = item.party_name ? item.party_name.trim() : null;

          if (resolvedPartyId) {
            const pCheck = await client.query(
              'SELECT id, name FROM parties WHERE id = $1 AND (branch_id = $2 OR branch_id IS NULL)',
              [resolvedPartyId, branchId]
            );
            if (pCheck.rows.length > 0) resolvedPartyName = pCheck.rows[0].name;
          } else if (resolvedPartyName) {
            const pLookup = await client.query(
              'SELECT id, name FROM parties WHERE LOWER(name) = LOWER($1) AND (branch_id = $2 OR branch_id IS NULL) LIMIT 1',
              [resolvedPartyName, branchId]
            );
            if (pLookup.rows.length > 0) {
              resolvedPartyId = pLookup.rows[0].id;
              resolvedPartyName = pLookup.rows[0].name;
            } else {
              throw new Error(`Party "${resolvedPartyName}" not found in masters.`);
            }
          }

          // 2. Resolve Vehicle
          let resolvedVehicleId = item.vehicle_id || null;
          let resolvedVehicleNo = item.vehicle_no ? item.vehicle_no.trim().toUpperCase() : null;

          if (resolvedVehicleId) {
            const vCheck = await client.query(
              'SELECT id, vehicle_no FROM vehicles WHERE id = $1 AND (branch_id = $2 OR branch_id IS NULL)',
              [resolvedVehicleId, branchId]
            );
            if (vCheck.rows.length > 0) resolvedVehicleNo = vCheck.rows[0].vehicle_no;
          } else if (resolvedVehicleNo) {
            const vLookup = await client.query(
              'SELECT id, vehicle_no FROM vehicles WHERE LOWER(vehicle_no) = LOWER($1) AND (branch_id = $2 OR branch_id IS NULL) LIMIT 1',
              [resolvedVehicleNo, branchId]
            );
            if (vLookup.rows.length > 0) {
              resolvedVehicleId = vLookup.rows[0].id;
              resolvedVehicleNo = vLookup.rows[0].vehicle_no;
            } else {
              throw new Error(`Vehicle "${resolvedVehicleNo}" not found in masters.`);
            }
          }

          // 3. Resolve Boxes & Fish Types
          const validatedBoxes = [];
          for (const box of item.boxes) {
            let fId = box.fish_type_id || null;
            let fName = box.fish_name ? box.fish_name.trim().toUpperCase() : 'FISH';

            if (fId) {
              const fCheck = await client.query(
                'SELECT id, name FROM fish_types WHERE id = $1 AND (branch_id = $2 OR branch_id IS NULL)',
                [fId, branchId]
              );
              if (fCheck.rows.length > 0) fName = fCheck.rows[0].name;
            } else if (fName) {
              const fLookup = await client.query(
                'SELECT id, name FROM fish_types WHERE LOWER(name) = LOWER($1) AND (branch_id = $2 OR branch_id IS NULL) LIMIT 1',
                [fName, branchId]
              );
              if (fLookup.rows.length > 0) {
                fId = fLookup.rows[0].id;
                fName = fLookup.rows[0].name;
              } else {
                throw new Error(`Fish species "${fName}" not found in masters.`);
              }
            }

            validatedBoxes.push({
              fish_type_id: fId,
              fish_name: fName,
              box_count: parseInt(box.box_count, 10) || 1,
              mix_percentage: parseFloat(box.mix_percentage) || 100.0,
            });
          }

          // 4. Atomic serial allocation
          const serialRes = await client.query(
            `
            SELECT COALESCE(MAX(daily_sl_no), 0) + 1 AS next_sl_no
            FROM entries
            WHERE branch_id = $1 AND entry_date = $2
            `,
            [branchId, targetDate]
          );
          const dailySlNo = parseInt(serialRes.rows[0].next_sl_no, 10);

          const computedRemarks = item.remarks && item.remarks.trim()
            ? item.remarks.trim()
            : generateNarrativeRemarks(validatedBoxes);

          // 5. Insert Entry
          const insertEntryRes = await client.query(
            `
            INSERT INTO entries (
              id, branch_id, daily_sl_no, entry_date, party_id, party_name,
              vehicle_id, vehicle_no, gross_loaded_kg, empty_tare_kg, ice_water_kg,
              net_kg, remarks, status
            )
            VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12, 'RATE_PENDING'
            )
            RETURNING *;
            `,
            [
              branchId,
              dailySlNo,
              targetDate,
              resolvedPartyId,
              resolvedPartyName || 'UNKNOWN',
              resolvedVehicleId,
              resolvedVehicleNo || 'UNKNOWN',
              loaded,
              empty,
              ice,
              netKg,
              computedRemarks,
            ]
          );
          const createdEntry = insertEntryRes.rows[0];

          // 6. Insert Entry Boxes
          const savedBoxes = [];
          for (const box of validatedBoxes) {
            const bRes = await client.query(
              `
              INSERT INTO entry_boxes (id, entry_id, fish_type_id, fish_name, box_count, mix_percentage)
              VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
              RETURNING *;
              `,
              [createdEntry.id, box.fish_type_id, box.fish_name, box.box_count, box.mix_percentage]
            );
            savedBoxes.push(bRes.rows[0]);
          }

          await recordAuditLog(
            {
              actorId,
              branchId,
              action: 'ENTRY_CREATED_OFFLINE_SYNC',
              entityType: 'entries',
              entityId: createdEntry.id,
              diffs: {
                tempId,
                entry: createdEntry,
                boxes: savedBoxes,
              },
              ipAddress: req.ip,
            },
            client
          );

          return { ...createdEntry, boxes: savedBoxes };
        }, { actorId, branchId });

        // Trigger push notification event
        try {
          eventBus.emit('entry:created', newEntryRecord);
        } catch (eventErr) {
          console.error('[EventBus] Error dispatching entry:created event during sync:', eventErr.message);
        }

        synced.push({
          tempId,
          id: newEntryRecord.id,
          daily_sl_no: newEntryRecord.daily_sl_no,
          status: newEntryRecord.status,
          entry_date: newEntryRecord.entry_date,
          party_name: newEntryRecord.party_name,
          vehicle_no: newEntryRecord.vehicle_no,
          net_kg: newEntryRecord.net_kg,
          synced: true,
        });
      } catch (err) {
        errors.push({ tempId, error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      processed: entries.length,
      synced,
      conflicts,
      errors,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createEntry,
  getEntries,
  getEntryById,
  updateEntry,
  syncEntries,
};

