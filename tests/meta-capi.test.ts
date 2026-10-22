import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { requestAllowsTracking, requestUserData, sha256 } from '../server/services/meta-capi';

const req = (cookie: string, extra: Record<string, string> = {}) =>
  ({ headers: { cookie, 'user-agent': 'UA/1', 'x-forwarded-for': '203.0.113.9, 10.0.0.1', ...extra }, socket: {} }) as unknown as Request;

describe('Meta CAPI helpers', () => {
  it('hashes email after trimming and lowercasing (Meta normalisation)', () => {
    expect(sha256('  Buyer@Example.COM ')).toBe(sha256('buyer@example.com'));
    expect(sha256('buyer@example.com')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('tracks outside the consent region, or after consent only', () => {
    expect(requestAllowsTracking(req('cr_region=open'))).toBe(true);
    expect(requestAllowsTracking(req('cr_region=consent'))).toBe(false);
    expect(requestAllowsTracking(req('cr_region=consent; cr_consent=granted'))).toBe(true);
    expect(requestAllowsTracking(req('cr_region=open; cr_consent=denied'))).toBe(false);
    expect(requestAllowsTracking(req(''))).toBe(false);
  });
  it('reads browser identifiers from the request', () => {
    expect(requestUserData(req('_fbp=fb.1.1700000000000.123; _fbc=fb.1.1700000000000.abc'))).toEqual({
      client_ip_address: '203.0.113.9', client_user_agent: 'UA/1', fbp: 'fb.1.1700000000000.123', fbc: 'fb.1.1700000000000.abc',
    });
  });
});
