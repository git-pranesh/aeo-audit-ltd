/**
 * Reproducible runtime proof for Task #15 (playbook & topic verification).
 * Run from the project root:  npx tsx docs/proofs/verify-playbook-topics.ts
 *
 * Exercises the real deterministic playbook generator, the real topic
 * deduplication functions, and the real per-plan feature flags on fixed
 * inputs so the ledger's runtime evidence (PT-01..PT-06) can be re-generated
 * exactly by any auditor.
 */
import { generatePlaybook } from '../../server/playbook-generator-service';
import { deduplicateTopics, processTopics } from '../../server/topic-deduplication-service';
import { getFeatureFlags } from '../../shared/feature-flags';

// ---- PT-01 / PT-02: deterministic playbook + Quick Wins subset ----
// Empty signals -> every gap fires, so we get the full action set.
const emptySignals: any = {
  tutorialCount: 0, howToGuideCount: 0, faqSectionCount: 0, stepByStepListCount: 0,
  externalLinkCount: 0, dataPointCount: 0, statisticMentionCount: 0, researchTermCount: 0,
  schemaTypeCount: 0, headingHierarchyScore: 0, hasStructuredData: false, imageCount: 0,
  caseStudyCount: 0, frameworkMentionCount: 0, longFormContentScore: 0, nuancedTermCount: 0,
  blogPostCount: 0, documentationPageCount: 0, totalPageCount: 200, contentDepthScore: 0,
};
const scoring = { platformScores: { chatgpt: 0, perplexity: 0, gemini: 0, claude: 0 }, overallScore: 0 };
const company = { industry: 'SaaS', businessType: 'Software' };

const pb1 = generatePlaybook(emptySignals, scoring, company, 'Acme');
const pb2 = generatePlaybook(emptySignals, scoring, company, 'Acme');
console.log('PLAYBOOK actions:', pb1.actions.length,
  '| priorities:', pb1.actions.map(a => a.priority).join(','));
console.log('PLAYBOOK withCodeSnippet:', pb1.actions.filter(a => a.codeSnippet).length,
  '| withContentTemplate:', pb1.actions.filter(a => a.contentTemplate).length);
console.log('PLAYBOOK sorted-by-priority:',
  JSON.stringify(pb1.actions.map(a => a.priority)) ===
  JSON.stringify([...pb1.actions.map(a => a.priority)].sort(
    (x, y) => ({critical:0,high:1,medium:2,low:3} as any)[x] - ({critical:0,high:1,medium:2,low:3} as any)[y])));
console.log('PLAYBOOK deterministic(2 runs identical):',
  JSON.stringify(pb1) === JSON.stringify(pb2));
console.log('QUICKWINS count:', pb1.quickWins.length,
  '| all easy+critical/high:',
  pb1.quickWins.every(a => a.difficulty === 'easy' && (a.priority === 'critical' || a.priority === 'high')));

// ---- PT-05: topic dedup is keyword/word-overlap (Jaccard), NOT cosine ----
const topics: any[] = [
  { topic: 'How to improve ChatGPT visibility for SaaS', targetPlatform: 'chatgpt', contentType: 'how-to' },
  { topic: 'How to improve ChatGPT visibility for SaaS companies', targetPlatform: 'chatgpt', contentType: 'how-to' }, // near-dup -> removed
  { topic: 'How to improve Perplexity citations for SaaS', targetPlatform: 'perplexity', contentType: 'how-to' }, // same words, diff platform -> kept
  { topic: 'Case study: cutting churn with onboarding', targetPlatform: 'claude', contentType: 'case-study' }, // distinct -> kept
];
const deduped = deduplicateTopics(topics, 0.65);
console.log('DEDUP in:', topics.length, '-> out:', deduped.length,
  '| kept:', JSON.stringify(deduped.map(t => t.topic.slice(0, 28))));

// content-type diversity cap (processTopics maxPerType)
const manyHowTo = Array.from({ length: 15 }, (_, i) => ({ topic: `Unique widget guide number ${i}`, contentType: 'how-to' }));
console.log('DIVERSITY in:', manyHowTo.length, '-> out(maxPerType=12):', processTopics(manyHowTo, { maxPerType: 12 }).length);

// ---- PT-03 / PT-04 / PT-06: per-plan flags (source of truth for enforcement) ----
for (const plan of ['free', 'starter', 'pro', 'enterprise', 'lifetime']) {
  const f = getFeatureFlags(plan);
  console.log(`FLAGS ${plan}: topicsPerCategory=${f.topicsPerCategory} playbooks=${f.playbooks} quickWinsLimit=${f.quickWinsLimit}`);
}
