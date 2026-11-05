import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="container">
      <div className="hero">
        <h1>
          Village-to-city repairs,
          <br /> handled end to end.
        </h1>
        <p>
          WeFix Setu connects customers in smaller towns and villages with trusted
          city repair shops — with door-step pickup, transparent quotes, live
          tracking, and return delivery in one place.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          {user ? (
            <Link
              className="btn primary"
              to={
                user.role === 'admin'
                  ? '/admin'
                  : user.role === 'vendor'
                    ? '/vendor'
                    : '/orders'
              }
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link className="btn primary" to="/register">
                Book a repair
              </Link>
              <Link className="btn ghost" to="/register-vendor">
                Register your shop
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <h3>1 · Request</h3>
          <p className="small muted">
            Describe the issue, pick a shop and couriers, and see your cost preview
            before you commit.
          </p>
        </div>
        <div className="card">
          <h3>2 · Repair</h3>
          <p className="small muted">
            The shop sends a quote. Once you accept, pickup begins and your device
            is repaired — with live status updates.
          </p>
        </div>
        <div className="card">
          <h3>3 · Return</h3>
          <p className="small muted">
            Repaired devices ship back to your door with full shipment tracking and
            milestone timestamps.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Demo accounts</h3>
        <p className="small muted" style={{ marginBottom: 0 }}>
          All passwords: <code>password123</code> &nbsp;·&nbsp;
          customer@wefixsetu.com &nbsp;·&nbsp; vendor.berlin@wefixsetu.com
          &nbsp;·&nbsp; admin@wefixsetu.com
        </p>
      </div>
    </div>
  );
}
