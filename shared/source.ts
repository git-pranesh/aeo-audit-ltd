/**
 * Sale attribution carried in Dodo checkout metadata by citationrocket.com/buy:
 *   source = "s=<source>|m=<medium>|c=<campaign>|l=<landing>|d=<first seen>|p=<buy page>"
 * Older checkouts (before 17 Nov 2026) sent only utm_source. No consent means no source.
 */
export interface SaleSource {
  source: string; medium: string; campaign: string; landing: string; buyPage: string; firstSeen: string; consent: boolean;
}

export function parseSaleSource(meta: Record<string, string | undefined>): SaleSource {
  const consent = meta.consent === 'allowed';
  const parts = Object.fromEntries(String(meta.source || '').split('|').map((kv) => {
    const i = kv.indexOf('=');
    return i > 0 ? [kv.slice(0, i), kv.slice(i + 1)] : [kv, ''];
  }));
  return {
    source: parts.s || meta.utm_source || (consent ? 'unknown' : 'no consent'),
    medium: parts.m || '',
    campaign: parts.c || '',
    landing: parts.l || '',
    buyPage: parts.p || '',
    firstSeen: parts.d || '',
    consent,
  };
}

/** One short line, e.g. "google.com (organic) · landed /pricing". */
export function describeSaleSource(s: SaleSource): string {
  const head = `${s.source}${s.medium && s.medium !== 'none' && s.medium !== 'tagged' ? ` (${s.medium})` : ''}${s.campaign ? ` · ${s.campaign}` : ''}`;
  return [head, s.landing ? `landed ${s.landing}` : '', s.buyPage ? `bought from ${s.buyPage}` : ''].filter(Boolean).join(' · ');
}
