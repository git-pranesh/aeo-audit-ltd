import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { COLLECTIONS } from './firestore-utils';

const DEMO_PREFIX = 'demo-';

interface DemoClient {
  auditId: string;
  domain: string;
  industry: string;
  overallScore: number;
  letterGrade: string;
  platformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number };
  mentionRate: number;
  checklistCompleted: number;
  checklistTotal: number;
  monthsAgo: number;
}

const DEMO_CLIENTS: DemoClient[] = [
  { auditId: 'demo-acmecorp', domain: 'acmecorp.com', industry: 'SaaS', overallScore: 79, letterGrade: 'B+', platformScores: { chatgpt: 82, perplexity: 74, gemini: 81, claude: 79 }, mentionRate: 33, checklistCompleted: 10, checklistTotal: 13, monthsAgo: 1 },
  { auditId: 'demo-cloudtech', domain: 'cloudtech-solutions.io', industry: 'SaaS', overallScore: 68, letterGrade: 'B', platformScores: { chatgpt: 71, perplexity: 64, gemini: 70, claude: 67 }, mentionRate: 25, checklistCompleted: 7, checklistTotal: 12, monthsAgo: 2 },
  { auditId: 'demo-devtools', domain: 'devtools-hub.com', industry: 'SaaS', overallScore: 55, letterGrade: 'C+', platformScores: { chatgpt: 58, perplexity: 51, gemini: 57, claude: 54 }, mentionRate: 17, checklistCompleted: 4, checklistTotal: 11, monthsAgo: 1 },
  { auditId: 'demo-saasanalytics', domain: 'saas-analytics.co', industry: 'SaaS', overallScore: 42, letterGrade: 'D+', platformScores: { chatgpt: 44, perplexity: 39, gemini: 45, claude: 40 }, mentionRate: 8, checklistCompleted: 2, checklistTotal: 13, monthsAgo: 3 },
  { auditId: 'demo-luxeretail', domain: 'luxe-retail.com', industry: 'E-commerce', overallScore: 71, letterGrade: 'B', platformScores: { chatgpt: 74, perplexity: 68, gemini: 73, claude: 69 }, mentionRate: 28, checklistCompleted: 8, checklistTotal: 11, monthsAgo: 1 },
  { auditId: 'demo-shopnow', domain: 'shopnow-deals.com', industry: 'E-commerce', overallScore: 48, letterGrade: 'D+', platformScores: { chatgpt: 50, perplexity: 45, gemini: 51, claude: 46 }, mentionRate: 10, checklistCompleted: 3, checklistTotal: 12, monthsAgo: 2 },
  { auditId: 'demo-fashionforward', domain: 'fashion-forward.co', industry: 'E-commerce', overallScore: 84, letterGrade: 'A-', platformScores: { chatgpt: 87, perplexity: 80, gemini: 86, claude: 83 }, mentionRate: 38, checklistCompleted: 11, checklistTotal: 13, monthsAgo: 1 },
  { auditId: 'demo-wellnesscare', domain: 'wellnesscare-clinic.com', industry: 'Healthcare', overallScore: 61, letterGrade: 'B-', platformScores: { chatgpt: 64, perplexity: 57, gemini: 63, claude: 60 }, mentionRate: 19, checklistCompleted: 5, checklistTotal: 10, monthsAgo: 2 },
  { auditId: 'demo-medtech', domain: 'medtech-innovations.com', industry: 'Healthcare', overallScore: 37, letterGrade: 'D', platformScores: { chatgpt: 39, perplexity: 34, gemini: 40, claude: 35 }, mentionRate: 5, checklistCompleted: 1, checklistTotal: 13, monthsAgo: 4 },
  { auditId: 'demo-enterprise', domain: 'enterprise-solutions.net', industry: 'B2B', overallScore: 73, letterGrade: 'B+', platformScores: { chatgpt: 76, perplexity: 69, gemini: 75, claude: 72 }, mentionRate: 31, checklistCompleted: 9, checklistTotal: 12, monthsAgo: 1 },
  { auditId: 'demo-b2bgrowth', domain: 'b2b-growth.io', industry: 'B2B', overallScore: 57, letterGrade: 'C+', platformScores: { chatgpt: 60, perplexity: 53, gemini: 59, claude: 56 }, mentionRate: 14, checklistCompleted: 5, checklistTotal: 11, monthsAgo: 3 },
  { auditId: 'demo-consulting', domain: 'consulting-pro.com', industry: 'B2B', overallScore: 30, letterGrade: 'F', platformScores: { chatgpt: 32, perplexity: 27, gemini: 33, claude: 28 }, mentionRate: 2, checklistCompleted: 0, checklistTotal: 13, monthsAgo: 5 },
  { auditId: 'demo-creativeagency', domain: 'creative-agency.co', industry: 'Marketing', overallScore: 66, letterGrade: 'B-', platformScores: { chatgpt: 69, perplexity: 62, gemini: 68, claude: 65 }, mentionRate: 22, checklistCompleted: 6, checklistTotal: 10, monthsAgo: 1 },
  { auditId: 'demo-digitalmarketing', domain: 'digital-marketing-pro.com', industry: 'Marketing', overallScore: 52, letterGrade: 'C', platformScores: { chatgpt: 55, perplexity: 48, gemini: 54, claude: 51 }, mentionRate: 12, checklistCompleted: 3, checklistTotal: 11, monthsAgo: 2 },
  { auditId: 'demo-brandstudio', domain: 'brand-studio.io', industry: 'Marketing', overallScore: 45, letterGrade: 'D+', platformScores: { chatgpt: 47, perplexity: 42, gemini: 48, claude: 43 }, mentionRate: 9, checklistCompleted: 2, checklistTotal: 12, monthsAgo: 3 },
];

function makeChecklistItems(client: DemoClient) {
  const allActions = [
    { actionId: `add-faq-schema-to-your-top-pages-chatgpt`, title: 'Add FAQ Schema to Your Top Pages', priority: 'critical', targetPlatform: 'chatgpt', estimatedImpact: 'Could improve ChatGPT score by 10-15 points', difficulty: 'easy' },
    { actionId: `create-step-by-step-tutorial-content-chatgpt`, title: 'Create Step-by-Step Tutorial Content', priority: 'high', targetPlatform: 'chatgpt', estimatedImpact: 'Could improve ChatGPT score by 12-18 points', difficulty: 'medium' },
    { actionId: `implement-article-howto-schema-markup-gemini`, title: 'Implement Article & HowTo Schema Markup', priority: 'high', targetPlatform: 'gemini', estimatedImpact: 'Could improve Gemini score by 12-18 points', difficulty: 'easy' },
    { actionId: `publish-customer-case-studies-claude`, title: 'Publish Customer Case Studies', priority: 'high', targetPlatform: 'claude', estimatedImpact: 'Could improve Claude score by 8-12 points', difficulty: 'medium' },
    { actionId: `add-statistics-and-data-to-existing-content-perplexity`, title: 'Add Statistics and Data to Existing Content', priority: 'high', targetPlatform: 'perplexity', estimatedImpact: 'Could improve Perplexity score by 10-15 points', difficulty: 'easy' },
    { actionId: `create-a-proprietary-framework-article-claude`, title: 'Create a Proprietary Framework Article', priority: 'medium', targetPlatform: 'claude', estimatedImpact: 'Could improve Claude score by 8-12 points', difficulty: 'medium' },
    { actionId: `add-research-citations-to-key-pages-perplexity`, title: 'Add Research Citations to Key Pages', priority: 'medium', targetPlatform: 'perplexity', estimatedImpact: 'Could improve Perplexity score by 8-12 points', difficulty: 'easy' },
    { actionId: `convert-tutorials-into-how-to-guides-chatgpt`, title: 'Convert Tutorials into How-To Guides', priority: 'medium', targetPlatform: 'chatgpt', estimatedImpact: 'Could improve ChatGPT score by 5-8 points', difficulty: 'easy' },
    { actionId: `develop-long-form-authoritative-content-claude`, title: 'Develop Long-Form Authoritative Content', priority: 'medium', targetPlatform: 'claude', estimatedImpact: 'Could improve Claude score by 6-10 points', difficulty: 'hard' },
    { actionId: `start-regular-blog-publishing-all`, title: 'Start Regular Blog Publishing', priority: 'high', targetPlatform: 'all', estimatedImpact: 'Could improve all platform scores by 8-15 points', difficulty: 'medium' },
    { actionId: `build-comprehensive-documentation-perplexity`, title: 'Build Comprehensive Documentation', priority: 'high', targetPlatform: 'perplexity', estimatedImpact: 'Could improve Perplexity and Claude scores by 10-15 points', difficulty: 'hard' },
    { actionId: `publish-original-research-or-industry-report-perplexity`, title: 'Publish Original Research or Industry Report', priority: 'medium', targetPlatform: 'perplexity', estimatedImpact: 'Could improve Perplexity score by 8-12 points', difficulty: 'hard' },
    { actionId: `deepen-existing-content-with-analysis-claude`, title: 'Deepen Existing Content with Analysis', priority: 'medium', targetPlatform: 'claude', estimatedImpact: 'Could improve Claude score by 5-10 points', difficulty: 'medium' },
  ];

  const items = allActions.slice(0, client.checklistTotal);
  return items.map((action, i) => ({
    ...action,
    completed: i < client.checklistCompleted,
    completedAt: i < client.checklistCompleted ? new Date(Date.now() - (client.checklistCompleted - i) * 3 * 24 * 60 * 60 * 1000).toISOString() : null,
    status: i < 3 ? 'carried_over' : 'new',
  }));
}

function makeScoreHistory(client: DemoClient) {
  const entries = [];
  const baseScore = Math.max(20, client.overallScore - 30);
  for (let month = 5; month >= 0; month--) {
    const progress = (5 - month) / 5;
    const score = Math.round(baseScore + (client.overallScore - baseScore) * progress + (Math.random() * 4 - 2));
    const date = new Date();
    date.setMonth(date.getMonth() - month);
    const chatgpt = Math.round(client.platformScores.chatgpt - (5 - (5 - month)) * 5 + Math.random() * 3);
    const perplexity = Math.round(client.platformScores.perplexity - (5 - (5 - month)) * 5 + Math.random() * 3);
    const gemini = Math.round(client.platformScores.gemini - (5 - (5 - month)) * 5 + Math.random() * 3);
    const claude = Math.round(client.platformScores.claude - (5 - (5 - month)) * 5 + Math.random() * 3);
    entries.push({
      runId: `demo-run-${client.auditId}-m${month}`,
      runAt: date.toISOString(),
      type: month === 5 ? 'initial' : 'reaudit',
      overallScore: Math.min(100, Math.max(10, score)),
      letterGrade: score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F',
      platformScores: {
        chatgpt: Math.min(100, Math.max(10, chatgpt)),
        perplexity: Math.min(100, Math.max(10, perplexity)),
        gemini: Math.min(100, Math.max(10, gemini)),
        claude: Math.min(100, Math.max(10, claude)),
      },
    });
  }
  return entries;
}

function makeAuditData(client: DemoClient) {
  const competitors = [
    { name: 'HubSpot', timesFound: 8 },
    { name: 'Salesforce', timesFound: 6 },
    { name: 'Intercom', timesFound: 4 },
  ];

  return {
    auditResults: {
      overallScore: client.overallScore,
      letterGrade: client.letterGrade,
      platformScores: client.platformScores,
      strengths: [
        'Clear value proposition on homepage',
        'Good use of headings and content structure',
        'Active blog with relevant industry topics',
      ],
      weaknesses: [
        'Limited FAQ content and schema markup',
        'Few tutorial or how-to guide pages',
        'Low citation density — insufficient data points referenced',
      ],
      technicalFindings: {
        domainAuthority: client.overallScore >= 65 ? 'High' : client.overallScore >= 45 ? 'Medium' : 'Low',
        contentStructure: client.overallScore >= 70 ? 'Excellent' : client.overallScore >= 55 ? 'Good' : 'Fair',
        schemaMarkup: client.overallScore >= 65 ? 'Partial' : 'Missing',
        entityRecognition: client.overallScore >= 70 ? 'Strong' : client.overallScore >= 50 ? 'Moderate' : 'Weak',
      },
    },
    citationSnapshot: {
      totalPromptsChecked: 12,
      mentionedCount: Math.round(12 * client.mentionRate / 100),
      mentionRate: client.mentionRate,
      snapshotDate: new Date(Date.now() - client.monthsAgo * 30 * 24 * 60 * 60 * 1000).toISOString(),
      promptResults: [],
      topCompetitorsCited: competitors,
    },
    contentTopics: {
      authoritative: [
        { topic: `The Complete Guide to ${client.industry} AI Optimization`, confidence: 85, justification: 'High search intent, low competition', platforms: ['chatgpt', 'claude'], difficulty: 'Medium', priorityTier: 'High Impact', contentType: 'guide', searchVolume: 'Estimated: 2,000-4,000/month' },
        { topic: `How ${client.industry} Leaders Use AI Tools in 2026`, confidence: 78, justification: 'Trending topic, high relevance', platforms: ['perplexity', 'gemini'], difficulty: 'Easy', priorityTier: 'Quick Win', contentType: 'data-driven', searchVolume: 'Estimated: 1,500-3,000/month' },
      ],
      thoughtLeadership: [
        { topic: `The Future of ${client.industry}: AI Predictions for 2027`, confidence: 72, justification: 'Positions brand as thought leader', platforms: ['claude', 'chatgpt'], difficulty: 'Hard', priorityTier: 'Long-term', contentType: 'framework', searchVolume: 'Estimated: 800-1,500/month' },
      ],
      competitiveAdvantage: [
        { topic: `${client.industry} vs Traditional Approaches: An Honest Comparison`, confidence: 80, justification: 'Direct competitor gap identified', platforms: ['chatgpt', 'perplexity'], difficulty: 'Medium', priorityTier: 'High Impact', contentType: 'case-study', searchVolume: 'Estimated: 1,200-2,500/month' },
      ],
      emergingOpportunity: [
        { topic: `AI-Powered ${client.industry} Tools: What to Know Before You Buy`, confidence: 68, justification: 'Emerging buyer intent category', platforms: ['perplexity', 'gemini'], difficulty: 'Easy', priorityTier: 'Quick Win', contentType: 'faq', searchVolume: 'Estimated: 600-1,200/month' },
      ],
    },
    playbook: {
      actions: makeChecklistItems(client).map(item => ({
        id: item.actionId,
        title: item.title,
        priority: item.priority,
        targetPlatform: item.targetPlatform,
        estimatedImpact: item.estimatedImpact,
        difficulty: item.difficulty,
        currentState: 'Not detected',
        targetState: 'Fully implemented',
        stepByStep: ['Identify target pages', 'Implement the change', 'Verify and monitor'],
      })),
      quickWins: makeChecklistItems(client).filter(a => a.difficulty === 'easy' && (a.priority === 'critical' || a.priority === 'high')),
      estimatedScoreImprovement: {
        chatgpt: Math.round((100 - client.platformScores.chatgpt) * 0.3),
        perplexity: Math.round((100 - client.platformScores.perplexity) * 0.3),
        gemini: Math.round((100 - client.platformScores.gemini) * 0.3),
        claude: Math.round((100 - client.platformScores.claude) * 0.3),
        overall: Math.round((100 - client.overallScore) * 0.3),
      },
    },
    companyIntelligence: {
      industry: client.industry,
      businessType: 'B2B',
      targetAudience: 'Business professionals',
      valueProposition: `Leading ${client.industry} solutions provider`,
    },
    contentSignals: {
      tutorialCount: Math.floor(client.overallScore / 15),
      howToGuideCount: Math.floor(client.overallScore / 20),
      faqSectionCount: Math.floor(client.overallScore / 25),
      schemaTypeCount: Math.floor(client.overallScore / 30),
      caseStudyCount: Math.floor(client.overallScore / 20),
      dataPointCount: Math.floor(client.overallScore / 5),
      externalLinkCount: Math.floor(client.overallScore / 4),
      blogPostCount: Math.floor(client.overallScore / 4),
      documentationPageCount: Math.floor(client.overallScore / 10),
    },
  };
}

export async function seedDemoData(userId: string): Promise<{ seeded: number }> {
  const auditsRef = collection(db, COLLECTIONS.AUDITS);
  let seeded = 0;

  for (const client of DEMO_CLIENTS) {
    const auditId = `${DEMO_PREFIX}${userId.slice(0, 6)}-${client.auditId.replace('demo-', '')}`;
    const auditRef = doc(auditsRef, auditId);

    const generatedAt = new Date();
    generatedAt.setMonth(generatedAt.getMonth() - client.monthsAgo);

    const checklist = makeChecklistItems(client);

    await setDoc(auditRef, {
      auditId,
      userId,
      websiteUrl: `https://${client.domain}`,
      generatedAt: generatedAt.toISOString(),
      lastReauditAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      isDemoData: true,
      auditData: makeAuditData(client),
      checklist,
      checklistArchive: [
        {
          actionId: `old-action-${client.auditId}`,
          title: 'Old resolved action from previous audit',
          priority: 'medium',
          targetPlatform: 'chatgpt',
          completed: true,
          completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          resolvedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          retiredReason: 'resolved_by_reaudit',
        },
      ],
      checklistMeta: {
        carriedOverCount: 3,
        carriedOverCompletedCount: Math.min(3, checklist.filter(i => i.status === 'carried_over' && i.completed).length),
        newCount: client.checklistTotal - 3,
        resolvedCount: 1,
        lastMergedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    const historyEntries = makeScoreHistory(client);
    for (const entry of historyEntries) {
      const historyRef = doc(collection(db, COLLECTIONS.AUDITS, auditId, 'scoreHistory'), entry.runId);
      await setDoc(historyRef, entry);
    }

    seeded++;
  }

  return { seeded };
}

export async function clearDemoData(userId: string): Promise<{ deleted: number }> {
  const auditsRef = collection(db, COLLECTIONS.AUDITS);
  const q = query(auditsRef, where('userId', '==', userId), where('isDemoData', '==', true));
  const snapshot = await getDocs(q);

  let deleted = 0;
  for (const auditDoc of snapshot.docs) {
    const historyRef = collection(db, COLLECTIONS.AUDITS, auditDoc.id, 'scoreHistory');
    const historySnap = await getDocs(historyRef);
    const batch = writeBatch(db);
    historySnap.docs.forEach(h => batch.delete(h.ref));
    batch.delete(auditDoc.ref);
    await batch.commit();
    deleted++;
  }

  return { deleted };
}

export async function getDemoDataCount(userId: string): Promise<number> {
  const auditsRef = collection(db, COLLECTIONS.AUDITS);
  const q = query(auditsRef, where('userId', '==', userId), where('isDemoData', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.size;
}
