-- =============================================================================
-- Migration: 001_initial_schema.sql
-- Application: Tally Fish Daily Statement Application (Multi-Branch PWA)
-- Target: PostgreSQL 16+
-- =============================================================================

BEGIN;

-- 1. Enable Cryptographic UUID Generator
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Automated updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. BRANCHES TABLE
-- Multi-branch unit management (e.g. Ullal Unit, Mangaluru Port)
-- =============================================================================
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON branches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. USERS TABLE
-- User credentials with 4-digit PIN hash and lockout counters (Argon2id/Bcrypt)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    pin_hash VARCHAR(255) NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. USER_BRANCH_ROLES TABLE
-- Multi-tenant RBAC mapping (staff, admin, billing) scoped per branch
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_branch_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('staffAdmin', 'owner', 'billingAdmin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_branch_role UNIQUE (user_id, branch_id, role)
);

CREATE INDEX IF NOT EXISTS idx_ubr_user_id ON user_branch_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_ubr_branch_id ON user_branch_roles(branch_id);

CREATE TRIGGER trg_user_branch_roles_updated_at
BEFORE UPDATE ON user_branch_roles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 5. PARTIES MASTER TABLE (Vendors / Suppliers)
-- Optional branch_id (NULL = global company-wide, UUID = branch-specific)
-- Unique name per branch with NULLS NOT DISTINCT
-- =============================================================================
CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    phone VARCHAR(25),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_parties_branch_name UNIQUE NULLS NOT DISTINCT (branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_parties_branch_id ON parties(branch_id);
CREATE INDEX IF NOT EXISTS idx_parties_phone ON parties(phone);

CREATE TRIGGER trg_parties_updated_at
BEFORE UPDATE ON parties
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 6. VEHICLES MASTER TABLE
-- Optional branch_id (NULL = global company-wide, UUID = branch-specific)
-- Unique vehicle_no per branch with NULLS NOT DISTINCT
-- =============================================================================
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    vehicle_no VARCHAR(50) NOT NULL,
    party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vehicles_branch_no UNIQUE NULLS NOT DISTINCT (branch_id, vehicle_no)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_branch_id ON vehicles(branch_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_party_id ON vehicles(party_id);

CREATE TRIGGER trg_vehicles_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 7. FISH_TYPES MASTER TABLE (Fish Catalog)
-- Optional branch_id (NULL = global company-wide, UUID = branch-specific)
-- Unique name per branch with NULLS NOT DISTINCT
-- =============================================================================
CREATE TABLE IF NOT EXISTS fish_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    default_rate NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fish_types_branch_name UNIQUE NULLS NOT DISTINCT (branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_fish_types_branch_id ON fish_types(branch_id);

CREATE TRIGGER trg_fish_types_updated_at
BEFORE UPDATE ON fish_types
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 8. ENTRIES TABLE (Weighbridge Purchase Transactions)
-- Foreign keys to parties(id) and vehicles(id)
-- Composite unique sequence per branch: (branch_id, entry_date, daily_sl_no)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    daily_sl_no INTEGER NOT NULL,
    party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    party_name VARCHAR(255) NOT NULL,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    vehicle_no VARCHAR(50) NOT NULL,
    gross_loaded_kg NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    empty_tare_kg NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ice_water_kg NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_kg NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    c_value NUMERIC(10, 2),
    remarks TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'RATE_PENDING' CHECK (status IN ('DRAFT', 'RATE_PENDING', 'LOCKED', 'STATEMENT_READY', 'HOLD_REVIEW', 'pending', 'locked', 'hold')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entries_branch_date_sl_no UNIQUE (branch_id, entry_date, daily_sl_no)
);

CREATE INDEX IF NOT EXISTS idx_entries_branch_date ON entries(branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_party_id ON entries(party_id);
CREATE INDEX IF NOT EXISTS idx_entries_vehicle_id ON entries(vehicle_id);

CREATE TRIGGER trg_entries_updated_at
BEFORE UPDATE ON entries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 9. ENTRY_BOXES TABLE (Box Breakdown & Multi-Fish Mix)
-- Foreign keys to entries(id) and fish_types(id)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entry_boxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    fish_type_id UUID REFERENCES fish_types(id) ON DELETE SET NULL,
    fish_name VARCHAR(100) NOT NULL,
    box_count INTEGER NOT NULL CHECK (box_count >= 0),
    mix_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (mix_percentage > 0 AND mix_percentage <= 100.00),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entry_boxes_entry_id ON entry_boxes(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_boxes_fish_type_id ON entry_boxes(fish_type_id);

CREATE TRIGGER trg_entry_boxes_updated_at
BEFORE UPDATE ON entry_boxes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 10. ENTRY_RATES TABLE (Admin Rate Fixing)
-- Foreign keys to entries(id), fish_types(id), and users(id)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entry_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    fish_type_id UUID REFERENCES fish_types(id) ON DELETE SET NULL,
    fish_name VARCHAR(100) NOT NULL,
    rate_per_kg NUMERIC(10, 2) NOT NULL CHECK (rate_per_kg >= 0),
    rated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entry_rates_entry_fish UNIQUE (entry_id, fish_name)
);

CREATE INDEX IF NOT EXISTS idx_entry_rates_entry_id ON entry_rates(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_rates_fish_type_id ON entry_rates(fish_type_id);
CREATE INDEX IF NOT EXISTS idx_entry_rates_rated_by ON entry_rates(rated_by);

CREATE TRIGGER trg_entry_rates_updated_at
BEFORE UPDATE ON entry_rates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 11. PUSH_SUBSCRIPTIONS TABLE (W3C Web Push VAPID RFC 8291/8292)
-- =============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_branch_id ON push_subscriptions(branch_id);

CREATE TRIGGER trg_push_subscriptions_updated_at
BEFORE UPDATE ON push_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 12. AUDIT_LOGS TABLE (Immutable Audit Journal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    diffs JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_created ON audit_logs(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_diffs_gin ON audit_logs USING gin (diffs);

COMMIT;
