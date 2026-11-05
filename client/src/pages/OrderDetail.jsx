import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useOrderStream } from '../lib/useOrderStream.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Timeline from '../components/Timeline.jsx';
import CostBreakdown from '../components/CostBreakdown.jsx';
import OrderProgress from '../components/OrderProgress.jsx';
import StripeCheckout from '../components/StripeCheckout.jsx';

const PAYMENT_METHODS = ['Card', 'Net Banking', 'PayPal'];
const SHIPMENT_STATUSES = ['Label Created', 'Scheduled', 'Picked Up', 'In Transit', 'Delivered'];

// Client-side mirror of the server's allowed forward transitions, used to show
// only valid "next status" buttons to vendors.
const TRANSITIONS = {
  Created: ['Pickup Scheduled', 'Cancelled'],
  'Pickup Scheduled': ['Picked Up', 'Cancelled'],
  'Picked Up': ['In Transit to Shop', 'Cancelled'],
  'In Transit to Shop': ['Received by Shop', 'Cancelled'],
  'Received by Shop': ['Quote Sent', 'Cancelled'],
  'Quote Sent': ['Quote Accepted', 'Cancelled'],
  'Quote Accepted': ['In Repair', 'Cancelled'],
  'In Repair': ['Repaired', 'Cancelled'],
  Repaired: ['Ready to Ship', 'Cancelled'],
  'Ready to Ship': ['Shipped Back', 'Cancelled'],
  'Shipped Back': ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

const ALL_STATUSES = [
  'Created', 'Pickup Scheduled', 'Picked Up', 'In Transit to Shop',
  'Received by Shop', 'Quote Sent', 'Quote Accepted', 'In Repair',
  'Repaired', 'Ready to Ship', 'Shipped Back', 'Delivered', 'Cancelled',
];

function fmt(ts) {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { order, setOrder, connected, error, refresh } = useOrderStream(id);
  const [actionError, setActionError] = useState('');
  const [payments, setPayments] = useState({ provider: 'mock', publishableKey: null });
  const toast = useToast();

  // Discover which payment provider is active (Stripe vs mock).
  useEffect(() => {
    api('/catalog/meta')
      .then((m) => m.payments && setPayments(m.payments))
      .catch(() => {});
  }, []);

  // Wraps any action call: clears errors, runs it, refreshes on success.
  async function run(fn, successMsg) {
    setActionError('');
    try {
      const res = await fn();
      if (res && res.order) setOrder(res.order);
      else await refresh();
      if (successMsg) toast.success(successMsg);
    } catch (e) {
      setActionError(e.message);
      toast.error(e.message);
    }
  }

  if (error && !order) return <div className="container"><div className="alert error">{error}</div></div>;
  if (!order) return <div className="container"><p className="muted">Loading order…</p></div>;

  const isCustomer = user.role === 'customer';
  const isVendor = user.role === 'vendor';
  const isAdmin = user.role === 'admin';

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link className="small muted" to={isVendor ? '/vendor' : isAdmin ? '/admin' : '/orders'}>
          ← Back
        </Link>
        <h1 style={{ margin: 0 }}>
          <code>{order.publicId}</code>
        </h1>
        <StatusBadge status={order.status} />
        {order.disputeFlag && <span className="badge red">dispute flagged</span>}
        <span className="spacer" style={{ flex: 1 }} />
        <span className="small muted" title={connected ? 'Live updates active' : 'Reconnecting / polling'}>
          <span className={`live-dot ${connected ? '' : 'off'}`} />
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
      </div>

      {actionError && <div className="alert error">{actionError}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <OrderProgress status={order.status} />
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start', marginTop: 16 }}>
        {/* LEFT: details + timeline */}
        <div>
          <div className="card">
            <h3>Repair</h3>
            <div className="kv"><span>Category</span><span>{order.category}</span></div>
            <div className="kv"><span>Issue</span><span style={{ textAlign: 'right', maxWidth: 280 }}>{order.issueDescription}</span></div>
            <div className="kv"><span>Quote status</span><span>{order.quoteStatus}</span></div>
            <div className="kv"><span>Payment</span><span>{order.paymentStatus}{order.paymentMethod ? ` · ${order.paymentMethod}` : ''}</span></div>
            {order.estimatedDays != null && (
              <div className="kv"><span>Estimated repair time</span><span>~{order.estimatedDays} day(s)</span></div>
            )}
            {order.quoteNotes && (
              <div className="kv"><span>Quote notes</span><span style={{ textAlign: 'right', maxWidth: 280 }}>{order.quoteNotes}</span></div>
            )}
            {order.imageUrls?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {order.imageUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer">
                    <img src={u} alt="device" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  </a>
                ))}
              </div>
            )}
            {(order.beforeNotes || order.afterNotes) && (
              <div style={{ marginTop: 10 }}>
                {order.beforeNotes && <p className="small"><strong>Before:</strong> {order.beforeNotes}</p>}
                {order.afterNotes && <p className="small"><strong>After:</strong> {order.afterNotes}</p>}
              </div>
            )}
          </div>

          <div className="card">
            <h3>Pickup</h3>
            <div className="kv"><span>Address</span><span style={{ textAlign: 'right', maxWidth: 280 }}>{order.pickup.address}</span></div>
            <div className="kv"><span>City / Country</span><span>{order.pickup.city}, {order.pickup.country}</span></div>
            <div className="kv"><span>Phone</span><span>{order.pickup.phoneCountryCode} {order.pickup.phone}</span></div>
            <div className="kv"><span>Date / slot</span><span>{order.pickup.date || 'Any'} · {order.pickup.slot || 'Any'}</span></div>
          </div>

          {order.shipments?.length > 0 && (
            <div className="card">
              <h3>Shipments</h3>
              {order.shipments.map((s) => (
                <div key={s.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{s.kind === 'pickup' ? 'Pickup' : 'Return'}</strong>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="small muted">Tracking: <code>{s.trackingNumber}</code></div>
                  <div className="small muted">
                    Scheduled {fmt(s.scheduledAt)} · Picked up {fmt(s.pickedUpAt)} · In transit {fmt(s.inTransitAt)} · Delivered {fmt(s.deliveredAt)}
                  </div>
                  {isVendor && (
                    <div className="btn-row" style={{ marginTop: 6 }}>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const status = e.target.value;
                          e.target.value = '';
                          run(() => api(`/vendor/shipments/${s.id}/status`, { method: 'POST', body: { status } }));
                        }}
                      >
                        <option value="">Update status…</option>
                        {SHIPMENT_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3>Timeline</h3>
            <Timeline events={order.timeline} />
          </div>
        </div>

        {/* RIGHT: costs + role actions */}
        <div>
          <div className="card">
            <h3>Cost breakdown</h3>
            <CostBreakdown costs={order.costs} />
          </div>

          {isCustomer && <CustomerActions order={order} run={run} payments={payments} setOrder={setOrder} />}
          {isVendor && <VendorActions order={order} run={run} />}
          {isAdmin && <AdminActions order={order} run={run} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Customer actions ---------------------- */
function CustomerActions({ order, run, payments, setOrder }) {
  const [method, setMethod] = useState('Card');
  const canDecide = order.quoteStatus === 'sent' && order.status === 'Quote Sent';
  const canPay = order.quoteStatus === 'accepted' && order.paymentStatus !== 'paid';
  const useStripe = payments?.provider === 'stripe' && payments?.publishableKey;
  const canCancel = !['In Repair', 'Repaired', 'Ready to Ship', 'Shipped Back', 'Delivered', 'Cancelled'].includes(order.status);

  return (
    <div className="card">
      <h3>Your actions</h3>
      {canDecide ? (
        <>
          <div className="alert info">The shop has sent a quote. Review the cost above and decide.</div>
          <div className="btn-row">
            <button className="btn primary" onClick={() => run(() => api(`/orders/${order.id}/accept-quote`, { method: 'POST' }), 'Quote accepted — your repair is underway.')}>
              Accept quote
            </button>
            <button className="btn danger" onClick={() => run(() => api(`/orders/${order.id}/reject-quote`, { method: 'POST', body: { reason: '' } }), 'Quote rejected.')}>
              Reject quote
            </button>
          </div>
        </>
      ) : (
        <p className="small muted">
          {order.quoteStatus === 'none' && 'Waiting for the shop to inspect your device and send a quote.'}
          {order.quoteStatus === 'accepted' && 'Quote accepted. Repair is underway.'}
          {order.quoteStatus === 'rejected' && 'You rejected the quote.'}
        </p>
      )}

      {canPay && useStripe && (
        <div style={{ marginTop: 12 }}>
          <label>Card payment</label>
          <StripeCheckout
            orderId={order.id}
            publishableKey={payments.publishableKey}
            onPaid={(o) => setOrder(o)}
          />
        </div>
      )}

      {canPay && !useStripe && (
        <div style={{ marginTop: 12 }}>
          <label>Payment method (demo)</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="btn-row">
            <button className="btn accent" onClick={() => run(() => api(`/orders/${order.id}/pay`, { method: 'POST', body: { method } }), `Payment received via ${method}.`)}>
              Pay €{order.costs.total?.toFixed(2)}
            </button>
          </div>
        </div>
      )}
      {order.paymentStatus === 'paid' && <div className="alert success" style={{ marginTop: 10 }}>Payment complete via {order.paymentMethod}.</div>}

      {canCancel && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={() => run(() => api(`/orders/${order.id}/cancel`, { method: 'POST' }))}>
            Cancel order
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------- Vendor actions ---------------------- */
function VendorActions({ order, run }) {
  const [quote, setQuote] = useState({ price: order.costs.repair ?? '', estimatedDays: order.estimatedDays ?? '', notes: order.quoteNotes ?? '' });
  const [notes, setNotes] = useState({ beforeNotes: '', afterNotes: '' });
  const nextStatuses = (TRANSITIONS[order.status] || []).filter((s) => s !== 'Quote Sent');

  return (
    <>
      {order.status === 'Created' && (
        <div className="card">
          <h3>Intake</h3>
          <div className="btn-row">
            <button className="btn primary" onClick={() => run(() => api(`/vendor/orders/${order.id}/intake`, { method: 'POST', body: { action: 'accept' } }), 'Intake accepted — pickup scheduled.')}>
              Accept intake
            </button>
            <button className="btn danger" onClick={() => run(() => api(`/vendor/orders/${order.id}/intake`, { method: 'POST', body: { action: 'reject' } }), 'Intake rejected.')}>
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Send / update quote</h3>
        <div className="row">
          <div>
            <label>Repair price (€)</label>
            <input type="number" min="0" value={quote.price} onChange={(e) => setQuote({ ...quote, price: e.target.value })} />
          </div>
          <div>
            <label>Est. days</label>
            <input type="number" min="0" value={quote.estimatedDays} onChange={(e) => setQuote({ ...quote, estimatedDays: e.target.value })} />
          </div>
        </div>
        <label>Notes</label>
        <textarea value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} />
        <div className="btn-row">
          <button className="btn primary" disabled={quote.price === ''} onClick={() => run(() => api(`/vendor/orders/${order.id}/quote`, { method: 'POST', body: { price: Number(quote.price), estimatedDays: quote.estimatedDays ? Number(quote.estimatedDays) : null, notes: quote.notes } }), 'Quote sent to customer.')}>
            {order.quoteStatus === 'none' ? 'Send quote' : 'Update quote'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Advance status</h3>
        {nextStatuses.length === 0 ? (
          <p className="small muted">No further status changes available.</p>
        ) : (
          <div className="btn-row">
            {nextStatuses.map((s) => (
              <button key={s} className={`btn sm ${s === 'Cancelled' ? 'danger' : 'accent'}`}
                onClick={() => run(() => api(`/vendor/orders/${order.id}/status`, { method: 'POST', body: { status: s } }), `Status updated to ${s}.`)}>
                → {s}
              </button>
            ))}
          </div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>
          Repair can only begin after the customer accepts the quote.
        </p>
      </div>

      <div className="card">
        <h3>Shipments</h3>
        <div className="btn-row">
          <button className="btn ghost sm" onClick={() => run(() => api(`/vendor/orders/${order.id}/shipments`, { method: 'POST', body: { kind: 'pickup' } }))}>
            + Pickup shipment
          </button>
          <button className="btn ghost sm" onClick={() => run(() => api(`/vendor/orders/${order.id}/shipments`, { method: 'POST', body: { kind: 'return' } }))}>
            + Return shipment
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Before / after notes</h3>
        <label>Before</label>
        <textarea value={notes.beforeNotes} onChange={(e) => setNotes({ ...notes, beforeNotes: e.target.value })} />
        <label>After</label>
        <textarea value={notes.afterNotes} onChange={(e) => setNotes({ ...notes, afterNotes: e.target.value })} />
        <div className="btn-row">
          <button className="btn primary sm"
            disabled={!notes.beforeNotes && !notes.afterNotes}
            onClick={() => run(async () => {
              const res = await api(`/vendor/orders/${order.id}/notes`, { method: 'POST', body: { beforeNotes: notes.beforeNotes || null, afterNotes: notes.afterNotes || null } });
              setNotes({ beforeNotes: '', afterNotes: '' });
              return res;
            })}>
            Save notes
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------------------- Admin actions ---------------------- */
function AdminActions({ order, run }) {
  const [override, setOverride] = useState(order.status);
  return (
    <>
      <div className="card">
        <h3>Dispute</h3>
        <div className="btn-row">
          <button className="btn danger sm" onClick={() => run(() => api(`/admin/orders/${order.id}/dispute`, { method: 'POST', body: { flag: !order.disputeFlag } }))}>
            {order.disputeFlag ? 'Clear dispute flag' : 'Flag dispute'}
          </button>
        </div>
      </div>
      <div className="card">
        <h3>Manual status override</h3>
        <select value={override} onChange={(e) => setOverride(e.target.value)}>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="btn-row">
          <button className="btn accent sm" onClick={() => run(() => api(`/admin/orders/${order.id}/status`, { method: 'POST', body: { status: override } }))}>
            Apply override
          </button>
        </div>
      </div>
    </>
  );
}
