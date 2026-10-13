/**
 * AEO File Generator
 *
 * Thing 3 core. Generates every file AI crawlers look for:
 *   - llms.txt          (AI crawler context file)
 *   - llms-full.txt     (verbose version with full page content)
 *   - AGENTS.md         (Addy Osmani standard for AI coding agents)
 *   - schema/*.json     (Organization, FAQPage, HowTo, Article, BreadcrumbList)
 *   - robots-patch.txt  (Unblocks GPTBot, PerplexityBot, ClaudeBot, etc.)
 *   - markdown-twins/   (Clean .md versions of key pages)
 *
 * Also pings Bing IndexNow for fast crawl triggering.
 *
 * Returns a manifest of all generated files as { filename: content } strings.
 * The API endpoint zips them and returns as download.
 */

import type { ContentSignals } from './content-signal-service';

export interface GeneratedFiles {
  'llms.txt': string;
  'llms-full.txt': string;
  'AGENTS.md': string;
  'robots-patch.txt': string;
  'schema/Organization.jsonld': string;
  'schema/FAQPage.jsonld': string;
  'schema/HowTo.jsonld': string;
  'schema/Article.jsonld': string;
  'schema/BreadcrumbList.jsonld': string;
  'markdown-twins/homepage.md': string;
  'INSTRUCTIONS.md': string;
}

export interface GeneratorInput {
  websiteUrl: string;
  companyName: string;
  industry: string;
  businessType: string;
  targetAudience: string;
  valueProposition: string;
  signals: ContentSignals;
  sitemapUrls: string[];
  scrapedText: string;
  keywords: string[];
  competitors: string[];
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function generateAeoFiles(rawInput: GeneratorInput): Promise<GeneratedFiles> {
  // Normalize the website URL once: no trailing slash, so `${websiteUrl}/path`
  // never produces double slashes in any generated file.
  const input: GeneratorInput = {
    ...rawInput,
    websiteUrl: normalizeUrl(rawInput.websiteUrl),
  };
  const domain = extractDomain(input.websiteUrl);

  const files: GeneratedFiles = {
    'llms.txt':                   generateLlmsTxt(input, domain),
    'llms-full.txt':              generateLlmsFullTxt(input, domain),
    'AGENTS.md':                  generateAgentsMd(input, domain),
    'robots-patch.txt':           generateRobotsPatch(input.websiteUrl),
    'schema/Organization.jsonld': generateOrganizationSchema(input, domain),
    'schema/FAQPage.jsonld':      generateFaqPageSchema(input),
    'schema/HowTo.jsonld':        generateHowToSchema(input),
    'schema/Article.jsonld':      generateArticleSchema(input, domain),
    'schema/BreadcrumbList.jsonld': generateBreadcrumbSchema(input.websiteUrl, domain),
    'markdown-twins/homepage.md': generateHomepageMarkdown(input, domain),
    'INSTRUCTIONS.md':            generateInstructions(input, domain),
  };

  return files;
}

// ─── Bing IndexNow ping ───────────────────────────────────────────────────────

/**
 * Ping Bing IndexNow to trigger fast crawl of key URLs.
 * Non-blocking. Returns success/failure.
 */
export async function pingBingIndexNow(
  websiteUrl: string,
  sitemapUrls: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    const normalizedUrl = normalizeUrl(websiteUrl);
    const domain = extractDomain(normalizedUrl);

    // Submit up to 100 most important URLs
    const keyUrls = [
      normalizedUrl,
      `https://${domain}/llms.txt`,
      `https://${domain}/llms-full.txt`,
      `https://${domain}/AGENTS.md`,
      ...sitemapUrls
        .filter(u => /\/blog(\/|$)|\/docs(\/|$)|\/faq|\/tutorial|\/guide/i.test(u))
        .slice(0, 90),
    ].slice(0, 100);

    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: domain,
        key: process.env.BING_INDEXNOW_KEY || generateIndexNowKey(domain),
        keyLocation: `https://${domain}/indexnow-key.txt`,
        urlList: keyUrls,
      }),
    });

    if (response.ok || response.status === 202) {
      console.log(`✅ Bing IndexNow: pinged ${keyUrls.length} URLs for ${domain}`);
      return { success: true, message: `Submitted ${keyUrls.length} URLs to Bing IndexNow` };
    } else {
      const body = await response.text();
      console.warn(`⚠️ Bing IndexNow returned ${response.status}: ${body}`);
      return { success: false, message: `IndexNow returned ${response.status}` };
    }
  } catch (err: any) {
    console.warn(`⚠️ Bing IndexNow ping failed:`, err?.message);
    return { success: false, message: err?.message || 'Unknown error' };
  }
}

function generateIndexNowKey(domain: string): string {
  // Deterministic key from domain — user needs to host the verification file
  const hash = domain.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  return Math.abs(hash).toString(16).padStart(32, '0').substring(0, 32);
}

// ─── File generators ──────────────────────────────────────────────────────────

function generateLlmsTxt(input: GeneratorInput, domain: string): string {
  const { companyName, websiteUrl, industry, targetAudience, valueProposition, signals, sitemapUrls, keywords } = input;

  const tutorialUrls = sitemapUrls.filter(u => /\/tutorial|\/guide|\/how-to|\/learn|\/docs/i.test(u)).slice(0, 10);
  const caseStudyUrls = sitemapUrls.filter(u => /\/case-stud|\/customer|\/success|\/portfolio/i.test(u)).slice(0, 8);
  const faqUrls = sitemapUrls.filter(u => /\/faq|\/questions|\/help/i.test(u)).slice(0, 5);
  const blogUrls = sitemapUrls.filter(u => /\/blog(\/|$)|\/articles?(\/|$)|\/posts?(\/|$)/i.test(u)).slice(0, 10);

  return `# ${companyName}
> ${valueProposition || `${industry} company helping ${targetAudience}`}
> Website: ${websiteUrl}

## What We Do
${describeCompany(companyName, industry, targetAudience, valueProposition)}

## Target Audience
${targetAudience || 'Businesses and professionals'}

## Key Topics
${keywords.map(k => `- ${k}`).join('\n') || `- ${industry}`}
${buildImportantPagesSection([
  ['Guides & Tutorials', tutorialUrls],
  ['Case Studies & Results', caseStudyUrls],
  ['FAQ', faqUrls],
  ['Blog & Resources', blogUrls],
])}
## Content Statistics
- Total pages: ${signals.totalPageCount}
- Tutorial/guide pages: ${signals.tutorialCount}
- FAQ sections: ${signals.faqSectionCount}
- Case studies: ${signals.caseStudyCount}
- Blog posts: ${signals.blogPostCount}
- Documentation pages: ${signals.documentationPageCount}

## Sitemap
${websiteUrl.replace(/\/$/, '')}/sitemap.xml

## Last Updated
${new Date().toISOString().split('T')[0]}
`.trim();
}

function generateLlmsFullTxt(input: GeneratorInput, domain: string): string {
  const { companyName, websiteUrl, industry, targetAudience, valueProposition, signals, sitemapUrls, keywords, scrapedText } = input;

  // Take first 3000 chars of scraped text, cleaned up
  const cleanedText = scrapedText
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s.,!?;:()\-'"]/g, '')
    .trim()
    .substring(0, 3000);

  const allContentUrls = sitemapUrls
    .filter(u => /\/blog(\/|$)|\/docs(\/|$)|\/guide|\/tutorial|\/faq|\/case-stud|\/customer|\/playbook|\/resource/i.test(u))
    .slice(0, 50);

  return `# ${companyName} — Full Content Reference
> For AI assistants and LLM agents requiring comprehensive context
> Generated: ${new Date().toISOString().split('T')[0]}

## Company Overview
**Name:** ${companyName}
**Website:** ${websiteUrl}
**Industry:** ${industry || 'Not specified'}
**Business Type:** ${input.businessType || 'Not specified'}
**Target Audience:** ${targetAudience || 'Not specified'}
**Value Proposition:** ${valueProposition || 'Not specified'}

## Core Keywords & Topics
${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n') || `1. ${industry}`}

## Homepage Content Extract
${cleanedText || 'Content not available.'}

## Key Content URLs (${allContentUrls.length} highlighted of ${signals.totalPageCount} total pages)
${allContentUrls.map(u => `- ${u}`).join('\n') || `- ${websiteUrl}`}

## Content Inventory
| Type | Count |
|------|-------|
| Total pages | ${signals.totalPageCount} |
| Tutorials/Guides | ${signals.tutorialCount} |
| How-to guides | ${signals.howToGuideCount} |
| FAQ sections | ${signals.faqSectionCount} |
| Case studies | ${signals.caseStudyCount} |
| Blog posts | ${signals.blogPostCount} |
| Documentation pages | ${signals.documentationPageCount} |
| Schema types | ${signals.schemaTypeCount} |
| Data points | ${signals.dataPointCount} |
| External links | ${signals.externalLinkCount} |

## Competitors
${input.competitors.length > 0 ? input.competitors.map(c => `- ${c}`).join('\n') : '- Not specified'}

## Sitemap
${websiteUrl.replace(/\/$/, '')}/sitemap.xml
`.trim();
}

function generateAgentsMd(input: GeneratorInput, domain: string): string {
  const { companyName, websiteUrl, industry, targetAudience, valueProposition, signals, sitemapUrls, keywords } = input;

  const apiUrls = sitemapUrls.filter(u => /\/api\/|\/docs\/|\/developer/i.test(u)).slice(0, 5);
  // Only reference section URLs that actually exist in the sitemap — never invent /docs, /blog, /faq
  const docsUrl = sitemapUrls.find(u => /\/docs(\/|$)/i.test(u));
  const blogUrl = sitemapUrls.find(u => /\/blog(\/|$)/i.test(u));
  const faqUrl = sitemapUrls.find(u => /\/faq(\/|$)/i.test(u));
  const contactUrl = sitemapUrls.find(u => /\/contact(-us)?(\/|$)/i.test(u));

  return `# AGENTS.md — ${companyName}

## Project Overview
**Website:** ${websiteUrl}
**Company:** ${companyName}
**Industry:** ${industry || 'Not specified'}
**Audience:** ${targetAudience || 'Not specified'}

## What This Site Is
${valueProposition || `${companyName} is a ${industry || 'business'} serving ${targetAudience || 'customers'}.`}

## Key Topics
${keywords.map(k => `- ${k}`).join('\n') || `- ${industry}`}

## Site Structure
- **Total pages:** ${signals.totalPageCount}
- **Documentation:** ${docsUrl ? `${signals.documentationPageCount} pages at ${docsUrl}` : signals.documentationPageCount > 0 ? `${signals.documentationPageCount} pages` : 'Not available'}
- **Blog/Resources:** ${blogUrl ? `${signals.blogPostCount} posts at ${blogUrl}` : signals.blogPostCount > 0 ? `${signals.blogPostCount} posts` : 'Not available'}
- **FAQ:** ${faqUrl ? `${signals.faqSectionCount} sections at ${faqUrl}` : signals.faqSectionCount > 0 ? `${signals.faqSectionCount} sections` : 'Not available'}

${apiUrls.length > 0 ? `## API & Developer Resources
${apiUrls.map(u => `- ${u}`).join('\n')}
` : ''}
## Content References
- llms.txt: ${websiteUrl}/llms.txt
- llms-full.txt: ${websiteUrl}/llms-full.txt
- Sitemap: ${websiteUrl}/sitemap.xml

## AI Crawling
This site welcomes crawling by all AI assistants. See robots.txt for details.
GPTBot, PerplexityBot, ClaudeBot, and Google-Extended are explicitly allowed.

## Contact
For questions about this site's content: ${contactUrl || websiteUrl}

## Last Updated
${new Date().toISOString().split('T')[0]}
`.trim();
}

function generateRobotsPatch(websiteUrl: string): string {
  return `# robots.txt PATCH — AI Crawler Allowances
# Generated by Citation Rocket (citationrocket.com)
# 
# ACTION REQUIRED: Copy the section below into your existing robots.txt file.
# If you don't have a robots.txt, create one at your domain root with this content.
#
# IMPORTANT: Check your current robots.txt first.
# If you have "User-agent: *" with "Disallow: /" anywhere, 
# these Allow rules must come BEFORE that block.

# ─── AI CRAWLERS — ADD THESE TO YOUR robots.txt ───────────────────────────────

# OpenAI (ChatGPT training and browsing)
User-agent: GPTBot
Allow: /

# OpenAI ChatGPT browsing plugin
User-agent: ChatGPT-User
Allow: /

# Perplexity AI
User-agent: PerplexityBot
Allow: /

# Anthropic Claude
User-agent: ClaudeBot
Allow: /
User-agent: anthropic-ai
Allow: /

# Google AI (Gemini, AI Overviews)
User-agent: Google-Extended
Allow: /

# Microsoft Copilot (Bingbot already allowed if you allow Bingbot)
User-agent: bingbot
Allow: /

# Common AI-powered crawlers
User-agent: cohere-ai
Allow: /
User-agent: omgili
Allow: /
User-agent: FacebookBot
Allow: /
User-agent: Diffbot
Allow: /

# ─── ALSO ADD THIS SITEMAP LINE IF NOT ALREADY PRESENT ───────────────────────
Sitemap: ${websiteUrl.replace(/\/$/, '')}/sitemap.xml

# ─── END PATCH ────────────────────────────────────────────────────────────────
`.trim();
}

function generateOrganizationSchema(input: GeneratorInput, domain: string): string {
  const { companyName, websiteUrl, industry, targetAudience } = input;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: companyName,
    url: websiteUrl,
    description: input.valueProposition || describeCompany(companyName, industry, targetAudience, ''),
    logo: { '@type': 'ImageObject', url: '[REPLACE: Full URL to your logo image, e.g. https://yoursite.com/logo.png]' },
    sameAs: ['[REPLACE: LinkedIn URL]', '[REPLACE: Twitter/X URL]'],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: '[REPLACE: URL of your contact page]',
    },
    knowsAbout: input.keywords,
    audience: { '@type': 'Audience', audienceType: targetAudience || 'General' },
  };
  return JSON.stringify(schema, null, 2);
}

function generateFaqPageSchema(input: GeneratorInput): string {
  const { companyName, websiteUrl, industry } = input;
  const industryLower = (industry || '').toLowerCase();

  const faqSets: Record<string, Array<{ q: string; a: string }>> = {
    legal: [
      { q: 'What types of cases does your firm handle?', a: `${companyName} handles a range of legal matters. Contact us for a free consultation to discuss your situation.` },
      { q: 'How long does a case typically take?', a: 'Case duration varies by type and complexity. We provide realistic timelines during your initial consultation.' },
      { q: 'Do you offer a free consultation?', a: `Yes, ${companyName} offers a free initial consultation.` },
      { q: 'What are your fees?', a: 'Our fees vary by case type. We offer transparent pricing and will discuss costs fully before any commitment.' },
    ],
    healthcare: [
      { q: 'How do I schedule an appointment?', a: `Schedule online at ${websiteUrl} or call our office directly.` },
      { q: 'Do you accept insurance?', a: 'We accept most major insurance plans. Contact us to confirm your specific coverage.' },
      { q: 'What should I bring to my first appointment?', a: 'Please bring your insurance card, photo ID, and any relevant medical records.' },
      { q: 'Do you offer telehealth appointments?', a: 'Yes, we offer virtual appointments for many types of consultations.' },
    ],
    saas: [
      { q: `How does ${companyName} work?`, a: `${describeCompany(companyName, industry, input.targetAudience, input.valueProposition)} Visit ${websiteUrl} to learn more.` },
      { q: 'How do I get started?', a: `Visit ${websiteUrl} to learn more or get in touch. [REPLACE: Add your actual signup/trial details — e.g. "Start a free trial" — only if you offer one.]` },
      { q: 'How does your software integrate with existing tools?', a: `[REPLACE: List your actual integrations, or delete this question if it does not apply.]` },
      { q: 'What security practices do you follow?', a: `[REPLACE: Describe your actual security practices/certifications, or delete this question if it does not apply.]` },
    ],
    default: [
      { q: `What does ${companyName} offer?`, a: `${companyName} provides ${input.valueProposition || `services for ${input.targetAudience}`}.` },
      { q: 'How do I get started?', a: `Getting started with ${companyName} is easy. Visit ${websiteUrl} or contact us directly.` },
      { q: 'What makes you different from competitors?', a: `${companyName} focuses on ${input.keywords.slice(0, 2).join(' and ') || 'delivering value'} for ${input.targetAudience}.` },
      { q: 'Do you offer support?', a: `Yes, ${companyName} offers customer support. Visit ${websiteUrl} to get in touch.` },
    ],
  };

  const key = /legal|law/.test(industryLower) ? 'legal'
    : /health|medical|clinic/.test(industryLower) ? 'healthcare'
    : /saas|software|tech|platform/.test(industryLower) ? 'saas'
    : 'default';

  const faqs = faqSets[key];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return JSON.stringify(schema, null, 2);
}

function generateHowToSchema(input: GeneratorInput): string {
  const { companyName, websiteUrl, industry } = input;
  const industryLower = (industry || '').toLowerCase();

  const howToSets: Record<string, { title: string; steps: Array<{ name: string; text: string }> }> = {
    legal: {
      title: `How to Get Legal Help from ${companyName}`,
      steps: [
        { name: 'Describe your situation', text: 'Call or fill out our contact form to briefly describe your legal situation.' },
        { name: 'Schedule a consultation', text: 'Book a free initial consultation at a time that suits you.' },
        { name: 'Review your options', text: `${companyName} will explain your legal options and recommended approach.` },
        { name: 'Engage representation', text: 'If you decide to proceed, we handle all paperwork and next steps.' },
        { name: 'Stay informed', text: 'We keep you updated at every stage of your case.' },
      ],
    },
    healthcare: {
      title: `How to Book an Appointment with ${companyName}`,
      steps: [
        { name: 'Check your insurance', text: 'Confirm we accept your insurance by calling our office or checking online.' },
        { name: 'Schedule your visit', text: `Book online at ${websiteUrl} or call us directly.` },
        { name: 'Complete intake forms', text: 'Fill out new patient forms online before your visit to save time.' },
        { name: 'Attend your appointment', text: 'Arrive 10 minutes early with your insurance card and photo ID.' },
        { name: 'Follow-up care', text: 'We provide clear next steps and follow-up scheduling before you leave.' },
      ],
    },
    default: {
      title: `How to Get Started with ${companyName}`,
      steps: [
        { name: 'Visit our website', text: `Go to ${websiteUrl} to learn more about ${companyName}.` },
        { name: 'Request information', text: 'Contact us to discuss your needs and get a tailored overview.' },
        { name: 'Review the proposal', text: `${companyName} will prepare a proposal tailored to your requirements.` },
        { name: 'Get started', text: 'Once approved, we begin onboarding immediately.' },
        { name: 'Review results', text: 'We track progress and share regular updates with you.' },
      ],
    },
  };

  const key = /legal|law/.test(industryLower) ? 'legal'
    : /health|medical|clinic/.test(industryLower) ? 'healthcare'
    : 'default';

  const howTo = howToSets[key];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: howTo.title,
    description: `Step-by-step guide to working with ${companyName}.`,
    step: howTo.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };

  return JSON.stringify(schema, null, 2);
}

function generateArticleSchema(input: GeneratorInput, domain: string): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '[REPLACE: Your Article Title Here]',
    description: '[REPLACE: 2-3 sentence article summary]',
    author: {
      '@type': 'Organization',
      name: input.companyName,
      url: input.websiteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: input.companyName,
      url: input.websiteUrl,
      logo: { '@type': 'ImageObject', url: '[REPLACE: Full URL to your logo image]' },
    },
    datePublished: '[REPLACE: YYYY-MM-DD]',
    dateModified: '[REPLACE: YYYY-MM-DD]',
    mainEntityOfPage: { '@type': 'WebPage', '@id': '[REPLACE: Full article URL]' },
    about: input.keywords.slice(0, 3).map(k => ({ '@type': 'Thing', name: k })),
  };
  return JSON.stringify(schema, null, 2);
}

function generateBreadcrumbSchema(websiteUrl: string, domain: string): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: websiteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: '[REPLACE: Section Name — e.g. Blog]',
        item: `${websiteUrl}/[REPLACE: section-url]`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: '[REPLACE: Page Title]',
        item: `${websiteUrl}/[REPLACE: page-url]`,
      },
    ],
  };
  return JSON.stringify(schema, null, 2);
}

function generateHomepageMarkdown(input: GeneratorInput, domain: string): string {
  const { companyName, websiteUrl, industry, targetAudience, valueProposition, keywords } = input;

  return `# ${companyName}

**${valueProposition || `${industry} for ${targetAudience}`}**

${describeCompany(companyName, industry, targetAudience, '')}

## What We Do

${valueProposition || `${companyName} provides services tailored to ${targetAudience}.`}

## Key Areas

${keywords.slice(0, 5).map(k => `- **${k}**`).join('\n') || `- ${industry}`}

## Who We Serve

${targetAudience || 'Businesses and professionals looking for results.'}

## Get Started

Visit [${domain}](${websiteUrl}) to learn more or get in touch.

---
*This markdown version is provided for AI agents and crawlers.*
*Canonical URL: ${websiteUrl}*
*Last updated: ${new Date().toISOString().split('T')[0]}*
`.trim();
}

function generateInstructions(input: GeneratorInput, domain: string): string {
  return `# AEO File Package — Installation Instructions
# Generated by Citation Rocket for ${input.companyName}
# Generated: ${new Date().toISOString().split('T')[0]}

## What's in this ZIP

| File | Where to put it | Priority |
|------|----------------|----------|
| llms.txt | Root of your domain: ${input.websiteUrl}/llms.txt | HIGH |
| llms-full.txt | Root of your domain: ${input.websiteUrl}/llms-full.txt | HIGH |
| AGENTS.md | Root of your domain: ${input.websiteUrl}/AGENTS.md | HIGH |
| robots-patch.txt | Copy contents into your existing robots.txt | HIGH |
| schema/Organization.jsonld | Add to <head> of your homepage | HIGH |
| schema/FAQPage.jsonld | Add to <head> of your FAQ page | HIGH |
| schema/HowTo.jsonld | Add to <head> of any how-to/guide pages | MEDIUM |
| schema/Article.jsonld | Add to <head> of each blog post (customise per post) | MEDIUM |
| schema/BreadcrumbList.jsonld | Add to <head> of all pages (customise per page) | MEDIUM |
| markdown-twins/homepage.md | Host at ${input.websiteUrl}/homepage.md | LOW |

## Step 1: Upload llms.txt, llms-full.txt, AGENTS.md

Upload these three files to the ROOT of your website.
- WordPress: Upload via FTP/cPanel to public_html/
- Webflow: Publish as static files (Settings → Assets)
- Framer: Upload via custom domain file hosting
- Vercel/Netlify: Place in /public folder

Verify at: ${input.websiteUrl}/llms.txt

## Step 2: Update robots.txt

Open your existing robots.txt file and add the contents of robots-patch.txt.
If you don't have a robots.txt, rename robots-patch.txt to robots.txt and upload to root.

Verify at: ${input.websiteUrl}/robots.txt

## Step 3: Add Schema Markup

For each schema file, wrap the contents in a script tag and add to the <head> of the relevant page:

<script type="application/ld+json">
[PASTE JSON CONTENT HERE]
</script>

Replace all [REPLACE: ...] placeholders with your actual content before publishing.

Validate at: https://validator.schema.org/

## Step 4: Verify

After uploading, run a new audit at citationrocket.com to confirm your score improved.
Schema markup typically improves Gemini scores by 6-12 points.
llms.txt helps all AI platforms understand your site structure.

## Questions?

Support: https://citationrocket.com/contact
Docs: https://citationrocket.com/docs
`.trim();
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Build the "## Important Pages" block from REAL sitemap URLs only.
 * Sections with no matching URLs are omitted entirely — we never invent
 * fallback URLs like /guides or /faq that may 404 on the customer's site.
 * Returns an empty string when no section has content.
 */
function buildImportantPagesSection(sections: Array<[string, string[]]>): string {
  const nonEmpty = sections.filter(([, urls]) => urls.length > 0);
  if (nonEmpty.length === 0) return '\n';
  const body = nonEmpty
    .map(([title, urls]) => `### ${title}\n${urls.map(u => `- ${u}`).join('\n')}`)
    .join('\n\n');
  return `\n## Important Pages\n\n${body}\n\n`;
}

/**
 * Join company name + industry + value proposition into one grammatical sentence
 * without jamming raw fragments together.
 */
function describeCompany(companyName: string, industry: string, targetAudience: string, valueProposition: string): string {
  // Descriptor: "a Custom Internal Software Development company" (append "company"
  // unless the industry string already ends with an org noun).
  const orgNoun = /(company|provider|firm|agency|studio|consultancy|practice|platform|business)$/i;
  let sentence: string;
  if (industry) {
    const descriptor = orgNoun.test(industry.trim()) ? industry.trim() : `${industry.trim()} company`;
    const article = /^[aeiou]/i.test(descriptor) ? 'an' : 'a';
    sentence = `${companyName} is ${article} ${descriptor}`;
  } else {
    sentence = `${companyName} is a business`;
  }
  if (targetAudience) {
    sentence += ` serving ${targetAudience.charAt(0).toLowerCase()}${targetAudience.slice(1)}`;
  }
  sentence = sentence.replace(/\.+$/, '') + '.';
  if (valueProposition) {
    const vp = valueProposition.trim();
    sentence += ` ${vp.endsWith('.') ? vp : vp + '.'}`;
  }
  return sentence;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}
