import { describe, it, expect } from 'vitest';
import { pageHasFaqSection, extractContentSignals } from '../server/engine/content-signal-service';

const accordion = (qs: string[]) => qs.map((q) => `<details><summary><div><p>${q}</p></div></summary><p>An answer that is long enough.</p></details>`).join('');

describe('FAQ section detection', () => {
  it('finds an FAQ titled "Questions & answers" (Notion pricing)', () => {
    expect(pageHasFaqSection('<h2 class="x">Questions &amp; answers</h2>')).toBe(true);
  });
  it('finds an FAQ heading with inline tags inside it', () => {
    expect(pageHasFaqSection('<h2 id="a"><span level="2">Frequently asked <em>questions</em></span></h2>')).toBe(true);
  });
  it('finds the usual FAQ titles', () => {
    for (const t of ['FAQ', 'FAQs', 'Common questions', 'Q&amp;A', 'Your questions, answered']) {
      expect(pageHasFaqSection(`<h3>${t}</h3>`)).toBe(true);
    }
  });
  it('finds FAQPage schema', () => {
    expect(pageHasFaqSection('<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>')).toBe(true);
  });
  it('finds question accordions with no FAQ title', () => {
    expect(pageHasFaqSection(accordion(['How does it work?', 'Is there a free plan?', 'Can I cancel?']))).toBe(true);
  });
  it('does not count CTAs or a couple of stray questions', () => {
    expect(pageHasFaqSection('<h2>Got questions? Talk to sales</h2>')).toBe(false);
    expect(pageHasFaqSection('<h2>Have questions?</h2>')).toBe(false);
    expect(pageHasFaqSection(accordion(['How does it work?', 'Ready to start?']))).toBe(false);
    expect(pageHasFaqSection('<h2>Answers for every team</h2><p>Questions welcome.</p>')).toBe(false);
  });
  it('counts one section per page, not per heading or schema block', () => {
    const page = '<h2>FAQ</h2><script type="application/ld+json">{"@type":"FAQPage"}</script>';
    const s = extractContentSignals(page + page, 'text', [], {}, 'example.com', [page, '<h1>Home</h1>', '<h2>Questions &amp; answers</h2>']);
    expect(s.faqSectionCount).toBe(2);
  });
});

import { buildScoreExplanation } from '../server/services/audit-pipeline';
describe('Score summary', () => {
  it('never names the same area strongest and weakest', () => {
    const base = extractContentSignals('<h1>x</h1>', 'text', [], {}, 'example.com', []);
    const e = buildScoreExplanation({ ...base, caseStudyCount: 11, faqSectionCount: 0, schemaTypeCount: 7, totalPageCount: 500 }, 'Productivity software');
    expect(e.strongestArea).not.toBe(e.weakestArea);
    expect(e.weakestArea).not.toMatch(/Case Studies/);
  });
});
