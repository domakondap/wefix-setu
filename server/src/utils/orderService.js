import { db, nowIso } from '../db.js';
import { publishOrderEvent } from './events.js';
import { publicEvent, publicOrder } from './serializers.js';
import { ORDER_TRANSITIONS } from '../constants.js';

export async function getOrderRow(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

export async function getOrderByPublicId(publicId) {
  return db.prepare('SELECT * FROM orders WHERE public_id = ?').get(publicId);
}

export async function listOrderEvents(orderId) {
  const rows = await db
    .prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id ASC')
    .all(orderId);
  return rows.map(publicEvent);
}

export async function listOrderShipments(orderId) {
  return db
    .prepare('SELECT * FROM shipments WHERE order_id = ? ORDER BY id ASC')
    .all(orderId);
}

// Record a timeline event and push it to any live SSE subscribers.
export async function addEvent(orderId, { type, status, message, actorRole }) {
  const info = await db
    .prepare(
      `INSERT INTO order_events (order_id, type, status, message, actor_role)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(orderId, type, status || null, message, actorRole || null);

  const row = await db
    .prepare('SELECT * FROM order_events WHERE id = ?')
    .get(info.lastInsertRowid);
  const event = publicEvent(row);

  publishOrderEvent(orderId, { kind: 'event', event });
  return event;
}

// Mark an order paid (idempotent) and log a payment event. Called by the
// Stripe webhook (authoritative) and the mock pay flow.
export async function markOrderPaid(orderId, { method, paymentIntentId } = {}) {
  const order = await getOrderRow(orderId);
  if (!order) return null;
  if (order.payment_status === 'paid') return order; // idempotent

  await db
    .prepare(
      `UPDATE orders
         SET payment_status = 'paid', payment_method = ?, payment_intent_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(method || order.payment_method || 'Card', paymentIntentId || order.payment_intent_id || null, nowIso(), orderId);

  await addEvent(orderId, {
    type: 'payment',
    message: `Payment received${method ? ` via ${method}` : ''}.`,
    actorRole: 'customer',
  });
  await broadcastOrder(orderId);
  return getOrderRow(orderId);
}

// Whether `to` is a legal forward transition from `from`.
export function canTransition(from, to) {
  return (ORDER_TRANSITIONS[from] || []).includes(to);
}

// Apply a new status, stamp updated_at, log a timeline event, and broadcast.
export async function setOrderStatus(orderId, newStatus, { actorRole, message } = {}) {
  await db
    .prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`)
    .run(newStatus, nowIso(), orderId);

  await addEvent(orderId, {
    type: 'status',
    status: newStatus,
    message: message || `Status changed to ${newStatus}.`,
    actorRole,
  });

  await broadcastOrder(orderId);
}

// Push the full updated order object to live subscribers (used after any
// mutation so the detail page can refresh instantly).
export async function broadcastOrder(orderId) {
  const row = await getOrderRow(orderId);
  if (!row) return;
  publishOrderEvent(orderId, { kind: 'order', order: publicOrder(row) });
}

// Recompute pickup/return/total costs from selected partners + repair quote.
export async function recomputeCosts(orderRow) {
  const handlingFee = orderRow.handling_fee || 0;
  let pickupCost = 0;
  let returnCost = 0;

  if (orderRow.pickup_partner_id) {
    const p = await db
      .prepare('SELECT price FROM delivery_partners WHERE id = ?')
      .get(orderRow.pickup_partner_id);
    pickupCost = p ? p.price : 0;
  }
  if (orderRow.return_partner_id) {
    const p = await db
      .prepare('SELECT price FROM delivery_partners WHERE id = ?')
      .get(orderRow.return_partner_id);
    returnCost = p ? p.price : 0;
  }

  const repairCost = orderRow.repair_cost || 0;
  const total = repairCost + pickupCost + returnCost + handlingFee;

  await db
    .prepare(
      `UPDATE orders
         SET pickup_cost = ?, return_cost = ?, total_cost = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(pickupCost, returnCost, total, nowIso(), orderRow.id);

  return { pickupCost, returnCost, repairCost, handlingFee, total };
}
