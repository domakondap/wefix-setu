import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phoneCountryCode: '+49',
    phone: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/orders', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container narrow">
      <div className="card">
        <h1>Create your account</h1>
        <p className="muted small">Book repairs and track them live.</p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={onSubmit}>
          <label>Full name</label>
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
          <p className="small muted">
            Min 8 characters, with upper &amp; lower case letters and a number.
          </p>
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
          <div className="btn-row">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
        <p className="small muted" style={{ marginTop: 16 }}>
          Already have an account? <Link to="/login">Log in</Link>.
        </p>
      </div>
    </div>
  );
}
