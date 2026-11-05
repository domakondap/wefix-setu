import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function destFor(role) {
    if (role === 'admin') return '/admin';
    if (role === 'vendor') return '/vendor';
    return '/orders';
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(email, password);
      const from = location.state?.from;
      navigate(from || destFor(u.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container narrow">
      <div className="card">
        <h1>Log in</h1>
        <p className="muted small">Welcome back to WeFix Setu.</p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="btn-row">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </button>
          </div>
        </form>
        <p className="small muted" style={{ marginTop: 16 }}>
          New here? <Link to="/register">Create a customer account</Link> or{' '}
          <Link to="/register-vendor">register your repair shop</Link>.
        </p>
      </div>
    </div>
  );
}
