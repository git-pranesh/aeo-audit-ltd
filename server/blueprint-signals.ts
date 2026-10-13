/**
 * Blueprint Signals — Extended AEO Signal Interface
 *
 * Adds the 8 research-backed blueprint modules on top of existing ContentSignals.
 * These are the signals with PROVEN correlation to AI citation:
 *   E-E-A-T:          r=0.81 (65.6% variance explained)
 *   Off-Site Presence: r=0.664 (44% variance explained)
 *   Answer Capsule:    Strongest single on-site predictor
 *   Content Freshness: 25.7% fresher than non-cited content
 *
 * Blueprint scoring: 150 raw points → normalized to 100
 *
 * Module weights:
 *   Module 1: Answer Capsule Quality    0–25
 *   Module 2: E-E-A-T Index             0–35
 *   Module 3: AI Bot Access             0–10
 *   Module 4: Off-Site Authority        0–30
 *   Module 5: Content Freshness         0–15
 *   Module 6: Schema Completeness       0–20
 *   Module 7: Fan-Out Coverage          0–10
 *   Module 8: Entity Consistency        0–5
 *                              Total: 150 raw
 */

// ─── Module 1: Answer Capsule ─────────────────────────────────────────────────

export interface AnswerCapsuleSignals {
  first150WordCount: number;
  hasDefinitionFirstPattern: boolean;   // opening sentence is a direct definition
  hasDataPointInFirst3Sentences: boolean; // citable stat in opening 3 sentences
  questionFramedHeadingCount: number;    // H2/H3 starting with How/What/Why/When/Which
  answerBlocksPresent: number;           // count of 40-150 word answer blocks under headings
  h1IsDeclarative: boolean;             // true = good; false = question H1 (penalised)
  answerCapsuleScore: number;           // 0–25
}

// ─── Module 2: E-E-A-T ───────────────────────────────────────────────────────

export interface EEATSignals {
  // Experience
  hasAuthorByline: boolean;
  bylineLinksToBioPage: boolean;
  firstPersonExperientialCount: number; // "I tested", "we found", "in our experience"

  // Expertise
  hasPersonSchema: boolean;
  personSchemaCompleteness: number;     // 0–1, ratio of key properties present
  hasAuthorCredentialsMentioned: boolean;
  hasSameAsLinks: boolean;             // Person schema sameAs to LinkedIn/ORCID
  namedExternalCitationsCount: number; // cited sources with named attribution

  // Authority
  hasExpertQuoteWithAttribution: boolean; // "according to Dr. X" not "experts say"
  knowledgeGraphEntityFound: boolean;    // brand found in Google KG
  wikidataEntityFound: boolean;          // brand has Wikidata Q-number

  // Trust
  hasOrganizationSchema: boolean;
  organizationSchemaCompleteness: number; // 0–1
  hasPrivacyPolicyPage: boolean;
  hasTermsPage: boolean;
  isHttps: boolean;
  dateModifiedWithin90Days: boolean;

  eeAtScore: number;                   // 0–35
  eeAtBreakdown: {
    experience: number;                // 0–8
    expertise: number;                 // 0–9
    authority: number;                 // 0–10
    trust: number;                     // 0–8
  };
}

// ─── Module 3: AI Bot Access ─────────────────────────────────────────────────

export interface BotAccessSignals {
  robotsTxtFetched: boolean;
  robotsTxtContent: string;

  // Citation bots — MUST be allowed for AI citations
  citationBotsBlocked: string[];       // Any here = critical error
  citationBotsAllowed: string[];

  // Training bots — user's choice
  trainingBotsBlocked: string[];
  trainingBotsAllowed: string[];

  hasSitemapInRobotsTxt: boolean;
  jsRenderingDetected: boolean;        // true = content may be invisible to AI crawlers
  llmsTxtPresent: boolean;
  llmsFullTxtPresent: boolean;
  agentsMdPresent: boolean;

  botAccessScore: number;             // 0–10
}

// ─── Module 4: Off-Site Authority ────────────────────────────────────────────

export interface OffsiteSignals {
  // Entity Foundation (0–10)
  knowledgeGraphEntityType: string | null;  // 'Organization', 'Person', null
  wikidataQNumber: string | null;
  wikipediaArticleExists: boolean;
  crunchbaseProfileExists: boolean;
  linkedinCompanyPageExists: boolean;
  entityFoundationScore: number;      // 0–10

  // Review Platform Coverage (0–10)
  g2ProfileExists: boolean;
  g2ReviewCount: number | null;
  capteRraProfileExists: boolean;
  trustpilotProfileExists: boolean;
  reviewPlatformScore: number;        // 0–10

  // Community Presence (0–10)
  redditBrandMentionCount: number;
  redditRelevantSubreddits: string[];  // subreddits covering the brand's category
  redditBrandPresentInSubreddits: string[]; // subreddits where brand IS mentioned
  communityScore: number;             // 0–10

  offsiteScore: number;              // 0–30
}

// ─── Module 5: Content Freshness ─────────────────────────────────────────────

export interface FreshnessSignals {
  dateModifiedInSchema: string | null;
  dateModifiedInHttp: string | null;
  daysSinceModified: number | null;
  hasVisibleLastUpdatedAnnotation: boolean; // "Last Updated: [date]" visible text
  hasChangelogSection: boolean;            // changelog or "what's new" section
  sitemapLastModMatchesPage: boolean;      // sitemap lastmod = page dateModified
  isSubstantiveUpdate: boolean;            // word count / heading changes detected vs baseline
  indexNowConfigured: boolean;             // IndexNow API key in page source or meta

  freshnessScore: number;                 // 0–15
  freshnessStatus: 'green' | 'yellow' | 'red';
}

// ─── Module 6: Schema Completeness ───────────────────────────────────────────

export interface SchemaCompletenessSignals {
  organization: {
    present: boolean;
    propertiesFound: string[];
    criticalMissing: string[];   // name, url, logo, sameAs = critical
    sameAsLinksValid: boolean;   // sameAs URLs actually resolve
    score: number;               // 0–5
  };
  person: {
    present: boolean;
    propertiesFound: string[];
    hasJobTitle: boolean;
    hasKnowsAbout: boolean;
    hasSameAs: boolean;
    linkedToArticle: boolean;    // Article.author points to this Person
    score: number;               // 0–5
  };
  article: {
    present: boolean;
    hasDateModified: boolean;
    authorIsEntityRef: boolean;  // author is @id link, not just a string
    headlineMatchesH1: boolean;
    score: number;               // 0–4
  };
  faqPage: {
    present: boolean;
    avgAnswerWordCount: number;
    answersInOptimalRange: boolean; // 40–80 words = optimal
    score: number;                 // 0–3
  };
  breadcrumb: {
    present: boolean;
    score: number;               // 0–3
  };

  schemaCompletenessScore: number; // 0–20
}

// ─── Module 7: Fan-Out Coverage ──────────────────────────────────────────────

export interface FanOutSignals {
  h1ContainsPrimaryQuery: boolean;
  h1IsQuestionStyle: boolean;         // penalised per research (3.4 vs 4.3 avg citations)
  h2h3MatchPrimaryQuery: boolean;     // over-optimisation flag
  avgWordsBetweenHeadings: number;    // optimal: 120–180
  headingsWithAnswerBlockBelow: number; // headings with 40–60 word direct answer block
  totalHeadingCount: number;
  distinctSubtopicCount: number;      // if > 5, flag for potential splitting
  answerDensityScore: number;         // headingsWithAnswerBlock / totalHeadings

  fanOutScore: number;               // 0–10
}

// ─── Module 8: Entity Consistency ────────────────────────────────────────────

export interface EntityConsistencySignals {
  brandNameOnSite: string;
  brandNameOnLinkedIn: string | null;
  brandNameOnG2: string | null;
  brandNameOnCrunchbase: string | null;
  brandNameOnWikidata: string | null;

  nameMismatchCount: number;          // how many external sources differ
  foundingYearConsistent: boolean | null;
  hqLocationConsistent: boolean | null;
  categoryConsistent: boolean | null;

  entityConsistencyScore: number;     // 0–5
  entityCoherenceRating: 'strong' | 'moderate' | 'weak';
}

// ─── Combined Blueprint Result ────────────────────────────────────────────────

export interface BlueprintResult {
  // 8 module scores (raw, 150 total)
  answerCapsule: AnswerCapsuleSignals;
  eeat: EEATSignals;
  botAccess: BotAccessSignals;
  offsite: OffsiteSignals;
  freshness: FreshnessSignals;
  schemaCompleteness: SchemaCompletenessSignals;
  fanOut: FanOutSignals;
  entityConsistency: EntityConsistencySignals;

  // Totals
  rawScore: number;                   // 0–150
  normalizedScore: number;            // 0–100 (rawScore / 150 * 100)

  // What's missing (for UI display)
  criticalGaps: CriticalGap[];
  quickWins: BlueprintQuickWin[];
}

export interface CriticalGap {
  module: string;
  signal: string;
  impact: 'critical' | 'high' | 'medium';
  fix: string;
  estimatedScoreGain: number;
}

export interface BlueprintQuickWin {
  action: string;
  timeEstimate: string;
  module: string;
  scoreGain: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ─── Defaults (safe empty state) ─────────────────────────────────────────────

export function emptyBlueprintResult(): BlueprintResult {
  return {
    answerCapsule: {
      first150WordCount: 0, hasDefinitionFirstPattern: false,
      hasDataPointInFirst3Sentences: false, questionFramedHeadingCount: 0,
      answerBlocksPresent: 0, h1IsDeclarative: false, answerCapsuleScore: 0,
    },
    eeat: {
      hasAuthorByline: false, bylineLinksToBioPage: false, firstPersonExperientialCount: 0,
      hasPersonSchema: false, personSchemaCompleteness: 0, hasAuthorCredentialsMentioned: false,
      hasSameAsLinks: false, namedExternalCitationsCount: 0, hasExpertQuoteWithAttribution: false,
      knowledgeGraphEntityFound: false, wikidataEntityFound: false, hasOrganizationSchema: false,
      organizationSchemaCompleteness: 0, hasPrivacyPolicyPage: false, hasTermsPage: false,
      isHttps: false, dateModifiedWithin90Days: false, eeAtScore: 0,
      eeAtBreakdown: { experience: 0, expertise: 0, authority: 0, trust: 0 },
    },
    botAccess: {
      robotsTxtFetched: false, robotsTxtContent: '', citationBotsBlocked: [],
      citationBotsAllowed: [], trainingBotsBlocked: [], trainingBotsAllowed: [],
      hasSitemapInRobotsTxt: false, jsRenderingDetected: false, llmsTxtPresent: false,
      llmsFullTxtPresent: false, agentsMdPresent: false, botAccessScore: 0,
    },
    offsite: {
      knowledgeGraphEntityType: null, wikidataQNumber: null, wikipediaArticleExists: false,
      crunchbaseProfileExists: false, linkedinCompanyPageExists: false, entityFoundationScore: 0,
      g2ProfileExists: false, g2ReviewCount: null, capteRraProfileExists: false,
      trustpilotProfileExists: false, reviewPlatformScore: 0, redditBrandMentionCount: 0,
      redditRelevantSubreddits: [], redditBrandPresentInSubreddits: [], communityScore: 0,
      offsiteScore: 0,
    },
    freshness: {
      dateModifiedInSchema: null, dateModifiedInHttp: null, daysSinceModified: null,
      hasVisibleLastUpdatedAnnotation: false, hasChangelogSection: false,
      sitemapLastModMatchesPage: false, isSubstantiveUpdate: false,
      indexNowConfigured: false, freshnessScore: 0, freshnessStatus: 'red',
    },
    schemaCompleteness: {
      organization: { present: false, propertiesFound: [], criticalMissing: ['name','url','logo','sameAs'], sameAsLinksValid: false, score: 0 },
      person: { present: false, propertiesFound: [], hasJobTitle: false, hasKnowsAbout: false, hasSameAs: false, linkedToArticle: false, score: 0 },
      article: { present: false, hasDateModified: false, authorIsEntityRef: false, headlineMatchesH1: false, score: 0 },
      faqPage: { present: false, avgAnswerWordCount: 0, answersInOptimalRange: false, score: 0 },
      breadcrumb: { present: false, score: 0 },
      schemaCompletenessScore: 0,
    },
    fanOut: {
      h1ContainsPrimaryQuery: false, h1IsQuestionStyle: false, h2h3MatchPrimaryQuery: false,
      avgWordsBetweenHeadings: 0, headingsWithAnswerBlockBelow: 0, totalHeadingCount: 0,
      distinctSubtopicCount: 0, answerDensityScore: 0, fanOutScore: 0,
    },
    entityConsistency: {
      brandNameOnSite: '', brandNameOnLinkedIn: null, brandNameOnG2: null,
      brandNameOnCrunchbase: null, brandNameOnWikidata: null, nameMismatchCount: 0,
      foundingYearConsistent: null, hqLocationConsistent: null, categoryConsistent: null,
      entityConsistencyScore: 0, entityCoherenceRating: 'weak',
    },
    rawScore: 0,
    normalizedScore: 0,
    criticalGaps: [],
    quickWins: [],
  };
}
