import { describe, it, expect } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:5000';

describe('Edge Cases', () => {
  describe('Invalid URL Handling', () => {
    it('should reject malformed URLs', async () => {
      const malformedUrls = [
        'not-a-url',
        'ftp://invalid-protocol.com',
        'javascript:alert(1)',
        '//missing-protocol.com',
        'http://',
        ''
      ];

      for (const url of malformedUrls) {
        const response = await fetch(`${API_BASE}/api/audit/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ websiteUrl: url })
        });
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('should handle URLs with special characters', async () => {
      const specialUrls = [
        'https://example.com/path?query=value&other=<script>',
        'https://example.com/path#fragment',
        'https://例え.jp/'
      ];

      for (const url of specialUrls) {
        const response = await fetch(`${API_BASE}/api/audit/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ websiteUrl: url })
        });
        expect(response.status).toBeLessThan(500);
      }
    });
  });

  describe('Payload Size Limits', () => {
    it('should reject excessively large payloads', async () => {
      const largePayload = {
        websiteUrl: 'https://example.com',
        extraData: 'x'.repeat(10 * 1024 * 1024)
      };

      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largePayload)
      });
      expect([400, 401, 413, 414]).toContain(response.status);
    });
  });

  describe('Content Type Handling', () => {
    it('should reject non-JSON content types for JSON endpoints', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'websiteUrl=https://example.com'
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle missing content-type header', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'POST',
        body: JSON.stringify({ websiteUrl: 'https://example.com' })
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array(5).fill(null).map(() => 
        fetch(`${API_BASE}/api/audit/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ websiteUrl: 'https://example.com' })
        })
      );

      const responses = await Promise.all(requests);
      
      for (const response of responses) {
        expect(response.status).toBeLessThan(500);
      }
    });
  });

  describe('HTTP Method Validation', () => {
    it('should reject GET requests to POST endpoints', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'GET'
      });
      expect([404, 405, 429]).toContain(response.status);
    });

    it('should reject PUT requests to POST endpoints', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: 'https://example.com' })
      });
      expect([404, 405, 429]).toContain(response.status);
    });

    it('should reject DELETE requests to POST endpoints', async () => {
      const response = await fetch(`${API_BASE}/api/audit/analyze`, {
        method: 'DELETE'
      });
      expect([404, 405, 429]).toContain(response.status);
    });
  });
});
