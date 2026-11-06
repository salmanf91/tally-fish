/* eslint-disable camelcase */

/**
 * Migration: Update user roles to explicit names
 * Roles: staff, staffAdmin, owner, billingAdmin
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Drop old check constraint
    ALTER TABLE user_branch_roles
    DROP CONSTRAINT IF EXISTS user_branch_roles_role_check;

    -- Update legacy data if present
    UPDATE user_branch_roles SET role = 'owner' WHERE role = 'admin';
    UPDATE user_branch_roles SET role = 'billingAdmin' WHERE role = 'billing';

    -- Add updated check constraint with explicit role names
    ALTER TABLE user_branch_roles
    ADD CONSTRAINT user_branch_roles_role_check
    CHECK (role IN ('staff', 'staffAdmin', 'owner', 'billingAdmin'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_branch_roles
    DROP CONSTRAINT IF EXISTS user_branch_roles_role_check;

    UPDATE user_branch_roles SET role = 'admin' WHERE role IN ('owner', 'staffAdmin');
    UPDATE user_branch_roles SET role = 'billing' WHERE role = 'billingAdmin';

    ALTER TABLE user_branch_roles
    ADD CONSTRAINT user_branch_roles_role_check
    CHECK (role IN ('staff', 'admin', 'billing'));
  `);
};

