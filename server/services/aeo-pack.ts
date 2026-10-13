/**
 * AEO Pack generator.
 *
 * Every file is built only from facts observed on the site (page titles,
 * descriptions, real paragraphs, declared logo, linked social profiles, FAQ
 * questions the site already shows). Where we could not observe something the
 * file contains an explicit [REPLACE: …] placeholder: never invented text.
 *
 * Standards followed:
 *  - llms.txt: https://llmstxt.org (H1, blockquote summary, H2 sections of links)
 *  - JSON-LD: schema.org types/properties; Google structured-data policies
 *    (FAQ markup must match content visible on the page)
 *  - robots.txt: RFC 9309 (groups are chosen by user-agent, not by order)
 *  - Crawler names from OpenAI, Anthropic, Perplexity, Google, Microsoft docs
 */

import type { ContentSignals } from '../engine/content-signal-service';
import type { SiteFacts } from '../engine/site-facts';

export interface GeneratorInput {
  websiteUrl: string;
  companyName: string;
  industry: string;
  businessType: string;
  targetAudience: string;
  valueProposition: string;
  signals?: ContentSignals;
  sitemapUrls: string[];
  keywords: string[];
  competitors?: string[];
  facts?: SiteFacts;
  sitemapLocation?: string | null;
  hasLlmsTxt?: boolean;
}

export type GeneratedFiles = Record<string, string>;

const today = () => new Date().toISOString().split('T')[0];

export async function generateAeoFiles(raw: GeneratorInput): Promise<GeneratedFiles> {
  const input = { ...raw, websiteUrl: raw.websiteUrl.replace(/\/+$/, '') };
  const facts: SiteFacts = input.facts ?? { pages: [], logoUrl: null, socialProfiles: [], faqs: [] };

  return {
    'llms.txt': llmsTxt(input, facts),
    'llms-full.txt': llmsFullTxt(input, facts),
    'robots-patch.txt': robotsPatch(input),
    'schema/Organization.jsonld': json(organization(input, facts)),
    'schema/WebSite.jsonld': json({ '@context': 'https://schema.org', '@type': 'WebSite', name: input.companyName, url: `${input.websiteUrl}/` }),
    'schema/FAQPage.jsonld': json(faqPage(facts)),
    'schema/Article.jsonld': json(articleTemplate(input, facts)),
    'schema/BreadcrumbList.jsonld': json(breadcrumbTemplate(input)),
    'markdown-twins/homepage.md': homepageMarkdown(input, facts),
    'INSTRUCTIONS.md': instructions(input, facts),
  };
}

const json = (o: unknown) => JSON.stringify(o, null, 2);

function summary(input: GeneratorInput, facts: SiteFacts): string {
  const home = facts.pages[0];
  return (home?.description || input.valueProposition || `${input.companyName}: ${input.industry}`).replace(/\s+/g, ' ').trim();
}

/** Short page name: <title> without the " | Brand" suffix, else a short H1, else the path. */
function pageLabel(p: { title: string; h1: string; url: string }, companyName: string): string {
  const title = p.title.split(/\s+[|–—]\s+|\s+-\s+/).filter((part) => part.trim().toLowerCase() !== companyName.toLowerCase())[0]?.trim() ?? '';
  if (title && title.length <= 70) return title;
  if (p.h1 && p.h1.length <= 70) return p.h1;
  try {
    return new URL(p.url).pathname.replace(/^\/|\/$/g, '') || 'Home';
  } catch {
    return p.url;
  }
}

function keyLinks(input: GeneratorInput, facts: SiteFacts) {
  const seen = new Set<string>();
  const links: { title: string; url: string; note: string }[] = [];
  for (const p of facts.pages) {
    const url = p.url.replace(/\/+$/, '') || input.websiteUrl;
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ title: url === input.websiteUrl ? 'Home' : pageLabel(p, input.companyName), url, note: p.description });
  }
  const extra = input.sitemapUrls.filter((u) => !seen.has(u.replace(/\/+$/, ''))).slice(0, 15);
  return { links, extra };
}

// ─── llms.txt (llmstxt.org) ───────────────────────────────────────────────────

function llmsTxt(input: GeneratorInput, facts: SiteFacts): string {
  const { links, extra } = keyLinks(input, facts);
  const lines = [
    `# ${input.companyName}`,
    '',
    `> ${summary(input, facts)}`,
    '',
  ];
  const details = [
    input.industry && `${input.companyName} operates in ${input.industry}${input.businessType ? ` (${input.businessType})` : ''}.`,
    input.targetAudience && `Primary audience: ${input.targetAudience}.`,
    input.keywords.length > 0 && `Key topics: ${input.keywords.join(', ')}.`,
  ].filter(Boolean);
  if (details.length) lines.push(details.join(' '), '');

  lines.push('## Key pages', '');
  for (const l of links) lines.push(`- [${l.title}](${l.url})${l.note ? `: ${l.note}` : ''}`);
  if (links.length === 0) lines.push(`- [Home](${input.websiteUrl}/)`);
  lines.push('');

  if (extra.length) {
    lines.push('## More content', '');
    for (const u of extra) lines.push(`- [${u.replace(/^https?:\/\/[^/]+/, '') || '/'}](${u})`);
    lines.push('');
  }
  if (input.sitemapLocation) {
    lines.push('## Optional', '', `- [Sitemap](${input.sitemapLocation}): full list of pages`, '');
  }
  return lines.join('\n');
}

// ─── llms-full.txt (real page text, main content only) ────────────────────────

function llmsFullTxt(input: GeneratorInput, facts: SiteFacts): string {
  const out = [`# ${input.companyName}`, '', `> ${summary(input, facts)}`, ''];
  for (const p of facts.pages) {
    const body = [p.description, ...p.paragraphs].filter(Boolean);
    if (body.length === 0 && p.headings.length === 0) continue;
    out.push(`## ${pageLabel(p, input.companyName)}`, '', `Source: ${p.url}`, '');
    if (p.headings.length) out.push(`Sections: ${p.headings.join(' · ')}`, '');
    out.push(...body.map((b) => `${b}\n`));
  }
  if (facts.faqs.length) {
    out.push('## Frequently asked questions', '');
    for (const f of facts.faqs) out.push(`**${f.question}**`, '', f.answer, '');
  }
  return out.join('\n');
}

// ─── robots.txt patch (RFC 9309) ──────────────────────────────────────────────

function robotsPatch(input: GeneratorInput): string {
  const group = (agents: string[]) => agents.map((a) => `User-agent: ${a}`).join('\n') + '\nAllow: /';
  return `# robots.txt additions for AI search & assistants: ${input.companyName}
# Generated ${today()}
#
# How robots.txt works (RFC 9309): each crawler follows the group that names it
# and ignores "User-agent: *". So a named group below lets that crawler in even
# if you block other bots under "*". Order in the file does not matter.
# Keep any Disallow lines for private areas (e.g. /admin, /cart, /account).

# ── 1. AI SEARCH & ANSWER CRAWLERS (recommended) ─────────────────────────────
# These fetch pages to show and cite them in AI answers.
# OpenAI: OAI-SearchBot (ChatGPT search), ChatGPT-User (user-requested visits)
# Anthropic: Claude-SearchBot (search), Claude-User (user-requested visits)
# Perplexity: PerplexityBot (search), Perplexity-User (user-requested visits)
# Microsoft: bingbot (Bing & Copilot)
${group(['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'bingbot'])}

# ── 2. AI TRAINING CRAWLERS (optional: your choice) ─────────────────────────
# These collect content to train models. Allowing them is not required to be
# cited in AI search. Remove the "#" to allow them.
# User-agent: GPTBot
# User-agent: ClaudeBot
# User-agent: Google-Extended
# User-agent: Applebot-Extended
# User-agent: CCBot
# Allow: /
${input.sitemapLocation ? `\nSitemap: ${input.sitemapLocation}\n` : `\n# Add your sitemap once you have one:\n# Sitemap: ${input.websiteUrl}/sitemap.xml\n`}`;
}

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

function organization(input: GeneratorInput, facts: SiteFacts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.companyName,
    url: `${input.websiteUrl}/`,
    description: summary(input, facts),
    logo: facts.logoUrl ?? '[REPLACE: full URL of your logo, e.g. https://example.com/logo.png]',
    sameAs: facts.socialProfiles.length ? facts.socialProfiles : ['[REPLACE: URL of your LinkedIn / X / Facebook profile]'],
    ...(input.keywords.length ? { knowsAbout: input.keywords } : {}),
  };
}

function faqPage(facts: SiteFacts) {
  const mainEntity = (facts.faqs.length >= 2
    ? facts.faqs
    : [
        { question: '[REPLACE: a question answered on this page]', answer: '[REPLACE: the exact answer shown on this page]' },
        { question: '[REPLACE: another question answered on this page]', answer: '[REPLACE: the exact answer shown on this page]' },
      ]
  ).map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } }));
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity };
}

function articleTemplate(input: GeneratorInput, facts: SiteFacts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '[REPLACE: article title, max 110 characters]',
    description: '[REPLACE: one-sentence summary]',
    author: { '@type': 'Person', name: '[REPLACE: author name]', url: '[REPLACE: author bio page URL]' },
    publisher: {
      '@type': 'Organization',
      name: input.companyName,
      ...(facts.logoUrl ? { logo: { '@type': 'ImageObject', url: facts.logoUrl } } : {}),
    },
    datePublished: '[REPLACE: YYYY-MM-DD]',
    dateModified: '[REPLACE: YYYY-MM-DD]',
    mainEntityOfPage: '[REPLACE: full URL of the article]',
  };
}

function breadcrumbTemplate(input: GeneratorInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${input.websiteUrl}/` },
      { '@type': 'ListItem', position: 2, name: '[REPLACE: section name, e.g. Blog]', item: `${input.websiteUrl}/[REPLACE: section-path]` },
      { '@type': 'ListItem', position: 3, name: '[REPLACE: page title]' },
    ],
  };
}

// ─── Markdown twin of the homepage ────────────────────────────────────────────

function homepageMarkdown(input: GeneratorInput, facts: SiteFacts): string {
  const home = facts.pages[0];
  const out = [`# ${home?.h1 || input.companyName}`, ''];
  if (home?.description) out.push(`> ${home.description}`, '');
  for (const h of home?.headings ?? []) out.push(`- ${h}`);
  if (home?.headings?.length) out.push('');
  for (const p of home?.paragraphs ?? []) out.push(p, '');
  out.push('---', `Source: ${input.websiteUrl}/ · Generated ${today()}`);
  return out.join('\n');
}

// ─── Instructions ─────────────────────────────────────────────────────────────

function instructions(input: GeneratorInput, facts: SiteFacts): string {
  const realFaqs = facts.faqs.length >= 2;
  return `# AEO Pack: ${input.companyName}
Generated ${today()} by Citation Rocket from the pages we could read on ${input.websiteUrl}.
Nothing here is invented: values we could not verify are marked [REPLACE: …].

| File | Where it goes | Priority |
|---|---|---|
| robots-patch.txt | Merge into ${input.websiteUrl}/robots.txt | High |
| llms.txt | ${input.websiteUrl}/llms.txt | High |
| schema/Organization.jsonld | Homepage <head> | High |
| schema/WebSite.jsonld | Homepage <head> | Medium |
| schema/FAQPage.jsonld | ${realFaqs ? 'The page that shows these questions' : 'A page with visible Q&A (fill in placeholders)'} | Medium |
| schema/Article.jsonld | Each blog post / article (template) | Medium |
| schema/BreadcrumbList.jsonld | Inner pages (template) | Low |
| llms-full.txt | ${input.websiteUrl}/llms-full.txt | Low |
| markdown-twins/homepage.md | Optional plain-text copy of your homepage | Low |

## 1. robots.txt
Open robots-patch.txt and copy section 1 into your existing robots.txt. Section 2
(training crawlers) is optional. Check the result at ${input.websiteUrl}/robots.txt.

## 2. llms.txt${input.hasLlmsTxt ? `
**You already have an llms.txt.** Compare it with ours and merge anything useful , 
don't overwrite yours blindly.` : ''}
Upload to the root of your domain so it is served at ${input.websiteUrl}/llms.txt
(WordPress: upload to the site root via your host's file manager or a plugin;
Webflow/Framer/Squarespace/Wix: use the platform's custom-file or redirect
feature; Vercel/Netlify/Next.js: put it in /public).

## 3. Schema markup (JSON-LD)
Each .jsonld file must be wrapped in a script tag inside <head>:

\`\`\`html
<script type="application/ld+json">
  … paste the file contents here …
</script>
\`\`\`

- Replace every [REPLACE: …] value before publishing, or remove that property.
- FAQPage: ${realFaqs ? 'these questions were taken from your site. Add the markup only to the page where they are visible.' : 'Google requires FAQ markup to match questions and answers visible on the page. Fill it from a real FAQ section.'}
- Validate with https://validator.schema.org and Google's Rich Results Test.

## 4. Verify
Re-run your Citation Rocket audit after publishing to see the change.
`;
}
