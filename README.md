# WeFix Setu

**Village-to-city repair logistics platform.** Customers in smaller towns and
villages book device repairs with trusted city shops; WeFix Setu coordinates
door-step pickup, transparent quotes, live status tracking, and return delivery
— end to end.

> Core flow: **Customer creates order → vendor sends quote → customer
> accepts/rejects → pickup starts only after acceptance → repair updates →
> return shipment → delivered.**

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + React Router |
| Backend | Node.js + Express |
| Database | SQLite (dev) **or** PostgreSQL (prod) — same code, switch with `DATABASE_URL` |
| Auth | Email/password + JWT, bcrypt password hashing |
| Realtime | Server-Sent Events (SSE) |
| Security | helmet, CORS allowlist, auth rate limiting, strong password rules, production JWT-secret checks, role-based access middleware |

> **Why `node:sqlite`?** It ships with Node ≥ 22.5 and needs **zero native
> compilation** (no `better-sqlite3` build step / Python / toolchain). The data
> layer in [`server/src/db.js`](server/src/db.js) is a thin shim that mirrors the
> `better-sqlite3` API, so swapping engines later touches one file.

---

## Prerequisites

- **Node.js ≥ 22.5** (required for `node:sqlite`). Check with `node --version`.
- npm.

---

## Quick start (local dev)

From the repo root (Node ≥ 22.5):

```bash
npm run install:all
cp -n server/.env.example server/.env
cp -n client/.env.example client/.env
npm run seed
npm run dev
```

That starts the API on **http://localhost:4000** and the UI on
**http://localhost:5173**, then returns once both are healthy. Open the UI URL.
The Vite dev server proxies `/api` to the backend, so SSE and API calls work
same-origin with no CORS fuss.

Cloud Agents use the same flow via [`.cursor/environment.json`](.cursor/environment.json)
(`install` then `scripts/cursor-start.sh`). Re-running `npm run dev` is safe if
the app is already up.

To start the two processes in separate terminals instead:

**1) Backend**
```bash
cd server
cp -n .env.example .env
npm install
npm run seed                  # creates + seeds the SQLite DB
npm run dev                   # http://localhost:4000
```

**2) Frontend**
```bash
cd client
cp -n .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

### Demo accounts (all password: `password123`)

| Email | Role | Notes |
|---|---|---|
| `customer@wefixsetu.com` | customer | Has 2 demo orders |
| `vendor.berlin@wefixsetu.com` | vendor | Berlin shop (approved) |
| `vendor.munich@wefixsetu.com` | vendor | Munich shop (approved) |
| `vendor.hamburg@wefixsetu.com` | vendor | Hamburg shop (**pending** approval) |
| `admin@wefixsetu.com` | admin | Full admin console |

Germany is seeded with **Berlin, Munich, Hamburg** shops and three delivery
partners (DeutschePost Express, DHL Same-Day, Hermes Standard).

---

## Testing

A comprehensive end-to-end suite ([`server/test/e2e.mjs`](server/test/e2e.mjs))
exercises **74 scenarios**: the full order lifecycle (Created → Delivered),
every transition guard, role-based access & ownership, the admin console, input
validation, and the quote/intake rejection paths.

```bash
# with the server running (npm run dev) and demo data seeded (npm run seed):
cd server
npm run test:e2e
```

The same suite passes against both SQLite and PostgreSQL.

## Features

### Customer
- Register / login.
- Create a repair order: category, issue description, optional image URLs,
  pickup country/city/address, phone (country code + number), pickup date &
  time slot, choice of repair shop, pickup & return couriers.
- Live **cost preview** (repair + pickup + return + platform handling fee).
- Order list + detail page with a **live timeline** (SSE).
- Accept / reject the vendor's quote.
- Mock payment: Card / Net Banking / PayPal.

### Vendor
- Self-registration that creates a vendor account **and** a shop pending admin
  approval.
- Dashboard of assigned orders.
- Accept / reject intake.
- Send / update quote (price, estimated days, notes).
- Advance repair statuses (forward-only, validated).
- Create pickup/return shipments and update shipment statuses (with milestone
  timestamps).
- Add before/after repair notes.

### Admin
- Approve / disable shops.
- Manage delivery partners (service areas, price, ETA, enable/disable).
- Set the platform handling fee.
- View all users, orders, and shipments.
- Flag disputes and manually override any order status.

### Order status flow
```
Created → Pickup Scheduled → Picked Up → In Transit to Shop → Received by Shop
→ Quote Sent → Quote Accepted → In Repair → Repaired → Ready to Ship
→ Shipped Back → Delivered            (+ Cancelled from most states)
```
Forward transitions are enforced server-side; **repair cannot begin until the
customer accepts the quote**. Admins can override.

### Realtime
- SSE endpoint: `GET /api/events/orders/:orderId/stream?token=...`
- The server pushes both granular timeline events and full updated order
  objects whenever anything changes.
- The order detail page listens live and updates instantly, with automatic
  reconnect and a 5-second polling fallback if the stream drops.

See **[docs/API.md](docs/API.md)** for the full endpoint reference.

---

## Project structure

```
wefix/
├── server/                 # Express API
│   ├── src/
│   │   ├── index.js        # entry — migrate() + listen
│   │   ├── app.js          # middleware + route wiring
│   │   ├── config.js       # env + production JWT-secret guard
│   │   ├── db.js           # node:sqlite + schema/migrations
│   │   ├── constants.js    # status flow, transitions, enums
│   │   ├── seed.js         # demo data (npm run seed)
│   │   ├── middleware/     # auth (RBAC), rate limiting, errors
│   │   ├── routes/         # auth, catalog, orders, vendor, admin, events
│   │   └── utils/          # jwt, password, SSE bus, order service, serializers
│   ├── Dockerfile
│   └── .env.example
├── client/                 # React + Vite SPA
│   ├── src/
│   │   ├── pages/          # Home, Login, Register(+Vendor), Orders, NewOrder,
│   │   │                   #   OrderDetail, VendorDashboard, AdminDashboard
│   │   ├── components/     # Layout, ProtectedRoute, Timeline, CostBreakdown, StatusBadge
│   │   ├── context/        # AuthContext (JWT)
│   │   └── lib/            # api client, useOrderStream (SSE hook)
│   ├── Dockerfile + nginx.conf
│   └── .env.example
├── docs/API.md
├── docker-compose.yml
└── render.yaml
```

---

## Environment variables

### Server (`server/.env`)
| Var | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port. |
| `NODE_ENV` | `development` | `production` enables the strict JWT-secret check. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated CORS allowlist. |
| `JWT_SECRET` | dev placeholder | **Required & ≥ 32 chars in production** or the server refuses to boot. |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime. |
| `DATABASE_FILE` | `./data/wefix.sqlite` | SQLite file path. |
| `DEFAULT_HANDLING_FEE` | `5` | Initial platform handling fee. |

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Client (`client/.env`)
| Var | Default | Notes |
|---|---|---|
| `VITE_API_BASE` | empty | Empty = same-origin `/api`. Set to the API's full URL when hosting the SPA separately. |
| `VITE_API_TARGET` | `http://localhost:4000` | Dev-only proxy target. |

---

## Run with Docker

```bash
# Build & run API + nginx-served frontend together.
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  docker compose up --build
```
Open **http://localhost:8080**. nginx serves the built SPA and proxies `/api`
(including SSE) to the API container. SQLite persists in the `wefix_data` volume.

To seed demo data inside the running API container:
```bash
docker compose exec api npm run seed
```

---

## Deploy to Google Cloud Run (single container)

The root [`Dockerfile`](Dockerfile) builds **one** image that serves the React
SPA *and* the Express API on the same origin (so auth + SSE work with no CORS
setup). A helper script wraps the deploy:

```bash
# One-time: install gcloud, then
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Deploy (builds via Cloud Build — no local Docker needed):
./deploy-cloudrun.sh
```

This reuses the service name `wefix-setu` in `europe-west2`, generates a strong
`JWT_SECRET`, and sets `SEED_ON_BOOT=true` so a fresh container seeds demo data
on first boot. Override defaults with env vars, e.g.
`SERVICE=wefix-setu REGION=europe-west2 JWT_SECRET=… ./deploy-cloudrun.sh`.

> **SQLite + Cloud Run caveat:** Cloud Run's filesystem is **ephemeral**. Data
> lives in `/tmp` and is reset on each cold start / new revision (the app
> re-seeds so it's never blank, but customer-created orders won't persist
> long-term). For durable data, migrate to **Cloud SQL (PostgreSQL)** — see
> *PostgreSQL migration* below — and point `DATABASE_URL` at it. This is the
> only change needed for production-grade persistence.

## Deploy to Render

This repo includes a [`render.yaml`](render.yaml) Blueprint that provisions:

1. **`wefix-setu-api`** — Node web service with a 1 GB persistent disk mounted
   at `/var/data` for the SQLite file. `JWT_SECRET` is auto-generated.
2. **`wefix-setu-web`** — static site built from the Vite app.

Steps:
1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo.
3. After the first deploy, set two values (Render service URLs aren't known
   until then):
   - On **wefix-setu-web**: `VITE_API_BASE` → the API's full URL
     (e.g. `https://wefix-setu-api.onrender.com`), then redeploy.
   - On **wefix-setu-api**: `CLIENT_ORIGIN` → the web app's full URL
     (e.g. `https://wefix-setu-web.onrender.com`).
4. (Optional) Seed demo data from the API service shell: `npm run seed`.

> Note: SQLite on a single instance with a persistent disk is great for an MVP
> but does not scale horizontally. For production scale, migrate to PostgreSQL
> (below) and back the SSE bus with Redis pub/sub.

---

## PostgreSQL for production (built in)

The data layer in [`server/src/db.js`](server/src/db.js) is **dual-driver**:

- **No `DATABASE_URL`** → Node's built-in SQLite (local dev, zero setup).
- **`DATABASE_URL` set** → PostgreSQL via `pg`. Schema, identity columns, and
  timestamps are handled per-dialect automatically.

The **same code and the same 74-test E2E suite pass on both engines** — no
route or business-logic changes. To use a free, permanent Postgres:

1. Create a free database at **[neon.tech](https://neon.tech)** (no card, no
   expiry) and copy its connection string.
2. Locally: put it in `server/.env` as
   `DATABASE_URL=postgresql://…?sslmode=require`, then `npm run seed && npm run dev`.
3. On Cloud Run: `DATABASE_URL="postgresql://…" ./deploy-cloudrun.sh` — the
   script passes it through and the app migrates + seeds on first boot.

Run the suite against your Postgres to confirm:
```bash
DATABASE_URL="postgresql://…" npm run seed
DATABASE_URL="postgresql://…" PORT=4001 npm start &
BASE=http://localhost:4001 npm run test:e2e
```

> Verified locally against PostgreSQL 16 — all 74 scenarios pass on Postgres
> exactly as on SQLite.

### Scaling realtime
The SSE bus ([`server/src/utils/events.js`](server/src/utils/events.js)) is an
in-process `EventEmitter`. For multiple API instances, publish/subscribe through
Redis so an update on one instance reaches clients connected to another.

---

## Security notes
- **helmet** sets safe HTTP headers; `x-powered-by` disabled.
- **CORS** restricted to an explicit origin allowlist.
- **Rate limiting**: 20 auth attempts / 15 min / IP; 600 req / 15 min / IP for
  the rest of the API.
- **Passwords**: bcrypt-hashed; registration enforces ≥ 8 chars with mixed case
  and a digit.
- **JWT**: in production the server refuses to start with a missing, default, or
  short (< 32 char) secret.
- **RBAC**: every mutating endpoint checks role *and* resource ownership
  (customers see only their orders; vendors only orders routed to shops they
  own).

---

## License
MIT — provided as an MVP reference implementation.
