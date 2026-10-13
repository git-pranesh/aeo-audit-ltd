/**
 * Verifiable facts pulled from the pages we fetched. The AEO Pack is built
 * from these so it never contains invented content: anything we could not
 * observe becomes a clearly marked placeholder instead.
 */

export interface PageSummary {
  url: string;
  title: string;
  description: string;
  h1: string;
  headings: string[];
  paragraphs: string[];
}

export interface FaqPair {
  question: string;
  answer: string;
}

export interface SiteFacts {
  pages: PageSummary[];
  logoUrl: string | null;
  socialProfiles: string[];
  faqs: FaqPair[];
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function meta(html: string, name: string): string {
  const re1 = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
  return decode((html.match(re1) || html.match(re2))?.[1] ?? '').trim();
}

/** Main content only: drop nav/header/footer/aside/scripts before reading paragraphs. */
function mainHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
}

function summarize(url: string, html: string): PageSummary {
  const body = mainHtml(html);
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 160);
  const description = (meta(html, 'description') || meta(html, 'og:description')).slice(0, 300);
  const h1 = stripTags(body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').slice(0, 160);
  const headings = Array.from(body.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi))
    .map((m) => stripTags(m[1]))
    .filter((h) => h.length >= 3 && h.length <= 120)
    .slice(0, 10);
  const paragraphs = Array.from(body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((m) => stripTags(m[1]))
    .filter((p) => p.length >= 60 && !/cookie|javascript|©|all rights reserved/i.test(p))
    .slice(0, 6)
    .map((p) => p.slice(0, 500));
  return { url, title, description, h1, headings, paragraphs };
}

function collectJsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        out.push(n);
        Object.values(n).forEach(walk);
      };
      walk(data);
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return out;
}

const hasType = (node: any, type: string) => [].concat(node?.['@type'] ?? []).some((t: any) => String(t).toLowerCase() === type.toLowerCase());

function extractFaqs(html: string): FaqPair[] {
  const pairs: FaqPair[] = [];
  // 1. FAQPage markup the site already has.
  for (const node of collectJsonLd(html)) {
    if (hasType(node, 'Question') && typeof node.name === 'string') {
      const answer = node.acceptedAnswer?.text ?? node.suggestedAnswer?.text;
      if (typeof answer === 'string') pairs.push({ question: stripTags(node.name), answer: stripTags(answer) });
    }
  }
  // 2. <details><summary>Question?</summary>Answer</details>
  for (const m of html.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    const q = stripTags(m[1]);
    const a = stripTags(m[2]);
    if (q.endsWith('?') && a.length >= 20) pairs.push({ question: q, answer: a });
  }
  // 3. A heading phrased as a question followed by a paragraph.
  for (const m of mainHtml(html).matchAll(/<h[2-4][^>]*>([^<]{10,150}\?)\s*<\/h[2-4]>\s*(?:<[^p][^>]*>\s*)*<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const a = stripTags(m[2]);
    if (a.length >= 30) pairs.push({ question: stripTags(m[1]), answer: a });
  }
  const seen = new Set<string>();
  // Real questions start like questions; marketing CTAs ("Ready to start?") don't count.
  const QUESTION = /^(what|how|why|when|where|who|which|can|could|do|does|did|is|are|should|will|would|may|if)\b/i;
  const CTA = /^(ready|want|looking|need|interested|still have|got|have questions)\b/i;
  return pairs
    .filter((p) => QUESTION.test(p.question) && !CTA.test(p.question))
    .filter((p) => p.question.length <= 200 && !seen.has(p.question.toLowerCase()) && seen.add(p.question.toLowerCase()))
    .map((p) => ({ question: p.question, answer: p.answer.slice(0, 600) }))
    .slice(0, 10);
}

const SOCIAL_HOSTS = /^(www\.)?(linkedin\.com\/(company|in)\/|x\.com\/|twitter\.com\/|facebook\.com\/|instagram\.com\/|youtube\.com\/(@|c\/|channel\/|user\/)|tiktok\.com\/@|github\.com\/|pinterest\.com\/)/i;

export function extractSiteFacts(pages: { url: string; html: string }[]): SiteFacts {
  const summaries = pages.map((p) => summarize(p.url, p.html));

  const socials = new Set<string>();
  let logoUrl: string | null = null;
  const faqs: FaqPair[] = [];

  for (const page of pages) {
    for (const m of page.html.matchAll(/href=["'](https?:\/\/[^"'#?\s]+)["']/gi)) {
      const href = m[1].replace(/\/+$/, '');
      if (SOCIAL_HOSTS.test(href.replace(/^https?:\/\//, '')) && href.split('/').length >= 4) socials.add(href);
    }
    if (!logoUrl) {
      const org = collectJsonLd(page.html).find((n) => (hasType(n, 'Organization') || /business|corporation/i.test(String(n['@type'] ?? ''))) && n.logo);
      const fromSchema = typeof org?.logo === 'string' ? org.logo : org?.logo?.url;
      const iconHref = page.html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];
      // og:image is usually a share banner, not a logo — only trust declared logos.
      const candidate = fromSchema || iconHref;
      if (candidate) {
        try {
          logoUrl = new URL(candidate, page.url).toString();
        } catch {
          // ignore
        }
      }
    }
    faqs.push(...extractFaqs(page.html));
  }

  const seen = new Set<string>();
  return {
    pages: summaries,
    logoUrl,
    socialProfiles: Array.from(socials).slice(0, 8),
    faqs: faqs.filter((f) => !seen.has(f.question.toLowerCase()) && seen.add(f.question.toLowerCase())).slice(0, 10),
  };
}
