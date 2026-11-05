import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Guards a route by authentication and (optionally) role.
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="center-screen">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    // Logged in but wrong role — send them to their own home.
    const home =
      user.role === 'admin' ? '/admin' : user.role === 'vendor' ? '/vendor' : '/orders';
    return <Navigate to={home} replace />;
  }
  return children;
}
