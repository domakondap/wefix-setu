import express from 'express';
import { db, getSetting } from '../db.js';
import { config } from '../config.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { authRequired } from '../middleware/auth.js';
import { publicPartner, publicShop } from '../utils/serializers.js';
import { REPAIR_CATEGORIES, PAYMENT_METHODS } from '../constants.js';

const router = express.Router();

// GET /api/catalog/meta — static lists for building the order form.
router.get(
  '/meta',
  asyncHandler(async (req, res) => {
    res.json({
      categories: REPAIR_CATEGORIES,
      paymentMethods: PAYMENT_METHODS,
      handlingFee: Number(await getSetting('handling_fee', '0')),
      currency: config.currency,
      payments: {
        provider: config.paymentsProvider, // 'stripe' | 'mock'
        publishableKey: config.stripe.publishableKey || null,
      },
    });
  })
);

// GET /api/catalog/shops — approved shops, optionally filtered by city/category.
router.get(
  '/shops',
  asyncHandler(async (req, res) => {
    const { city, category } = req.query;
    const rows = await db
      .prepare(`SELECT * FROM shops WHERE status = 'approved' ORDER BY name ASC`)
      .all();
    let shops = rows.map(publicShop);

    if (city) {
      shops = shops.filter(
        (s) => s.city.toLowerCase() === String(city).toLowerCase()
      );
    }
    if (category) {
      shops = shops.filter(
        (s) => s.categories.length === 0 || s.categories.includes(category)
      );
    }
    res.json({ shops });
  })
);

// GET /api/catalog/partners — enabled delivery partners, optionally by area/type.
router.get(
  '/partners',
  asyncHandler(async (req, res) => {
    const { area, type } = req.query;
    const rows = await db
      .prepare(`SELECT * FROM delivery_partners WHERE enabled = 1 ORDER BY price ASC`)
      .all();
    let partners = rows.map(publicPartner);

    if (type) {
      partners = partners.filter((p) => p.type === type || p.type === 'both');
    }
    if (area) {
      const needle = String(area).toLowerCase();
      partners = partners.filter(
        (p) =>
          p.serviceAreas.length === 0 ||
          p.serviceAreas.some((a) => a.toLowerCase().includes(needle))
      );
    }
    res.json({ partners });
  })
);

// POST /api/catalog/cost-preview — compute a live cost breakdown before ordering.
router.post(
  '/cost-preview',
  authRequired,
  asyncHandler(async (req, res) => {
    const { pickupPartnerId, returnPartnerId, repairEstimate } = req.body || {};

    const handlingFee = Number(await getSetting('handling_fee', '0'));
    let pickupCost = 0;
    let returnCost = 0;

    if (pickupPartnerId) {
      const p = await db
        .prepare('SELECT * FROM delivery_partners WHERE id = ? AND enabled = 1')
        .get(pickupPartnerId);
      if (!p) throw new HttpError(400, 'Selected pickup partner is unavailable.');
      pickupCost = p.price;
    }
    if (returnPartnerId) {
      const p = await db
        .prepare('SELECT * FROM delivery_partners WHERE id = ? AND enabled = 1')
        .get(returnPartnerId);
      if (!p) throw new HttpError(400, 'Selected return partner is unavailable.');
      returnCost = p.price;
    }

    const repair = Number(repairEstimate || 0);
    const total = repair + pickupCost + returnCost + handlingFee;

    res.json({
      breakdown: { repair, pickup: pickupCost, return: returnCost, handlingFee, total },
    });
  })
);

export default router;
