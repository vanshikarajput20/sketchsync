/**
 * server/src/app.js
 *
 * Express application factory. Keeps HTTP concerns (REST routes, CORS, logging)
 * completely separate from Socket.IO event handling.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { apiRouter } from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Creates and configures the Express application.
 * @returns {import('express').Application}
 */
export function createApp() {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(' ');

  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow requests with no origin (e.g. curl, Postman) in development
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // Health check for Railway / Render uptime monitors
  app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

  // ── Error handler (must be last) ────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
