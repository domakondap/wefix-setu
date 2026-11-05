import express from 'express';
import { db } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { authRequired } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { publicShop, publicUser } from '../utils/serializers.js';

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issue(userRow) {
  const token = signToken({ sub: userRow.id, role: userRow.role });
  return { token, user: publicUser(userRow) };
}

// POST /api/auth/register — customer self-registration
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password, phoneCountryCode, phone } = req.body || {};

    if (!name || !email || !password) {
      throw new HttpError(400, 'Name, email and password are required.');
    }
    if (!EMAIL_RE.test(email)) {
      throw new HttpError(400, 'Please provide a valid email address.');
    }
    const pwProblems = validatePassword(password);
    if (pwProblems.length) {
      throw new HttpError(400, pwProblems.join(' '));
    }

    const existing = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email.toLowerCase());
    if (existing) {
      throw new HttpError(409, 'An account with this email already exists.');
    }

    const info = await db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, phone_country_code, phone)
         VALUES (?, ?, ?, 'customer', ?, ?)`
      )
      .run(
        name,
        email.toLowerCase(),
        hashPassword(password),
        phoneCountryCode || null,
        phone || null
      );

    const row = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(info.lastInsertRowid);
    res.status(201).json(issue(row));
  })
);

// POST /api/auth/register-vendor — vendor self-registration.
// Creates a vendor user AND a pending shop awaiting admin approval.
router.post(
  '/register-vendor',
  authLimiter,
  asyncHandler(async (req, res) => {
    const {
      name,
      email,
      password,
      phoneCountryCode,
      phone,
      shopName,
      country,
      city,
      address,
      categories,
    } = req.body || {};

    if (!name || !email || !password || !shopName || !country || !city) {
      throw new HttpError(
        400,
        'Name, email, password, shop name, country and city are required.'
      );
    }
    if (!EMAIL_RE.test(email)) {
      throw new HttpError(400, 'Please provide a valid email address.');
    }
    const pwProblems = validatePassword(password);
    if (pwProblems.length) {
      throw new HttpError(400, pwProblems.join(' '));
    }

    const existing = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email.toLowerCase());
    if (existing) {
      throw new HttpError(409, 'An account with this email already exists.');
    }

    const { userId, shopId } = await db.tx(async (t) => {
      const userInfo = await t
        .prepare(
          `INSERT INTO users (name, email, password_hash, role, phone_country_code, phone)
           VALUES (?, ?, ?, 'vendor', ?, ?)`
        )
        .run(
          name,
          email.toLowerCase(),
          hashPassword(password),
          phoneCountryCode || null,
          phone || null
        );

      const shopInfo = await t
        .prepare(
          `INSERT INTO shops (owner_user_id, name, country, city, address, categories, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`
        )
        .run(
          userInfo.lastInsertRowid,
          shopName,
          country,
          city,
          address || null,
          JSON.stringify(Array.isArray(categories) ? categories : [])
        );

      return { userId: userInfo.lastInsertRowid, shopId: shopInfo.lastInsertRowid };
    });

    const userRow = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const shopRow = await db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);

    res.status(201).json({ ...issue(userRow), shop: publicShop(shopRow) });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw new HttpError(400, 'Email and password are required.');
    }

    const row = await db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(String(email).toLowerCase());

    // Constant-ish response to avoid leaking which emails exist.
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, 'Invalid email or password.');
    }

    res.json(issue(row));
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    // For vendors, include their shop(s) for convenience.
    let shops = [];
    if (req.user.role === 'vendor') {
      const rows = await db
        .prepare('SELECT * FROM shops WHERE owner_user_id = ?')
        .all(req.user.id);
      shops = rows.map(publicShop);
    }
    res.json({ user: req.user, shops });
  })
);

export default router;
