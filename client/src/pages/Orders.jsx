import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/orders')
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 style={{ flex: 1 }}>My repair orders</h1>
        <Link className="btn primary" to="/orders/new">
          + New repair
        </Link>
      </div>

      {error && <div className="alert error">{error}</div>}
      {orders == null && !error && <p className="muted">Loading…</p>}

      {orders && orders.length === 0 && (
        <div className="card">
          <p className="muted">
            You have no orders yet. <Link to="/orders/new">Book your first repair</Link>.
          </p>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Category</th>
                <th>City</th>
                <th>Status</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.publicId}</code>
                    {o.disputeFlag && <span className="badge red" style={{ marginLeft: 6 }}>dispute</span>}
                  </td>
                  <td>{o.category}</td>
                  <td>{o.pickup.city}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{o.costs.total == null ? '—' : `€${o.costs.total.toFixed(2)}`}</td>
                  <td>
                    <Link className="btn sm ghost" to={`/orders/${o.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
