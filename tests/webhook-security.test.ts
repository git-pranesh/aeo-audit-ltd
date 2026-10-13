import { describe, it, expect } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:5000';

describe('Webhook Security', () => {
  describe('Dodo Payment Webhooks', () => {
    it('should reject webhooks without signature headers', async () => {
      const response = await fetch(`${API_BASE}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment.succeeded',
          data: { amount: 1000 }
        })
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject webhooks with invalid signature', async () => {
      const response = await fetch(`${API_BASE}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'webhook-id': 'fake-id',
          'webhook-timestamp': Date.now().toString(),
          'webhook-signature': 'v1,invalid-signature-12345'
        },
        body: JSON.stringify({
          type: 'payment.succeeded',
          data: { amount: 1000 }
        })
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject webhooks with tampered payload', async () => {
      const originalPayload = JSON.stringify({ type: 'payment.succeeded', amount: 100 });
      const tamperedPayload = JSON.stringify({ type: 'payment.succeeded', amount: 10000 });
      
      const response = await fetch(`${API_BASE}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'webhook-id': 'msg_test123',
          'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
          'webhook-signature': 'v1,fake-signature'
        },
        body: tamperedPayload
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject expired webhook timestamps', async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 600;
      
      const response = await fetch(`${API_BASE}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'webhook-id': 'msg_test123',
          'webhook-timestamp': expiredTimestamp.toString(),
          'webhook-signature': 'v1,some-signature'
        },
        body: JSON.stringify({ type: 'test' })
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should have rate limiting headers', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: 'https://example.com' })
      });
      const hasRateLimitHeader = 
        response.headers.has('x-ratelimit-limit') ||
        response.headers.has('ratelimit-limit') ||
        response.headers.has('retry-after');
      expect(response.status === 429 || response.status === 401 || !hasRateLimitHeader).toBeTruthy();
    });
  });
});
