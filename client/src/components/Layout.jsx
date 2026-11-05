import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // Home destination depends on role.
  const home =
    user?.role === 'admin'
      ? '/admin'
      : user?.role === 'vendor'
        ? '/vendor'
        : user
          ? '/orders'
          : '/';

  return (
    <>
      <nav className="nav">
        <NavLink to={home} className="brand">
          <span className="dot" />
          WeFix Setu
        </NavLink>

        {user?.role === 'customer' && (
          <>
            <NavLink to="/orders">My Orders</NavLink>
            <NavLink to="/orders/new">New Repair</NavLink>
          </>
        )}
        {user?.role === 'vendor' && <NavLink to="/vendor">Dashboard</NavLink>}
        {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}

        <span className="spacer" />

        {user ? (
          <>
            <span className="muted small">
              {user.name} · <span className="badge">{user.role}</span>
            </span>
            <button className="btn ghost sm" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register">Sign up</NavLink>
          </>
        )}
      </nav>
      {children}
    </>
  );
}
