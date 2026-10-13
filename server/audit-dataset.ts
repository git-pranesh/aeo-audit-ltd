/**
 * Audit Dataset Service
 *
 * THE MOAT. Every audit run through the cloud version feeds this dataset.
 * Self-hosted / open-source users never contribute here.
 *
 * Over time this becomes: "We know what content properties correlate with
 * AI citation, across 50,000 real audits." No competitor can replicate
 * this without starting from audit #1.
 *
 * Storage: Firestore collection `audit_dataset`
 * Each document = one audit, keyed by auditId.
 *
 * Schema is append-only and additive. Never delete, never mutate.
 * Add fields in new audits; old docs just won't have them.
 */

import type { ContentSignals } from './content-signal-service';

export interface DatasetRecord {
  // Identity
  auditId: string;
  websiteUrl: string;
  domain: string;
  recordedAt: string;          // ISO timestamp

  // Site classification (user-confirmed)
  industry: string;
  industryKey: string;         // normalized: saas | legal | healthcare | etc.
  businessType: string;
  targetAudience: string;

  // Scores
  overallScore: number;
  letterGrade: string;
  platformScores: {
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
  scoreBreakdown: {
    contentDepth: number;
    structureTechnical: number;
    researchCitations: number;
    authority: number;
  };

  // Raw content signals (the ground truth)
  signals: {
    tutorialCount: number;
    howToGuideCount: number;
    faqSectionCount: number;
    caseStudyCount: number;
    blogPostCount: number;
    documentationPageCount: number;
    schemaTypeCount: number;
    dataPointCount: number;
    statisticMentionCount: number;
    externalLinkCount: number;
    frameworkMentionCount: number;
    longFormContentScore: number;
    nuancedTermCount: number;
    totalPageCount: number;
  };

  // Citation data (if snapshot was run)
  citationMentionRate: number | null;   // 0-100, null if no snapshot
  citationPromptsChecked: number | null;
  topCompetitors: string[];             // competitor names extracted

  // Playbook
  playbookActionCount: number;
  quickWinCount: number;

  // Plan context (anonymized — used for aggregate stats only)
  planName: string;

  // Quality flags
  scrapingSuccess: boolean;
  signalQuality: 'minimal' | 'normal';
  largeSiteDetected: boolean;
}

function extractDomainSimple(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function normalizeIndustryKey(industry: string): string {
  const lower = (industry || '').toLowerCase();
  if (/legal|law|attorney|lawyer/.test(lower)) return 'legal';
  if (/healthcare|health|medical|hospital|clinic|dental|ambulatory|ehr/.test(lower)) return 'healthcare';
  if (/real estate|property|realtor|realty|mortgage/.test(lower)) return 'realestate';
  if (/ecommerce|e-commerce|retail|online store|shop/.test(lower)) return 'ecommerce';
  if (/marketing|advertising|agency|seo/.test(lower)) return 'marketing';
  if (/saas|software|technology|tech|platform|cloud|developer|api/.test(lower)) return 'saas';
  return 'general';
}

interface AuditDatasetInput {
  auditId: string;
  websiteUrl: string;
  industry: string;
  businessType: string;
  targetAudience: string;
  overallScore: number;
  letterGrade: string;
  platformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number };
  scoreBreakdown: { contentDepth: number; structureTechnical: number; researchCitations: number; authority: number };
  signals: ContentSignals;
  citationMentionRate: number | null;
  citationPromptsChecked: number | null;
  topCompetitors: string[];
  playbookActionCount: number;
  quickWinCount: number;
  planName: string;
  scrapingSuccess: boolean;
  signalQuality: 'minimal' | 'normal';
  largeSiteDetected: boolean;
}

/**
 * Write one audit record to the central dataset.
 * Non-blocking — never throws, logs warnings only.
 * Safe to call fire-and-forget after every completed audit.
 */
export async function writeToDataset(input: AuditDatasetInput): Promise<void> {
  try {
    const record: DatasetRecord = {
      auditId: input.auditId,
      websiteUrl: input.websiteUrl,
      domain: extractDomainSimple(input.websiteUrl),
      recordedAt: new Date().toISOString(),

      industry: input.industry,
      industryKey: normalizeIndustryKey(input.industry),
      businessType: input.businessType,
      targetAudience: input.targetAudience,

      overallScore: input.overallScore,
      letterGrade: input.letterGrade,
      platformScores: input.platformScores,
      scoreBreakdown: input.scoreBreakdown,

      signals: {
        tutorialCount: input.signals.tutorialCount,
        howToGuideCount: input.signals.howToGuideCount,
        faqSectionCount: input.signals.faqSectionCount,
        caseStudyCount: input.signals.caseStudyCount,
        blogPostCount: input.signals.blogPostCount,
        documentationPageCount: input.signals.documentationPageCount,
        schemaTypeCount: input.signals.schemaTypeCount,
        dataPointCount: input.signals.dataPointCount,
        statisticMentionCount: input.signals.statisticMentionCount,
        externalLinkCount: input.signals.externalLinkCount,
        frameworkMentionCount: input.signals.frameworkMentionCount,
        longFormContentScore: input.signals.longFormContentScore,
        nuancedTermCount: input.signals.nuancedTermCount,
        totalPageCount: input.signals.totalPageCount,
      },

      citationMentionRate: input.citationMentionRate,
      citationPromptsChecked: input.citationPromptsChecked,
      topCompetitors: input.topCompetitors,

      playbookActionCount: input.playbookActionCount,
      quickWinCount: input.quickWinCount,

      planName: input.planName,
      scrapingSuccess: input.scrapingSuccess,
      signalQuality: input.signalQuality,
      largeSiteDetected: input.largeSiteDetected,
    };

    const { initializeApp, getApp } = await import('firebase/app');
    const { getFirestore, doc, setDoc } = await import('firebase/firestore');

    let app;
    try {
      app = getApp('dataset-app');
    } catch {
      app = initializeApp(
        {
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        },
        'dataset-app'
      );
    }

    const db = getFirestore(app);
    await setDoc(doc(db, 'audit_dataset', input.auditId), record);

    console.log(`📊 Dataset: wrote audit ${input.auditId} (${record.domain}, score ${record.overallScore}, industry ${record.industryKey})`);
  } catch (err: any) {
    // Non-blocking — dataset write failure must never break an audit response
    console.warn(`⚠️ Dataset write failed for ${input.auditId}:`, err?.message ?? err);
  }
}

/**
 * Aggregate dataset stats for a given industry key.
 * Used by the /api/v1/benchmarks endpoint to return live industry averages
 * once enough data accumulates (returns null if < MIN_SAMPLE_SIZE audits).
 *
 * In early days (< 50 audits per industry) the hardcoded INDUSTRY_BENCHMARKS
 * in industry-benchmarks.ts are used instead.
 */
export interface LiveBenchmarkStats {
  industryKey: string;
  sampleSize: number;
  avgOverallScore: number;
  avgPlatformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number };
  avgSignals: {
    tutorials: number;
    faqs: number;
    caseStudies: number;
    schemaTypes: number;
    dataPoints: number;
  };
  top10pctScore: number;
  computedAt: string;
}

const MIN_SAMPLE_SIZE = 50; // minimum audits before we trust live stats

export async function getLiveBenchmarks(industryKey: string): Promise<LiveBenchmarkStats | null> {
  try {
    const { initializeApp, getApp } = await import('firebase/app');
    const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');

    let app;
    try {
      app = getApp('dataset-app');
    } catch {
      app = initializeApp(
        {
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        },
        'dataset-app'
      );
    }

    const db = getFirestore(app);
    const q = query(
      collection(db, 'audit_dataset'),
      where('industryKey', '==', industryKey),
      where('signalQuality', '==', 'normal')
    );

    const snapshot = await getDocs(q);
    const records = snapshot.docs.map(d => d.data() as DatasetRecord);

    if (records.length < MIN_SAMPLE_SIZE) {
      console.log(`📊 Dataset: ${records.length} audits for industry '${industryKey}' — below ${MIN_SAMPLE_SIZE} minimum, returning null`);
      return null;
    }

    const n = records.length;
    const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const percentile = (arr: number[], p: number) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * p)] ?? 0;
    };

    const overallScores = records.map(r => r.overallScore);

    return {
      industryKey,
      sampleSize: n,
      avgOverallScore: avg(overallScores),
      avgPlatformScores: {
        chatgpt: avg(records.map(r => r.platformScores.chatgpt)),
        perplexity: avg(records.map(r => r.platformScores.perplexity)),
        gemini: avg(records.map(r => r.platformScores.gemini)),
        claude: avg(records.map(r => r.platformScores.claude)),
      },
      avgSignals: {
        tutorials: avg(records.map(r => r.signals.tutorialCount)),
        faqs: avg(records.map(r => r.signals.faqSectionCount)),
        caseStudies: avg(records.map(r => r.signals.caseStudyCount)),
        schemaTypes: avg(records.map(r => r.signals.schemaTypeCount)),
        dataPoints: avg(records.map(r => r.signals.dataPointCount)),
      },
      top10pctScore: percentile(overallScores, 0.9),
      computedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn(`⚠️ getLiveBenchmarks failed for '${industryKey}':`, err?.message ?? err);
    return null;
  }
}
