import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cron from "node-cron";
import { runCitationRefreshCycle } from "./citation-scheduler";

const app = express();
app.set('trust proxy', 1); // Trust first proxy for rate limiting

// IMPORTANT: Register webhook text body parser BEFORE global JSON parser
// This ensures webhook endpoints receive raw body for cryptographic signature verification
// The text parser is applied specifically to webhook paths first
app.use('/api/webhooks/dodo', express.text({ type: '*/*' }));

// Global JSON parser for all other endpoints
app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: false, limit: '300kb' }));

// COOP header required for Firebase Auth popup to communicate back
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5001 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5001', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    const enableScheduler = process.env.NODE_ENV === 'production' || process.env.ENABLE_CITATION_SCHEDULER === 'true';
    if (enableScheduler) {
      cron.schedule('0 * * * *', async () => {
        log('🕐 Citation scheduler: hourly tick');
        try {
          await runCitationRefreshCycle();
        } catch (err: any) {
          console.error('❌ Citation scheduler error:', err.message);
        }
      });
      log('🗓️ Citation scheduler started (hourly)');
    } else {
      log('⏸️ Citation scheduler disabled (set ENABLE_CITATION_SCHEDULER=true or NODE_ENV=production to enable)');
    }
  });
})();
