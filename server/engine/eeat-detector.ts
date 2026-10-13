/**
 * E-E-A-T Signal Detector — Module 2 (0–35 points)
 *
 * r=0.81 correlation with AI citation probability — highest measured signal.
 * Author byline alone lifts AI citations by ~40%.
 *
 * APIs used (all free):
 *   Google Knowledge Graph API: 100K requests/day free
 *   Wikidata API: completely free, no auth
 *
 * On-page signals require only the scraped HTML — no API needed.
 */

import type { EEATSignals } from './blueprint-signals';
import { verifyWikidataByDomain, verifyKnowledgeGraph } from './entity-verify';

// ─── On-page patterns ─────────────────────────────────────────────────────────

const AUTHOR_BYLINE_PATTERNS = [
  /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/,             // "by John Smith"
  /\bauthor[:\s]+[A-Z][a-z]+/i,                       // "Author: John"
  /<(span|div|p)[^>]*(author|byline|writer)[^>]*>/i, // author CSS class
  /\bwritten\s+by\s+[A-Z]/i,                          // "written by"
  /rel="author"/i,                                     // semantic author link
  /<a[^>]*(author|byline|writer)[^>]*>/i,             // author link element
  /itemprop="author"/i,                               // microdata
  /"@type"\s*:\s*"Person"/i,                          // JSON-LD Person type
  /class="[^"]*author[^"]*"/i,                        // author CSS class (attr)
  /class="[^"]*byline[^"]*"/i,                        // byline CSS class (attr)
  /href="[^"]*\/author\//i,                           // /author/ URL pattern
  /href="[^"]*\/blog\/authors\//i,                    // /blog/authors/ URL pattern
];

const FIRST_PERSON_PATTERNS = [
  /\bI (tested|tried|used|found|discovered|built|analyzed|reviewed|measured)\b/i,
  /\bwe (tested|found|discovered|built|analyzed|measured|observed|ran|conducted)\b/i,
  /\bbased on (our|my) (experience|testing|research|analysis|review|testing)\b/i,
  /\bin (my|our) (experience|testing|opinion|review|analysis)\b/i,
  /\bI('ve| have) (been|worked|used|built|tested)\b/i,
];

const CREDENTIALS_PATTERNS = [
  /\b(MD|PhD|JD|MBA|CPA|PE|RN|NP|DO|DDS|PharmD|LCSW|CFP|CFA)\b/,
  /\b(doctor|professor|certified|licensed|chartered|registered|accredited)\b/i,
  /\b(years? of experience|years? in|decade|expert in)\b/i,
  /\b(founder|CEO|CTO|director|manager|specialist|consultant|advisor)\b/i,
];

const EXPERT_QUOTE_PATTERNS = [
  /according to (Dr\.?|Prof\.?|[A-Z][a-z]+ [A-Z][a-z]+),?/i,
  /"[^"]{20,100}"\s*[—–-]\s*[A-Z][a-z]+ [A-Z][a-z]+/,   // "Quote" — Name
  /[A-Z][a-z]+ [A-Z][a-z]+,?\s+(said|says|explains?|notes?|argues?|states?)/i,
];

const NAMED_CITATION_PATTERNS = [
  /\(source:\s*[^\)]+\)/i,
  /according to (the |a )?[A-Z][a-zA-Z\s]{3,30}(,| |\.)/,
  /\bcited by\b/i,
  /\[([\d]+)\]/,                    // footnote references
  /via [A-Z][a-zA-Z]+/i,
];

// Editorial / expert review attribution — trusted institutions (health, news,
// reference) often signal authorship via review processes rather than an individual
// byline. "Medically reviewed by", "fact-checked", "edited by" are strong E-E-A-T.
const EDITORIAL_REVIEW_PATTERNS = [
  /\b(medically|clinically|fact|expert|peer)[\s-]*(reviewed|checked)\b/i,
  /\breviewed\s+(and\s+approved\s+)?by\b/i,
  /\b(edited|fact[\s-]?checked)\s+by\b/i,
  /\breviewed\s+by\s+(our\s+)?(medical|editorial|clinical|expert)\s+(team|board|staff)\b/i,
  /\bwritten\s+and\s+(reviewed|edited)\b/i,
];

// Organizational authorship — "Mayo Clinic Staff", "Editorial Team", or a JSON-LD
// author/reviewedBy that is an Organization (not an individual Person).
const ORG_AUTHORSHIP_PATTERNS = [
  /\b[A-Z][A-Za-z.&'\- ]{2,40}\s(Staff|Editorial Team|Editorial Staff|Editors|Newsroom)\b/,
  /\bby\s+(the\s+)?[A-Z][A-Za-z.&'\- ]{2,40}\s(staff|editorial team|team|editors|newsroom)\b/i,
  /"(author|reviewedBy)"\s*:\s*(\[[^\]]*)?\{[^{}]*"@type"\s*:\s*"([A-Za-z]*Organization|Corporation|MedicalBusiness)"/i,
];

// ─── Main detector ────────────────────────────────────────────────────────────

export async function detectEEAT(
  html: string,
  text: string,
  websiteUrl: string,
  brandName: string
): Promise<EEATSignals> {
  const domain = extractDomain(websiteUrl);
  const isHttps = websiteUrl.startsWith('https://');

  // ── Experience signals ────────────────────────────────────────────────────
  // Authorship can be an individual byline, an organizational/editorial byline
  // ("Mayo Clinic Staff", "Editorial Team"), or a "reviewed by" attribution — all
  // are legitimate E-E-A-T signals, not just an individual Person byline.
  const hasEditorialReview = EDITORIAL_REVIEW_PATTERNS.some(p => p.test(text) || p.test(html));
  const hasOrgAuthorship = ORG_AUTHORSHIP_PATTERNS.some(p => p.test(html));
  const hasAuthorByline = AUTHOR_BYLINE_PATTERNS.some(p => p.test(html)) || hasOrgAuthorship || hasEditorialReview;
  const bylineLinksToBioPage = /<a[^>]*(author|about|team|bio)[^>]*>[\s\S]*?(by\s+|author)/i.test(html);
  const firstPersonExperientialCount = FIRST_PERSON_PATTERNS.filter(p => p.test(text)).length;

  // ── Expertise signals ─────────────────────────────────────────────────────
  const personSchema = extractPersonSchema(html);
  const hasPersonSchema = personSchema !== null;
  const personSchemaCompleteness = personSchema ? scorePersonSchema(personSchema) : 0;
  const hasAuthorCredentialsMentioned = CREDENTIALS_PATTERNS.some(p => p.test(text));
  const hasSameAsLinks = hasPersonSchema && /"sameAs"\s*:/.test(html);
  const namedExternalCitationsCount = NAMED_CITATION_PATTERNS.filter(p => p.test(text)).length;

  // ── Authority signals ─────────────────────────────────────────────────────
  const hasExpertQuoteWithAttribution = EXPERT_QUOTE_PATTERNS.some(p => p.test(text));
  const { knowledgeGraphEntityFound, wikidataEntityFound, wikidataQNumber } =
    await lookupEntityPresence(brandName, domain);

  // ── Trust signals ─────────────────────────────────────────────────────────
  const orgSchema = extractOrganizationSchema(html);
  const hasOrganizationSchema = orgSchema !== null;
  const organizationSchemaCompleteness = orgSchema ? scoreOrganizationSchema(orgSchema) : 0;
  const hasPrivacyPolicyPage = /privacy(-policy)?|privacy_policy/i.test(html);
  const hasTermsPage = /terms(-of-service|-of-use)?|tos\b/i.test(html);
  const dateModifiedWithin90Days = checkDateModifiedWithin90Days(html);

  // ── Score calculation ──────────────────────────────────────────────────────
  // Experience (0–8)
  let experience = 0;
  if (hasAuthorByline) experience += 3;
  if (bylineLinksToBioPage) experience += 2;
  experience += Math.min(3, firstPersonExperientialCount);

  // Expertise (0–9)
  let expertise = 0;
  if (hasPersonSchema) expertise += 2;
  expertise += Math.round(personSchemaCompleteness * 3);
  if (hasAuthorCredentialsMentioned) expertise += 2;
  if (hasSameAsLinks) expertise += 1;
  expertise += Math.min(1, namedExternalCitationsCount);
  // Editorial / "medically reviewed by" / organizational authorship is a strong
  // expertise signal for trusted institutions that don't use individual bylines.
  if ((hasEditorialReview || hasOrgAuthorship) && !hasPersonSchema) expertise += 2;

  // Authority (0–10)
  let authority = 0;
  if (hasExpertQuoteWithAttribution) authority += 3;
  if (knowledgeGraphEntityFound) authority += 5;
  if (wikidataEntityFound) authority += 2;

  // Trust (0–8)
  let trust = 0;
  if (hasOrganizationSchema) trust += 2;
  trust += Math.round(organizationSchemaCompleteness * 2);
  if (hasPrivacyPolicyPage) trust += 1;
  if (hasTermsPage) trust += 1;
  if (isHttps) trust += 1;
  if (dateModifiedWithin90Days) trust += 1;

  // Enforce per-pillar sub-caps BEFORE totaling so no single pillar can exceed its
  // budget (e.g. editorial-authorship credit must not push expertise past 9).
  const experienceCapped = Math.min(8, experience);
  const expertiseCapped = Math.min(9, expertise);
  const authorityCapped = Math.min(10, authority);
  const trustCapped = Math.min(8, trust);
  const eeAtScore = Math.min(35, experienceCapped + expertiseCapped + authorityCapped + trustCapped);

  return {
    hasAuthorByline, bylineLinksToBioPage, firstPersonExperientialCount,
    hasPersonSchema, personSchemaCompleteness, hasAuthorCredentialsMentioned,
    hasSameAsLinks, namedExternalCitationsCount, hasExpertQuoteWithAttribution,
    knowledgeGraphEntityFound, wikidataEntityFound, hasOrganizationSchema,
    organizationSchemaCompleteness, hasPrivacyPolicyPage, hasTermsPage,
    isHttps, dateModifiedWithin90Days,
    eeAtScore,
    eeAtBreakdown: {
      experience: experienceCapped,
      expertise: expertiseCapped,
      authority: authorityCapped,
      trust: trustCapped,
    },
  };
}

// ─── Google Knowledge Graph API ───────────────────────────────────────────────

async function lookupEntityPresence(
  brandName: string,
  domain: string
): Promise<{ knowledgeGraphEntityFound: boolean; wikidataEntityFound: boolean; wikidataQNumber: string | null }> {
  // Only credit entities that can be tied to the actual domain (official website
  // match), not just the closest name match — see entity-verify.ts.
  const [kg, wd] = await Promise.all([
    verifyKnowledgeGraph(brandName, domain, process.env.GOOGLE_KG_API_KEY),
    verifyWikidataByDomain(brandName, domain),
  ]);

  return {
    knowledgeGraphEntityFound: kg.found,
    wikidataEntityFound: !!wd.qNumber,
    wikidataQNumber: wd.qNumber,
  };
}

// ─── Schema parsers ───────────────────────────────────────────────────────────

// Flatten a parsed JSON-LD value into a list of schema objects, unwrapping the
// `@graph` wrapper that Yoast / RankMath / most pro sites use.
function flattenJsonLdNodes(node: any): any[] {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (Array.isArray(n['@graph'])) n['@graph'].forEach(visit);
    if (n['@type']) out.push(n);
  };
  visit(node);
  return out;
}

function typeMatches(schemaType: any, wanted: string[]): boolean {
  if (Array.isArray(schemaType)) return schemaType.some((t) => wanted.includes(t));
  return wanted.includes(schemaType);
}

function extractPersonSchema(html: string): Record<string, any> | null {
  try {
    const matches = Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi));
    for (const match of matches) {
      const schemas = flattenJsonLdNodes(JSON.parse(match[1]));
      for (const s of schemas) {
        if (typeMatches(s['@type'], ['Person'])) return s;
      }
    }
  } catch { /* malformed schema */ }
  return null;
}

function extractOrganizationSchema(html: string): Record<string, any> | null {
  try {
    const matches = Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi));
    for (const match of matches) {
      const schemas = flattenJsonLdNodes(JSON.parse(match[1]));
      for (const s of schemas) {
        if (typeMatches(s['@type'], ['Organization', 'Corporation', 'LocalBusiness', 'OnlineBusiness', 'MedicalOrganization', 'MedicalBusiness', 'Hospital', 'Physician', 'Dentist', 'GovernmentOrganization', 'EducationalOrganization', 'CollegeOrUniversity', 'School', 'NGO', 'NonprofitOrganization', 'NewsMediaOrganization', 'LegalService', 'ProfessionalService', 'FinancialService', 'ResearchOrganization'])) return s;
      }
    }
  } catch { /* malformed schema */ }
  return null;
}

function scorePersonSchema(schema: Record<string, any>): number {
  const keyProps = ['name', 'jobTitle', 'alumniOf', 'knowsAbout', 'sameAs', 'image'];
  const found = keyProps.filter(p => schema[p]).length;
  return found / keyProps.length;
}

function scoreOrganizationSchema(schema: Record<string, any>): number {
  const criticalProps = ['name', 'url', 'logo', 'sameAs'];
  const importantProps = ['foundingDate', 'address', 'contactPoint', 'description'];
  const critical = criticalProps.filter(p => schema[p]).length / criticalProps.length;
  const important = importantProps.filter(p => schema[p]).length / importantProps.length;
  return critical * 0.7 + important * 0.3;
}

function checkDateModifiedWithin90Days(html: string): boolean {
  const patterns = [
    /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/,
    /property="article:modified_time"\s+content="(\d{4}-\d{2}-\d{2})/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const modified = new Date(m[1]);
      const daysAgo = (Date.now() - modified.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 90;
    }
  }
  return false;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
}
