import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import { registerRoutes, registerWebhooks } from './routes';
import { generalLimiter } from './security/rate-limits';
import { assertEncryptionConfigured } from './security/encryption';
import { log, serveStatic } from './static';

const isProduction = process.env.NODE_ENV === 'production';

// Refuse to boot without the key-encryption secret: customer keys must never be stored in plaintext.
assertEncryptionConfigured();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  // The SPA loads Firebase Auth popups and Google fonts; a strict CSP is set at the CDN if needed.
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Raw-body routes (signature verification) before the JSON parser.
registerWebhooks(app);

app.use('/api', generalLimiter);
app.use(express.json({ limit: '400kb' }));

// Minimal request log — never logs bodies (they can contain API keys).
app.use((req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  if (!path.startsWith('/api')) return next();
  const start = Date.now();
  res.on('finish', () => log(`${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms`));
  next();
});

registerRoutes(app);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.status || err?.statusCode || 500;
  if (status >= 500) console.error('Unhandled error:', err?.message || err);
  if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'Internal error' : err?.message || 'Bad request' });
});

(async () => {
  const server = createServer(app);
  // Long enough for a full synchronous audit; Cloud Run's request timeout should match (300s).
  server.requestTimeout = 300_000;

  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import('./vite');
    await setupVite(app, server);
  }

  const port = parseInt(process.env.PORT || '5001', 10);
  server.listen({ port, host: '0.0.0.0' }, () => log(`serving on port ${port}`));
})();
