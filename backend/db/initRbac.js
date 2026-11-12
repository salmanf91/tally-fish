const db = require('./index');

const SYSTEM_ROLES = [
  {
    id: 'owner',
    name: 'Owner / Administrator',
    description: 'Complete administrative authority across all branches, pricing, and system security.',
    is_system: true,
    permissions: ['*'],
  },
  {
    id: 'billingAdmin',
    name: 'Billing Department',
    description: 'Manages intake slips, pricing review, master catalog, statements, and WhatsApp distribution.',
    is_system: true,
    permissions: [
      'slips:view',
      'slips:create',
      'slips:edit_open',
      'slips:edit_locked',
      'slips:delete_open',
      'slips:delete_locked',
      'rates:view',
      'rates:set',
      'billing:view',
      'statement:view',
      'statement:export',
      'masters:view',
      'masters:manage',
    ],
  },
  {
    id: 'staffAdmin',
    name: 'Weighbridge Staff',
    description: 'Weighbridge operator recording incoming trucks, boxes, and net weights.',
    is_system: true,
    permissions: [
      'slips:view',
      'slips:create',
      'slips:edit_open',
      'slips:delete_open',
    ],
  },
];

// Master list of available permissions with labels and categories
const ALL_PERMISSIONS = [
  // Weighbridge & Slips
  {
    category: 'Weighbridge & Slips',
    key: 'slips:view',
    name: 'View Intake Slips',
    description: 'Access Today view and view recorded weighbridge slips.',
  },
  {
    category: 'Weighbridge & Slips',
    key: 'slips:create',
    name: 'Create Intake Slips',
    description: 'Record new truck weighments, boxes, and net weights.',
  },
  {
    category: 'Weighbridge & Slips',
    key: 'slips:edit_open',
    name: 'Edit Open Slips',
    description: 'Modify weights, truck numbers, and boxes before rate is locked.',
  },
  {
    category: 'Weighbridge & Slips',
    key: 'slips:edit_locked',
    name: 'Edit Locked Slips',
    description: 'Modify slips even after rates have been fixed by admin.',
  },
  {
    category: 'Weighbridge & Slips',
    key: 'slips:delete_open',
    name: 'Delete Open Slips',
    description: 'Delete wrongly recorded slips before rate lock.',
  },
  {
    category: 'Weighbridge & Slips',
    key: 'slips:delete_locked',
    name: 'Delete Locked Slips',
    description: 'Delete slips even after rates have been assigned and locked.',
  },

  // Pricing & Rates
  {
    category: 'Pricing & Rates',
    key: 'rates:view',
    name: 'View Fish Rates',
    description: 'View pricing per kg and receive rate-pending alerts.',
  },
  {
    category: 'Pricing & Rates',
    key: 'rates:set',
    name: 'Set & Fix Rates',
    description: 'Assign and fix final purchasing rates per kg for fish species.',
  },

  // Billing & Statements
  {
    category: 'Billing & Statements',
    key: 'billing:view',
    name: 'Billing Department',
    description: 'Access billing department view for reviewing approved slips.',
  },
  {
    category: 'Billing & Statements',
    key: 'statement:view',
    name: 'View Daily Statements',
    description: 'View detailed daily procurement statements and summaries.',
  },
  {
    category: 'Billing & Statements',
    key: 'statement:export',
    name: 'Export & Share Statements',
    description: 'Download Excel, print/save PDF reports, and share via WhatsApp.',
  },

  // Master Catalog
  {
    category: 'Master Catalog',
    key: 'masters:view',
    name: 'View Masters',
    description: 'View vendors, vehicles, and fish species catalog.',
  },
  {
    category: 'Master Catalog',
    key: 'masters:manage',
    name: 'Manage Masters',
    description: 'Create, edit, merge, or deactivate vendors, vehicles, and fish species.',
  },

  // Administration & Security
  {
    category: 'Administration & Security',
    key: 'accounts:manage',
    name: 'Manage Users & Security',
    description: 'Create user accounts, assign branch access, and reset 4-digit PINs.',
  },
  {
    category: 'Administration & Security',
    key: 'roles:manage',
    name: 'Manage Roles & RBAC',
    description: 'Create custom roles, edit role permissions, and customize access policies.',
  },
  {
    category: 'Administration & Security',
    key: 'audit:view',
    name: 'View Audit Logs',
    description: 'Inspect immutable system audit journal for all modifications.',
  },
];

async function initRbac() {
  try {
    // 1. Create roles table
    await db.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT false,
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Upsert default system roles
    for (const r of SYSTEM_ROLES) {
      await db.query(
        `
        INSERT INTO roles (id, name, description, is_system, permissions)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_system = EXCLUDED.is_system,
          permissions = CASE
            WHEN roles.is_system = true THEN EXCLUDED.permissions
            ELSE roles.permissions
          END,
          updated_at = CURRENT_TIMESTAMP
        `,
        [r.id, r.name, r.description, r.is_system, JSON.stringify(r.permissions)]
      );
    }
    console.log('[RBAC] Roles and system permission policies initialized successfully.');
  } catch (err) {
    console.error('[RBAC Error] Failed to initialize RBAC tables:', err.message);
  }
}

module.exports = {
  initRbac,
  SYSTEM_ROLES,
  ALL_PERMISSIONS,
};
