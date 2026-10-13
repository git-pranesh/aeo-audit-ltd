/**
 * Entity verification helpers — shared by offsite-scanner and eeat-detector.
 *
 * Problem: searching Wikidata / Wikipedia / Google Knowledge Graph by brand NAME
 * alone returns the closest-named entity even when it is completely unrelated to
 * the website being scanned (e.g. brand "Tsenta" → "Akhmat-Yurt", a village in
 * Chechnya). That produced false "Wikipedia/Wikidata/Knowledge Graph" credits.
 *
 * Fix: only count an off-site entity when it can be tied to the ACTUAL domain —
 * its official website (Wikidata P856 / KG result url) must match the scanned
 * domain. Wikipedia existence is derived from the verified Wikidata entity's
 * English sitelink rather than a separate loose name search.
 */

export function apexHost(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    let h = String(input).trim();
    if (/^https?:\/\//i.test(h)) h = new URL(h).hostname;
    else h = h.split('/')[0];
    h = h.toLowerCase().replace(/^www\./, '');
    return h || null;
  } catch {
    return null;
  }
}

export function domainsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = apexHost(a);
  const y = apexHost(b);
  if (!x || !y) return false;
  return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
}

/**
 * Look up a Wikidata entity for the brand, but only return a QID when the
 * entity's official website (P856) matches the scanned domain. Also reports
 * whether that verified entity has an English Wikipedia article.
 */
export async function verifyWikidataByDomain(
  brandName: string,
  domain: string,
  clientWikidataQid?: string | null
): Promise<{ qNumber: string | null; wikipediaExists: boolean }> {
  try {
    let candidateIds: string[] = [];

    if (clientWikidataQid) {
      candidateIds = [clientWikidataQid];
    } else if (brandName) {
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=en&limit=5&format=json&origin=*`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json() as any;
        candidateIds = (data?.search ?? [])
          .map((s: any) => s?.id)
          .filter((id: any): id is string => typeof id === 'string')
          .slice(0, 5);
      }
    }

    if (candidateIds.length === 0) return { qNumber: null, wikipediaExists: false };

    const idsParam = candidateIds.join('|');
    const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(idsParam)}&props=claims|sitelinks&format=json&origin=*`;
    const entRes = await fetch(entUrl, { signal: AbortSignal.timeout(6000) });
    if (!entRes.ok) {
      return clientWikidataQid
        ? { qNumber: clientWikidataQid, wikipediaExists: false }
        : { qNumber: null, wikipediaExists: false };
    }

    const entData = await entRes.json() as any;
    const entities = entData?.entities ?? {};

    const hasEnwiki = (e: any): boolean => !!(e?.sitelinks?.enwiki);
    const officialSites = (e: any): string[] => {
      const claims = e?.claims?.P856 ?? [];
      return claims
        .map((c: any) => c?.mainsnak?.datavalue?.value)
        .filter((v: any): v is string => typeof v === 'string');
    };

    // 1. Prefer a candidate whose official website (P856) matches the domain.
    for (const id of candidateIds) {
      const e = entities[id];
      if (!e) continue;
      if (officialSites(e).some(site => domainsMatch(site, domain))) {
        return { qNumber: id, wikipediaExists: hasEnwiki(e) };
      }
    }

    // 2. A QID explicitly supplied by trusted client data is accepted as-is.
    if (clientWikidataQid && entities[clientWikidataQid]) {
      return { qNumber: clientWikidataQid, wikipediaExists: hasEnwiki(entities[clientWikidataQid]) };
    }

    // 3. No domain-verified entity → do not credit (avoids false positives).
    return { qNumber: null, wikipediaExists: false };
  } catch {
    return { qNumber: clientWikidataQid ?? null, wikipediaExists: false };
  }
}

/**
 * Look up a Google Knowledge Graph entity, but only count it when the returned
 * entity's official website matches the scanned domain.
 */
export async function verifyKnowledgeGraph(
  brandName: string,
  domain: string,
  apiKey?: string
): Promise<{ found: boolean; entityType: string | null }> {
  if (!apiKey || !brandName) return { found: false, entityType: null };
  try {
    const url = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(brandName)}&key=${apiKey}&limit=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { found: false, entityType: null };

    const data = await res.json() as any;
    const items = data?.itemListElement ?? [];
    for (const item of items) {
      const result = item?.result;
      const siteUrl = result?.url; // entity's official website, when present
      if (siteUrl && domainsMatch(siteUrl, domain)) {
        return { found: true, entityType: result?.['@type']?.[0] ?? 'Organization' };
      }
    }
    return { found: false, entityType: null };
  } catch {
    return { found: false, entityType: null };
  }
}
