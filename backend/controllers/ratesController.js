const db = require('../db');
const { calculateWeightedAverageRate } = require('../utils/calculations');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * POST /api/entries/:id/rates
 * Admin / Billing rate-fixing endpoint
 * Enforces rate locking and calculates percentage-weighted mix averages
 */
async function setEntryRates(req, res, next) {
  try {
    const { id } = req.params;
    const branchId = req.branchId;
    const actorId = req.user.id;
    const { rates } = req.body;

    if (!Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'An array of rates ([{ fish_name, rate_per_kg }]) is required',
      });
    }

    // Validate rate values
    for (const r of rates) {
      const rateVal = Number(r.rate_per_kg);
      if (isNaN(rateVal) || rateVal < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid rate amount for "${r.fish_name || 'fish'}": ${r.rate_per_kg}. Rates cannot be negative.`,
        });
      }
    }

    const result = await db.withTransaction(async (client) => {
      // 1. Fetch entry
      const entryRes = await client.query(
        'SELECT * FROM entries WHERE id = $1 AND branch_id = $2 FOR UPDATE',
        [id, branchId]
      );

      if (entryRes.rows.length === 0) {
        throw new Error('Entry not found for this branch');
      }

      const entry = entryRes.rows[0];

      // 2. Fetch existing boxes for mix calculation
      const boxesRes = await client.query(
        'SELECT * FROM entry_boxes WHERE entry_id = $1',
        [id]
      );
      const boxes = boxesRes.rows;

      if (boxes.length === 0) {
        throw new Error('Cannot set rates: Entry has no fish boxes recorded');
      }

      // 3. Replace entry rates
      await client.query('DELETE FROM entry_rates WHERE entry_id = $1', [id]);

      const savedRates = [];
      for (const r of rates) {
        const fishName = r.fish_name ? r.fish_name.trim().toUpperCase() : 'FISH';
        const ratePerKg = Number(r.rate_per_kg);
        const boxId = r.box_id || null;

        const rateRes = await client.query(
          `
          INSERT INTO entry_rates (
            id, entry_id, box_id, fish_type_id, fish_name, rate_per_kg, rated_by
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6
          )
          RETURNING *;
          `,
          [id, boxId, r.fish_type_id || null, fishName, ratePerKg, actorId]
        );
        savedRates.push(rateRes.rows[0]);
      }

      // 4. Calculate Percentage-Weighted Average Rate (FR-03)
      // Average Rate = ∑(Box Count × Fish % × Fish Rate) / ∑(Box Count × Fish %)
      const { averageRate, totalEffectiveBoxes, weightedSum } =
        calculateWeightedAverageRate(boxes, savedRates);

      const netKg = Number(entry.net_kg) || 0;
      const totalAmount = Math.round(netKg * averageRate * 100) / 100;

      // 5. Update entry state to LOCKED (preventing future Staff edits)
      const updateEntryRes = await client.query(
        `
        UPDATE entries
        SET status = 'LOCKED', updated_by = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
        `,
        [actorId, id]
      );

      // 6. Explicit application audit record
      await recordAuditLog(
        {
          actorId,
          branchId,
          action: 'ENTRY_RATES_FIXED',
          entityType: 'entries',
          entityId: id,
          diffs: {
            previous_status: entry.status,
            new_status: 'LOCKED',
            rates: savedRates,
            average_rate: averageRate,
            net_kg: netKg,
            total_amount: totalAmount,
          },
          ipAddress: req.ip,
        },
        client
      );

      return {
        entry: updateEntryRes.rows[0],
        rates: savedRates,
        calculation: {
          averageRate,
          totalEffectiveBoxes,
          weightedSum,
          totalAmount,
        },
      };
    }, { actorId, branchId });

    return res.status(200).json({
      success: true,
      message: 'Rates successfully set and entry locked against staff modifications.',
      data: {
        entry_id: id,
        status: result.entry.status,
        net_kg: result.entry.net_kg,
        average_rate: result.calculation.averageRate,
        total_amount: result.calculation.totalAmount,
        rates: result.rates,
        breakdown: {
          total_effective_boxes: result.calculation.totalEffectiveBoxes,
          weighted_sum: result.calculation.weightedSum,
        },
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A conflict occurred while saving entry rates. Please refresh and retry.',
      });
    }
    next(err);
  }
}

/**
 * GET /api/entries/:id/rates
 * View rates for an entry (accessible by Admin / Billing only)
 */
async function getEntryRates(req, res, next) {
  try {
    const { id } = req.params;
    const branchId = req.branchId;

    const ratesRes = await db.query(
      `
      SELECT er.*, u.username as rated_by_username
      FROM entry_rates er
      JOIN entries e ON e.id = er.entry_id
      LEFT JOIN users u ON u.id = er.rated_by
      WHERE er.entry_id = $1 AND e.branch_id = $2
      ORDER BY er.fish_name ASC
      `,
      [id, branchId]
    );

    return res.status(200).json({
      success: true,
      count: ratesRes.rows.length,
      data: ratesRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setEntryRates,
  getEntryRates,
};

