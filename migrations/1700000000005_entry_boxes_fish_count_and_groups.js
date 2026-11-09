/* eslint-disable camelcase */

/**
 * Migration: Add fish_count and box_group_id to entry_boxes, box_id to entry_rates
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE entry_boxes
    ADD COLUMN IF NOT EXISTS fish_count integer,
    ADD COLUMN IF NOT EXISTS box_group_id integer DEFAULT 1;

    ALTER TABLE entry_rates
    ADD COLUMN IF NOT EXISTS box_id uuid REFERENCES entry_boxes(id) ON DELETE CASCADE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE entry_rates DROP COLUMN IF EXISTS box_id;
    ALTER TABLE entry_boxes DROP COLUMN IF EXISTS fish_count;
    ALTER TABLE entry_boxes DROP COLUMN IF EXISTS box_group_id;
  `);
};
