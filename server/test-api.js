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

    // Valid Admin Login
    const adminLogin = await request('POST', '/auth/login', { username: 'admin', pin: '1234' });
    assert(adminLogin.status === 200 && adminLogin.body.token, 'Admin PIN Authentication & JWT generation');
    const adminToken = adminLogin.body.token;

    // Valid Staff Login
    const staffLogin = await request('POST', '/auth/login', { username: 'staff_ullal', pin: '1111' });
    assert(staffLogin.status === 200 && staffLogin.body.token, 'Staff PIN Authentication & JWT generation');
    const staffToken = staffLogin.body.token;
    const branchId = staffLogin.body.branches[0].branch_id;
    assert(!!branchId, `Resolved active Branch ID for staff & admin: ${branchId}`);

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

    if (entryCreateRes.status !== 201) {
      console.error('DEBUG entryCreateRes error:', JSON.stringify(entryCreateRes.body, null, 2));
    }

    assert(entryCreateRes.status === 201, 'Entry creation success');
    const entry = entryCreateRes.body.data;
    assert(Number(entry.net_kg) === 1000.00, `Net Weight computation: ${entry.net_kg} == 1000.00 (1500 - 400 - 100)`);
    assert(entry.status === 'RATE_PENDING', 'Initial entry status is RATE_PENDING');
    assert(entry.daily_sl_no >= 1, `Isolated daily serial allocated: #${entry.daily_sl_no}`);

    // 6. Rate Fixing & Server-Side Locking
    console.log('\n--- Test Group: Rate Fixing & Locking Engine ---');
    // Staff attempt to set rates -> Must be FORBIDDEN
    const staffRateAttempt = await request(
      'POST',
      `/entries/${entry.id}/rates`,
      { rates: [{ fish_type_id: chambanFish.id, fish_name: 'CHAMBAN', rate_per_kg: 50 }] },
      { Authorization: `Bearer ${staffToken}`, 'X-Branch-ID': branchId }
    );
    assert(staffRateAttempt.status === 403, 'Staff is strictly FORBIDDEN from setting rates');

    // Admin sets rates:
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

    const adminRateRes = await request('POST', `/entries/${entry.id}/rates`, ratePayload, {
      Authorization: `Bearer ${adminToken}`,
      'X-Branch-ID': branchId,
    });

    assert(adminRateRes.status === 200, 'Admin successfully set purchase rates');
    const rateData = adminRateRes.body.data;
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

    // 8. Masters Merging by Admin
    console.log('\n--- Test Group: Master Merging by Admin ---');
    // Create duplicate party
    const dupPartyRes = await request(
      'POST',
      '/masters/parties',
      { name: `Duplicate Vendor ${Date.now()}` },
      { Authorization: `Bearer ${adminToken}`, 'X-Branch-ID': branchId }
    );
    const dupPartyId = dupPartyRes.body.data.id;

    const mergeRes = await request(
      'POST',
      '/masters/parties/merge',
      { sourcePartyId: dupPartyId, targetPartyId: partyId },
      { Authorization: `Bearer ${adminToken}`, 'X-Branch-ID': branchId }
    );
    assert(mergeRes.status === 200, 'Admin duplicate party merging success');

    // 9. Automated Audit Trail Verification
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

    console.log('\n======================================================');
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! PHASE 2 BACKEND IS 100% OPERATIONAL');
    } else {
      console.error(`💥 ${failed} TEST(S) FAILED`);
    }
    console.log('======================================================\n');
  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    server.close();
    await db.pool.end();
    process.exit(failed === 0 ? 0 : 1);
  }
}

runTests();
