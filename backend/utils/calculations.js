/**
 * Calculation Utilities for Tally Fish Daily Statement Application
 * Implements FR-02, FR-03 specifications
 */

/**
 * Computes net weight from gross loaded weight, tare empty weight, and ice/water deduction
 * Net Weight = Loaded kg - Empty kg - Ice/Water kg
 *
 * @param {number|string} loaded - Gross loaded kg
 * @param {number|string} empty - Empty tare kg
 * @param {number|string} iceWater - Ice/water deduction kg
 * @returns {number} Net weight rounded to 2 decimal places
 */
function calculateNetWeight(loaded, empty, iceWater) {
  const gross = Number(loaded) || 0;
  const tare = Number(empty) || 0;
  const ice = Number(iceWater) || 0;
  const net = gross - tare - ice;
  return Math.round(net * 100) / 100;
}

/**
 * Validates that box mix percentages adhere to exact 100% constraints per mix grouping
 *
 * @param {Array<{ fish_name: string, box_count: number, mix_percentage: number, mix_group?: string }>} boxes
 * @returns {{ valid: boolean, error?: string }}
 */
function validateBoxMixPercentages(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) {
    return { valid: false, error: 'At least one box entry is required' };
  }

  const mixGroups = {};
  const ungroupedFractional = [];

  for (const box of boxes) {
    const count = Number(box.box_count);
    const mix = Number(box.mix_percentage !== undefined ? box.mix_percentage : 100);

    if (isNaN(count) || count < 0) {
      return { valid: false, error: `Invalid box count: ${box.box_count}` };
    }
    if (isNaN(mix) || mix <= 0 || mix > 100) {
      return {
        valid: false,
        error: `Mix percentage for ${box.fish_name || 'fish'} must be between 0 and 100%`,
      };
    }

    if (box.mix_group || box.group_id) {
      const gKey = box.mix_group || box.group_id;
      if (!mixGroups[gKey]) mixGroups[gKey] = [];
      mixGroups[gKey].push(box);
    } else if (mix < 100) {
      ungroupedFractional.push(box);
    }
    // If mix === 100 without a mix_group, it is a self-contained 100% single-species box lot.
  }

  // Validate explicit mix groups
  for (const [key, groupBoxes] of Object.entries(mixGroups)) {
    const sumPercentage = groupBoxes.reduce(
      (sum, b) => sum + Number(b.mix_percentage || 0),
      0
    );
    if (Math.abs(sumPercentage - 100) > 0.01) {
      return {
        valid: false,
        error: `Mix percentages for box group "${key}" must sum to exactly 100% (currently ${sumPercentage}%)`,
      };
    }
  }

  // Validate ungrouped fractional boxes
  if (ungroupedFractional.length > 0) {
    const sumFractional = ungroupedFractional.reduce(
      (sum, b) => sum + Number(b.mix_percentage || 0),
      0
    );
    if (Math.abs(sumFractional - 100) > 0.01) {
      return {
        valid: false,
        error: `Mix percentages for fractional mixed boxes must sum to exactly 100% (currently ${sumFractional}%)`,
      };
    }
  }

  return { valid: true };
}

/**
 * Calculates percentage-weighted average rate according to FR-03:
 * Average Rate = ∑(Box Count × Fish % × Fish Rate) / ∑(Box Count × Fish %)
 *
 * @param {Array<{ box_count: number, mix_percentage: number, fish_type_id?: string, fish_name: string }>} boxes
 * @param {Array<{ fish_type_id?: string, fish_name: string, rate_per_kg: number }>} rates
 * @returns {{ averageRate: number, totalEffectiveBoxes: number, weightedSum: number }}
 */
function calculateWeightedAverageRate(boxes, rates) {
  const boxRateMap = new Map();
  const rateLookup = new Map();

  for (const r of rates) {
    if (r.box_id) {
      boxRateMap.set(String(r.box_id), Number(r.rate_per_kg));
    }
    if (r.fish_type_id) {
      rateLookup.set(`id:${r.fish_type_id}`, Number(r.rate_per_kg));
    }
    if (r.fish_name) {
      rateLookup.set(`name:${r.fish_name.trim().toUpperCase()}`, Number(r.rate_per_kg));
    }
  }

  let totalEffectiveBoxes = 0;
  let weightedSum = 0;

  for (const box of boxes) {
    const boxCount = Number(box.box_count) || 0;
    const mixPercentage = Number(box.mix_percentage) || 100;
    const weightFactor = boxCount * (mixPercentage / 100);

    let rate = 0;
    if (box.id && boxRateMap.has(String(box.id))) {
      rate = boxRateMap.get(String(box.id));
    } else if (box.fish_type_id && rateLookup.has(`id:${box.fish_type_id}`)) {
      rate = rateLookup.get(`id:${box.fish_type_id}`);
    } else if (box.fish_name && rateLookup.has(`name:${box.fish_name.trim().toUpperCase()}`)) {
      rate = rateLookup.get(`name:${box.fish_name.trim().toUpperCase()}`);
    }

    totalEffectiveBoxes += weightFactor;
    weightedSum += weightFactor * rate;
  }

  const averageRate = totalEffectiveBoxes > 0
    ? Math.round((weightedSum / totalEffectiveBoxes) * 100) / 100
    : 0;

  return {
    averageRate,
    totalEffectiveBoxes: Math.round(totalEffectiveBoxes * 100) / 100,
    weightedSum: Math.round(weightedSum * 100) / 100,
  };
}

/**
 * Generates narrative remarks string (e.g., "50 BX CHAMBAN + 20 BX (80% SARDINE, 20% MIX)")
 *
 * @param {Array<{ fish_name: string, box_count: number, mix_percentage: number }>} boxes
 * @returns {string}
 */
function generateNarrativeRemarks(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) return '';

  return boxes
    .map((b) => {
      const count = b.box_count;
      const name = b.fish_name ? b.fish_name.toUpperCase() : 'FISH';
      const pct = Number(b.mix_percentage);
      if (pct && pct < 100) {
        return `${count} BX (${pct}% ${name})`;
      }
      return `${count} BX ${name}`;
    })
    .join(' + ');
}

module.exports = {
  calculateNetWeight,
  validateBoxMixPercentages,
  calculateWeightedAverageRate,
  generateNarrativeRemarks,
};
