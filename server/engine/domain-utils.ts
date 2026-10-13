/**
 * Shared domain utility functions used across citation services.
 */

/**
 * Extracts the base domain from a URL (strips protocol, www, path).
 */
export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

/**
 * Derives a human-readable company name from a URL when the real name is unknown.
 * Strips protocol, www, path, and common TLD suffixes.
 *
 * Examples:
 *   https://notion.so       → "Notion"
 *   https://www.hubspot.com → "Hubspot"
 *   https://acme.co.uk      → "Acme"
 */
export function deriveNameFromDomain(websiteUrl: string): string {
  let name = extractDomain(websiteUrl);
  name = name.replace(/\.[a-z]{2,}$/i, '');
  name = name.replace(/\.(co|com|org|net|gov|edu|ac|io)$/i, '');
  if (!name || name.length < 2) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
