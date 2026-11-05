import express from 'express';
import { customAlphabet } from 'nanoid';
import { db, getSetting } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { publicOrder, publicShipment } from '../utils/serializers.js';
import {
  addEvent,
  broadcastOrder,
  getOrderRow,
  listOrderEvents,
  listOrderShipments,
  recomputeCosts,
  setOrderStatus,
} from '../utils/orderService.js';
import { PAYMENT_METHODS } from '../constants.js';
import {
  createPaymentIntent,
  retrievePaymentIntent,
  paymentsEnabled,
} from '../utils/payments.js';
import { markOrderPaid } from '../utils/orderService.js';

const router = express.Router();
const orderCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

// Ensures the requesting user is allowed to view/act on this order.
async function loadAuthorizedOrder(req) {
  const order = await getOrderRow(req.params.id);
  if (!order) throw new HttpError(404, 'Order not found.');

  const { role, id } = req.user;
  if (role === 'admin') return order;

  if (role === 'customer') {
    if (order.customer_id !== id) throw new HttpError(403, 'Not your order.');
    return order;
  }

  if (role === 'vendor') {
    const ownsShop =
      order.shop_id &&
      (await db
        .prepare('SELECT 1 FROM shops WHERE id = ? AND owner_user_id = ?')
        .get(order.shop_id, id));
    if (!ownsShop) throw new HttpError(403, 'This order is not assigned to your shop.');
    return order;
  }

  throw new HttpError(403, 'Forbidden.');
}

async function fullOrder(orderRow) {
  const [timeline, shipments] = await Promise.all([
    listOrderEvents(orderRow.id),
    listOrderShipments(orderRow.id),
  ]);
  return publicOrder(orderRow, { timeline, shipments: shipments.map(publicShipment) });
}

// POST /api/orders — customer creates a repair order.
router.post(
  '/',
  authRequired,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const {
      category, issueDescription, imageUrls,
      pickupCountry, pickupCity, pickupAddress,
      phoneCountryCode, phone, pickupDate, pickupSlot,
      shopId, pickupPartnerId, returnPartnerId,
    } = req.body || {};

    if (!category || !issueDescription || !pickupCountry || !pickupCity || !pickupAddress) {
      throw new HttpError(
        400,
        'Category, issue description, pickup country, city and address are required.'
      );
    }

    if (shopId) {
      const shop = await db
        .prepare(`SELECT * FROM shops WHERE id = ? AND status = 'approved'`)
        .get(shopId);
      if (!shop) throw new HttpError(400, 'Selected shop is unavailable.');
    }
    for (const [pid, label] of [
      [pickupPartnerId, 'pickup'],
      [returnPartnerId, 'return'],
    ]) {
      if (pid) {
        const p = await db
          .prepare('SELECT 1 FROM delivery_partners WHERE id = ? AND enabled = 1')
          .get(pid);
        if (!p) throw new HttpError(400, `Selected ${label} courier is unavailable.`);
      }
    }

    const handlingFee = Number(await getSetting('handling_fee', '0'));
    const publicId = `WF-${orderCode()}`;

    const info = await db
      .prepare(
        `INSERT INTO orders (
           public_id, customer_id, shop_id, category, issue_description, image_urls,
           pickup_country, pickup_city, pickup_address, phone_country_code, phone,
           pickup_date, pickup_slot, pickup_partner_id, return_partner_id,
           status, handling_fee, quote_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Created', ?, 'none')`
      )
      .run(
        publicId,
        req.user.id,
        shopId || null,
        category,
        issueDescription,
        JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
        pickupCountry,
        pickupCity,
        pickupAddress,
        phoneCountryCode || req.user.phoneCountryCode || null,
        phone || req.user.phone || null,
        pickupDate || null,
        pickupSlot || null,
        pickupPartnerId || null,
        returnPartnerId || null,
        handlingFee
      );

    const orderId = info.lastInsertRowid;
    await recomputeCosts(await getOrderRow(orderId));
    await addEvent(orderId, {
      type: 'system',
      status: 'Created',
      message: 'Order created. Awaiting shop intake and quote.',
      actorRole: 'customer',
    });

    res.status(201).json({ order: await fullOrder(await getOrderRow(orderId)) });
  })
);

// GET /api/orders — list orders visible to the requester.
router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { role, id } = req.user;
    let rows;
    if (role === 'admin') {
      rows = await db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    } else if (role === 'vendor') {
      rows = await db
        .prepare(
          `SELECT o.* FROM orders o
             JOIN shops s ON s.id = o.shop_id
            WHERE s.owner_user_id = ?
            ORDER BY o.id DESC`
        )
        .all(id);
    } else {
      rows = await db
        .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC')
        .all(id);
    }
    res.json({ orders: rows.map((r) => publicOrder(r)) });
  })
);

// GET /api/orders/:id — full detail with timeline + shipments.
router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const order = await loadAuthorizedOrder(req);
    res.json({ order: await fullOrder(order) });
  })
);

// POST /api/orders/:id/accept-quote
router.post(
  '/:id/accept-quote',
  authRequired,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await loadAuthorizedOrder(req);
    if (order.quote_status !== 'sent' || order.status !== 'Quote Sent') {
      throw new HttpError(409, 'There is no pending quote to accept.');
    }

    await db.prepare(`UPDATE orders SET quote_status = 'accepted' WHERE id = ?`).run(order.id);
    await addEvent(order.id, {
      type: 'quote',
      message: 'Customer accepted the repair quote.',
      actorRole: 'customer',
    });
    await setOrderStatus(order.id, 'Quote Accepted', {
      actorRole: 'customer',
      message: 'Quote accepted — pickup can now be scheduled.',
    });

    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

// POST /api/orders/:id/reject-quote
router.post(
  '/:id/reject-quote',
  authRequired,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await loadAuthorizedOrder(req);
    if (order.quote_status !== 'sent' || order.status !== 'Quote Sent') {
      throw new HttpError(409, 'There is no pending quote to reject.');
    }
    const reason = (req.body && req.body.reason) || '';

    await db.prepare(`UPDATE orders SET quote_status = 'rejected' WHERE id = ?`).run(order.id);
    await addEvent(order.id, {
      type: 'quote',
      message: `Customer rejected the quote.${reason ? ` Reason: ${reason}` : ''}`,
      actorRole: 'customer',
    });
    await broadcastOrder(order.id);

    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

// POST /api/orders/:id/payment-intent — start a payment.
// Returns a Stripe client secret (real) or a mock descriptor.
router.post(
  '/:id/payment-intent',
  authRequired,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await loadAuthorizedOrder(req);
    if (order.quote_status !== 'accepted') {
      throw new HttpError(409, 'Accept the quote before paying.');
    }
    if (order.payment_status === 'paid') {
      throw new HttpError(409, 'This order is already paid.');
    }
    if (!order.total_cost || order.total_cost <= 0) {
      throw new HttpError(409, 'Order total is not finalised yet.');
    }

    const intent = await createPaymentIntent({
      amount: order.total_cost,
      orderId: order.id,
      publicId: order.public_id,
      email: req.user.email,
    });
    // Persist the intent id so the webhook can reconcile.
    await db
      .prepare(`UPDATE orders SET payment_intent_id = ? WHERE id = ?`)
      .run(intent.paymentIntentId, order.id);

    res.json(intent);
  })
);

// POST /api/orders/:id/pay — confirm payment.
//  • Stripe mode: pass { paymentIntentId }; we verify it succeeded with Stripe.
//  • Mock mode:   pass { method }; we mark it paid directly.
// (The Stripe webhook is the authoritative confirmation; this gives instant UI.)
router.post(
  '/:id/pay',
  authRequired,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await loadAuthorizedOrder(req);
    if (order.payment_status === 'paid') {
      return res.json({ order: await fullOrder(await getOrderRow(order.id)) }); // idempotent
    }
    if (order.quote_status !== 'accepted') {
      throw new HttpError(409, 'Accept the quote before paying.');
    }

    const { method, paymentIntentId } = req.body || {};

    if (paymentsEnabled === 'stripe') {
      const piId = paymentIntentId || order.payment_intent_id;
      if (!piId) throw new HttpError(400, 'Missing payment intent.');
      const intent = await retrievePaymentIntent(piId);
      if (intent.status !== 'succeeded') {
        throw new HttpError(402, `Payment not completed (status: ${intent.status}).`);
      }
      if (String(intent.metadata.orderId) !== String(order.id)) {
        throw new HttpError(400, 'Payment does not match this order.');
      }
      await markOrderPaid(order.id, { method: 'Card', paymentIntentId: piId });
    } else {
      if (!PAYMENT_METHODS.includes(method)) {
        throw new HttpError(400, `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`);
      }
      await markOrderPaid(order.id, { method, paymentIntentId: order.payment_intent_id });
    }

    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

// POST /api/orders/:id/cancel
router.post(
  '/:id/cancel',
  authRequired,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await loadAuthorizedOrder(req);
    const blocked = ['In Repair', 'Repaired', 'Ready to Ship', 'Shipped Back', 'Delivered', 'Cancelled'];
    if (blocked.includes(order.status)) {
      throw new HttpError(409, `Order can no longer be cancelled (status: ${order.status}).`);
    }
    await setOrderStatus(order.id, 'Cancelled', {
      actorRole: 'customer',
      message: 'Order cancelled by customer.',
    });
    res.json({ order: await fullOrder(await getOrderRow(order.id)) });
  })
);

export default router;
