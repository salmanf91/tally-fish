/* eslint-disable camelcase */

/**
 * Migration: Strictly 3 roles in database
 * Roles: staffAdmin, owner, billingAdmin
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Drop old check constraint
    ALTER TABLE user_branch_roles
    DROP CONSTRAINT IF EXISTS user_branch_roles_role_check;

    -- Update any 'staff' rows to 'staffAdmin'
    UPDATE user_branch_roles SET role = 'staffAdmin' WHERE role = 'staff';

    -- Add updated check constraint with strictly 3 roles
    ALTER TABLE user_branch_roles
    ADD CONSTRAINT user_branch_roles_role_check
    CHECK (role IN ('staffAdmin', 'owner', 'billingAdmin'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_branch_roles
    DROP CONSTRAINT IF EXISTS user_branch_roles_role_check;

    ALTER TABLE user_branch_roles
    ADD CONSTRAINT user_branch_roles_role_check
    CHECK (role IN ('staff', 'staffAdmin', 'owner', 'billingAdmin'));
  `);
};
