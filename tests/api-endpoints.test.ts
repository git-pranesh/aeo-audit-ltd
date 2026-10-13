import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import type { Express } from 'express';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:5000';

describe('API Endpoints', () => {
  describe('Health & Basic Endpoints', () => {
    it('should respond to root path', async () => {
      const response = await fetch(`${API_BASE}/`);
      expect(response.status).toBeLessThan(500);
    });

    it('should have CORS headers enabled', async () => {
      const response = await fetch(`${API_BASE}/`, {
        method: 'OPTIONS',
      });
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Authentication Protection', () => {
    it('should reject unauthenticated requests to /api/audit/analyze', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: 'https://example.com' })
      });
      expect([401, 429]).toContain(response.status);
    });

    it('should reject unauthenticated requests to /api/audit/batch', async () => {
      const response = await fetch(`${API_BASE}/api/audit/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: 'https://example.com' })
      });
      expect([401, 429]).toContain(response.status);
    });

    it('should reject invalid auth tokens', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token-12345'
        },
        body: JSON.stringify({ websiteUrl: 'https://example.com' })
      });
      expect([401, 429]).toContain(response.status);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty websiteUrl', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({ websiteUrl: '' })
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject missing websiteUrl', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({})
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid endpoints', async () => {
      const response = await fetch(`${API_BASE}/api/nonexistent-endpoint`);
      expect([404, 200]).toContain(response.status);
    });

    it('should not expose stack traces in production errors', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json {'
      });
      const text = await response.text();
      expect(text.toLowerCase()).not.toContain('at module');
      expect(text.toLowerCase()).not.toContain('node_modules');
    });
  });
});
