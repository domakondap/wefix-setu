import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// --- Production-safe JWT secret check ---
// In production we refuse to boot with a missing or obviously-insecure secret.
const JWT_SECRET = process.env.JWT_SECRET || '';
const INSECURE_SECRETS = new Set([
  '',
  'secret',
  'changeme',
  'dev-only-insecure-secret-change-me',
]);

if (isProd && (INSECURE_SECRETS.has(JWT_SECRET) || JWT_SECRET.length < 32)) {
  // eslint-disable-next-line no-console
  console.error(
    '\n[FATAL] JWT_SECRET is missing or insecure. ' +
      'Set a strong (>=32 char) JWT_SECRET environment variable in production.\n'
  );
  process.exit(1);
}

function parseClientOrigins(raw) {
  const listed = String(raw || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set(listed);
  // Browsers treat localhost and 127.0.0.1 as different origins. Cloud Agent
  // previews often use 127.0.0.1, so accept the loopback aliases automatically.
  for (const origin of listed) {
    try {
      const u = new URL(origin);
      const port = u.port ? `:${u.port}` : '';
      if (u.hostname === 'localhost') {
        out.add(`${u.protocol}//127.0.0.1${port}`);
        out.add(`${u.protocol}//[::1]${port}`);
      } else if (u.hostname === '127.0.0.1' || u.hostname === '::1') {
        out.add(`${u.protocol}//localhost${port}`);
      }
    } catch {
      /* ignore malformed origins */
    }
  }
  return [...out];
}

export const config = {
  env: NODE_ENV,
  isProd,
  port: Number(process.env.PORT || 4000),
  clientOrigins: parseClientOrigins(process.env.CLIENT_ORIGIN),
  jwtSecret: JWT_SECRET || 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseFile: path.resolve(
    __dirname,
    '..',
    process.env.DATABASE_FILE || './data/wefix.sqlite'
  ),
  defaultHandlingFee: Number(process.env.DEFAULT_HANDLING_FEE || 5),

  // Currency for payments (ISO 4217). The app prices in EUR by default.
  currency: (process.env.CURRENCY || 'eur').toLowerCase(),

  // --- Payments (Stripe) ---
  // When STRIPE_SECRET_KEY is set we use real Stripe; otherwise the app falls
  // back to a built-in mock so demos still work end-to-end.
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  },
  get paymentsProvider() {
    return process.env.STRIPE_SECRET_KEY ? 'stripe' : 'mock';
  },

  // --- Email (transactional) ---
  // Resend by default; falls back to console logging when no key is set.
  email: {
    provider: process.env.EMAIL_PROVIDER || 'resend',
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || 'WeFix Setu <onboarding@resend.dev>',
  },

  // Public base URL of the app (used in email links). Falls back to client origin.
  appUrl: process.env.APP_URL || (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0],
};
