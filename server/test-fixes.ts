/**
 * Standalone verification script for recent bug fixes.
 * Run with: npx tsx server/test-fixes.ts
 */

import { auditDataSchema } from "../shared/schema";

type ContentSignals = {
  caseStudyCount: number;
  dataPointCount: number;
  tutorialCount: number;
  faqCount: number;
  schemaTypeCount: number;
};

// ─── Inlined logic from server/routes.ts ──────────────────────────────────────
function computeStrongestArea(contentSignals: ContentSignals): string | null {
  const candidates: { label: string; score: number }[] = [
    { label: "Case Studies", score: contentSignals.caseStudyCount * 3 },
    { label: "Data & Research", score: contentSignals.dataPointCount * 0.5 },
    { label: "Tutorials", score: contentSignals.tutorialCount * 2 },
    { label: "FAQs", score: contentSignals.faqCount * 2.5 },
    { label: "Schema Markup", score: contentSignals.schemaTypeCount * 4 },
  ];
  const topCandidate = candidates.reduce(
    (best, c) => (c.score > best.score ? c : best),
    candidates[0]
  );
  const strongestArea =
    topCandidate.score === 0 ? "No Strong Area Detected" : topCandidate.label;
  if (
    strongestArea === "No Strong Area Detected" ||
    strongestArea === "General Content"
  ) {
    return null;
  }
  return strongestArea;
}

// Raw label (pre-null mapping) — used for tests that check the underlying label.
function computeStrongestAreaLabel(contentSignals: ContentSignals): string {
  const candidates: { label: string; score: number }[] = [
    { label: "Case Studies", score: contentSignals.caseStudyCount * 3 },
    { label: "Data & Research", score: contentSignals.dataPointCount * 0.5 },
    { label: "Tutorials", score: contentSignals.tutorialCount * 2 },
    { label: "FAQs", score: contentSignals.faqCount * 2.5 },
    { label: "Schema Markup", score: contentSignals.schemaTypeCount * 4 },
  ];
  const topCandidate = candidates.reduce(
    (best, c) => (c.score > best.score ? c : best),
    candidates[0]
  );
  return topCandidate.score === 0 ? "No Strong Area Detected" : topCandidate.label;
}

// ─── Inlined from server/playbook-generator-service.ts ────────────────────────
const INDUSTRY_EXAMPLES_DATA: Record<
  string,
  {
    faqQuestions: string[];
    tutorialTopics: string[];
    caseStudyTitle: string;
    frameworkName: string;
    frameworkProblem: string;
    dataSourceSuggestions: string[];
  }
> = {
  SaaS: {
    faqQuestions: [
      "How does your software integrate with existing tools?",
      "What security certifications does your platform hold?",
      "How long does implementation typically take?",
    ],
    tutorialTopics: [],
    caseStudyTitle: "",
    frameworkName: "",
    frameworkProblem: "",
    dataSourceSuggestions: ["Gartner reports", "G2 benchmarks", "your own product usage data"],
  },
  Legal: {
    faqQuestions: [
      "What should I do immediately after [legal event]?",
      "How long does a [case type] case typically take?",
      "What are your fees and how is billing structured?",
    ],
    tutorialTopics: [],
    caseStudyTitle: "",
    frameworkName: "",
    frameworkProblem: "",
    dataSourceSuggestions: [
      "court records and statistics",
      "bar association data",
      "government legal aid reports",
      "industry legal benchmarks",
    ],
  },
  Healthcare: {
    faqQuestions: [
      "What should I expect during my first appointment?",
      "Do you accept [Insurance Provider]?",
      "How do I prepare for [Procedure or Treatment]?",
    ],
    tutorialTopics: [],
    caseStudyTitle: "",
    frameworkName: "",
    frameworkProblem: "",
    dataSourceSuggestions: [
      "peer-reviewed medical journals",
      "CDC and WHO data",
      "NHS or government health statistics",
      "clinical trial data",
    ],
  },
  Restaurant: {
    faqQuestions: [
      "Do you take reservations and how far in advance?",
      "Do you cater for dietary requirements such as vegan or gluten-free?",
      "Do you offer private dining or event hire?",
    ],
    tutorialTopics: [],
    caseStudyTitle: "",
    frameworkName: "",
    frameworkProblem: "",
    dataSourceSuggestions: [
      "UK Food Standards Agency data",
      "Michelin Guide insights",
      "local tourism board statistics",
      "OpenTable dining trend reports",
    ],
  },
  default: {
    faqQuestions: [
      "What makes your solution different from competitors?",
      "How do I get started?",
      "What support options are available?",
    ],
    tutorialTopics: [],
    caseStudyTitle: "",
    frameworkName: "",
    frameworkProblem: "",
    dataSourceSuggestions: [
      "industry reports",
      "government statistics",
      "original research surveys",
    ],
  },
};

function getIndustryExamples(industry: string, businessType: string) {
  const search = (industry + " " + businessType).toLowerCase();
  if (
    search.includes("saas") ||
    search.includes("software") ||
    search.includes("developer") ||
    search.includes("api") ||
    search.includes("platform")
  ) {
    return INDUSTRY_EXAMPLES_DATA["SaaS"];
  }
  if (
    search.includes("legal") ||
    search.includes("law") ||
    search.includes("attorney") ||
    search.includes("solicitor")
  ) {
    return INDUSTRY_EXAMPLES_DATA["Legal"];
  }
  if (
    search.includes("health") ||
    search.includes("medical") ||
    search.includes("clinic") ||
    search.includes("dental") ||
    search.includes("pharma")
  ) {
    return INDUSTRY_EXAMPLES_DATA["Healthcare"];
  }
  if (
    search.includes("restaurant") ||
    search.includes("food") ||
    search.includes("cafe") ||
    search.includes("dining") ||
    search.includes("catering")
  ) {
    return INDUSTRY_EXAMPLES_DATA["Restaurant"];
  }
  return INDUSTRY_EXAMPLES_DATA["default"];
}

// ─── Inlined from client/src/components/schema-generator.tsx ──────────────────
const INDUSTRY_SCHEMA_MAP: Record<
  string,
  { primaryTypes: string[]; defaultSchemas: string[] }
> = {
  saas: {
    primaryTypes: ["SoftwareApplication", "Product", "FAQPage", "HowTo", "Article"],
    defaultSchemas: ["SoftwareApplication", "FAQPage", "HowTo"],
  },
  legal: {
    primaryTypes: ["LegalService", "LocalBusiness", "FAQPage", "Article", "Person"],
    defaultSchemas: ["LegalService", "FAQPage", "Article"],
  },
  healthcare: {
    primaryTypes: ["MedicalBusiness", "Physician", "FAQPage", "Article", "MedicalCondition"],
    defaultSchemas: ["MedicalBusiness", "FAQPage", "Article"],
  },
  restaurant: {
    primaryTypes: ["Restaurant", "LocalBusiness", "FAQPage", "Menu", "Review"],
    defaultSchemas: ["Restaurant", "FAQPage", "Menu"],
  },
  default: {
    primaryTypes: ["Organization", "LocalBusiness", "FAQPage", "Article", "BreadcrumbList"],
    defaultSchemas: ["Organization", "FAQPage", "Article"],
  },
};

function getIndustrySchemaConfig(industry: string | undefined) {
  if (!industry) return INDUSTRY_SCHEMA_MAP.default;
  const normalized = industry.toLowerCase();
  if (
    normalized.includes("saas") ||
    normalized.includes("software") ||
    normalized.includes("tech")
  ) {
    return INDUSTRY_SCHEMA_MAP.saas;
  }
  if (
    normalized.includes("legal") ||
    normalized.includes("law") ||
    normalized.includes("attorney")
  ) {
    return INDUSTRY_SCHEMA_MAP.legal;
  }
  if (
    normalized.includes("health") ||
    normalized.includes("medical") ||
    normalized.includes("clinic") ||
    normalized.includes("dental")
  ) {
    return INDUSTRY_SCHEMA_MAP.healthcare;
  }
  if (
    normalized.includes("restaurant") ||
    normalized.includes("food") ||
    normalized.includes("cafe") ||
    normalized.includes("dining")
  ) {
    return INDUSTRY_SCHEMA_MAP.restaurant;
  }
  return INDUSTRY_SCHEMA_MAP.default;
}

// ─── Test runner ──────────────────────────────────────────────────────────────
const results: { name: string; passed: boolean; details: string[] }[] = [];

function record(name: string, checks: { ok: boolean; msg: string }[]) {
  const failures = checks.filter((c) => !c.ok);
  results.push({
    name,
    passed: failures.length === 0,
    details: failures.map((f) => "  ✗ " + f.msg),
  });
}

function eq<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    ok,
    msg: ok ? "" : `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  };
}

function contains(arr: string[] | undefined, needle: string, label: string) {
  const ok = !!arr && arr.some((s) => s.toLowerCase().includes(needle.toLowerCase()));
  return {
    ok,
    msg: ok ? "" : `${label}: expected array to contain "${needle}", got ${JSON.stringify(arr)}`,
  };
}

function notContains(arr: string[] | undefined, needle: string, label: string) {
  const ok = !arr || !arr.some((s) => s.toLowerCase().includes(needle.toLowerCase()));
  return {
    ok,
    msg: ok ? "" : `${label}: expected array to NOT contain "${needle}", got ${JSON.stringify(arr)}`,
  };
}

// ── Test 1: strongestArea weighted scoring ──────────────────────────────────
const empty: ContentSignals = {
  caseStudyCount: 0,
  dataPointCount: 0,
  tutorialCount: 0,
  faqCount: 0,
  schemaTypeCount: 0,
};
record("Test 1 — strongestArea weighted scoring", [
  eq(computeStrongestAreaLabel(empty), "No Strong Area Detected", "all zero"),
  eq(
    computeStrongestAreaLabel({ ...empty, caseStudyCount: 5 }),
    "Case Studies",
    "caseStudyCount=5"
  ),
  eq(
    computeStrongestAreaLabel({ ...empty, tutorialCount: 8 }),
    "Tutorials",
    "tutorialCount=8"
  ),
  eq(
    computeStrongestAreaLabel({ ...empty, schemaTypeCount: 3 }),
    "Schema Markup",
    "schemaTypeCount=3"
  ),
  eq(
    computeStrongestAreaLabel({ ...empty, dataPointCount: 40 }),
    "Data & Research",
    "dataPointCount=40"
  ),
]);

// ── Test 2: strongestArea returns null for empty/general ───────────────────
record("Test 2 — strongestArea returns null when no strong area", [
  eq(computeStrongestArea(empty), null, "all-zero signals → null"),
  eq(
    computeStrongestArea({ ...empty, caseStudyCount: 5 }),
    "Case Studies",
    "non-empty → string label"
  ),
]);

// ── Test 3: Playbook industry examples ──────────────────────────────────────
{
  const legal = getIndustryExamples("Legal Services", "");
  const health = getIndustryExamples("Healthcare Medical", "");
  const restaurant = getIndustryExamples("Restaurant", "");
  const saas = getIndustryExamples("SaaS Software", "");
  let unknownOk = true;
  let unknownErr = "";
  let unknown: ReturnType<typeof getIndustryExamples> | null = null;
  try {
    unknown = getIndustryExamples("Unknown Vertical XYZ", "");
  } catch (e) {
    unknownOk = false;
    unknownErr = String(e);
  }

  record("Test 3 — Playbook industry examples", [
    notContains(legal.dataSourceSuggestions, "Gartner", "Legal NOT contain Gartner"),
    notContains(legal.dataSourceSuggestions, "G2", "Legal NOT contain G2"),
    {
      ok:
        contains(health.dataSourceSuggestions, "CDC", "").ok ||
        contains(health.dataSourceSuggestions, "journal", "").ok,
      msg: `Healthcare should contain CDC or journal, got ${JSON.stringify(health.dataSourceSuggestions)}`,
    },
    {
      ok:
        contains(restaurant.faqQuestions, "reservation", "").ok ||
        contains(restaurant.faqQuestions, "dietary", "").ok,
      msg: `Restaurant FAQs should mention reservations or dietary, got ${JSON.stringify(restaurant.faqQuestions)}`,
    },
    contains(saas.dataSourceSuggestions, "G2", "SaaS contains G2"),
    {
      ok: unknownOk && unknown === INDUSTRY_EXAMPLES_DATA["default"],
      msg: unknownOk
        ? `Unknown vertical should return default config, got different reference`
        : `Unknown vertical threw: ${unknownErr}`,
    },
  ]);
}

// ── Test 4: Schema config industry detection ────────────────────────────────
{
  const legal = getIndustrySchemaConfig("Legal Services");
  const saas = getIndustrySchemaConfig("SaaS Software");
  const health = getIndustrySchemaConfig("Healthcare");
  const restaurant = getIndustrySchemaConfig("Restaurant dining");
  let undefOk = true;
  let undefErr = "";
  let undef: ReturnType<typeof getIndustrySchemaConfig> | null = null;
  try {
    undef = getIndustrySchemaConfig(undefined);
  } catch (e) {
    undefOk = false;
    undefErr = String(e);
  }

  record("Test 4 — Schema config industry detection", [
    contains(legal.primaryTypes, "LegalService", "Legal includes LegalService"),
    contains(saas.primaryTypes, "SoftwareApplication", "SaaS includes SoftwareApplication"),
    contains(health.primaryTypes, "MedicalBusiness", "Healthcare includes MedicalBusiness"),
    contains(restaurant.primaryTypes, "Restaurant", "Restaurant includes Restaurant"),
    {
      ok: undefOk && undef === INDUSTRY_SCHEMA_MAP.default,
      msg: undefOk
        ? `undefined should return default config`
        : `undefined threw: ${undefErr}`,
    },
  ]);
}

// ── Test 5: scrapingStatus exists in AuditData schema ───────────────────────
{
  const topic = {
    topic: "x",
    confidence: 50,
    justification: "x",
    platforms: ["chatgpt"],
  };
  const sample = {
    auditResults: {
      overallScore: 50,
      letterGrade: "C" as const,
      platformScores: { chatgpt: 50, perplexity: 50, gemini: 50, claude: 50 },
      strengths: [],
      weaknesses: ["x"],
      technicalFindings: {
        domainAuthority: "Medium" as const,
        contentStructure: "Good" as const,
        schemaMarkup: "Partial" as const,
        entityRecognition: "Moderate" as const,
      },
    },
    contentTopics: {
      authoritative: [topic],
      thoughtLeadership: [topic],
      competitiveAdvantage: [topic],
      emergingOpportunity: [topic],
    },
    recommendations: ["x"],
    scrapingStatus: {
      success: false,
      warning: "Scraping failed",
      errorDetail: "Bot blocked",
    },
  };

  let parseOk = true;
  let parseErr = "";
  try {
    auditDataSchema.parse(sample);
  } catch (e: any) {
    parseOk = false;
    parseErr = e.message;
  }

  // Optional check — should parse without scrapingStatus too
  let optionalOk = true;
  try {
    const { scrapingStatus, ...withoutField } = sample;
    auditDataSchema.parse(withoutField);
  } catch {
    optionalOk = false;
  }

  record("Test 5 — scrapingStatus field exists in AuditData schema", [
    {
      ok: parseOk,
      msg: parseOk ? "" : `Schema rejected sample with scrapingStatus: ${parseErr}`,
    },
    {
      ok: optionalOk,
      msg: optionalOk ? "" : "scrapingStatus should be optional",
    },
  ]);
}

// ── Print results ───────────────────────────────────────────────────────────
console.log("");
results.forEach((r) => {
  console.log(`${r.passed ? "PASS" : "FAIL"} — ${r.name}`);
  r.details.forEach((d) => console.log(d));
});

const passed = results.filter((r) => r.passed).length;
const total = results.length;
console.log("");
console.log("==================");
console.log(`RESULTS: ${passed}/${total} passed`);
console.log("==================");

process.exit(passed === total ? 0 : 1);
