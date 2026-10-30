import { describe, expect, it } from 'vitest';
import { generateAeoFiles } from '../server/services/aeo-pack';
import { extractSiteFacts } from '../server/engine/site-facts';
import { extractContentSignals } from '../server/engine/content-signal-service';

const base = {
  websiteUrl: 'https://acme.test/', companyName: 'Acme', industry: 'B2B SaaS', businessType: 'SaaS',
  targetAudience: 'Ops teams', valueProposition: 'Automate ops', sitemapUrls: [], keywords: ['ops automation'],
};

describe('AEO Pack', () => {
  it('produces valid JSON-LD and never invents FAQ answers', async () => {
    const files = await generateAeoFiles({ ...base, facts: { pages: [], logoUrl: null, socialProfiles: [], faqs: [] } });
    for (const [name, body] of Object.entries(files)) if (name.endsWith('.jsonld')) expect(() => JSON.parse(body)).not.toThrow();
    expect(files['schema/FAQPage.jsonld']).toContain('[REPLACE:');
    expect(files['AGENTS.md']).toBeUndefined();
    expect(files['schema/HowTo.jsonld']).toBeUndefined();
    expect(JSON.parse(files['schema/Organization.jsonld'])).not.toHaveProperty('audience');
  });

  it('uses real FAQs, logo and socials found on the site', async () => {
    const html = `<html><head><title>Acme</title><link rel="apple-touch-icon" href="/icon.png"></head><body>
      <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
      <details><summary>How long is the trial?</summary><p>The free trial lasts 14 days.</p></details>
      <details><summary>Can I export my data?</summary><p>Yes, export to CSV at any time.</p></details></body></html>`;
    const facts = extractSiteFacts([{ url: 'https://acme.test/', html }]);
    const files = await generateAeoFiles({ ...base, facts, sitemapLocation: 'https://acme.test/sitemap.xml' });
    const faq = JSON.parse(files['schema/FAQPage.jsonld']);
    expect(faq.mainEntity.map((q: any) => q.name)).toEqual(['How long is the trial?', 'Can I export my data?']);
    const org = JSON.parse(files['schema/Organization.jsonld']);
    expect(org.logo).toBe('https://acme.test/icon.png');
    expect(org.sameAs).toEqual(['https://www.linkedin.com/company/acme']);
    expect(files['robots-patch.txt']).toContain('Sitemap: https://acme.test/sitemap.xml');
  });

  it('robots patch lists real AI search crawlers and keeps training bots optional', async () => {
    const files = await generateAeoFiles({ ...base });
    const patch = files['robots-patch.txt'];
    for (const bot of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']) {
      expect(patch).toMatch(new RegExp(`^User-agent: ${bot}$`, 'm'));
    }
    expect(patch).toMatch(/^# User-agent: GPTBot$/m);
    expect(patch).not.toMatch(/^Sitemap:/m); // no sitemap was found, so none is claimed
  });
});

describe('content signals are observed, not inferred', () => {
  it('does not invent schema, external links or content counts for large sitemaps', () => {
    const sitemap = Array.from({ length: 3000 }, (_, i) => `https://big.test/products/item-${i}`);
    const s = extractContentSignals('<html><body><a href="https://big.test/about">About</a><p>Hello</p></body></html>', 'hello', sitemap, {}, 'big.test');
    expect(s.schemaTypeCount).toBe(0);
    expect(s.externalLinkCount).toBe(0);
    expect(s.tutorialCount).toBe(0);
    expect(s.blogPostCount).toBe(0);
    expect(s.caseStudyCount).toBe(0);
  });

  it('counts parsed JSON-LD types and each sitemap URL in one category only', () => {
    const html = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"FAQPage"}]}</script>';
    const s = extractContentSignals(html, '', ['https://x.test/blog/a', 'https://x.test/blog/b', 'https://x.test/case-studies/c', 'https://other.test/blog/z'], {}, 'x.test');
    expect(s.schemaTypeCount).toBe(2);
    expect(s.blogPostCount).toBe(2);
    expect(s.caseStudyCount).toBe(1);
  });

  it('classifies internal links on fetched pages when the sitemap leaves sections out', () => {
    const html = '<nav><a href="/customers">Customers</a><a href="/reviews/">Reviews</a><a href="https://x.test/academy/seo-basics">Academy</a>'
      + '<a href="/blog/reviews-of-tools">Post</a><a href="https://other.test/case-studies/z">Partner</a><a href="mailto:a@x.test">Mail</a><a href="tel:+1">Call</a><a href="javascript:void(0)">x</a></nav>';
    const s = extractContentSignals(html, '', [], {}, 'x.test');
    expect(s.caseStudyCount).toBe(2); // /customers and /reviews are social proof pages
    expect(s.tutorialCount).toBe(1); // /academy/seo-basics
    expect(s.blogPostCount).toBe(1); // /blog/reviews-of-tools is a blog post, not a review page
    expect(s.externalLinkCount).toBe(1);
  });

  it('does not double count a URL that is in the sitemap and linked on the page', () => {
    const s = extractContentSignals('<a href="/case-studies/acme/">Acme</a>', '', ['https://x.test/case-studies/acme'], {}, 'x.test');
    expect(s.caseStudyCount).toBe(1);
  });

  it('caps word-mention fallbacks so text alone cannot invent many pages', () => {
    const text = Array.from({ length: 40 }, () => 'read our case study and this step by step tutorial').join(' ');
    const s = extractContentSignals('<p>x</p>', text, [], {}, 'x.test');
    expect(s.caseStudyCount).toBe(2);
    expect(s.tutorialCount).toBe(2);
  });

  it('survives a link farm and malformed hrefs quickly', () => {
    const farm = Array.from({ length: 50000 }, (_, i) => `<a href="/blog/p${i}">p</a><a href="../x">y</a><a href="//cdn.x.test/a">z</a><a href="">e</a>`).join('');
    const t0 = Date.now();
    const s = extractContentSignals(farm, '', [], {}, 'x.test');
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(s.blogPostCount).toBeLessThanOrEqual(5000);
  });
});

describe('scores are earned, never floored', () => {
  it('a big sitemap with no measured content does not get a minimum score', async () => {
    const { calculatePlatformScoresV2 } = await import('../server/engine/scoring-service');
    const sitemap = Array.from({ length: 6000 }, (_, i) => `https://big.test/p/${i}`);
    const signals = extractContentSignals('<html><body><p>hi</p></body></html>', 'hi', sitemap, {}, 'big.test');
    const r = calculatePlatformScoresV2(signals, sitemap.length, 5, 'SaaS', signals.totalPageCount);
    expect(r.overallScore).toBeLessThan(10);
    expect(Math.max(...Object.values(r.platformScores))).toBeLessThan(10);
  });
});
