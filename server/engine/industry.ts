/**
 * Single source of truth for mapping a free-text industry ("Personal injury
 * law firm", "DTC footwear brand") to a scoring profile.
 *
 * Whole-word matching only: "lawn care" must not become "law", "apparel" must
 * not become "app". Order matters — the first profile with a match wins.
 */

export type IndustryKey = 'legal' | 'healthcare' | 'realestate' | 'local' | 'ecommerce' | 'marketing' | 'saas';

const PROFILES: Array<{ key: IndustryKey; terms: string[] }> = [
  { key: 'legal', terms: ['legal', 'law firm', 'law', 'attorney', 'attorneys', 'lawyer', 'lawyers', 'litigation', 'personal injury', 'paralegal', 'notary'] },
  { key: 'healthcare', terms: ['healthcare', 'health care', 'health', 'medical', 'medicine', 'hospital', 'clinic', 'dental', 'dentist', 'dentistry', 'pharma', 'pharmaceutical', 'biotech', 'wellness', 'telehealth', 'therapy', 'mental health', 'physician', 'veterinary', 'chiropractic'] },
  { key: 'realestate', terms: ['real estate', 'property', 'properties', 'realtor', 'realty', 'mortgage', 'housing', 'brokerage', 'homebuilder'] },
  { key: 'local', terms: ['restaurant', 'restaurants', 'cafe', 'bakery', 'bar', 'food service', 'fast food', 'fast casual', 'catering', 'hospitality', 'hotel', 'salon', 'spa', 'fitness', 'gym', 'plumbing', 'plumber', 'hvac', 'roofing', 'landscaping', 'lawn care', 'cleaning', 'home services', 'contractor', 'construction', 'auto repair', 'local business', 'franchise'] },
  { key: 'ecommerce', terms: ['e-commerce', 'ecommerce', 'retail', 'retailer', 'online store', 'shop', 'store', 'dtc', 'direct-to-consumer', 'consumer goods', 'cpg', 'fashion', 'apparel', 'footwear', 'clothing', 'beauty', 'cosmetics', 'skincare', 'furniture', 'food & beverage', 'grocery'] },
  { key: 'marketing', terms: ['marketing', 'digital marketing', 'advertising', 'agency', 'seo', 'content marketing', 'branding', 'public relations', 'pr agency', 'media agency'] },
  { key: 'saas', terms: ['saas', 'software', 'technology', 'tech', 'platform', 'cloud', 'app', 'apps', 'developer', 'developers', 'api', 'devtools', 'it services', 'information technology', 'automation', 'ai'] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS = PROFILES.map(({ key, terms }) => ({
  key,
  re: new RegExp(`(^|[^a-z0-9])(${terms.map(escape).join('|')})([^a-z0-9]|$)`, 'i'),
}));

export function detectIndustryKey(industry: string | undefined | null): IndustryKey | null {
  const text = (industry || '').toLowerCase().trim();
  if (!text) return null;
  return MATCHERS.find((m) => m.re.test(text))?.key ?? null;
}

/** Kinds of advice the report can give. */
export type AdviceTopic =
  | 'tutorials' | 'howto' | 'faq' | 'schema' | 'caseStudies' | 'data' | 'frameworks'
  | 'externalLinks' | 'longForm' | 'blog' | 'docs' | 'research' | 'analysis';

const ALL: AdviceTopic[] = ['tutorials', 'howto', 'faq', 'schema', 'caseStudies', 'data', 'frameworks', 'externalLinks', 'longForm', 'blog', 'docs', 'research', 'analysis'];

/**
 * Which advice makes sense for which kind of business. A restaurant should not
 * be told to write API documentation or a proprietary framework.
 */
const RELEVANT: Record<IndustryKey | 'general', AdviceTopic[]> = {
  saas: ALL,
  marketing: ALL.filter((t) => t !== 'docs'),
  legal: ['howto', 'faq', 'schema', 'caseStudies', 'data', 'externalLinks', 'longForm', 'blog', 'analysis'],
  healthcare: ['howto', 'faq', 'schema', 'data', 'externalLinks', 'longForm', 'blog', 'research'],
  realestate: ['howto', 'faq', 'schema', 'data', 'blog'],
  ecommerce: ['tutorials', 'howto', 'faq', 'schema', 'data', 'blog'],
  local: ['faq', 'schema', 'blog'],
  general: ['tutorials', 'howto', 'faq', 'schema', 'caseStudies', 'data', 'externalLinks', 'longForm', 'blog'],
};

export function isAdviceRelevant(industry: string | undefined | null, topic: AdviceTopic): boolean {
  return RELEVANT[detectIndustryKey(industry) ?? 'general'].includes(topic);
}

/** Best-effort mapping of a generated finding/recommendation sentence to its topic. */
export function adviceTopicOf(textOrTitle: string): AdviceTopic | null {
  const t = textOrTitle.toLowerCase();
  if (/documentation/.test(t)) return 'docs';
  if (/framework|methodolog/.test(t)) return 'frameworks';
  if (/case stud|success stor/.test(t)) return 'caseStudies';
  if (/original research|industry report/.test(t)) return 'research';
  if (/how-to guide|convert tutorials/.test(t)) return 'howto';
  if (/tutorial/.test(t)) return 'tutorials';
  if (/\bfaq/.test(t)) return 'faq';
  if (/schema/.test(t)) return 'schema';
  if (/citation|external link/.test(t)) return 'externalLinks';
  if (/data point|statistic/.test(t)) return 'data';
  if (/long-form/.test(t)) return 'longForm';
  if (/blog|publishing/.test(t)) return 'blog';
  if (/analysis|analytical/.test(t)) return 'analysis';
  return null;
}
