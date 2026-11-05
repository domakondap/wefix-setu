import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/error.js';

import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';
import vendorRoutes from './routes/vendor.js';
import adminRoutes from './routes/admin.js';
import eventRoutes from './routes/events.js';
import webhookRoutes from './routes/webhooks.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // helmet with a CSP that still allows the SPA's own assets, same-origin SSE,
  // and the externally-hosted device images customers may attach.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  // CORS: allow no-origin (curl/SSR), configured client origins, and any
  // genuine same-origin request (origin host === request host). The last rule
  // means single-container deploys (frontend served by this server) work
  // without having to hardcode the deployed URL.
  app.use((req, res, next) =>
    cors({
      credentials: true,
      origin(origin, cb) {
        if (!origin || config.clientOrigins.includes(origin)) return cb(null, true);
        try {
          if (new URL(origin).host === req.headers.host) return cb(null, true);
        } catch {
          /* fall through */
        }
        return cb(null, false);
      },
    })(req, res, next)
  );
  // Stripe webhooks need the raw body for signature verification, so they must
  // be mounted BEFORE the JSON body parser.
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '1mb' }));

  // Health check (useful for Docker/Render).
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', env: config.env, time: new Date().toISOString() });
  });

  // SSE must NOT go through the JSON rate limiter's counting of long-lived
  // connections in a way that blocks; mount it before the global limiter.
  app.use('/api/events', eventRoutes);

  // Global API rate limit for the rest.
  app.use('/api', apiLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/vendor', vendorRoutes);
  app.use('/api/admin', adminRoutes);

  // Unknown API routes → JSON 404 (must come before the SPA fallback).
  app.use('/api', notFound);

  // --- Serve the built frontend (single-container / Cloud Run deploys) ---
  // When CLIENT_DIST points at a built Vite "dist" folder, serve it and fall
  // back to index.html for client-side routes. In local dev this is unset and
  // the Vite dev server handles the frontend instead.
  const clientDist = process.env.CLIENT_DIST;
  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
