import express from 'express';
import { db, getSetting, setSetting, nowIso } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  publicOrder,
  publicPartner,
  publicShipment,
  publicShop,
  publicUser,
} from '../utils/serializers.js';
import { addEvent, broadcastOrder, getOrderRow, setOrderStatus } from '../utils/orderService.js';
import { ORDER_STATUSES, SHOP_STATUSES } from '../constants.js';

const router = express.Router();
router.use(authRequired, requireRole('admin'));

/* ----------------------------- Shops ----------------------------- */
router.get(
  '/shops',
  asyncHandler(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM shops ORDER BY id DESC').all();
    res.json({ shops: rows.map(publicShop) });
  })
);

router.patch(
  '/shops/:id',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!SHOP_STATUSES.includes(status)) {
      throw new HttpError(400, `status must be one of: ${SHOP_STATUSES.join(', ')}.`);
    }
    const shop = await db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id);
    if (!shop) throw new HttpError(404, 'Shop not found.');

    await db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(status, shop.id);
    const updated = await db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
    res.json({ shop: publicShop(updated) });
  })
);

/* ------------------------ Delivery partners ----------------------- */
router.get(
  '/partners',
  asyncHandler(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM delivery_partners ORDER BY id DESC').all();
    res.json({ partners: rows.map(publicPartner) });
  })
);

router.post(
  '/partners',
  asyncHandler(async (req, res) => {
    const { name, type, serviceAreas, price, etaDays, enabled } = req.body || {};
    if (!name) throw new HttpError(400, 'name is required.');

    const info = await db
      .prepare(
        `INSERT INTO delivery_partners (name, type, service_areas, price, eta_days, enabled)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        ['pickup', 'return', 'both'].includes(type) ? type : 'both',
        JSON.stringify(Array.isArray(serviceAreas) ? serviceAreas : []),
        Number(price) || 0,
        Number(etaDays) || 1,
        enabled === false ? 0 : 1
      );
    const row = await db.prepare('SELECT * FROM delivery_partners WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ partner: publicPartner(row) });
  })
);

router.patch(
  '/partners/:id',
  asyncHandler(async (req, res) => {
    const partner = await db.prepare('SELECT * FROM delivery_partners WHERE id = ?').get(req.params.id);
    if (!partner) throw new HttpError(404, 'Partner not found.');

    const { name, type, serviceAreas, price, etaDays, enabled } = req.body || {};
    await db
      .prepare(
        `UPDATE delivery_partners
           SET name = ?, type = ?, service_areas = ?, price = ?, eta_days = ?, enabled = ?
         WHERE id = ?`
      )
      .run(
        name ?? partner.name,
        ['pickup', 'return', 'both'].includes(type) ? type : partner.type,
        serviceAreas != null ? JSON.stringify(serviceAreas) : partner.service_areas,
        price != null ? Number(price) : partner.price,
        etaDays != null ? Number(etaDays) : partner.eta_days,
        enabled == null ? partner.enabled : enabled ? 1 : 0,
        partner.id
      );
    const row = await db.prepare('SELECT * FROM delivery_partners WHERE id = ?').get(partner.id);
    res.json({ partner: publicPartner(row) });
  })
);

/* --------------------------- Settings ----------------------------- */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json({ handlingFee: Number(await getSetting('handling_fee', '0')) });
  })
);

router.put(
  '/settings/handling-fee',
  asyncHandler(async (req, res) => {
    const { handlingFee } = req.body || {};
    const fee = Number(handlingFee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new HttpError(400, 'handlingFee must be a non-negative number.');
    }
    await setSetting('handling_fee', fee);
    res.json({ handlingFee: fee });
  })
);

/* ------------------------- Global views --------------------------- */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM users ORDER BY id DESC').all();
    res.json({ users: rows.map(publicUser) });
  })
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    res.json({ orders: rows.map((r) => publicOrder(r)) });
  })
);

router.get(
  '/shipments',
  asyncHandler(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM shipments ORDER BY id DESC').all();
    res.json({ shipments: rows.map(publicShipment) });
  })
);

/* --------------------- Disputes & overrides ----------------------- */
router.post(
  '/orders/:id/dispute',
  asyncHandler(async (req, res) => {
    const order = await getOrderRow(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found.');
    const flag = !!(req.body && req.body.flag);
    const note = (req.body && req.body.note) || '';

    await db
      .prepare(`UPDATE orders SET dispute_flag = ?, updated_at = ? WHERE id = ?`)
      .run(flag ? 1 : 0, nowIso(), order.id);
    await addEvent(order.id, {
      type: 'system',
      message: `Admin ${flag ? 'flagged' : 'cleared'} a dispute.${note ? ` ${note}` : ''}`,
      actorRole: 'admin',
    });
    await broadcastOrder(order.id);

    res.json({ order: publicOrder(await getOrderRow(order.id)) });
  })
);

router.post(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const order = await getOrderRow(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found.');
    const { status, note } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      throw new HttpError(400, 'Invalid status.');
    }
    await setOrderStatus(order.id, status, {
      actorRole: 'admin',
      message: `Admin override: status set to ${status}.${note ? ` ${note}` : ''}`,
    });
    res.json({ order: publicOrder(await getOrderRow(order.id)) });
  })
);

export default router;
