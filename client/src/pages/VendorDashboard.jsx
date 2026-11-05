import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function VendorDashboard() {
  const [orders, setOrders] = useState(null);
  const [shops, setShops] = useState([]);
  const [error, setError] = useState('');

  function load() {
    api('/vendor/orders').then((d) => setOrders(d.orders)).catch((e) => setError(e.message));
    api('/auth/me').then((d) => setShops(d.shops || [])).catch(() => {});
  }
  useEffect(load, []);

  const pendingShop = shops.find((s) => s.status !== 'approved');

  return (
    <div className="container">
      <h1>Vendor dashboard</h1>

      <div className="card">
        <h3>Your shop(s)</h3>
        {shops.length === 0 && <p className="muted small">No shop on file.</p>}
        {shops.map((s) => (
          <div className="kv" key={s.id}>
            <span>{s.name} — {s.city}</span>
            <span className={`badge ${s.status === 'approved' ? 'green' : s.status === 'disabled' ? 'red' : 'amber'}`}>
              {s.status}
            </span>
          </div>
        ))}
        {pendingShop && (
          <div className="alert info" style={{ marginTop: 10 }}>
            Your shop is awaiting admin approval. Orders can be assigned to you once approved.
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ padding: 0, marginTop: 18 }}>
        <div style={{ padding: '14px 20px 0' }}><h3>Assigned orders</h3></div>
        {orders == null ? (
          <p className="muted" style={{ padding: 20 }}>Loading…</p>
        ) : orders.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>No orders assigned yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th><th>Category</th><th>City</th><th>Status</th><th>Quote</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><code>{o.publicId}</code>{o.disputeFlag && <span className="badge red" style={{ marginLeft: 6 }}>dispute</span>}</td>
                  <td>{o.category}</td>
                  <td>{o.pickup.city}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="small muted">{o.quoteStatus}</td>
                  <td><Link className="btn sm ghost" to={`/orders/${o.id}`}>Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
