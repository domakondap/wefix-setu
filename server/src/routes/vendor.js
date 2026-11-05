import express from 'express';
import { customAlphabet } from 'nanoid';
import { db, nowIso } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { publicOrder, publicShipment } from '../utils/serializers.js';
import {
  addEvent,
  broadcastOrder,
  canTransition,
  getOrderRow,
  listOrderEvents,
  listOrderShipments,
  recomputeCosts,
  setOrderStatus,
} from '../utils/orderService.js';
import { SHIPMENT_STATUSES, SHIPMENT_MILESTONE_COLUMN } from '../constants.js';

const router = express.Router();
const trackingCode = customAlphabet('0123456789', 12);

router.use(authRequired, requireRole('vendor'));

async function loadVendorOrder(req) {
  const order = await getOrderRow(req.params.id);
  if (!order) throw new HttpError(404, 'Order not found.');
  const ownsShop =
    order.shop_id &&
    (await db
      .prepare('SELECT 1 FROM shops WHERE id = ? AND owner_user_id = ?')
      .get(order.shop_id, req.user.id));
  if (!ownsShop) throw new HttpError(403, 'This order is not assigned to your shop.');
  return order;
}

async function fullOrder(orderRow) {
  const [timeline, shipments] = await Promise.all([
    listOrderEvents(orderRow.id),
    listOrderShipments(orderRow.id),
  ]);
  return publicOrder(orderRow, { timeline, shipments: shipments.map(publicShipment) });
}

// GET /api/vendor/orders
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const rows = await db
      .prepare(
        `SELECT o.* FROM orders o
           JOIN shops s ON s.id = o.shop_id
          WHERE s.owner_user_id = ?
          ORDER BY o.id DESC`
      )
      .all(req.user.id);
    res.json({ orders: rows.map((r) => publicOrder(r)) });
  })
);

// POST /api/vendor/orders/:id/intake
router.post(
  '/orders/:id/intake',
  asyncHandler(async (req, res) => {
    const order = await loadVendorOrder(req);
    const { action, reason } = req.body || {};

    if (action === 'reject') {
      await setOrderStatus(order.id, 'Cancelled', {
        actorRole: 'vendor',
        message: `Shop declined intake.${reason ? ` Reason: ${reason}` : ''}`,
      });
      return res.json({ order: await fullOrder(await getOrderRow(order.id)) });
    }

    if (action !== 'accept') {
      throw new HttpError(400, "action must be 'accept' or 'reject'.");
    }
    if (order.status !== 'Created') {
      throw new HttpError(409, `Intake can only be actioned while status is "Created" (current: ${order.status}).`);
    }

    await setOrderStatus(order.id, 'Pickup Scheduled', {
      actorRole: 'vendor',
      message: 'Shop accepted the order. Pickup scheduled.',
    });
    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

// POST /api/vendor/orders/:id/quote
router.post(
  '/orders/:id/quote',
  asyncHandler(async (req, res) => {
    const order = await loadVendorOrder(req);
    const { price, estimatedDays, notes } = req.body || {};

    const repairCost = Number(price);
    if (!Number.isFinite(repairCost) || repairCost < 0) {
      throw new HttpError(400, 'A valid non-negative price is required.');
    }

    await db
      .prepare(
        `UPDATE orders
           SET repair_cost = ?, estimated_days = ?, quote_notes = ?,
               quote_status = 'sent', updated_at = ?
         WHERE id = ?`
      )
      .run(repairCost, estimatedDays ? Number(estimatedDays) : null, notes || null, nowIso(), order.id);

    await recomputeCosts(await getOrderRow(order.id));

    await addEvent(order.id, {
      type: 'quote',
      message: `Quote sent: repair ${repairCost}${
        estimatedDays ? `, ~${estimatedDays} day(s)` : ''
      }.${notes ? ` Notes: ${notes}` : ''}`,
      actorRole: 'vendor',
    });

    if (canTransition(order.status, 'Quote Sent') || order.status === 'Received by Shop') {
      await setOrderStatus(order.id, 'Quote Sent', {
        actorRole: 'vendor',
        message: 'Quote sent to customer for approval.',
      });
    } else {
      await broadcastOrder(order.id);
    }

    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

// POST /api/vendor/orders/:id/status
router.post(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const order = await loadVendorOrder(req);
    const { status } = req.body || {};
    if (!status) throw new HttpError(400, 'status is required.');

    if (!canTransition(order.status, status)) {
      throw new HttpError(409, `Cannot move from "${order.status}" to "${status}".`);
    }
    if (status === 'In Repair' && order.quote_status !== 'accepted') {
      throw new HttpError(409, 'Customer must accept the quote before repair begins.');
    }

    await setOrderStatus(order.id, status, { actorRole: 'vendor' });
    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

// POST /api/vendor/orders/:id/notes
router.post(
  '/orders/:id/notes',
  asyncHandler(async (req, res) => {
    const order = await loadVendorOrder(req);
    const { beforeNotes, afterNotes } = req.body || {};
    if (beforeNotes == null && afterNotes == null) {
      throw new HttpError(400, 'Provide beforeNotes and/or afterNotes.');
    }

    await db
      .prepare(
        `UPDATE orders
           SET before_notes = COALESCE(?, before_notes),
               after_notes = COALESCE(?, after_notes),
               updated_at = ?
         WHERE id = ?`
      )
      .run(beforeNotes ?? null, afterNotes ?? null, nowIso(), order.id);

    await addEvent(order.id, {
      type: 'note',
      message: `Shop updated repair notes${beforeNotes ? ' (before)' : ''}${afterNotes ? ' (after)' : ''}.`,
      actorRole: 'vendor',
    });
    await broadcastOrder(order.id);

    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

// POST /api/vendor/orders/:id/shipments
router.post(
  '/orders/:id/shipments',
  asyncHandler(async (req, res) => {
    const order = await loadVendorOrder(req);
    const { kind, partnerId } = req.body || {};
    if (!['pickup', 'return'].includes(kind)) {
      throw new HttpError(400, "kind must be 'pickup' or 'return'.");
    }

    const resolvedPartner =
      partnerId || (kind === 'pickup' ? order.pickup_partner_id : order.return_partner_id);

    const trackingNumber = `${kind === 'pickup' ? 'PCK' : 'RTN'}${trackingCode()}`;
    const info = await db
      .prepare(
        `INSERT INTO shipments (order_id, kind, partner_id, tracking_number, status)
         VALUES (?, ?, ?, ?, 'Label Created')`
      )
      .run(order.id, kind, resolvedPartner || null, trackingNumber);

    await addEvent(order.id, {
      type: 'shipment',
      message: `${kind === 'pickup' ? 'Pickup' : 'Return'} shipment created (${trackingNumber}).`,
      actorRole: 'vendor',
    });
    await broadcastOrder(order.id);

    const shipment = await db
      .prepare('SELECT * FROM shipments WHERE id = ?')
      .get(info.lastInsertRowid);
    res.status(201).json({ shipment: publicShipment(shipment) });
  })
);

// POST /api/vendor/shipments/:shipmentId/status
router.post(
  '/shipments/:shipmentId/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!SHIPMENT_STATUSES.includes(status)) {
      throw new HttpError(400, `status must be one of: ${SHIPMENT_STATUSES.join(', ')}.`);
    }

    const shipment = await db
      .prepare('SELECT * FROM shipments WHERE id = ?')
      .get(req.params.shipmentId);
    if (!shipment) throw new HttpError(404, 'Shipment not found.');

    const owns = await db
      .prepare(
        `SELECT 1 FROM orders o JOIN shops s ON s.id = o.shop_id
          WHERE o.id = ? AND s.owner_user_id = ?`
      )
      .get(shipment.order_id, req.user.id);
    if (!owns) throw new HttpError(403, 'This shipment is not yours to update.');

    const milestoneCol = SHIPMENT_MILESTONE_COLUMN[status];
    if (milestoneCol) {
      await db
        .prepare(`UPDATE shipments SET status = ?, ${milestoneCol} = ? WHERE id = ?`)
        .run(status, nowIso(), shipment.id);
    } else {
      await db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(status, shipment.id);
    }

    await addEvent(shipment.order_id, {
      type: 'shipment',
      message: `${shipment.kind === 'pickup' ? 'Pickup' : 'Return'} shipment ${shipment.tracking_number}: ${status}.`,
      actorRole: 'vendor',
    });
    await broadcastOrder(shipment.order_id);

    const updated = await db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipment.id);
    res.json({ shipment: publicShipment(updated) });
  })
);

export default router;
