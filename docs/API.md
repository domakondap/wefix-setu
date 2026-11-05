# WeFix Setu — API Reference

Base URL: `/api` (dev: `http://localhost:4000/api`)

All authenticated endpoints expect a JWT in the `Authorization: Bearer <token>`
header. The SSE stream additionally accepts the token as a `?token=` query
param (because `EventSource` cannot set headers).

Roles: `customer`, `vendor`, `admin`. Endpoints enforce role via middleware.

---

## Auth

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | public | `{ name, email, password, phoneCountryCode?, phone? }` | Customer signup. Returns `{ token, user }`. |
| POST | `/auth/register-vendor` | public | `{ name, email, password, shopName, country, city, address?, categories?[] }` | Creates vendor + **pending** shop. Returns `{ token, user, shop }`. |
| POST | `/auth/login` | public | `{ email, password }` | Returns `{ token, user }`. |
| GET | `/auth/me` | any | — | Returns `{ user, shops[] }` (shops only for vendors). |

Password policy: ≥ 8 chars, with upper, lower, and a digit. Auth endpoints are
rate-limited (20 requests / 15 min / IP).

---

## Catalog (order-building helpers)

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/catalog/meta` | public | `{ categories[], paymentMethods[], handlingFee }`. |
| GET | `/catalog/shops?city=&category=` | public | Approved shops (filterable). |
| GET | `/catalog/partners?area=&type=` | public | Enabled delivery partners. |
| POST | `/catalog/cost-preview` | any | `{ pickupPartnerId?, returnPartnerId?, repairEstimate? }` → `{ breakdown }`. |

---

## Orders (customer + shared)

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| POST | `/orders` | customer | `{ category, issueDescription, imageUrls?[], pickupCountry, pickupCity, pickupAddress, phoneCountryCode?, phone?, pickupDate?, pickupSlot?, shopId?, pickupPartnerId?, returnPartnerId? }` | Creates order (status `Created`). |
| GET | `/orders` | any | — | Scoped: customer→own, vendor→assigned, admin→all. |
| GET | `/orders/:id` | owner/vendor/admin | — | Full detail incl. `timeline[]` and `shipments[]`. |
| POST | `/orders/:id/accept-quote` | customer | — | Only when `quoteStatus = sent`. Moves to `Quote Accepted`. |
| POST | `/orders/:id/reject-quote` | customer | `{ reason? }` | Marks quote rejected. |
| POST | `/orders/:id/pay` | customer | `{ method: 'Card'\|'Net Banking'\|'PayPal' }` | Mock payment; requires accepted quote. |
| POST | `/orders/:id/cancel` | customer | — | Allowed before repair begins. |

---

## Vendor

All require role `vendor` and that the order belongs to a shop the vendor owns.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/vendor/orders` | — | Orders assigned to the vendor's shop(s). |
| POST | `/vendor/orders/:id/intake` | `{ action: 'accept'\|'reject', reason? }` | Accept → `Pickup Scheduled`. |
| POST | `/vendor/orders/:id/quote` | `{ price, estimatedDays?, notes? }` | Send/update quote → `Quote Sent`. |
| POST | `/vendor/orders/:id/status` | `{ status }` | Forward-only transition (validated). Repair gated on accepted quote. |
| POST | `/vendor/orders/:id/notes` | `{ beforeNotes?, afterNotes? }` | Before/after repair notes. |
| POST | `/vendor/orders/:id/shipments` | `{ kind: 'pickup'\|'return', partnerId? }` | Creates a shipment + tracking number. |
| POST | `/vendor/shipments/:shipmentId/status` | `{ status }` | Updates shipment + stamps the milestone timestamp. |

Shipment statuses: `Label Created`, `Scheduled`, `Picked Up`, `In Transit`,
`Delivered`. Milestone columns stamped: `scheduled_at`, `picked_up_at`,
`in_transit_at`, `delivered_at`.

---

## Admin

All require role `admin`.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/admin/shops` | — | All shops. |
| PATCH | `/admin/shops/:id` | `{ status: 'approved'\|'disabled'\|'pending' }` | Approve / disable. |
| GET | `/admin/partners` | — | All delivery partners. |
| POST | `/admin/partners` | `{ name, type?, serviceAreas?[], price?, etaDays?, enabled? }` | Create partner. |
| PATCH | `/admin/partners/:id` | partial partner | Update / enable / disable. |
| GET | `/admin/settings` | — | `{ handlingFee }`. |
| PUT | `/admin/settings/handling-fee` | `{ handlingFee }` | Set platform handling fee. |
| GET | `/admin/users` | — | All users. |
| GET | `/admin/orders` | — | All orders. |
| GET | `/admin/shipments` | — | All shipments. |
| POST | `/admin/orders/:id/dispute` | `{ flag: boolean, note? }` | Flag / clear dispute. |
| POST | `/admin/orders/:id/status` | `{ status, note? }` | Manual status override (any status). |

---

## Realtime (SSE)

```
GET /api/events/orders/:orderId/stream?token=<jwt>
```

Emits `text/event-stream` frames. Each `data:` line is JSON:

- `{ "kind": "hello", "orderId", "at" }` — sent on connect.
- `{ "kind": "event", "event": {…} }` — a new timeline event.
- `{ "kind": "order", "order": {…} }` — the full, updated order object.
- `: ping` comments every 25s keep the connection alive.

The client merges `order` payloads over local state and appends `event`
payloads to the timeline. It auto-reconnects (3s `retry`) and falls back to 5s
polling if the stream drops.

---

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ status: 'ok', env, time }`. |

## Error shape

All errors return `{ "error": "<message>" }` with an appropriate HTTP status
(`400` validation, `401` auth, `403` role/ownership, `404` missing, `409`
conflict/illegal transition, `429` rate-limited).
