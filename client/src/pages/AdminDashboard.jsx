import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const TABS = ['Shops', 'Delivery partners', 'Settings', 'Users', 'Orders', 'Shipments'];

export default function AdminDashboard() {
  const [tab, setTab] = useState('Shops');
  return (
    <div className="container">
      <h1>Admin</h1>
      <div className="btn-row" style={{ marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t} className={`btn sm ${t === tab ? 'accent' : 'ghost'}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Shops' && <Shops />}
      {tab === 'Delivery partners' && <Partners />}
      {tab === 'Settings' && <Settings />}
      {tab === 'Users' && <Users />}
      {tab === 'Orders' && <AdminOrders />}
      {tab === 'Shipments' && <Shipments />}
    </div>
  );
}

function useAsync(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reload = () => loader().then(setData).catch((e) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, error, reload };
}

/* ----------------------------- Shops ----------------------------- */
function Shops() {
  const { data, error, reload } = useAsync(() => api('/admin/shops').then((d) => d.shops));
  async function setStatus(id, status) {
    await api(`/admin/shops/${id}`, { method: 'PATCH', body: { status } });
    reload();
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      {error && <div className="alert error" style={{ margin: 16 }}>{error}</div>}
      <table>
        <thead><tr><th>Shop</th><th>City</th><th>Categories</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {(data || []).map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.city}, {s.country}</td>
              <td className="small muted">{s.categories.join(', ') || '—'}</td>
              <td><span className={`badge ${s.status === 'approved' ? 'green' : s.status === 'disabled' ? 'red' : 'amber'}`}>{s.status}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  {s.status !== 'approved' && <button className="btn sm primary" onClick={() => setStatus(s.id, 'approved')}>Approve</button>}
                  {s.status !== 'disabled' && <button className="btn sm danger" onClick={() => setStatus(s.id, 'disabled')}>Disable</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------ Delivery partners ----------------------- */
function Partners() {
  const { data, error, reload } = useAsync(() => api('/admin/partners').then((d) => d.partners));
  const [form, setForm] = useState({ name: '', type: 'both', serviceAreas: '', price: '', etaDays: '' });

  async function create(e) {
    e.preventDefault();
    await api('/admin/partners', {
      method: 'POST',
      body: {
        name: form.name,
        type: form.type,
        serviceAreas: form.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean),
        price: Number(form.price) || 0,
        etaDays: Number(form.etaDays) || 1,
      },
    });
    setForm({ name: '', type: 'both', serviceAreas: '', price: '', etaDays: '' });
    reload();
  }
  async function patch(id, body) {
    await api(`/admin/partners/${id}`, { method: 'PATCH', body });
    reload();
  }

  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        {error && <div className="alert error" style={{ margin: 16 }}>{error}</div>}
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Service areas</th><th>Price</th><th>ETA</th><th>Enabled</th><th></th></tr></thead>
          <tbody>
            {(data || []).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.type}</td>
                <td className="small muted">{p.serviceAreas.join(', ') || 'any'}</td>
                <td>€{p.price.toFixed(2)}</td>
                <td>~{p.etaDays}d</td>
                <td>{p.enabled ? <span className="badge green">on</span> : <span className="badge red">off</span>}</td>
                <td>
                  <button className="btn sm ghost" onClick={() => patch(p.id, { enabled: !p.enabled })}>
                    {p.enabled ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Add delivery partner</h3>
        <form onSubmit={create}>
          <div className="row">
            <div><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div style={{ maxWidth: 140 }}>
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="both">both</option><option value="pickup">pickup</option><option value="return">return</option>
              </select>
            </div>
          </div>
          <label>Service areas (comma-separated, e.g. Germany/Berlin)</label>
          <input value={form.serviceAreas} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} placeholder="Germany/Berlin, Germany/Munich" />
          <div className="row">
            <div><label>Price (€)</label><input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><label>ETA (days)</label><input type="number" min="1" value={form.etaDays} onChange={(e) => setForm({ ...form, etaDays: e.target.value })} /></div>
          </div>
          <div className="btn-row"><button className="btn primary">Create partner</button></div>
        </form>
      </div>
    </>
  );
}

/* --------------------------- Settings ----------------------------- */
function Settings() {
  const { data, reload } = useAsync(() => api('/admin/settings'));
  const [fee, setFee] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setFee(String(data.handlingFee)); }, [data]);

  async function save(e) {
    e.preventDefault();
    await api('/admin/settings/handling-fee', { method: 'PUT', body: { handlingFee: Number(fee) } });
    setSaved(true);
    reload();
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <div className="card narrow">
      <h3>Platform handling fee</h3>
      <p className="small muted">Applied to every new order's cost breakdown.</p>
      {saved && <div className="alert success">Saved.</div>}
      <form onSubmit={save}>
        <label>Handling fee (€)</label>
        <input type="number" min="0" step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} />
        <div className="btn-row"><button className="btn primary">Save</button></div>
      </form>
    </div>
  );
}

/* ---------------------------- Users ------------------------------- */
function Users() {
  const { data, error } = useAsync(() => api('/admin/users').then((d) => d.users));
  return (
    <div className="card" style={{ padding: 0 }}>
      {error && <div className="alert error" style={{ margin: 16 }}>{error}</div>}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th></tr></thead>
        <tbody>
          {(data || []).map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td>
              <td><span className="badge">{u.role}</span></td>
              <td className="small muted">{u.phoneCountryCode || ''} {u.phone || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------- Orders ------------------------------ */
function AdminOrders() {
  const { data, error } = useAsync(() => api('/admin/orders').then((d) => d.orders));
  return (
    <div className="card" style={{ padding: 0 }}>
      {error && <div className="alert error" style={{ margin: 16 }}>{error}</div>}
      <table>
        <thead><tr><th>Order</th><th>Category</th><th>City</th><th>Status</th><th>Payment</th><th>Total</th><th></th></tr></thead>
        <tbody>
          {(data || []).map((o) => (
            <tr key={o.id}>
              <td><code>{o.publicId}</code>{o.disputeFlag && <span className="badge red" style={{ marginLeft: 6 }}>dispute</span>}</td>
              <td>{o.category}</td>
              <td>{o.pickup.city}</td>
              <td><StatusBadge status={o.status} /></td>
              <td className="small muted">{o.paymentStatus}</td>
              <td>{o.costs.total == null ? '—' : `€${o.costs.total.toFixed(2)}`}</td>
              <td><Link className="btn sm ghost" to={`/orders/${o.id}`}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- Shipments ---------------------------- */
function Shipments() {
  const { data, error } = useAsync(() => api('/admin/shipments').then((d) => d.shipments));
  return (
    <div className="card" style={{ padding: 0 }}>
      {error && <div className="alert error" style={{ margin: 16 }}>{error}</div>}
      <table>
        <thead><tr><th>Tracking</th><th>Order</th><th>Kind</th><th>Status</th><th>Delivered</th></tr></thead>
        <tbody>
          {(data || []).map((s) => (
            <tr key={s.id}>
              <td><code>{s.trackingNumber}</code></td>
              <td>#{s.orderId}</td>
              <td>{s.kind}</td>
              <td><StatusBadge status={s.status} /></td>
              <td className="small muted">{s.deliveredAt || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
