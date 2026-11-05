import bcrypt from 'bcryptjs';

// Strong password policy: >= 8 chars, with at least one lowercase, one
// uppercase, and one digit. Returns an array of human-readable problems
// (empty array == valid).
export function validatePassword(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 8) {
    problems.push('Password must be at least 8 characters long.');
  }
  if (!/[a-z]/.test(password || '')) {
    problems.push('Password must contain a lowercase letter.');
  }
  if (!/[A-Z]/.test(password || '')) {
    problems.push('Password must contain an uppercase letter.');
  }
  if (!/[0-9]/.test(password || '')) {
    problems.push('Password must contain a number.');
  }
  return problems;
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}
