import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// ---------------------------------------------------------------------------
// Driver-agnostic async data layer.
//
// • Local/dev (default): Node's built-in node:sqlite (zero native build).
// • Production: PostgreSQL when DATABASE_URL is set (e.g. Neon / Cloud SQL).
//
// The rest of the codebase uses a tiny better-sqlite3-like API:
//   await db.prepare(sql).get(...params)
//   await db.prepare(sql).all(...params)
//   await db.prepare(sql).run(...params)   // → { changes, lastInsertRowid }
//   await db.exec(multiStatementSql)
//   await db.tx(async (t) => { await t.prepare(sql).run(...) })  // atomic
//
// SQL is written with `?` placeholders and a few SQLite-isms; the Postgres
// driver translates them (`?`→`$n`, datetime('now')→portable timestamp).
// Timestamps are stored as TEXT in the identical 'YYYY-MM-DD HH:MM:SS' format
// in both engines so the frontend parses them the same way.
// ---------------------------------------------------------------------------

const USE_PG = !!process.env.DATABASE_URL;
export const dialect = USE_PG ? 'pg' : 'sqlite';

let impl;

if (USE_PG) {
  impl = await createPgDriver();
} else {
  impl = createSqliteDriver();
}

export const db = impl;

export function nowIso() {
  // Matches the DB CURRENT_TIMESTAMP format used in schema defaults.
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/* ----------------------------- SQLite driver ----------------------------- */
function createSqliteDriver() {
  fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  const raw = new DatabaseSync(config.databaseFile);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');

  const stmt = (sql) => ({
    get: async (...params) => raw.prepare(sql).get(...params),
    all: async (...params) => raw.prepare(sql).all(...params),
    run: async (...params) => {
      const info = raw.prepare(sql).run(...params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    },
  });

  return {
    dialect: 'sqlite',
    prepare: stmt,
    exec: async (sql) => raw.exec(sql),
    tx: async (fn) => {
      raw.exec('BEGIN');
      try {
        const result = await fn({ prepare: stmt });
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

/* --------------------------- PostgreSQL driver --------------------------- */
async function createPgDriver() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    max: 10,
  });

  // Translate `?` placeholders → $1..$n and SQLite-only functions to Postgres.
  function translate(sql) {
    let n = 0;
    let out = sql.replace(/\?/g, () => `$${++n}`);
    // datetime('now') → portable UTC text timestamp in the shared format.
    out = out.replace(
      /datetime\('now'\)/gi,
      "to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')"
    );
    return out;
  }

  const exec1 = async (client, sql, params) => {
    const res = await client.query(translate(sql), params);
    return res;
  };

  const makeStmt = (runner) => (sql) => {
    const isInsert = /^\s*insert/i.test(sql);
    // Append RETURNING id to get lastInsertRowid — except `settings`, which has
    // no id column (it's keyed by `key`) and never needs an insert id.
    const needsReturning =
      isInsert && !/returning/i.test(sql) && !/insert\s+into\s+settings/i.test(sql);
    return {
      get: async (...params) => {
        const res = await runner(sql, params);
        return res.rows[0];
      },
      all: async (...params) => {
        const res = await runner(sql, params);
        return res.rows;
      },
      run: async (...params) => {
        const finalSql = needsReturning ? `${sql} RETURNING id` : sql;
        const res = await runner(finalSql, params);
        return {
          changes: res.rowCount,
          lastInsertRowid: res.rows && res.rows[0] ? res.rows[0].id : undefined,
        };
      },
    };
  };

  const poolRunner = (sql, params) =>
    pool.query(translate(sql), params);

  return {
    dialect: 'pg',
    prepare: makeStmt(poolRunner),
    exec: async (sql) => pool.query(sql), // DDL is written per-dialect, no translate
    tx: async (fn) => {
      const client = await pool.connect();
      const clientRunner = (sql, params) => exec1(client, sql, params);
      try {
        await client.query('BEGIN');
        const result = await fn({ prepare: makeStmt(clientRunner) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/* ------------------------------ Migrations ------------------------------- */
const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    phone_country_code TEXT,
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL, country TEXT NOT NULL, city TEXT NOT NULL, address TEXT,
    categories TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS delivery_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'both',
    service_areas TEXT NOT NULL DEFAULT '[]',
    price REAL NOT NULL DEFAULT 0, eta_days INTEGER NOT NULL DEFAULT 2,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES users(id),
    shop_id INTEGER REFERENCES shops(id),
    category TEXT NOT NULL, issue_description TEXT NOT NULL,
    image_urls TEXT NOT NULL DEFAULT '[]',
    pickup_country TEXT NOT NULL, pickup_city TEXT NOT NULL, pickup_address TEXT NOT NULL,
    phone_country_code TEXT, phone TEXT, pickup_date TEXT, pickup_slot TEXT,
    pickup_partner_id INTEGER REFERENCES delivery_partners(id),
    return_partner_id INTEGER REFERENCES delivery_partners(id),
    status TEXT NOT NULL DEFAULT 'Created',
    repair_cost REAL, pickup_cost REAL NOT NULL DEFAULT 0, return_cost REAL NOT NULL DEFAULT 0,
    handling_fee REAL NOT NULL DEFAULT 0, total_cost REAL, estimated_days INTEGER,
    quote_notes TEXT, quote_status TEXT NOT NULL DEFAULT 'none',
    payment_method TEXT, payment_status TEXT NOT NULL DEFAULT 'unpaid',
    payment_intent_id TEXT,
    before_notes TEXT, after_notes TEXT, dispute_flag INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    type TEXT NOT NULL, status TEXT, message TEXT NOT NULL, actor_role TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, partner_id INTEGER REFERENCES delivery_partners(id),
    tracking_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Label Created',
    scheduled_at TEXT, picked_up_at TEXT, in_transit_at TEXT, delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
  CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);
  CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
`;

// Postgres: SERIAL ids, portable timestamp defaults, INTEGER booleans.
const PG_TS = "to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')";
const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer',
    phone_country_code TEXT, phone TEXT, created_at TEXT NOT NULL DEFAULT ${PG_TS}
  );
  CREATE TABLE IF NOT EXISTS shops (
    id SERIAL PRIMARY KEY, owner_user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL, country TEXT NOT NULL, city TEXT NOT NULL, address TEXT,
    categories TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT ${PG_TS}
  );
  CREATE TABLE IF NOT EXISTS delivery_partners (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'both',
    service_areas TEXT NOT NULL DEFAULT '[]', price REAL NOT NULL DEFAULT 0,
    eta_days INTEGER NOT NULL DEFAULT 2, enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${PG_TS}
  );
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, public_id TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES users(id),
    shop_id INTEGER REFERENCES shops(id),
    category TEXT NOT NULL, issue_description TEXT NOT NULL,
    image_urls TEXT NOT NULL DEFAULT '[]',
    pickup_country TEXT NOT NULL, pickup_city TEXT NOT NULL, pickup_address TEXT NOT NULL,
    phone_country_code TEXT, phone TEXT, pickup_date TEXT, pickup_slot TEXT,
    pickup_partner_id INTEGER REFERENCES delivery_partners(id),
    return_partner_id INTEGER REFERENCES delivery_partners(id),
    status TEXT NOT NULL DEFAULT 'Created',
    repair_cost REAL, pickup_cost REAL NOT NULL DEFAULT 0, return_cost REAL NOT NULL DEFAULT 0,
    handling_fee REAL NOT NULL DEFAULT 0, total_cost REAL, estimated_days INTEGER,
    quote_notes TEXT, quote_status TEXT NOT NULL DEFAULT 'none',
    payment_method TEXT, payment_status TEXT NOT NULL DEFAULT 'unpaid',
    payment_intent_id TEXT,
    before_notes TEXT, after_notes TEXT, dispute_flag INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${PG_TS}, updated_at TEXT NOT NULL DEFAULT ${PG_TS}
  );
  CREATE TABLE IF NOT EXISTS order_events (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    type TEXT NOT NULL, status TEXT, message TEXT NOT NULL, actor_role TEXT,
    created_at TEXT NOT NULL DEFAULT ${PG_TS}
  );
  CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, partner_id INTEGER REFERENCES delivery_partners(id),
    tracking_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Label Created',
    scheduled_at TEXT, picked_up_at TEXT, in_transit_at TEXT, delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${PG_TS}
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
  CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);
  CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
`;

// Idempotently add a column to an existing table (for schema evolution on
// databases created before the column existed).
async function addColumnIfMissing(table, column, type) {
  try {
    if (USE_PG) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    } else {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch {
    /* column already exists — ignore */
  }
}

export async function migrate() {
  await db.exec(USE_PG ? PG_SCHEMA : SQLITE_SCHEMA);
  // Evolution migrations for existing databases.
  await addColumnIfMissing('orders', 'payment_intent_id', 'TEXT');
  const existing = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('handling_fee');
  if (!existing) {
    await db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('handling_fee', String(config.defaultHandlingFee));
  }
}

export async function getSetting(key, fallback = null) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, String(value));
}

// Wipes all data (used by the seeder). Resets identity sequences per-dialect.
export async function resetAllData() {
  if (USE_PG) {
    await db.exec(
      'TRUNCATE order_events, shipments, orders, delivery_partners, shops, users RESTART IDENTITY CASCADE'
    );
  } else {
    await db.exec(`
      DELETE FROM order_events; DELETE FROM shipments; DELETE FROM orders;
      DELETE FROM delivery_partners; DELETE FROM shops; DELETE FROM users;
      DELETE FROM sqlite_sequence;
    `);
  }
}
