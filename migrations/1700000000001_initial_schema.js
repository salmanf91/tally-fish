/* eslint-disable camelcase */

/**
 * Migration: Initial Schema with Dedicated Masters
 * Engine: node-pg-migrate
 * Database: PostgreSQL 16+
 *
 * Dedicated Master Tables:
 *  - parties (optional branch_id, unique name per branch)
 *  - vehicles (optional branch_id, unique vehicle_no per branch)
 *  - fish_types (optional branch_id, unique name per branch)
 *
 * Core Transaction & System Tables:
 *  - branches
 *  - users
 *  - user_branch_roles
 *  - entries (FK: party_id, vehicle_id, composite unique: branch_id, entry_date, daily_sl_no)
 *  - entry_boxes (FK: fish_type_id)
 *  - entry_rates (FK: fish_type_id)
 *  - push_subscriptions
 *  - audit_logs
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Enable pgcrypto for UUID generation
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

  // Trigger function for automated updated_at timestamp maintenance
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 2. branches
  pgm.createTable('branches', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'varchar(255)', notNull: true },
    code: { type: 'varchar(50)', notNull: true, unique: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.sql(`
    CREATE TRIGGER trg_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 3. users
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    username: { type: 'varchar(100)', notNull: true, unique: true },
    pin_hash: { type: 'varchar(255)', notNull: true },
    failed_attempts: { type: 'integer', notNull: true, default: 0 },
    locked_until: { type: 'timestamptz', notNull: false },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.sql(`
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 4. user_branch_roles
  pgm.createTable('user_branch_roles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    branch_id: {
      type: 'uuid',
      notNull: true,
      references: 'branches',
      onDelete: 'CASCADE',
    },
    role: {
      type: 'varchar(20)',
      notNull: true,
      check: "role IN ('staffAdmin', 'owner', 'billingAdmin')",
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('user_branch_roles', 'uq_user_branch_role', {
    unique: ['user_id', 'branch_id', 'role'],
  });
  pgm.createIndex('user_branch_roles', 'user_id');
  pgm.createIndex('user_branch_roles', 'branch_id');

  pgm.sql(`
    CREATE TRIGGER trg_user_branch_roles_updated_at
    BEFORE UPDATE ON user_branch_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 5. parties (Master)
  // Optional branch_id: NULL for global company-wide, UUID for branch-specific
  pgm.createTable('parties', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    branch_id: {
      type: 'uuid',
      notNull: false,
      references: 'branches',
      onDelete: 'CASCADE',
    },
    name: { type: 'varchar(255)', notNull: true },
    code: { type: 'varchar(50)', notNull: false },
    phone: { type: 'varchar(25)', notNull: false },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Unique name per branch (NULLS NOT DISTINCT ensures single global entry per name)
  pgm.sql(`
    ALTER TABLE parties
    ADD CONSTRAINT uq_parties_branch_name
    UNIQUE NULLS NOT DISTINCT (branch_id, name);
  `);
  pgm.createIndex('parties', 'branch_id');
  pgm.createIndex('parties', 'phone');

  pgm.sql(`
    CREATE TRIGGER trg_parties_updated_at
    BEFORE UPDATE ON parties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 6. vehicles (Master)
  // Optional branch_id: NULL for global company-wide, UUID for branch-specific
  pgm.createTable('vehicles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    branch_id: {
      type: 'uuid',
      notNull: false,
      references: 'branches',
      onDelete: 'CASCADE',
    },
    vehicle_no: { type: 'varchar(50)', notNull: true },
    party_id: {
      type: 'uuid',
      notNull: false,
      references: 'parties',
      onDelete: 'SET NULL',
    },
    notes: { type: 'text', notNull: false },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Unique vehicle_no per branch (NULLS NOT DISTINCT)
  pgm.sql(`
    ALTER TABLE vehicles
    ADD CONSTRAINT uq_vehicles_branch_no
    UNIQUE NULLS NOT DISTINCT (branch_id, vehicle_no);
  `);
  pgm.createIndex('vehicles', 'branch_id');
  pgm.createIndex('vehicles', 'party_id');

  pgm.sql(`
    CREATE TRIGGER trg_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 7. fish_types (Master)
  // Optional branch_id: NULL for global company-wide, UUID for branch-specific
  pgm.createTable('fish_types', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    branch_id: {
      type: 'uuid',
      notNull: false,
      references: 'branches',
      onDelete: 'CASCADE',
    },
    name: { type: 'varchar(100)', notNull: true },
    code: { type: 'varchar(50)', notNull: false },
    default_rate: { type: 'numeric(10, 2)', notNull: false, default: 0.00 },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Unique fish name per branch (NULLS NOT DISTINCT)
  pgm.sql(`
    ALTER TABLE fish_types
    ADD CONSTRAINT uq_fish_types_branch_name
    UNIQUE NULLS NOT DISTINCT (branch_id, name);
  `);
  pgm.createIndex('fish_types', 'branch_id');

  pgm.sql(`
    CREATE TRIGGER trg_fish_types_updated_at
    BEFORE UPDATE ON fish_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 8. entries (Transactions)
  pgm.createTable('entries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    branch_id: {
      type: 'uuid',
      notNull: true,
      references: 'branches',
      onDelete: 'RESTRICT',
    },
    entry_date: {
      type: 'date',
      notNull: true,
      default: pgm.func('CURRENT_DATE'),
    },
    daily_sl_no: { type: 'integer', notNull: true },
    party_id: {
      type: 'uuid',
      notNull: false,
      references: 'parties',
      onDelete: 'SET NULL',
    },
    party_name: { type: 'varchar(255)', notNull: true },
    vehicle_id: {
      type: 'uuid',
      notNull: false,
      references: 'vehicles',
      onDelete: 'SET NULL',
    },
    vehicle_no: { type: 'varchar(50)', notNull: true },
    gross_loaded_kg: {
      type: 'numeric(12, 2)',
      notNull: true,
      default: 0.00,
    },
    empty_tare_kg: {
      type: 'numeric(12, 2)',
      notNull: true,
      default: 0.00,
    },
    ice_water_kg: {
      type: 'numeric(12, 2)',
      notNull: true,
      default: 0.00,
    },
    net_kg: {
      type: 'numeric(12, 2)',
      notNull: true,
      default: 0.00,
    },
    c_value: { type: 'numeric(10, 2)', notNull: false },
    remarks: { type: 'text', notNull: false },
    status: {
      type: 'varchar(30)',
      notNull: true,
      default: 'RATE_PENDING',
      check: "status IN ('DRAFT', 'RATE_PENDING', 'LOCKED', 'STATEMENT_READY', 'HOLD_REVIEW', 'pending', 'locked', 'hold')",
    },
    created_by: {
      type: 'uuid',
      notNull: false,
      references: 'users',
      onDelete: 'SET NULL',
    },
    updated_by: {
      type: 'uuid',
      notNull: false,
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Explicit composite unique index on (branch_id, entry_date, daily_sl_no)
  pgm.addConstraint('entries', 'uq_entries_branch_date_sl_no', {
    unique: ['branch_id', 'entry_date', 'daily_sl_no'],
  });

  pgm.createIndex('entries', ['branch_id', 'entry_date']);
  pgm.createIndex('entries', 'status');
  pgm.createIndex('entries', 'party_id');
  pgm.createIndex('entries', 'vehicle_id');

  pgm.sql(`
    CREATE TRIGGER trg_entries_updated_at
    BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 9. entry_boxes
  pgm.createTable('entry_boxes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    entry_id: {
      type: 'uuid',
      notNull: true,
      references: 'entries',
      onDelete: 'CASCADE',
    },
    fish_type_id: {
      type: 'uuid',
      notNull: false,
      references: 'fish_types',
      onDelete: 'SET NULL',
    },
    fish_name: { type: 'varchar(100)', notNull: true },
    box_count: {
      type: 'integer',
      notNull: true,
      check: 'box_count >= 0',
    },
    mix_percentage: {
      type: 'numeric(5, 2)',
      notNull: true,
      default: 100.00,
      check: 'mix_percentage > 0 AND mix_percentage <= 100.00',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('entry_boxes', 'entry_id');
  pgm.createIndex('entry_boxes', 'fish_type_id');

  pgm.sql(`
    CREATE TRIGGER trg_entry_boxes_updated_at
    BEFORE UPDATE ON entry_boxes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 10. entry_rates
  pgm.createTable('entry_rates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    entry_id: {
      type: 'uuid',
      notNull: true,
      references: 'entries',
      onDelete: 'CASCADE',
    },
    fish_type_id: {
      type: 'uuid',
      notNull: false,
      references: 'fish_types',
      onDelete: 'SET NULL',
    },
    fish_name: { type: 'varchar(100)', notNull: true },
    rate_per_kg: {
      type: 'numeric(10, 2)',
      notNull: true,
      check: 'rate_per_kg >= 0',
    },
    rated_by: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('entry_rates', 'uq_entry_rates_entry_fish', {
    unique: ['entry_id', 'fish_name'],
  });

  pgm.createIndex('entry_rates', 'entry_id');
  pgm.createIndex('entry_rates', 'fish_type_id');
  pgm.createIndex('entry_rates', 'rated_by');

  pgm.sql(`
    CREATE TRIGGER trg_entry_rates_updated_at
    BEFORE UPDATE ON entry_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 11. push_subscriptions
  pgm.createTable('push_subscriptions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    branch_id: {
      type: 'uuid',
      notNull: false,
      references: 'branches',
      onDelete: 'CASCADE',
    },
    endpoint: { type: 'text', notNull: true, unique: true },
    p256dh_key: { type: 'text', notNull: true },
    auth_key: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('push_subscriptions', 'user_id');
  pgm.createIndex('push_subscriptions', 'branch_id');

  pgm.sql(`
    CREATE TRIGGER trg_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 12. audit_logs
  pgm.createTable('audit_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    actor_id: {
      type: 'uuid',
      notNull: false,
      references: 'users',
      onDelete: 'SET NULL',
    },
    branch_id: {
      type: 'uuid',
      notNull: false,
      references: 'branches',
      onDelete: 'SET NULL',
    },
    action: { type: 'varchar(100)', notNull: true },
    entity_type: { type: 'varchar(100)', notNull: false },
    entity_id: { type: 'uuid', notNull: false },
    diffs: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    ip_address: { type: 'varchar(45)', notNull: false },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('audit_logs', ['branch_id', 'created_at']);
  pgm.createIndex('audit_logs', ['entity_type', 'entity_id']);
  pgm.createIndex('audit_logs', 'actor_id');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_audit_logs_diffs_gin ON audit_logs USING gin (diffs);');
};

exports.down = (pgm) => {
  // Drop tables in reverse topological order
  pgm.dropTable('audit_logs', { ifExists: true, cascade: true });
  pgm.dropTable('push_subscriptions', { ifExists: true, cascade: true });
  pgm.dropTable('entry_rates', { ifExists: true, cascade: true });
  pgm.dropTable('entry_boxes', { ifExists: true, cascade: true });
  pgm.dropTable('entries', { ifExists: true, cascade: true });
  pgm.dropTable('fish_types', { ifExists: true, cascade: true });
  pgm.dropTable('vehicles', { ifExists: true, cascade: true });
  pgm.dropTable('parties', { ifExists: true, cascade: true });
  pgm.dropTable('user_branch_roles', { ifExists: true, cascade: true });
  pgm.dropTable('users', { ifExists: true, cascade: true });
  pgm.dropTable('branches', { ifExists: true, cascade: true });

  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;');
};
