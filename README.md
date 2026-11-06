# Tally Fish Database Migrations

This repository uses **`node-pg-migrate`** for managing PostgreSQL 16+ database schema migrations for the **Tally Fish Daily Statement Application**, built according to the System Requirements Specification (`docs/System Requirements Specification (SRS) (1).pdf`) and project rules (`.antigravity/rules/system.md`).

---

## Schema Overview

### 1. Dedicated Masters
- **`parties`**: Vendors/suppliers master. Supports optional `branch_id` (`NULL` for company-wide, `UUID` for branch-specific). Enforces `UNIQUE NULLS NOT DISTINCT (branch_id, name)`.
- **`vehicles`**: Vehicle registration master linked to parties. Supports optional `branch_id`. Enforces `UNIQUE NULLS NOT DISTINCT (branch_id, vehicle_no)`.
- **`fish_types`**: Fish species master with default rates. Supports optional `branch_id`. Enforces `UNIQUE NULLS NOT DISTINCT (branch_id, name)`.

### 2. Core & Transaction Tables
- **`branches`**: Physical unit management (e.g., Ullal Unit, Mangaluru Port).
- **`users`**: User identities with PIN hashes, failed attempt counts, and lockout timestamps.
- **`user_branch_roles`**: Scoped RBAC (`staff`, `admin`, `billing`) per branch.
- **`entries`**: Weighbridge transaction records with `gross_loaded_kg`, `empty_tare_kg`, `ice_water_kg`, and `net_kg`.
  - Foreign keys: `party_id` &rarr; `parties(id)`, `vehicle_id` &rarr; `vehicles(id)`.
  - Composite unique constraint: `UNIQUE (branch_id, entry_date, daily_sl_no)`.
- **`entry_boxes`**: Box counts and multi-fish mix percentages.
  - Foreign key: `fish_type_id` &rarr; `fish_types(id)`.
- **`entry_rates`**: Fixed rates per fish species set by Admin/Billing users.
  - Foreign keys: `fish_type_id` &rarr; `fish_types(id)`, `rated_by` &rarr; `users(id)`.
- **`push_subscriptions`**: RFC 8291/8292 VAPID subscription endpoints for Web Push notifications.
- **`audit_logs`**: Append-only audit journal with `diffs` (`JSONB`).

---

## Setup & Running Migrations

### 1. Configure Environment

Copy `.env.example` to `.env` and set your PostgreSQL connection details:

```bash
cp .env.example .env
```

Ensure your PostgreSQL service is running and the target database exists (e.g. `createdb tally_fish_dev`).

### 2. Run Migrations

```bash
# Apply pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Create a new migration file
npm run migrate:create <migration-name>
```

*(Alternatively, apply directly via `psql`: `psql -h 127.0.0.1 -U postgres -d tally_fish_dev -f sql/001_initial_schema.sql`)*
