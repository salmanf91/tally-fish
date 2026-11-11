/* eslint-disable camelcase */

/**
 * Migration: Drop legacy unique constraint on (entry_id, fish_name) in entry_rates table.
 * Allows multiple lots in the same intake slip (e.g. mixed lot and single species lot)
 * to contain the same fish species with independent rates.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE entry_rates DROP CONSTRAINT IF EXISTS uq_entry_rates_entry_fish;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Down migration: re-add unique constraint if desired
    -- Note: will fail if duplicate fish entries exist in the same intake slip
    ALTER TABLE entry_rates ADD CONSTRAINT uq_entry_rates_entry_fish UNIQUE (entry_id, fish_name);
  `);
};

