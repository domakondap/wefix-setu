import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const CATEGORIES = [
  'Mobile Phone',
  'Laptop',
  'Tablet',
  'Home Appliance',
  'Watch',
  'Camera',
  'Audio Equipment',
  'Other',
];

export default function VendorRegister() {
  const { registerVendor } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phoneCountryCode: '+49',
    phone: '',
    shopName: '',
    country: 'Germany',
    city: '',
    address: '',
    categories: [],
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function toggleCategory(cat) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat],
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await registerVendor(form);
      navigate('/vendor', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container narrow">
      <div className="card">
        <h1>Register your repair shop</h1>
        <p className="muted small">
          Your shop is created in a <strong>pending</strong> state and goes live
          once an admin approves it.
        </p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={onSubmit}>
          <h3>Owner account</h3>
          <label>Your name</label>
          <input value={form.name} onChange={set('name')} required />
          <label>Email</label>
          <input type="email" value={form.email} onChange={set('email')} required />
          <label>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
          />
          <div className="row">
            <div style={{ maxWidth: 110 }}>
              <label>Code</label>
              <input value={form.phoneCountryCode} onChange={set('phoneCountryCode')} />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={set('phone')} />
            </div>
          </div>

          <h3 style={{ marginTop: 18 }}>Shop details</h3>
          <label>Shop name</label>
          <input value={form.shopName} onChange={set('shopName')} required />
          <div className="row">
            <div>
              <label>Country</label>
              <input value={form.country} onChange={set('country')} required />
            </div>
            <div>
              <label>City</label>
              <input value={form.city} onChange={set('city')} required />
            </div>
          </div>
          <label>Address</label>
          <input value={form.address} onChange={set('address')} />

          <label>Categories serviced</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                className={`btn sm ${form.categories.includes(c) ? 'accent' : 'ghost'}`}
                onClick={() => toggleCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="btn-row">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Registering…' : 'Register shop'}
            </button>
          </div>
        </form>
        <p className="small muted" style={{ marginTop: 16 }}>
          Looking to book a repair instead?{' '}
          <Link to="/register">Customer sign up</Link>.
        </p>
      </div>
    </div>
  );
}
