const db = require('../db');

async function cleanup() {
  console.log('--- Cleaning up database test records ---');
  // 1. Delete test entries (identified by test party / test vehicle patterns)
  const delTestEntries = await db.query(`
    SELECT id FROM entries 
    WHERE party_name ILIKE '%Quick Vendor%' 
       OR party_name ILIKE '%Duplicate Vendor%' 
       OR party_name ILIKE '%Push Event Vendor%' 
       OR party_name ILIKE '%Offline Sync%' 
       OR party_name ILIKE '%Test%'
       OR vehicle_no ILIKE '%EV-9999%'
       OR vehicle_no ILIKE '%EF 9999%'
  `);
  const testIds = delTestEntries.rows.map(r => r.id);
  if (testIds.length > 0) {
    const delRates = await db.query('DELETE FROM entry_rates WHERE entry_id = ANY($1)', [testIds]);
    console.log('Deleted test entry_rates:', delRates.rowCount);
    const delBoxes = await db.query('DELETE FROM entry_boxes WHERE entry_id = ANY($1)', [testIds]);
    console.log('Deleted test entry_boxes:', delBoxes.rowCount);
    const delEntries = await db.query('DELETE FROM entries WHERE id = ANY($1)', [testIds]);
    console.log('Deleted test entries:', delEntries.rowCount);
  }

  // 2. Delete test vehicles
  const delVehicles = await db.query(`
    DELETE FROM vehicles 
    WHERE vehicle_no ILIKE '%TEST%' 
       OR vehicle_no ILIKE '%EV-9999%' 
       OR vehicle_no ILIKE '%EF 9999%'
  `);
  console.log('Deleted test vehicles:', delVehicles.rowCount);

  // 3. Delete test parties
  const delParties = await db.query(`
    DELETE FROM parties 
    WHERE name ILIKE 'Quick Vendor%' 
       OR name ILIKE 'Duplicate Vendor%' 
       OR name ILIKE 'Push Event Vendor%' 
       OR name ILIKE 'Offline Sync%' 
       OR name ILIKE '%Test%'
  `);
  console.log('Deleted test parties:', delParties.rowCount);

  // 4. Delete test push subscriptions
  const delSubs = await db.query("DELETE FROM push_subscriptions WHERE endpoint ILIKE '%test%' OR endpoint ILIKE '%stale%'");
  console.log('Deleted test subscriptions:', delSubs.rowCount);

  // 5. Delete test audit logs
  const delAudit = await db.query("DELETE FROM audit_logs WHERE diffs::text ILIKE '%test%' OR diffs::text ILIKE '%Quick Vendor%'");
  console.log('Deleted test audit logs:', delAudit.rowCount);

  // 6. Check remaining
  const remainingEntries = await db.query('SELECT id, daily_sl_no, party_name, vehicle_no, status FROM entries');
  console.log('REMAINING ENTRIES:', remainingEntries.rows);
  const remainingParties = await db.query('SELECT id, name FROM parties');
  console.log('REMAINING PARTIES:', remainingParties.rows);
  const remainingVehicles = await db.query('SELECT id, vehicle_no FROM vehicles');
  console.log('REMAINING VEHICLES:', remainingVehicles.rows);
  const remainingFish = await db.query('SELECT id, name FROM fish_types');
  console.log('REMAINING FISH:', remainingFish.rows);

  process.exit(0);
}

cleanup().catch(err => {
  console.error('Cleanup error:', err);
  process.exit(1);
});

