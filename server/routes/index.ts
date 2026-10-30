import type { Express } from 'express';
import { meRouter } from './me';
import { licensesRouter } from './licenses';
import { auditsRouter } from './audits';
import { webhooksRouter } from './webhooks';
import { adminRouter } from './admin';
import { publicRouter } from './public';

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/public', publicRouter);
  app.use('/api/me', meRouter);
  app.use('/api/licenses', licensesRouter);
  app.use('/api/audits', auditsRouter);
  app.use('/api/admin', adminRouter);

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

/** Mounted before the JSON body parser: signature checks need the raw body. */
export function registerWebhooks(app: Express): void {
  app.use('/api/webhooks', webhooksRouter);
}
