import { promises as dns } from 'dns';
import net from 'net';
import http from 'http';
import https from 'https';
import axios, { type AxiosResponse } from 'axios';

export class UnsafeUrlError extends Error {
  code: string;
  constructor(message: string, code = 'UNSAFE_URL') {
    super(message);
    this.name = 'UnsafeUrlError';
    this.code = code;
  }
}

function ipv4ToLong(ip: string): number {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToLong(ip);
  const inRange = (start: string, bits: number) => {
    const base = ipv4ToLong(start);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (base & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||       // "this" network
    inRange('10.0.0.0', 8) ||      // private
    inRange('100.64.0.0', 10) ||   // carrier-grade NAT
    inRange('127.0.0.0', 8) ||     // loopback
    inRange('169.254.0.0', 16) ||  // link-local (incl. cloud metadata 169.254.169.254)
    inRange('172.16.0.0', 12) ||   // private
    inRange('192.0.0.0', 24) ||    // IETF protocol assignments
    inRange('192.168.0.0', 16) ||  // private
    inRange('198.18.0.0', 15) ||   // benchmarking
    inRange('224.0.0.0', 4) ||     // multicast
    inRange('240.0.0.0', 4)        // reserved
  );
}

function expandIpv6(ip: string): number[] | null {
  let str = ip.toLowerCase();
  // Handle embedded IPv4 (e.g. ::ffff:127.0.0.1) by converting the tail to hextets.
  const v4 = str.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const parts = v4[1].split('.').map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
    const h1 = ((parts[0] << 8) | parts[1]).toString(16);
    const h2 = ((parts[2] << 8) | parts[3]).toString(16);
    str = str.slice(0, v4.index) + `${h1}:${h2}`;
  }

  const halves = str.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - (head.length + tail.length);
  if (missing < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of groups) {
    const n = parseInt(g || '0', 16);
    if (Number.isNaN(n) || n < 0 || n > 0xffff) return null;
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

function isPrivateIpv6(ip: string): boolean {
  const b = expandIpv6(ip);
  if (!b) return true; // unparseable: treat as unsafe
  // Unspecified (::) and loopback (::1)
  if (b.every((x, i) => (i < 15 ? x === 0 : true)) && (b[15] === 0 || b[15] === 1)) return true;
  // Unique local fc00::/7
  if ((b[0] & 0xfe) === 0xfc) return true;
  // Link-local fe80::/10
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;
  // IPv4-mapped ::ffff:0:0/96: validate the embedded IPv4
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return isPrivateIpv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return true; // unknown format: treat as unsafe
}

/**
 * Validate a user-supplied URL for outbound (server-side) fetching and reject
 * SSRF targets (loopback, private ranges, link-local/cloud-metadata, etc.).
 * Returns the normalized URL string on success; throws UnsafeUrlError otherwise.
 */
export async function assertPublicUrl(input: string): Promise<string> {
  if (!input || typeof input !== 'string') {
    throw new UnsafeUrlError('A valid URL is required.', 'INVALID_URL');
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  if (hasScheme && !/^https?:\/\//i.test(input)) {
    throw new UnsafeUrlError('Only http and https URLs are allowed.', 'INVALID_PROTOCOL');
  }

  let url: URL;
  try {
    url = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    throw new UnsafeUrlError('That does not look like a valid URL.', 'INVALID_URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed.', 'INVALID_PROTOCOL');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || hostname.toLowerCase() === 'localhost') {
    throw new UnsafeUrlError('That URL points to a blocked address.', 'BLOCKED_HOST');
  }

  // If the host is already an IP literal, validate directly.
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeUrlError('That URL points to a blocked address.', 'BLOCKED_HOST');
    }
    return url.toString();
  }

  // Otherwise resolve DNS and ensure no address falls in a blocked range.
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError('Domain not found. Please check the URL and try again.', 'DOMAIN_NOT_FOUND');
  }

  if (!addresses.length) {
    throw new UnsafeUrlError('Domain not found. Please check the URL and try again.', 'DOMAIN_NOT_FOUND');
  }

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUrlError('That URL points to a blocked address.', 'BLOCKED_HOST');
    }
  }

  return url.toString();
}

// ─── Guarded outbound fetching ────────────────────────────────────────────────
//
// assertPublicUrl() only validates the URL a user typed. Every page, sitemap,
// robots.txt and redirect hop the scraper follows is attacker-influenced too,
// so all outbound website fetches go through safeGet(): each hop is validated
// before it is requested, redirects are followed manually, and the socket-level
// DNS lookup re-checks the resolved address (defeats DNS rebinding between the
// validation lookup and the connect).


function guardedLookup(hostname: string, options: any, callback: any): void {
  dns.lookup(hostname, { family: options?.family, hints: options?.hints, all: true }).then(
    (addresses: { address: string; family: number }[]) => {
      const bad = addresses.find((a) => isPrivateAddress(a.address));
      if (bad || addresses.length === 0) {
        callback(new UnsafeUrlError('Blocked address', 'BLOCKED_HOST'));
        return;
      }
      if (options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    },
    (err) => callback(err),
  );
}

const httpAgent = new http.Agent({ lookup: guardedLookup as any, keepAlive: false });
const httpsAgent = new https.Agent({ lookup: guardedLookup as any, keepAlive: false });

export const BOT_USER_AGENT = 'Mozilla/5.0 (compatible; CitationRocketBot/2.0; +https://citationrocket.com/bot)';
/** Only for public files some sites hide from unknown bots (robots.txt). */
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export interface SafeGetOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
  signal?: AbortSignal;
  userAgent?: string;
}

/**
 * GET a public URL with SSRF protection on every hop. Returns the final
 * response (any status) as text. Throws UnsafeUrlError for blocked targets.
 */
export async function safeGet(url: string, opts: SafeGetOptions = {}): Promise<AxiosResponse<string>> {
  const { timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, maxRedirects = 3, accept, signal, userAgent = BOT_USER_AGENT } = opts;
  let current = await assertPublicUrl(url);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await axios.get<string>(current, {
      timeout: timeoutMs,
      maxRedirects: 0,
      maxContentLength: maxBytes,
      responseType: 'text',
      transformResponse: (d) => d,
      validateStatus: () => true,
      httpAgent,
      httpsAgent,
      signal,
      headers: {
        'User-Agent': userAgent,
        ...(accept ? { Accept: accept } : {}),
      },
    });

    const location = res.headers?.location;
    if (res.status >= 300 && res.status < 400 && location) {
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError('Too many redirects', 'TOO_MANY_REDIRECTS');
}

/** safeGet that returns the body only for 2xx responses, otherwise null. Never throws. */
export async function safeGetText(url: string, opts: SafeGetOptions = {}): Promise<string | null> {
  try {
    const res = await safeGet(url, opts);
    if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') return res.data;
    return null;
  } catch {
    return null;
  }
}
