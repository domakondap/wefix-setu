// End-to-end scenario tests for the WeFix Setu API.
// Runs against a live server (default http://localhost:4000). Exercises the full
// order chain, every role, transition guards, RBAC, and error cases.
//
//   node src/index.js &          # or npm run dev
//   npm run seed                 # fresh demo data
//   npm run test:e2e
//
// Exit code 0 = all passed, 1 = at least one failure.

const BASE = process.env.BASE || 'http://localhost:4000';
let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(t) {
  console.log(`\n\x1b[1m${t}\x1b[0m`);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: res.status, data };
}

const uniq = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

async function main() {
  console.log(`\nWeFix Setu E2E — target ${BASE}\n${'='.repeat(48)}`);

  // ---------------------------------------------------------------- AUTH
  section('Auth & validation');
  let r = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Test Cust', email: `cust_${uniq}@test.com`, password: 'GoodPass1' },
  });
  ok('register customer (valid)', r.status === 201 && r.data.token, `status ${r.status}`);
  const custToken = r.data.token;

  r = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Weak', email: `weak_${uniq}@test.com`, password: 'short' },
  });
  ok('register weak password → 400', r.status === 400);

  r = await api('/auth/register', {
    method: 'POST',
    body: { name: 'NoUpper', email: `noupper_${uniq}@test.com`, password: 'alllower1' },
  });
  ok('register password without uppercase → 400', r.status === 400);

  r = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Dupe', email: `cust_${uniq}@test.com`, password: 'GoodPass1' },
  });
  ok('register duplicate email → 409', r.status === 409);

  r = await api('/auth/register', {
    method: 'POST',
    body: { name: 'BadEmail', email: 'not-an-email', password: 'GoodPass1' },
  });
  ok('register invalid email → 400', r.status === 400);

  r = await api('/auth/register-vendor', {
    method: 'POST',
    body: {
      name: 'Vend Owner',
      email: `vend_${uniq}@test.com`,
      password: 'GoodPass1',
      shopName: `Test Shop ${uniq}`,
      country: 'Germany',
      city: 'Berlin',
      categories: ['Mobile Phone', 'Tablet'],
    },
  });
  ok('register vendor (valid)', r.status === 201 && r.data.token, `status ${r.status}`);
  ok('new vendor shop is pending', r.data.shop?.status === 'pending');
  const newVendorToken = r.data.token;
  const newShopId = r.data.shop?.id;

  r = await api('/auth/login', {
    method: 'POST',
    body: { email: 'customer@wefixsetu.com', password: 'password123' },
  });
  ok('login seeded customer', r.status === 200 && r.data.token);
  const seedCust = r.data.token;

  r = await api('/auth/login', {
    method: 'POST',
    body: { email: 'customer@wefixsetu.com', password: 'wrongpass' },
  });
  ok('login wrong password → 401', r.status === 401);

  r = await api('/auth/login', {
    method: 'POST',
    body: { email: 'nobody@nowhere.com', password: 'whatever' },
  });
  ok('login unknown email → 401', r.status === 401);

  r = await api('/auth/me', { token: custToken });
  ok('GET /auth/me with token', r.status === 200 && r.data.user);
  r = await api('/auth/me');
  ok('GET /auth/me without token → 401', r.status === 401);

  const berlin = (await api('/auth/login', { method: 'POST', body: { email: 'vendor.berlin@wefixsetu.com', password: 'password123' } })).data.token;
  const admin = (await api('/auth/login', { method: 'POST', body: { email: 'admin@wefixsetu.com', password: 'password123' } })).data.token;

  // ---------------------------------------------------------------- CATALOG
  section('Catalog');
  r = await api('/catalog/meta');
  ok('catalog meta has categories + handlingFee', r.data.categories?.length > 0 && typeof r.data.handlingFee === 'number');
  r = await api('/catalog/shops');
  ok('catalog shops returns only approved', r.data.shops?.every((s) => s.status === 'approved'));
  r = await api('/catalog/partners');
  ok('catalog partners returns only enabled', r.data.partners?.every((p) => p.enabled));
  const partners = r.data.partners;
  r = await api('/catalog/cost-preview', { method: 'POST', token: seedCust, body: { pickupPartnerId: partners[0].id, returnPartnerId: partners[0].id, repairEstimate: 100 } });
  const expected = 100 + partners[0].price * 2 + r.data.breakdown.handlingFee;
  ok('cost-preview math correct', Math.abs(r.data.breakdown.total - expected) < 0.001, `got ${r.data.breakdown?.total}, expected ${expected}`);

  // ---------------------------------------------- FULL HAPPY PATH → Delivered
  section('Full lifecycle: Created → Delivered');
  r = await api('/orders', {
    method: 'POST', token: seedCust,
    body: { category: 'Mobile Phone', issueDescription: 'Screen', pickupCountry: 'Germany', pickupCity: 'Berlin', pickupAddress: 'Village 1', shopId: 1, pickupPartnerId: partners[0].id, returnPartnerId: partners[0].id },
  });
  ok('create order → Created', r.status === 201 && r.data.order.status === 'Created');
  const oid = r.data.order.id;

  r = await api(`/vendor/orders/${oid}/intake`, { method: 'POST', token: berlin, body: { action: 'accept' } });
  ok('vendor intake accept → Pickup Scheduled', r.data.order?.status === 'Pickup Scheduled');

  r = await api(`/vendor/orders/${oid}/shipments`, { method: 'POST', token: berlin, body: { kind: 'pickup' } });
  ok('create pickup shipment', r.status === 201 && r.data.shipment.trackingNumber);
  const pickupShipId = r.data.shipment.id;

  for (const st of ['Scheduled', 'Picked Up', 'In Transit', 'Delivered']) {
    r = await api(`/vendor/shipments/${pickupShipId}/status`, { method: 'POST', token: berlin, body: { status: st } });
    ok(`pickup shipment → ${st}`, r.data.shipment?.status === st);
  }
  r = await api(`/orders/${oid}`, { token: berlin });
  const ship = r.data.order.shipments.find((s) => s.id === pickupShipId);
  ok('pickup milestones stamped', ship.scheduledAt && ship.pickedUpAt && ship.inTransitAt && ship.deliveredAt);

  for (const st of ['Picked Up', 'In Transit to Shop', 'Received by Shop']) {
    r = await api(`/vendor/orders/${oid}/status`, { method: 'POST', token: berlin, body: { status: st } });
    ok(`order → ${st}`, r.data.order?.status === st, JSON.stringify(r.data));
  }

  // Guard: repair before quote accepted
  r = await api(`/orders/${oid}`, { token: berlin });
  // (status is Received by Shop; In Repair is not even a legal next step yet)
  r = await api(`/vendor/orders/${oid}/quote`, { method: 'POST', token: berlin, body: { price: 75, estimatedDays: 2, notes: 'OEM screen' } });
  ok('vendor send quote → Quote Sent', r.data.order?.status === 'Quote Sent' && r.data.order.quoteStatus === 'sent');
  ok('quote recomputed total', r.data.order.costs.repair === 75);

  // Guard: pay before accept
  r = await api(`/orders/${oid}/pay`, { method: 'POST', token: seedCust, body: { method: 'Card' } });
  ok('pay before accepting quote → 409', r.status === 409);

  r = await api(`/orders/${oid}/accept-quote`, { method: 'POST', token: seedCust });
  ok('customer accept quote → Quote Accepted', r.data.order?.status === 'Quote Accepted' && r.data.order.quoteStatus === 'accepted');

  r = await api(`/orders/${oid}/payment-intent`, { method: 'POST', token: seedCust });
  ok('create payment intent', !!r.data.clientSecret && (r.data.provider === 'mock' || r.data.provider === 'stripe'));

  r = await api(`/orders/${oid}/pay`, { method: 'POST', token: seedCust, body: { method: 'PayPal' } });
  ok('pay after accept → paid', r.data.order?.paymentStatus === 'paid');

  r = await api(`/orders/${oid}/pay`, { method: 'POST', token: seedCust, body: { method: 'Card' } });
  ok('double pay is idempotent (200, still paid)', r.status === 200 && r.data.order?.paymentStatus === 'paid');

  for (const st of ['In Repair', 'Repaired', 'Ready to Ship']) {
    r = await api(`/vendor/orders/${oid}/status`, { method: 'POST', token: berlin, body: { status: st } });
    ok(`order → ${st}`, r.data.order?.status === st);
  }
  r = await api(`/vendor/orders/${oid}/notes`, { method: 'POST', token: berlin, body: { beforeNotes: 'Cracked', afterNotes: 'Replaced, tested' } });
  ok('before/after notes saved', r.data.order?.beforeNotes && r.data.order?.afterNotes);

  r = await api(`/vendor/orders/${oid}/shipments`, { method: 'POST', token: berlin, body: { kind: 'return' } });
  const returnShipId = r.data.shipment.id;
  ok('create return shipment', r.status === 201 && r.data.shipment.kind === 'return');

  for (const st of ['Shipped Back', 'Delivered']) {
    r = await api(`/vendor/orders/${oid}/status`, { method: 'POST', token: berlin, body: { status: st } });
    ok(`order → ${st}`, r.data.order?.status === st);
  }
  r = await api(`/orders/${oid}`, { token: seedCust });
  ok('final state Delivered + paid', r.data.order.status === 'Delivered' && r.data.order.paymentStatus === 'paid');
  ok('timeline has many events', r.data.order.timeline.length >= 12, `${r.data.order.timeline.length} events`);

  // ------------------------------------------------------- TRANSITION GUARDS
  section('Transition & state guards');
  r = await api(`/vendor/orders/${oid}/status`, { method: 'POST', token: berlin, body: { status: 'In Repair' } });
  ok('illegal transition from Delivered → 409', r.status === 409);

  // New order to test illegal jump + cancel guard
  r = await api('/orders', { method: 'POST', token: seedCust, body: { category: 'Laptop', issueDescription: 'x', pickupCountry: 'Germany', pickupCity: 'Berlin', pickupAddress: 'a', shopId: 1 } });
  const oid2 = r.data.order.id;
  r = await api(`/vendor/orders/${oid2}/status`, { method: 'POST', token: berlin, body: { status: 'Delivered' } });
  ok('jump Created → Delivered → 409', r.status === 409);
  r = await api(`/orders/${oid2}/cancel`, { method: 'POST', token: seedCust });
  ok('cancel fresh order → Cancelled', r.data.order?.status === 'Cancelled');
  r = await api(`/orders/${oid2}/cancel`, { method: 'POST', token: seedCust });
  ok('cancel already-cancelled → 409', r.status === 409);

  // ----------------------------------------------------------- QUOTE REJECT
  section('Quote rejection path');
  r = await api('/orders', { method: 'POST', token: seedCust, body: { category: 'Tablet', issueDescription: 'y', pickupCountry: 'Germany', pickupCity: 'Berlin', pickupAddress: 'b', shopId: 1 } });
  const oid3 = r.data.order.id;
  await api(`/vendor/orders/${oid3}/intake`, { method: 'POST', token: berlin, body: { action: 'accept' } });
  for (const st of ['Picked Up', 'In Transit to Shop', 'Received by Shop']) await api(`/vendor/orders/${oid3}/status`, { method: 'POST', token: berlin, body: { status: st } });
  await api(`/vendor/orders/${oid3}/quote`, { method: 'POST', token: berlin, body: { price: 200 } });
  r = await api(`/orders/${oid3}/reject-quote`, { method: 'POST', token: seedCust, body: { reason: 'Too expensive' } });
  ok('reject quote → quoteStatus rejected', r.data.order?.quoteStatus === 'rejected');
  r = await api(`/vendor/orders/${oid3}/quote`, { method: 'POST', token: berlin, body: { price: 120 } });
  ok('vendor re-quote after rejection', r.data.order?.quoteStatus === 'sent');
  r = await api(`/orders/${oid3}/accept-quote`, { method: 'POST', token: seedCust });
  ok('accept re-quote → Quote Accepted', r.data.order?.status === 'Quote Accepted');

  // ---------------------------------------------------------- INTAKE REJECT
  section('Intake rejection path');
  r = await api('/orders', { method: 'POST', token: seedCust, body: { category: 'Watch', issueDescription: 'z', pickupCountry: 'Germany', pickupCity: 'Berlin', pickupAddress: 'c', shopId: 1 } });
  const oid4 = r.data.order.id;
  r = await api(`/vendor/orders/${oid4}/intake`, { method: 'POST', token: berlin, body: { action: 'reject', reason: 'Out of capacity' } });
  ok('vendor intake reject → Cancelled', r.data.order?.status === 'Cancelled');

  // ------------------------------------------------------------------- RBAC
  section('RBAC & ownership');
  // Another customer cannot see seedCust's order
  r = await api(`/orders/${oid}`, { token: custToken });
  ok('other customer reading order → 403', r.status === 403);
  // Customer cannot hit admin
  r = await api('/admin/users', { token: seedCust });
  ok('customer → admin endpoint → 403', r.status === 403);
  // Customer cannot use vendor endpoint
  r = await api(`/vendor/orders/${oid}/status`, { method: 'POST', token: seedCust, body: { status: 'In Repair' } });
  ok('customer → vendor endpoint → 403', r.status === 403);
  // New vendor (different shop) cannot act on Berlin's order
  r = await api(`/vendor/orders/${oid}/quote`, { method: 'POST', token: newVendorToken, body: { price: 1 } });
  ok('vendor acting on another shop’s order → 403', r.status === 403);
  // Unauthorized (no token)
  r = await api('/orders');
  ok('no token on /orders → 401', r.status === 401);

  // ------------------------------------------------------------------ ADMIN
  section('Admin console');
  r = await api(`/admin/shops/${newShopId}`, { method: 'PATCH', token: admin, body: { status: 'approved' } });
  ok('admin approve pending shop', r.data.shop?.status === 'approved');
  r = await api(`/admin/shops/${newShopId}`, { method: 'PATCH', token: admin, body: { status: 'disabled' } });
  ok('admin disable shop', r.data.shop?.status === 'disabled');
  r = await api('/catalog/shops');
  ok('disabled shop hidden from catalog', !r.data.shops.some((s) => s.id === newShopId));

  r = await api('/admin/partners', { method: 'POST', token: admin, body: { name: `Courier ${uniq}`, type: 'both', serviceAreas: ['Germany/Berlin'], price: 9, etaDays: 2 } });
  ok('admin create partner', r.status === 201);
  const partnerId = r.data.partner.id;
  r = await api(`/admin/partners/${partnerId}`, { method: 'PATCH', token: admin, body: { enabled: false } });
  ok('admin disable partner', r.data.partner?.enabled === false);
  r = await api('/catalog/partners');
  ok('disabled partner hidden from catalog', !r.data.partners.some((p) => p.id === partnerId));

  r = await api('/admin/settings/handling-fee', { method: 'PUT', token: admin, body: { handlingFee: 12 } });
  ok('admin set handling fee', r.data.handlingFee === 12);
  r = await api('/orders', { method: 'POST', token: seedCust, body: { category: 'Camera', issueDescription: 'fee test', pickupCountry: 'Germany', pickupCity: 'Berlin', pickupAddress: 'd', shopId: 1 } });
  ok('new order picks up updated handling fee', r.data.order.costs.handlingFee === 12, `got ${r.data.order.costs.handlingFee}`);
  await api('/admin/settings/handling-fee', { method: 'PUT', token: admin, body: { handlingFee: 5 } }); // restore

  r = await api(`/admin/orders/${oid3}/dispute`, { method: 'POST', token: admin, body: { flag: true, note: 'customer complaint' } });
  ok('admin flag dispute', r.data.order?.disputeFlag === true);
  r = await api(`/admin/orders/${oid3}/dispute`, { method: 'POST', token: admin, body: { flag: false } });
  ok('admin clear dispute', r.data.order?.disputeFlag === false);

  r = await api(`/admin/orders/${oid3}/status`, { method: 'POST', token: admin, body: { status: 'Cancelled', note: 'manual' } });
  ok('admin manual status override', r.data.order?.status === 'Cancelled');
  r = await api(`/admin/orders/${oid3}/status`, { method: 'POST', token: admin, body: { status: 'NotARealStatus' } });
  ok('admin invalid override status → 400', r.status === 400);

  r = await api('/admin/users', { token: admin });
  ok('admin list users', r.data.users?.length > 0);
  r = await api('/admin/orders', { token: admin });
  ok('admin list all orders', r.data.orders?.length > 0);
  r = await api('/admin/shipments', { token: admin });
  ok('admin list all shipments', Array.isArray(r.data.shipments));

  // ------------------------------------------------------------ VALIDATION
  section('Input validation');
  r = await api('/orders', { method: 'POST', token: seedCust, body: { category: 'Mobile Phone' } });
  ok('create order missing fields → 400', r.status === 400);
  r = await api('/orders', { method: 'POST', token: seedCust, body: { category: 'Mobile Phone', issueDescription: 'x', pickupCountry: 'Germany', pickupCity: 'Berlin', pickupAddress: 'a', shopId: 99999 } });
  ok('create order with bad shopId → 400', r.status === 400);
  // oid3 is quote-accepted but unpaid → invalid method should 400 (mock mode).
  r = await api(`/orders/${oid3}/pay`, { method: 'POST', token: seedCust, body: { method: 'Crypto' } });
  ok('invalid payment method → 400 (mock)', r.status === 400 || r.status === 402);
  r = await api('/orders/999999', { token: seedCust });
  ok('nonexistent order → 404', r.status === 404);

  // ------------------------------------------------------------------ DONE
  console.log(`\n${'='.repeat(48)}`);
  console.log(`\x1b[1mResults: \x1b[32m${passed} passed\x1b[0m, ${failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}\x1b[0m`);
  if (failed) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nAll scenarios passed. ✅\n');
}

main().catch((e) => {
  console.error('Test harness crashed:', e);
  process.exit(1);
});
