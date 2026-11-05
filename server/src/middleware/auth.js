import { verifyToken } from '../utils/jwt.js';
import { db } from '../db.js';
import { publicUser } from '../utils/serializers.js';

// Pulls a bearer token from the Authorization header OR a ?token= query param
// (the latter is needed for EventSource/SSE, which cannot set headers).
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (typeof req.query.token === 'string' && req.query.token) {
    return req.query.token;
  }
  return null;
}

export async function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = verifyToken(token);
    const row = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(payload.sub);
    if (!row) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }
    req.user = publicUser(row);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Role-based access control. Usage: requireRole('admin'), requireRole('vendor','admin')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}
