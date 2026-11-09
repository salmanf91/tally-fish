const bcrypt = require('bcryptjs');
const db = require('./index');

async function seed() {
  console.log('[Seed] Seeding initial data for Tally Fish development environment...');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Seed Branches
    const branchUllal = await client.query(`
      INSERT INTO branches (id, name, code, is_active)
      VALUES (gen_random_uuid(), 'Ullal Unit', 'ULLAL', true)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, code;
    `);
    const branchMnglr = await client.query(`
      INSERT INTO branches (id, name, code, is_active)
      VALUES (gen_random_uuid(), 'Mangaluru Port', 'MNGLR', true)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, code;
    `);

    const ullalId = branchUllal.rows[0].id;
    const mnglrId = branchMnglr.rows[0].id;
    console.log(`[Seed] Branches ready: Ullal (${ullalId}), Mangaluru (${mnglrId})`);

    // 2. Seed Users with 4-digit PINs
    const pinHashAdmin = await bcrypt.hash('1234', 10);
    const pinHashStaff = await bcrypt.hash('1111', 10);
    const pinHashBilling = await bcrypt.hash('2222', 10);

    const adminUser = await client.query(`
      INSERT INTO users (id, username, pin_hash, is_active)
      VALUES (gen_random_uuid(), 'admin', '${pinHashAdmin}', true)
      ON CONFLICT (username) DO UPDATE SET pin_hash = EXCLUDED.pin_hash
      RETURNING id, username;
    `);

    const staffUser = await client.query(`
      INSERT INTO users (id, username, pin_hash, is_active)
      VALUES (gen_random_uuid(), 'staff_ullal', '${pinHashStaff}', true)
      ON CONFLICT (username) DO UPDATE SET pin_hash = EXCLUDED.pin_hash
      RETURNING id, username;
    `);

    const billingUser = await client.query(`
      INSERT INTO users (id, username, pin_hash, is_active)
      VALUES (gen_random_uuid(), 'billing_user', '${pinHashBilling}', true)
      ON CONFLICT (username) DO UPDATE SET pin_hash = EXCLUDED.pin_hash
      RETURNING id, username;
    `);

    const adminId = adminUser.rows[0].id;
    const staffId = staffUser.rows[0].id;
    const billingId = billingUser.rows[0].id;

    // 3. User Branch Roles: Strictly 3 roles (owner, staffAdmin, billingAdmin)
    await client.query(`
      INSERT INTO user_branch_roles (id, user_id, branch_id, role)
      VALUES
        (gen_random_uuid(), '${adminId}', '${ullalId}', 'owner'),
        (gen_random_uuid(), '${adminId}', '${mnglrId}', 'owner'),
        (gen_random_uuid(), '${staffId}', '${ullalId}', 'staffAdmin'),
        (gen_random_uuid(), '${billingId}', '${ullalId}', 'billingAdmin')
      ON CONFLICT (user_id, branch_id, role) DO NOTHING;
    `);
    console.log('[Seed] Users and branch roles assigned.');

    // 4. Seed Fish Species Master
    await client.query(`
      INSERT INTO fish_types (id, branch_id, name, code, default_rate, is_active)
      VALUES
        (gen_random_uuid(), NULL, 'CHAMBAN', 'CHM', 45.00, true),
        (gen_random_uuid(), NULL, 'SARDINE', 'SAR', 35.00, true),
        (gen_random_uuid(), NULL, 'KODANDE', 'KOD', 30.00, true),
        (gen_random_uuid(), NULL, 'MURU HEAD', 'MUR', 40.00, true),
        (gen_random_uuid(), NULL, 'GOLAI', 'GOL', 50.00, true),
        (gen_random_uuid(), NULL, 'THONDE', 'THO', 55.00, true),
        (gen_random_uuid(), NULL, 'AILE', 'AIL', 42.00, true),
        (gen_random_uuid(), NULL, 'DISCO', 'DIS', 38.00, true),
        (gen_random_uuid(), NULL, 'PAMBOL', 'PAM', 65.00, true),
        (gen_random_uuid(), NULL, 'THAKATTE', 'THA', 48.00, true),
        (gen_random_uuid(), NULL, 'MIX', 'MIX', 25.00, true),
        (gen_random_uuid(), NULL, 'MACKEREL', 'MCK', 60.00, true)
      ON CONFLICT DO NOTHING;
    `);
    console.log('[Seed] Master fish types seeded.');

    // 5. Seed Vendor Parties Master
    const party1 = await client.query(`
      INSERT INTO parties (id, branch_id, name, code, phone, is_active)
      VALUES (gen_random_uuid(), '${ullalId}', 'Coastal Catchers Ltd', 'CCL', '+919876543210', true)
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);
    const party1Id = party1.rows.length > 0 ? party1.rows[0].id : null;

    // 6. Seed Vehicles Master
    await client.query(`
      INSERT INTO vehicles (id, branch_id, vehicle_no, party_id, is_active)
      VALUES
        (gen_random_uuid(), '${ullalId}', 'KL 59Z 5206', ${party1Id ? `'${party1Id}'` : 'NULL'}, true),
        (gen_random_uuid(), '${ullalId}', 'KA 19D 7628', NULL, true),
        (gen_random_uuid(), '${ullalId}', 'KA 19AE 6136', NULL, true),
        (gen_random_uuid(), '${ullalId}', 'KA 09C 8942', NULL, true),
        (gen_random_uuid(), '${ullalId}', 'KA-19-AB-1234', ${party1Id ? `'${party1Id}'` : 'NULL'}, true),
        (gen_random_uuid(), '${ullalId}', 'KA-19-CD-5678', NULL, true)
      ON CONFLICT DO NOTHING;
    `);
    console.log('[Seed] Master parties and vehicles seeded.');

    await client.query('COMMIT');
    console.log('[Seed] Seed completed successfully!');
    console.log('---------------------------------------------------------');
    console.log('Demo Credentials for Testing:');
    console.log('  Admin:   username = "admin"        PIN = "1234"');
    console.log('  Staff:   username = "staff_ullal"  PIN = "1111"');
    console.log('  Billing: username = "billing_user" PIN = "2222"');
    console.log(`  Branch:  "Ullal Unit" ID = "${ullalId}"`);
    console.log('---------------------------------------------------------');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed Error] Failed to seed database:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed().then(() => process.exit(0));
}

module.exports = seed;

