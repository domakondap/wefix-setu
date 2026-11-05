// Seeds demo users, shops, delivery partners and a couple of in-flight orders.
// Works against both the SQLite and PostgreSQL drivers.
import { customAlphabet } from 'nanoid';
import { db, migrate, setSetting, resetAllData, nowIso } from './db.js';
import { hashPassword } from './utils/password.js';
import { addEvent, recomputeCosts, getOrderRow } from './utils/orderService.js';

const orderCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);
const trackingCode = customAlphabet('0123456789', 12);

// A timestamp `days` days from now, in the shared 'YYYY-MM-DD HH:MM:SS' format.
function isoOffset(days) {
  const ms = Date.parse(`${nowIso().replace(' ', 'T')}Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

const insertId = async (sql, params) => {
  const info = await db.prepare(sql).run(...params);
  return info.lastInsertRowid;
};

// Wipes and re-seeds all demo data. Exported so the server can auto-seed an
// empty database on first boot.
export async function seedDemoData() {
  await migrate();
  console.log('Seeding WeFix Setu demo data…');

  await resetAllData();
  await setSetting('handling_fee', 5);

  const pw = hashPassword('password123');
  const userSql = `INSERT INTO users (name, email, password_hash, role, phone_country_code, phone)
                   VALUES (?, ?, ?, ?, ?, ?)`;

  await insertId(userSql, ['Platform Admin', 'admin@wefixsetu.com', pw, 'admin', '+49', '3010000000']);
  const customerId = await insertId(userSql, ['Anita Kumar', 'customer@wefixsetu.com', pw, 'customer', '+49', '15201234567']);
  const vendorBerlin = await insertId(userSql, ['Berlin Repair Hub', 'vendor.berlin@wefixsetu.com', pw, 'vendor', '+49', '3020000000']);
  const vendorMunich = await insertId(userSql, ['Munich FixIt', 'vendor.munich@wefixsetu.com', pw, 'vendor', '+49', '8920000000']);
  const vendorHamburg = await insertId(userSql, ['Hamburg TechCare', 'vendor.hamburg@wefixsetu.com', pw, 'vendor', '+49', '4020000000']);

  const shopSql = `INSERT INTO shops (owner_user_id, name, country, city, address, categories, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const berlinShopId = await insertId(shopSql, [vendorBerlin, 'Berlin Repair Hub', 'Germany', 'Berlin', 'Alexanderplatz 1, 10178 Berlin', JSON.stringify(['Mobile Phone', 'Laptop', 'Tablet']), 'approved']);
  const munichShopId = await insertId(shopSql, [vendorMunich, 'Munich FixIt', 'Germany', 'Munich', 'Marienplatz 8, 80331 München', JSON.stringify(['Mobile Phone', 'Home Appliance', 'Watch']), 'approved']);
  await insertId(shopSql, [vendorHamburg, 'Hamburg TechCare', 'Germany', 'Hamburg', 'Jungfernstieg 12, 20354 Hamburg', JSON.stringify(['Laptop', 'Camera', 'Audio Equipment']), 'pending']);

  const partnerSql = `INSERT INTO delivery_partners (name, type, service_areas, price, eta_days, enabled)
                      VALUES (?, ?, ?, ?, ?, ?)`;
  const p1 = await insertId(partnerSql, ['DeutschePost Express', 'both', JSON.stringify(['Germany/Berlin', 'Germany/Munich', 'Germany/Hamburg']), 7.5, 2, 1]);
  await insertId(partnerSql, ['DHL Same-Day', 'both', JSON.stringify(['Germany/Berlin', 'Germany/Munich']), 12.0, 1, 1]);
  const p3 = await insertId(partnerSql, ['Hermes Standard', 'both', JSON.stringify(['Germany/Berlin', 'Germany/Hamburg']), 5.0, 3, 1]);

  const orderSql = `INSERT INTO orders (
      public_id, customer_id, shop_id, category, issue_description, image_urls,
      pickup_country, pickup_city, pickup_address, phone_country_code, phone,
      pickup_date, pickup_slot, pickup_partner_id, return_partner_id,
      status, handling_fee, quote_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // --- Demo order 1: received by shop, awaiting quote (Berlin) ---
  const o1 = await insertId(orderSql, [
    `WF-${orderCode()}`, customerId, berlinShopId, 'Mobile Phone',
    'Cracked screen on a Pixel 7, touch works intermittently.',
    JSON.stringify(['https://picsum.photos/seed/phone/400/300']),
    'Germany', 'Berlin', 'Dorfstraße 5, 16356 Werneuchen (village near Berlin)',
    '+49', '15201234567', '2026-06-25', '10:00–12:00', p1, p3, 'Received by Shop', 5, 'none',
  ]);
  await recomputeCosts(await getOrderRow(o1));
  await addEvent(o1, { type: 'system', status: 'Created', message: 'Order created.', actorRole: 'customer' });
  await addEvent(o1, { type: 'status', status: 'Pickup Scheduled', message: 'Shop accepted the order. Pickup scheduled.', actorRole: 'vendor' });
  await addEvent(o1, { type: 'status', status: 'Picked Up', message: 'Status changed to Picked Up.', actorRole: 'vendor' });
  await addEvent(o1, { type: 'status', status: 'In Transit to Shop', message: 'Status changed to In Transit to Shop.', actorRole: 'vendor' });
  await addEvent(o1, { type: 'status', status: 'Received by Shop', message: 'Status changed to Received by Shop.', actorRole: 'vendor' });

  // --- Demo order 2: quote sent, awaiting customer decision (Munich) ---
  const o2 = await insertId(orderSql, [
    `WF-${orderCode()}`, customerId, munichShopId, 'Laptop',
    'Battery drains in under an hour on a ThinkPad; needs replacement.',
    JSON.stringify([]),
    'Germany', 'Munich', 'Hauptstraße 22, 85354 Freising (village near Munich)',
    '+49', '15201234567', '2026-06-23', '14:00–16:00', p1, p3, 'Quote Sent', 5, 'sent',
  ]);
  await db
    .prepare(`UPDATE orders SET repair_cost = 89, estimated_days = 3, quote_notes = ? WHERE id = ?`)
    .run('Genuine battery + labour. 6-month warranty.', o2);
  await recomputeCosts(await getOrderRow(o2));
  await addEvent(o2, { type: 'system', status: 'Created', message: 'Order created.', actorRole: 'customer' });
  await addEvent(o2, { type: 'status', status: 'Pickup Scheduled', message: 'Shop accepted the order. Pickup scheduled.', actorRole: 'vendor' });
  await addEvent(o2, { type: 'status', status: 'Picked Up', message: 'Picked up from customer.', actorRole: 'vendor' });
  await addEvent(o2, { type: 'status', status: 'In Transit to Shop', message: 'In transit to shop.', actorRole: 'vendor' });
  await addEvent(o2, { type: 'status', status: 'Received by Shop', message: 'Received by shop.', actorRole: 'vendor' });
  await addEvent(o2, { type: 'quote', message: 'Quote sent: repair 89, ~3 day(s). Notes: Genuine battery + labour.', actorRole: 'vendor' });
  await addEvent(o2, { type: 'status', status: 'Quote Sent', message: 'Quote sent to customer for approval.', actorRole: 'vendor' });

  await db
    .prepare(
      `INSERT INTO shipments (order_id, kind, partner_id, tracking_number, status, scheduled_at, picked_up_at, in_transit_at)
       VALUES (?, 'pickup', ?, ?, 'In Transit', ?, ?, ?)`
    )
    .run(o2, p1, `PCK${trackingCode()}`, isoOffset(-2), isoOffset(-1), isoOffset(-1));

  console.log('\nSeed complete. Demo accounts (all password: password123):');
  console.log('  admin@wefixsetu.com           (admin)');
  console.log('  customer@wefixsetu.com        (customer)');
  console.log('  vendor.berlin@wefixsetu.com   (vendor — Berlin, approved)');
  console.log('  vendor.munich@wefixsetu.com   (vendor — Munich, approved)');
  console.log('  vendor.hamburg@wefixsetu.com  (vendor — Hamburg, PENDING approval)');
  console.log('\nDelivery partners and 2 demo orders created.\n');
}

// Seeds only if the database has no users yet (safe to call on every boot).
export async function seedIfEmpty() {
  await migrate();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM users').get();
  const n = Number(row.n);
  if (n === 0) {
    await seedDemoData();
  } else {
    console.log(`Database already has ${n} users — skipping seed.`);
  }
}

// Run directly via `npm run seed` (node src/seed.js) → always re-seed.
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
