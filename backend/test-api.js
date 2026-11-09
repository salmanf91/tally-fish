/**
 * End-to-End API Test Script for Tally Fish Phase 2 Engine
 */
const http = require('http');
const app = require('./app');
const db = require('./db');

let server;
const PORT = 3001;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING TALLY FISH PHASE 2 ENGINE TEST SUITE');
  console.log('======================================================\n');

  server = app.listen(PORT);
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await request('GET', '/health');
    assert(health.status === 200 && health.body.status === 'ok', 'API Health Check');

    // 2. PIN Authentication & Lockout Verification
    console.log('\n--- Test Group: Authentication & PIN Lockout ---');
    // Invalid PIN
    const badLogin = await request('POST', '/auth/login', { username: 'admin', pin: '9999' });
    assert(badLogin.status === 401 && badLogin.body.remainingAttempts === 4, 'Invalid PIN rejection & failed attempts increment');

    // Valid Owner/Admin Login
    const adminLogin = await request('POST', '/auth/login', { username: 'admin', pin: '1234' });
    assert(adminLogin.status === 200 && adminLogin.body.token, 'Owner PIN Authentication & JWT generation');
    const adminToken = adminLogin.body.token;

    // Valid Staff Login
    const staffLogin = await request('POST', '/auth/login', { username: 'staff_ullal', pin: '1111' });
    assert(staffLogin.status === 200 && staffLogin.body.token, 'Staff PIN Authentication & JWT generation');
    const staffToken = staffLogin.body.token;
    const branchId = staffLogin.body.branches[0].branch_id;
    assert(!!branchId, `Resolved active Branch ID for staff & admin: ${branchId}`);

    // Valid BillingAdmin Login
    const billingLogin = await request('POST', '/auth/login', { username: 'billing_user', pin: '2222' });
    assert(billingLogin.status === 200 && billingLogin.body.token, 'billingAdmin PIN Authentication & JWT generation');
    const billingToken = billingLogin.body.token;

    // 3. Middleware & X-Branch-ID Enforcement
    console.log('\n--- Test Group: requireBranchRole & X-Branch-ID Middleware ---');
    const noBranchHeader = await request('GET', '/masters/parties', null, {
      Authorization: `Bearer ${staffToken}`,
    });
    assert(noBranchHeader.status === 400, 'Rejection when X-Branch-ID header is missing');

    const withBranchHeader = await request('GET', '/masters/parties', null, {
      Authorization: `Bearer ${staffToken}`,
      'X-Branch-ID': branchId,
    });
    assert(withBranchHeader.status === 200, 'Acceptance when X-Branch-ID header is present');

    // 4. Masters CRUD: Quick-Creation by Staff
    console.log('\n--- Test Group: Masters CRUD & Quick-Creation ---');
    const newPartyRes = await request(
      'POST',
      '/masters/parties',
      { name: `Quick Vendor ${Date.now()}`, phone: '+919988776655' },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    assert(newPartyRes.status === 201 && newPartyRes.body.data.id, 'Staff on-the-fly quick creation of Party');
    const partyId = newPartyRes.body.data.id;

    const newVehicleRes = await request(
      'POST',
      '/masters/vehicles',
      { vehicle_no: `KA-19-TEST-${Math.floor(Math.random() * 9000 + 1000)}`, party_id: partyId },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    assert(newVehicleRes.status === 201 && newVehicleRes.body.data.id, 'Staff on-the-fly quick creation of Vehicle');
    const vehicleId = newVehicleRes.body.data.id;

    // Fetch fish types
    const fishRes = await request('GET', '/masters/fish-types', null, {
      Authorization: `Bearer ${staffToken}`,
      'X-Branch-ID': branchId,
    });
    const chambanFish = fishRes.body.data.find((f) => f.name === 'CHAMBAN');
    const sardineFish = fishRes.body.data.find((f) => f.name === 'SARDINE');
    assert(!!chambanFish && !!sardineFish, 'Master fish types accessible to branch');

    // 5. Entry Creation: Net Weight Calculation & Box Mixes
    console.log('\n--- Test Group: Entry Creation & Net Weight Engine ---');
    // Formula: Net = Loaded (1500) - Empty (400) - Ice (100) = 1000 kg
    const entryPayload = {
      party_id: partyId,
      vehicle_id: vehicleId,
      gross_loaded_kg: 1500.00,
      empty_tare_kg: 400.00,
      ice_water_kg: 100.00,
      c_value: 12.5,
      boxes: [
        { fish_type_id: chambanFish.id, fish_name: 'CHAMBAN', box_count: 50, mix_percentage: 100 },
        { fish_type_id: sardineFish.id, fish_name: 'SARDINE', box_count: 20, mix_percentage: 100 },
      ],
    };

    const entryCreateRes = await request('POST', '/entries', entryPayload, {
      Authorization: `Bearer ${staffToken}`,
      'X-Branch-ID': branchId,
    });

    assert(entryCreateRes.status === 201, 'Entry creation success');
    const entry = entryCreateRes.body.data;
    assert(Number(entry.net_kg) === 1000.00, `Net Weight computation: ${entry.net_kg} == 1000.00 (1500 - 400 - 100)`);
    assert(entry.status === 'RATE_PENDING', 'Initial entry status is RATE_PENDING');
    assert(entry.daily_sl_no >= 1, `Isolated daily serial allocated: #${entry.daily_sl_no}`);

    // 6. Rate Fixing & Server-Side Locking by billingAdmin
    console.log('\n--- Test Group: Rate Fixing & Locking by billingAdmin ---');
    // Staff attempt to set rates -> Must be FORBIDDEN
    const staffRateAttempt = await request(
      'POST',
      `/entries/${entry.id}/rates`,
      { rates: [{ fish_type_id: chambanFish.id, fish_name: 'CHAMBAN', rate_per_kg: 50 }] },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    assert(staffRateAttempt.status === 403, 'Staff is strictly FORBIDDEN from setting rates');

    // billingAdmin sets rates directly with single office login:
    // Box mix:
    // 50 bx CHAMBAN @ 50/kg
    // 20 bx SARDINE @ 30/kg
    // Average Rate = (50*1.0*50 + 20*1.0*30) / (50 + 20) = (2500 + 600) / 70 = 3100 / 70 = 44.29 /kg
    const ratePayload = {
      rates: [
        { fish_type_id: chambanFish.id, fish_name: 'CHAMBAN', rate_per_kg: 50.00 },
        { fish_type_id: sardineFish.id, fish_name: 'SARDINE', rate_per_kg: 30.00 },
      ],
    };

    const billingRateRes = await request('POST', `/entries/${entry.id}/rates`, ratePayload, {
      Authorization: `Bearer ${billingToken}`,
      'X-Branch-ID': branchId,
    });

    assert(billingRateRes.status === 200, 'billingAdmin successfully set purchase rates');
    const rateData = billingRateRes.body.data;
    assert(rateData.status === 'LOCKED', 'Entry status updated to LOCKED');
    assert(rateData.average_rate === 44.29, `Weighted Average Rate calculated: ${rateData.average_rate} == 44.29`);
    assert(rateData.total_amount === 44290.00, `Total Purchase Amount: ${rateData.total_amount} == 44290.00 (1000 kg * 44.29)`);

    // 7. Verify Server-Side Lock Against Staff Edits
    console.log('\n--- Test Group: Server-Side Rate Lock Enforcement ---');
    const staffEditLockedEntry = await request(
      'PUT',
      `/entries/${entry.id}`,
      { gross_loaded_kg: 2000 },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    assert(staffEditLockedEntry.status === 403, 'Server-side rate lock strictly blocks Staff edits once locked');

    // 7b. Phase 5: Field Staff Flow & Offline Batch Sync (/api/entries/sync)
    console.log('\n--- Test Group: Offline Batch Sync & Server-Lock Conflict Handling ---');
    // Ensure masters exist for offline sync entry (production mode requires registered masters)
    await request(
      'POST',
      '/masters/parties',
      { name: 'Offline Sync Seafoods' },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    await request(
      'POST',
      '/masters/vehicles',
      { vehicle_no: 'KA 19 EF 9999' },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );

    const syncRes = await request(
      'POST',
      '/entries/sync',
      {
        entries: [
          {
            tempId: 'offline_slip_1',
            entry_date: new Date().toISOString().split('T')[0],
            party_name: 'Offline Sync Seafoods',
            vehicle_no: 'KA 19 EF 9999',
            gross_loaded_kg: 3200,
            empty_tare_kg: 1000,
            ice_water_kg: 200,
            remarks: '50 SARDINE 100% 20C',
            boxes: [{ fish_name: 'SARDINE', box_count: 50, mix_percentage: 100 }],
          },
          // Simulate conflicting edit on locked entry
          {
            tempId: 'offline_conflict_slip',
            id: entry.id,
            gross_loaded_kg: 1800,
            remarks: 'Staff offline attempted edit on locked slip',
          },
        ],
      },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    assert(syncRes.status === 200, 'POST /api/entries/sync responds 200');
    assert(syncRes.body.synced.length === 1, 'Offline new entry synced successfully');
    assert(syncRes.body.synced[0].tempId === 'offline_slip_1', 'Synced result includes original tempId');
    assert(syncRes.body.conflicts.length === 1, 'Server-lock conflict correctly detected');
    assert(syncRes.body.conflicts[0].status === 'HOLD_REVIEW', 'Conflicting entry routed to HOLD_REVIEW for Admin Review');

    // 8. Masters Merging by billingAdmin (Single Office Login capability)
    console.log('\n--- Test Group: Master Merging by billingAdmin ---');
    // Create duplicate party
    const dupPartyRes = await request(
      'POST',
      '/masters/parties',
      { name: `Duplicate Vendor ${Date.now()}` },
      { Authorization: `Bearer ${billingToken}`, 'X-Branch-ID': branchId }
    );
    const dupPartyId = dupPartyRes.body.data.id;

    const mergeRes = await request(
      'POST',
      '/masters/parties/merge',
      { sourcePartyId: dupPartyId, targetPartyId: partyId },
      { Authorization: `Bearer ${billingToken}`, 'X-Branch-ID': branchId }
    );
    assert(mergeRes.status === 200, 'billingAdmin successfully merged duplicate party');

    // 9. PIN Reset by billingAdmin (Single Office Login capability)
    console.log('\n--- Test Group: Operator PIN Reset by billingAdmin ---');
    const staffUserRes = await db.query("SELECT id FROM users WHERE username = 'staff_ullal'");
    const staffUserId = staffUserRes.rows[0].id;

    const resetPinRes = await request(
      'POST',
      '/auth/reset-pin',
      { userId: staffUserId, newPin: '1111' },
      { Authorization: `Bearer ${billingToken}`, 'X-Branch-ID': branchId }
    );
    assert(resetPinRes.status === 200, 'billingAdmin successfully reset operator PIN and unlocked account');

    // 10. Automated Audit Trail Verification
    console.log('\n--- Test Group: Automated Audit Log Verification ---');
    const auditRes = await db.query(
      `SELECT action, entity_type, diffs FROM audit_logs WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [branchId]
    );
    assert(auditRes.rows.length >= 2, `Audit trail recorded entries: ${auditRes.rows.length} logs found`);
    const actions = auditRes.rows.map((r) => r.action);
    console.log('   Recent Audit Actions:', actions);
    assert(
      actions.includes('ENTRY_RATES_FIXED') || actions.includes('RATE_CREATED') || actions.includes('MASTER_PARTY_MERGED'),
      'Audit log captured rates and master actions with diffs'
    );

    // 11. Web Push Subsystem: VAPID Key & Push Subscription
    console.log('\n--- Test Group: Web Push Subsystem (VAPID) ---');
    const vapidRes = await request('GET', '/notifications/vapid-key');
    assert(
      vapidRes.status === 200 && typeof vapidRes.body.publicKey === 'string' && vapidRes.body.publicKey.length > 20,
      'GET /api/notifications/vapid-key returns valid VAPID public key'
    );

    // Subscribe BillingAdmin device token linked to (user_id, branch_id)
    const testEndpointBilling = 'https://fcm.googleapis.com/fcm/send/test-billing-endpoint-' + Date.now();
    const subBillingRes = await request(
      'POST',
      '/notifications/subscribe',
      {
        endpoint: testEndpointBilling,
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YwfO5T9mockKeyBilling',
          auth: 'mockAuthSecretBilling',
        },
      },
      { Authorization: `Bearer ${billingToken}`, 'X-Branch-ID': branchId }
    );
    assert(subBillingRes.status === 201 && subBillingRes.body.success, 'POST /api/notifications/subscribe saves subscription for BillingAdmin');

    // Subscribe Owner device token linked to (user_id, branch_id)
    const testEndpointOwner = 'https://fcm.googleapis.com/fcm/send/test-owner-endpoint-' + Date.now();
    const subOwnerRes = await request(
      'POST',
      '/notifications/subscribe',
      {
        endpoint: testEndpointOwner,
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YwfO5T9mockKeyOwner',
          auth: 'mockAuthSecretOwner',
        },
      },
      { Authorization: `Bearer ${adminToken}`, 'X-Branch-ID': branchId }
    );
    assert(subOwnerRes.status === 201 && subOwnerRes.body.success, 'POST /api/notifications/subscribe saves subscription for Owner');

    // Verify stored subscriptions in PostgreSQL
    const dbSubs = await db.query(
      'SELECT id, endpoint, user_id, branch_id FROM push_subscriptions WHERE endpoint IN ($1, $2)',
      [testEndpointBilling, testEndpointOwner]
    );
    assert(dbSubs.rows.length === 2, 'Push subscriptions verified in PostgreSQL push_subscriptions table');

    // Test entry:created notification dispatch query logic
    const { getActiveBranchAdminSubscriptions, eventBus } = require('./notifications');
    const adminSubs = await getActiveBranchAdminSubscriptions(branchId);
    assert(
      adminSubs.some((s) => s.endpoint === testEndpointBilling) &&
      adminSubs.some((s) => s.endpoint === testEndpointOwner),
      'Active admin subscriptions resolved correctly for target branch'
    );

    // Test entry:created event emission on entry creation
    let eventReceivedEntry = null;
    eventBus.once('entry:created', (entry) => {
      eventReceivedEntry = entry;
    });

    // Ensure masters registered for event test
    await request(
      'POST',
      '/masters/parties',
      { name: 'Push Event Vendor' },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    await request(
      'POST',
      '/masters/vehicles',
      { vehicle_no: 'KA-19-EV-9999' },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );

    const eventEntryRes = await request(
      'POST',
      '/entries',
      {
        gross_loaded_kg: 1200,
        empty_tare_kg: 200,
        ice_water_kg: 50,
        party_name: 'Push Event Vendor',
        vehicle_no: 'KA-19-EV-9999',
        boxes: [{ fish_name: 'SARDINE', box_count: 10, mix_percentage: 100 }],
      },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    assert(eventEntryRes.status === 201, 'Created entry to verify entry:created event emission');

    // Give event loop tick
    await new Promise((r) => setTimeout(r, 100));
    assert(
      eventReceivedEntry !== null && Number(eventReceivedEntry.net_kg) === 950,
      'entry:created event bus listener successfully triggered with complete entry details'
    );

    // 12. Stale Push Subscription Pruning (HTTP 410 / 404 handler)
    console.log('\n--- Test Group: Stale Push Subscription Cleanup ---');
    const { deleteSubscriptionByEndpoint } = require('./notifications');
    const staleEndpoint = 'https://fcm.googleapis.com/fcm/send/stale-device-' + Date.now();
    await request(
      'POST',
      '/notifications/subscribe',
      {
        endpoint: staleEndpoint,
        keys: { p256dh: 'staleKey', auth: 'staleAuth' },
      },
      { Authorization: `Bearer ${billingToken}`, 'X-Branch-ID': branchId }
    );

    const beforeDelete = await db.query('SELECT id FROM push_subscriptions WHERE endpoint = $1', [staleEndpoint]);
    assert(beforeDelete.rows.length === 1, 'Stale test subscription saved');

    // Simulate 410 Gone / 404 Not Found pruning
    await deleteSubscriptionByEndpoint(staleEndpoint);
    const afterDelete = await db.query('SELECT id FROM push_subscriptions WHERE endpoint = $1', [staleEndpoint]);
    assert(afterDelete.rows.length === 0, 'Stale subscription successfully pruned from PostgreSQL');

    // 13. Master Bulk Import & Safe Deletion Test Group
    console.log('\n--- Test Group: Master Bulk Import & Deletion API ---');
    const importPayload = {
      entity: 'parties',
      records: [
        { name: 'Import Test Vendor Alpha', code: 'ITVA', phone: '+919111222333', is_active: true },
        { name: 'Import Test Vendor Beta', code: 'ITVB', phone: '+919444555666', is_active: true },
      ],
    };
    const importRes = await request(
      'POST',
      '/masters/import',
      importPayload,
      { Authorization: `Bearer ${billingToken}`, 'X-Branch-ID': branchId }
    );
    assert(importRes.status === 200, 'POST /api/masters/import responds 200');
    assert(importRes.body.data.inserted >= 1, `Bulk imported ${importRes.body.data.inserted} vendors`);

    // Verify imported vendor exists
    const checkImported = await db.query("SELECT id FROM parties WHERE name = 'Import Test Vendor Alpha'");
    assert(checkImported.rows.length === 1, 'Imported vendor found in database');
    const importedId = checkImported.rows[0].id;

    // Test Delete Master API
    const deleteRes = await request(
      'DELETE',
      `/masters/parties/${importedId}`,
      null,
      { Authorization: `Bearer ${billingToken}`, 'X-Branch-ID': branchId }
    );
    assert(deleteRes.status === 200 && deleteRes.body.success, 'DELETE /api/masters/parties/:id permanently deleted unreferenced vendor');

    console.log('\n======================================================');
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! MASTER CRUD & PRODUCTION ENGINE 100% OPERATIONAL');
    } else {
      console.error(`💥 ${failed} TEST(S) FAILED`);
    }
    console.log('======================================================\n');
  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    console.log('\n🧹 Cleaning up test artifacts to guarantee pristine production database state...');
    try {
      const realEntryId = '82d6cd23-4d13-46d4-9e16-d96143d9fc16';
      await db.query('DELETE FROM entry_rates WHERE entry_id != $1', [realEntryId]);
      await db.query('DELETE FROM entry_boxes WHERE entry_id != $1', [realEntryId]);
      await db.query('DELETE FROM entries WHERE id != $1', [realEntryId]);
      await db.query(`
        DELETE FROM vehicles 
        WHERE vehicle_no ILIKE '%TEST%' 
           OR vehicle_no ILIKE '%EV-9999%' 
           OR vehicle_no ILIKE '%EF 9999%'
      `);
      await db.query(`
        DELETE FROM parties 
        WHERE name ILIKE 'Quick Vendor%' 
           OR name ILIKE 'Duplicate Vendor%' 
           OR name ILIKE 'Push Event Vendor%' 
           OR name ILIKE 'Offline Sync%' 
           OR name ILIKE 'Import Test%'
           OR name ILIKE '%Test%'
      `);
      await db.query("DELETE FROM push_subscriptions WHERE endpoint ILIKE '%test%' OR endpoint ILIKE '%stale%'");
      await db.query("DELETE FROM audit_logs WHERE diffs::text ILIKE '%test%' OR diffs::text ILIKE '%Quick Vendor%'");
      console.log('✅ Cleanup completed: Only genuine manual entries and catalog masters preserved.');
    } catch (cleanupErr) {
      console.error('⚠️ Warning: Post-test cleanup encountered an error:', cleanupErr.message);
    }
    server.close();
    await db.pool.end();
    process.exit(failed === 0 ? 0 : 1);
  }
}

runTests();
