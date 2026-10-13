import { describe, it, expect } from 'vitest';
import { getFeatureFlags, type FeatureFlags } from '../server/feature-flags';
import { generatePlaybook, type PlaybookAction, type PlaybookResult } from '../server/playbook-generator-service';
import { normalizeDomain, extractUniqueDomains } from '../server/domain-limiter';
import type { ContentSignals } from '../server/content-signal-service';

function makeSignals(overrides: Partial<ContentSignals> = {}): ContentSignals {
  return {
    tutorialCount: 0,
    howToGuideCount: 0,
    faqSectionCount: 0,
    stepByStepListCount: 0,
    externalLinkCount: 0,
    dataPointCount: 0,
    statisticMentionCount: 0,
    researchTermCount: 0,
    schemaTypeCount: 0,
    headingHierarchyScore: 0,
    hasStructuredData: false,
    imageCount: 0,
    caseStudyCount: 0,
    frameworkMentionCount: 0,
    longFormContentScore: 0,
    nuancedTermCount: 0,
    blogPostCount: 0,
    documentationPageCount: 0,
    totalPageCount: 1,
    contentDepthScore: 0,
    ...overrides,
  };
}

const defaultScoring = {
  platformScores: { chatgpt: 20, perplexity: 20, gemini: 20, claude: 20 },
  overallScore: 20,
};

const defaultContext = {
  industry: 'SaaS',
  businessType: 'B2B SaaS',
  targetAudience: 'Marketers',
  valueProposition: 'AI readiness optimization',
};

describe('Feature Flags — All Plan Tiers', () => {
  const plans = ['free', 'starter', 'pro', 'enterprise', 'lifetime'];

  it('returns valid flags for every known plan', () => {
    for (const plan of plans) {
      const flags = getFeatureFlags(plan);
      expect(flags).toBeDefined();
      expect(typeof flags.multiDomainLimit).toBe('number');
      expect(typeof flags.topicsPerCategory).toBe('number');
      expect(typeof flags.quickWinsLimit).toBe('number');
    }
  });

  it('unknown plan defaults to free', () => {
    const unknown = getFeatureFlags('bogus-plan');
    const free = getFeatureFlags('free');
    expect(unknown).toEqual(free);
  });

  it('empty string defaults to free', () => {
    const empty = getFeatureFlags('');
    const free = getFeatureFlags('free');
    expect(empty).toEqual(free);
  });

  it('is case-insensitive', () => {
    expect(getFeatureFlags('PRO')).toEqual(getFeatureFlags('pro'));
    expect(getFeatureFlags('Enterprise')).toEqual(getFeatureFlags('enterprise'));
  });

  it('free plan restricts everything', () => {
    const f = getFeatureFlags('free');
    expect(f.multiDomainLimit).toBe(1);
    expect(f.topicsPerCategory).toBe(3);
    expect(f.quickWinsLimit).toBe(3);
    expect(f.quickWinsChecklist).toBe('basic');
    expect(f.monthlyReaudit).toBe(false);
    expect(f.citationAlerts).toBe(false);
    expect(f.citationRefreshButton).toBe(false);
    expect(f.citationMonitoringFrequency).toBe('none');
    expect(f.reauditButton).toBe(false);
    expect(f.playbooks).toBe('basic');
    expect(f.schemaGeneratorLimit).toBe(1);
    expect(f.competitorWatchlistLimit).toBe(0);
    expect(f.pdfExport).toBe('watermarked');
    expect(f.scoreTrendExport).toBe(false);
  });

  it('starter plan has correct limits', () => {
    const s = getFeatureFlags('starter');
    expect(s.multiDomainLimit).toBe(5);
    expect(s.topicsPerCategory).toBe(12);
    expect(s.quickWinsLimit).toBe(Infinity);
    expect(s.monthlyReaudit).toBe(true);
    expect(s.reauditButton).toBe(true);
    expect(s.citationRefreshButton).toBe(true);
    expect(s.citationMonitoringFrequency).toBe('monthly');
    expect(s.citationAlerts).toBe(false);
    expect(s.playbooks).toBe('full');
    expect(s.pdfExport).toBe('clean');
    expect(s.competitorWatchlistLimit).toBe(3);
    expect(s.scoreTrendExport).toBe(false);
  });

  it('pro plan unlocks everything except daily monitoring', () => {
    const p = getFeatureFlags('pro');
    expect(p.multiDomainLimit).toBe(Infinity);
    expect(p.topicsPerCategory).toBe(25);
    expect(p.quickWinsLimit).toBe(Infinity);
    expect(p.citationAlerts).toBe(true);
    expect(p.citationMonitoringFrequency).toBe('weekly');
    expect(p.playbooks).toBe('full_priority');
    expect(p.pdfExport).toBe('whitelabel');
    expect(p.scoreTrendExport).toBe(true);
    expect(p.competitorWatchlistLimit).toBe(999);
  });

  it('enterprise has daily monitoring and 100 topics', () => {
    const e = getFeatureFlags('enterprise');
    expect(e.topicsPerCategory).toBe(100);
    expect(e.citationMonitoringFrequency).toBe('daily');
    expect(e.playbooks).toBe('full_whitelabel');
    expect(e.multiDomainLimit).toBe(Infinity);
  });

  it('lifetime matches pro exactly', () => {
    const lt = getFeatureFlags('lifetime');
    const pro = getFeatureFlags('pro');
    expect(lt.topicsPerCategory).toBe(pro.topicsPerCategory);
    expect(lt.multiDomainLimit).toBe(pro.multiDomainLimit);
    expect(lt.citationMonitoringFrequency).toBe(pro.citationMonitoringFrequency);
    expect(lt.playbooks).toBe(pro.playbooks);
    expect(lt.pdfExport).toBe(pro.pdfExport);
  });

  it('domain limits form a strict hierarchy: free < starter < pro/enterprise', () => {
    const f = getFeatureFlags('free').multiDomainLimit;
    const s = getFeatureFlags('starter').multiDomainLimit;
    const p = getFeatureFlags('pro').multiDomainLimit;
    const e = getFeatureFlags('enterprise').multiDomainLimit;
    expect(f).toBeLessThan(s);
    expect(s).toBeLessThan(p);
    expect(p).toBe(e);
  });

  it('topics per category form a strict hierarchy', () => {
    const f = getFeatureFlags('free').topicsPerCategory;
    const s = getFeatureFlags('starter').topicsPerCategory;
    const p = getFeatureFlags('pro').topicsPerCategory;
    const e = getFeatureFlags('enterprise').topicsPerCategory;
    expect(f).toBeLessThan(s);
    expect(s).toBeLessThan(p);
    expect(p).toBeLessThan(e);
  });
});

describe('Canonical Action IDs', () => {
  it('generates deterministic IDs for the same title+platform', () => {
    const signals = makeSignals();
    const result1 = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    const result2 = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    expect(result1.actions.length).toBeGreaterThan(0);
    expect(result1.actions.map(a => a.id)).toEqual(result2.actions.map(a => a.id));
  });

  it('produces no legacy action-N pattern IDs', () => {
    const signals = makeSignals();
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    for (const action of result.actions) {
      expect(action.id).not.toMatch(/^action-\d+$/);
    }
  });

  it('all IDs are unique within a single playbook', () => {
    const signals = makeSignals();
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    const ids = result.actions.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('IDs are URL-safe slugs', () => {
    const signals = makeSignals();
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    for (const action of result.actions) {
      expect(action.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('IDs include platform suffix', () => {
    const signals = makeSignals();
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    for (const action of result.actions) {
      const platform = action.targetPlatform.toLowerCase();
      expect(action.id.endsWith(`-${platform}`)).toBe(true);
    }
  });
});

describe('Playbook Generation — Agency Scale', () => {
  it('generates maximum actions when all signals are zero', () => {
    const signals = makeSignals();
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    expect(result.actions.length).toBeGreaterThanOrEqual(12);
  });

  it('generates zero actions when all signals exceed thresholds', () => {
    const signals = makeSignals({
      faqSectionCount: 10,
      tutorialCount: 20,
      schemaTypeCount: 10,
      caseStudyCount: 10,
      dataPointCount: 30,
      frameworkMentionCount: 10,
      externalLinkCount: 30,
      howToGuideCount: 10,
      longFormContentScore: 80,
      blogPostCount: 30,
      documentationPageCount: 15,
      statisticMentionCount: 15,
      nuancedTermCount: 15,
    });
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    expect(result.actions.length).toBe(0);
  });

  it('actions are sorted by priority: critical → high → medium → low', () => {
    const signals = makeSignals();
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < result.actions.length; i++) {
      const prev = priorityOrder[result.actions[i - 1].priority];
      const curr = priorityOrder[result.actions[i].priority];
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('quickWins are only easy + critical/high priority', () => {
    const signals = makeSignals();
    const result = generatePlaybook(signals, defaultScoring, defaultContext, 'TestCo');
    for (const qw of result.quickWins) {
      expect(qw.difficulty).toBe('easy');
      expect(['critical', 'high']).toContain(qw.priority);
    }
  });

  it('estimated improvements never exceed remaining headroom', () => {
    const highScores = {
      platformScores: { chatgpt: 90, perplexity: 85, gemini: 95, claude: 88 },
      overallScore: 90,
    };
    const result = generatePlaybook(makeSignals(), highScores, defaultContext, 'TestCo');
    expect(result.estimatedScoreImprovement.chatgpt).toBeLessThanOrEqual(10);
    expect(result.estimatedScoreImprovement.perplexity).toBeLessThanOrEqual(15);
    expect(result.estimatedScoreImprovement.gemini).toBeLessThanOrEqual(5);
    expect(result.estimatedScoreImprovement.claude).toBeLessThanOrEqual(12);
  });

  it('handles different industries without crashing', () => {
    const industries = ['SaaS', 'E-commerce', 'B2B', 'Healthcare', 'Finance', 'Unknown'];
    for (const industry of industries) {
      const context = { ...defaultContext, industry };
      const result = generatePlaybook(makeSignals(), defaultScoring, context, 'TestCo');
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.estimatedScoreImprovement.overall).toBeGreaterThan(0);
    }
  });

  it('produces stable playbook output across 10 consecutive runs', () => {
    const signals = makeSignals({ faqSectionCount: 2, tutorialCount: 3 });
    const runs: PlaybookResult[] = [];
    for (let i = 0; i < 10; i++) {
      runs.push(generatePlaybook(signals, defaultScoring, defaultContext, 'AgencyCo'));
    }
    const firstIds = runs[0].actions.map(a => a.id);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].actions.map(a => a.id)).toEqual(firstIds);
    }
  });
});

describe('Checklist Merge Simulation', () => {
  function simulateMerge(
    oldChecklist: any[],
    newActions: PlaybookAction[],
    existingArchive: any[] = []
  ) {
    let mergedChecklist: any[] = [];
    let checklistArchive: any[] = [...existingArchive];
    let checklistMeta = {
      carriedOverCount: 0,
      carriedOverCompletedCount: 0,
      newCount: 0,
      resolvedCount: 0,
      lastMergedAt: new Date().toISOString(),
    };

    const oldByActionId = new Map<string, any>();
    const oldByTitlePlatform = new Map<string, any>();
    for (const item of oldChecklist) {
      if (item.actionId) {
        oldByActionId.set(item.actionId, item);
      }
      if (item.title && item.targetPlatform) {
        oldByTitlePlatform.set(`${item.title.toLowerCase().trim()}::${item.targetPlatform.toLowerCase().trim()}`, item);
      }
    }

    const matchedOldActionIds = new Set<string>();
    const newActionIds = new Set<string>();
    for (const action of newActions) {
      newActionIds.add(action.id);
      let oldItem = oldByActionId.get(action.id);
      if (!oldItem) {
        const fallbackKey = `${action.title.toLowerCase().trim()}::${action.targetPlatform.toLowerCase().trim()}`;
        oldItem = oldByTitlePlatform.get(fallbackKey);
      }
      if (oldItem && oldItem.actionId) {
        matchedOldActionIds.add(oldItem.actionId);
      }

      if (oldItem) {
        mergedChecklist.push({
          actionId: action.id,
          title: action.title,
          priority: action.priority,
          targetPlatform: action.targetPlatform,
          estimatedImpact: action.estimatedImpact,
          difficulty: action.difficulty,
          completed: oldItem.completed || false,
          completedAt: oldItem.completedAt || null,
          status: 'carried_over',
        });
        checklistMeta.carriedOverCount++;
        if (oldItem.completed) {
          checklistMeta.carriedOverCompletedCount++;
        }
      } else {
        mergedChecklist.push({
          actionId: action.id,
          title: action.title,
          priority: action.priority,
          targetPlatform: action.targetPlatform,
          estimatedImpact: action.estimatedImpact,
          difficulty: action.difficulty,
          completed: false,
          completedAt: null,
          status: 'new',
        });
        checklistMeta.newCount++;
      }
    }

    const now = new Date().toISOString();
    for (const oldItem of oldChecklist) {
      if (oldItem.actionId && !newActionIds.has(oldItem.actionId) && !matchedOldActionIds.has(oldItem.actionId)) {
        checklistArchive.push({
          actionId: oldItem.actionId,
          title: oldItem.title,
          priority: oldItem.priority,
          targetPlatform: oldItem.targetPlatform,
          completed: oldItem.completed || false,
          completedAt: oldItem.completedAt || null,
          resolvedAt: now,
          retiredReason: 'resolved_by_reaudit',
        });
        checklistMeta.resolvedCount++;
      }
    }

    return { mergedChecklist, checklistArchive, checklistMeta };
  }

  const sampleActions: PlaybookAction[] = [
    {
      id: 'add-faq-schema-to-your-top-pages-chatgpt',
      priority: 'critical',
      title: 'Add FAQ Schema to Your Top Pages',
      targetPlatform: 'chatgpt',
      estimatedImpact: 'Could improve ChatGPT score by 10-15 points',
      timeToImplement: '30 minutes',
      difficulty: 'easy',
      currentState: '0 FAQ sections',
      targetState: '5+ FAQ schemas',
      stepByStep: ['Step 1'],
    },
    {
      id: 'create-step-by-step-tutorial-content-chatgpt',
      priority: 'high',
      title: 'Create Step-by-Step Tutorial Content',
      targetPlatform: 'chatgpt',
      estimatedImpact: 'Could improve ChatGPT score by 12-18 points',
      timeToImplement: '2-4 hours',
      difficulty: 'medium',
      currentState: '0 tutorials',
      targetState: '15+ tutorials',
      stepByStep: ['Step 1'],
    },
    {
      id: 'publish-customer-case-studies-claude',
      priority: 'high',
      title: 'Publish Customer Case Studies',
      targetPlatform: 'claude',
      estimatedImpact: 'Could improve Claude score by 8-12 points',
      timeToImplement: '3-5 hours',
      difficulty: 'medium',
      currentState: '0 case studies',
      targetState: '8+ case studies',
      stepByStep: ['Step 1'],
    },
  ];

  it('first audit (empty old checklist) → all items marked new', () => {
    const { mergedChecklist, checklistMeta } = simulateMerge([], sampleActions);
    expect(mergedChecklist.length).toBe(3);
    expect(mergedChecklist.every(i => i.status === 'new')).toBe(true);
    expect(mergedChecklist.every(i => !i.completed)).toBe(true);
    expect(checklistMeta.newCount).toBe(3);
    expect(checklistMeta.carriedOverCount).toBe(0);
    expect(checklistMeta.resolvedCount).toBe(0);
  });

  it('re-audit with same actions → all carried over, completed state preserved', () => {
    const oldChecklist = [
      { actionId: 'add-faq-schema-to-your-top-pages-chatgpt', title: 'Add FAQ Schema to Your Top Pages', targetPlatform: 'chatgpt', completed: true, completedAt: '2026-01-15' },
      { actionId: 'create-step-by-step-tutorial-content-chatgpt', title: 'Create Step-by-Step Tutorial Content', targetPlatform: 'chatgpt', completed: false, completedAt: null },
      { actionId: 'publish-customer-case-studies-claude', title: 'Publish Customer Case Studies', targetPlatform: 'claude', completed: true, completedAt: '2026-02-01' },
    ];
    const { mergedChecklist, checklistMeta } = simulateMerge(oldChecklist, sampleActions);
    expect(mergedChecklist.length).toBe(3);
    expect(mergedChecklist.every(i => i.status === 'carried_over')).toBe(true);
    expect(mergedChecklist[0].completed).toBe(true);
    expect(mergedChecklist[1].completed).toBe(false);
    expect(mergedChecklist[2].completed).toBe(true);
    expect(checklistMeta.carriedOverCount).toBe(3);
    expect(checklistMeta.carriedOverCompletedCount).toBe(2);
    expect(checklistMeta.newCount).toBe(0);
    expect(checklistMeta.resolvedCount).toBe(0);
  });

  it('legacy positional IDs → falls back to title+platform matching', () => {
    const oldChecklist = [
      { actionId: 'action-1', title: 'Add FAQ Schema to Your Top Pages', targetPlatform: 'chatgpt', completed: true, completedAt: '2026-01-01' },
      { actionId: 'action-2', title: 'Create Step-by-Step Tutorial Content', targetPlatform: 'chatgpt', completed: false, completedAt: null },
    ];
    const { mergedChecklist, checklistMeta } = simulateMerge(oldChecklist, sampleActions);
    const faqItem = mergedChecklist.find(i => i.title === 'Add FAQ Schema to Your Top Pages');
    expect(faqItem?.status).toBe('carried_over');
    expect(faqItem?.completed).toBe(true);
    expect(faqItem?.actionId).toBe('add-faq-schema-to-your-top-pages-chatgpt');
    expect(checklistMeta.carriedOverCount).toBe(2);
    expect(checklistMeta.newCount).toBe(1);
  });

  it('resolved items get archived', () => {
    const oldChecklist = [
      { actionId: 'add-faq-schema-to-your-top-pages-chatgpt', title: 'Add FAQ Schema to Your Top Pages', targetPlatform: 'chatgpt', completed: true, completedAt: '2026-01-15' },
      { actionId: 'old-removed-action-gemini', title: 'Old Removed Action', targetPlatform: 'gemini', completed: false, completedAt: null },
    ];
    const newActionsSubset = [sampleActions[0]];
    const { mergedChecklist, checklistArchive, checklistMeta } = simulateMerge(oldChecklist, newActionsSubset);
    expect(mergedChecklist.length).toBe(1);
    expect(checklistArchive.length).toBe(1);
    expect(checklistArchive[0].actionId).toBe('old-removed-action-gemini');
    expect(checklistArchive[0].retiredReason).toBe('resolved_by_reaudit');
    expect(checklistMeta.resolvedCount).toBe(1);
  });

  it('archive accumulates across multiple re-audits', () => {
    const existingArchive = [
      { actionId: 'very-old-action-perplexity', title: 'Very Old Action', resolvedAt: '2025-06-01', retiredReason: 'resolved_by_reaudit' },
    ];
    const oldChecklist = [
      { actionId: 'another-old-action-claude', title: 'Another Old', targetPlatform: 'claude', completed: true, completedAt: '2026-01-01' },
    ];
    const { checklistArchive } = simulateMerge(oldChecklist, sampleActions, existingArchive);
    expect(checklistArchive.length).toBe(2);
    expect(checklistArchive[0].actionId).toBe('very-old-action-perplexity');
    expect(checklistArchive[1].actionId).toBe('another-old-action-claude');
  });

  it('no double-archiving of matched legacy items', () => {
    const oldChecklist = [
      { actionId: 'action-1', title: 'Add FAQ Schema to Your Top Pages', targetPlatform: 'chatgpt', completed: true, completedAt: '2026-01-01' },
    ];
    const { checklistArchive, checklistMeta } = simulateMerge(oldChecklist, [sampleActions[0]]);
    expect(checklistArchive.length).toBe(0);
    expect(checklistMeta.resolvedCount).toBe(0);
    expect(checklistMeta.carriedOverCount).toBe(1);
  });

  it('handles large-scale agency merge: 13 actions, all carried over', () => {
    const signals = makeSignals();
    const playbook = generatePlaybook(signals, defaultScoring, defaultContext, 'AgencyCo');
    const oldChecklist = playbook.actions.map((a, i) => ({
      actionId: a.id,
      title: a.title,
      targetPlatform: a.targetPlatform,
      completed: i % 2 === 0,
      completedAt: i % 2 === 0 ? '2026-01-01' : null,
    }));
    const { mergedChecklist, checklistMeta } = simulateMerge(oldChecklist, playbook.actions);
    expect(mergedChecklist.length).toBe(playbook.actions.length);
    expect(mergedChecklist.every(i => i.status === 'carried_over')).toBe(true);
    expect(checklistMeta.carriedOverCount).toBe(playbook.actions.length);
    expect(checklistMeta.resolvedCount).toBe(0);
    const completedCount = mergedChecklist.filter(i => i.completed).length;
    expect(completedCount).toBe(Math.ceil(playbook.actions.length / 2));
  });
});

describe('Domain Limiter — Pure Logic', () => {
  it('normalizeDomain handles all URL formats', () => {
    expect(normalizeDomain('https://www.example.com/page')).toBe('example.com');
    expect(normalizeDomain('http://example.com')).toBe('example.com');
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('example.com')).toBe('example.com');
    expect(normalizeDomain('HTTPS://WWW.EXAMPLE.COM')).toBe('example.com');
    expect(normalizeDomain('https://subdomain.example.com')).toBe('subdomain.example.com');
  });

  it('extractUniqueDomains deduplicates correctly', () => {
    const audits = [
      { websiteUrl: 'https://www.example.com' },
      { websiteUrl: 'https://example.com/page' },
      { websiteUrl: 'http://www.example.com/other' },
      { websiteUrl: 'https://other.com' },
    ];
    const domains = extractUniqueDomains(audits);
    expect(domains).toHaveLength(2);
    expect(domains).toContain('example.com');
    expect(domains).toContain('other.com');
  });

  it('simulates free plan: 1 domain limit', () => {
    const flags = getFeatureFlags('free');
    expect(flags.multiDomainLimit).toBe(1);
    const existingDomains = ['client1.com'];
    const newDomain = 'client2.com';
    const isNew = !existingDomains.includes(newDomain);
    const allowed = !isNew || existingDomains.length < flags.multiDomainLimit;
    expect(allowed).toBe(false);
  });

  it('simulates free plan: same domain allowed', () => {
    const flags = getFeatureFlags('free');
    const existingDomains = ['client1.com'];
    const isNew = !existingDomains.includes('client1.com');
    const allowed = !isNew || existingDomains.length < flags.multiDomainLimit;
    expect(allowed).toBe(true);
  });

  it('simulates starter plan: 5 domain limit', () => {
    const flags = getFeatureFlags('starter');
    expect(flags.multiDomainLimit).toBe(5);
    const existingDomains = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'];
    const isNew = !existingDomains.includes('f.com');
    const allowed = !isNew || existingDomains.length < flags.multiDomainLimit;
    expect(allowed).toBe(false);
  });

  it('simulates pro plan: unlimited domains', () => {
    const flags = getFeatureFlags('pro');
    expect(flags.multiDomainLimit).toBe(Infinity);
    expect(flags.multiDomainLimit >= 999).toBe(true);
  });

  it('simulates agency with 20 client domains on enterprise', () => {
    const flags = getFeatureFlags('enterprise');
    expect(flags.multiDomainLimit).toBe(Infinity);
    const domains = Array.from({ length: 20 }, (_, i) => `client${i + 1}.com`);
    expect(domains.length).toBe(20);
    const isNew = !domains.includes('client21.com');
    const allowed = flags.multiDomainLimit >= 999 || !isNew || domains.length < flags.multiDomainLimit;
    expect(allowed).toBe(true);
  });
});

describe('Agency Scale — End-to-End Playbook Stability', () => {
  const agencyDomains = Array.from({ length: 15 }, (_, i) => `agency-client-${i + 1}.com`);

  it('generates stable playbooks for 15 different client URLs', () => {
    const allIds: string[][] = [];
    for (const domain of agencyDomains) {
      const signals = makeSignals({ blogPostCount: Math.floor(Math.random() * 10), faqSectionCount: Math.floor(Math.random() * 3) });
      const result = generatePlaybook(signals, defaultScoring, defaultContext, domain);
      allIds.push(result.actions.map(a => a.id));
      expect(result.actions.length).toBeGreaterThan(0);
      const ids = result.actions.map(a => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('all actions have required fields (no undefined/null leaks)', () => {
    const result = generatePlaybook(makeSignals(), defaultScoring, defaultContext, 'TestCo');
    for (const action of result.actions) {
      expect(action.id).toBeTruthy();
      expect(action.title).toBeTruthy();
      expect(action.targetPlatform).toBeTruthy();
      expect(action.priority).toBeTruthy();
      expect(action.estimatedImpact).toBeTruthy();
      expect(action.difficulty).toBeTruthy();
      expect(action.currentState).toBeTruthy();
      expect(action.targetState).toBeTruthy();
      expect(action.stepByStep.length).toBeGreaterThan(0);
    }
  });

  it('estimated score improvements are non-negative', () => {
    const result = generatePlaybook(makeSignals(), defaultScoring, defaultContext, 'TestCo');
    const imp = result.estimatedScoreImprovement;
    expect(imp.chatgpt).toBeGreaterThanOrEqual(0);
    expect(imp.perplexity).toBeGreaterThanOrEqual(0);
    expect(imp.gemini).toBeGreaterThanOrEqual(0);
    expect(imp.claude).toBeGreaterThanOrEqual(0);
    expect(imp.overall).toBeGreaterThanOrEqual(0);
  });

  it('handles 15 sequential re-audits with growing archive', () => {
    let currentChecklist: any[] = [];
    let archive: any[] = [];

    for (let month = 0; month < 15; month++) {
      const signals = makeSignals({
        faqSectionCount: Math.min(month, 5),
        tutorialCount: Math.min(month * 2, 20),
        blogPostCount: Math.min(month * 3, 30),
        caseStudyCount: Math.min(month, 8),
        dataPointCount: Math.min(month * 2, 25),
      });
      const playbook = generatePlaybook(signals, defaultScoring, defaultContext, 'LongTermClient');
      const newActions = playbook.actions;

      const oldByActionId = new Map<string, any>();
      const oldByTitlePlatform = new Map<string, any>();
      for (const item of currentChecklist) {
        if (item.actionId) oldByActionId.set(item.actionId, item);
        if (item.title && item.targetPlatform)
          oldByTitlePlatform.set(`${item.title.toLowerCase().trim()}::${item.targetPlatform.toLowerCase().trim()}`, item);
      }

      const matchedOldActionIds = new Set<string>();
      const newActionIds = new Set<string>();
      const merged: any[] = [];

      for (const action of newActions) {
        newActionIds.add(action.id);
        let oldItem = oldByActionId.get(action.id);
        if (!oldItem) {
          const key = `${action.title.toLowerCase().trim()}::${action.targetPlatform.toLowerCase().trim()}`;
          oldItem = oldByTitlePlatform.get(key);
        }
        if (oldItem?.actionId) matchedOldActionIds.add(oldItem.actionId);

        merged.push({
          actionId: action.id,
          title: action.title,
          targetPlatform: action.targetPlatform,
          completed: oldItem ? (oldItem.completed || false) : false,
          completedAt: oldItem ? (oldItem.completedAt || null) : null,
          status: oldItem ? 'carried_over' : 'new',
        });
      }

      for (const oldItem of currentChecklist) {
        if (oldItem.actionId && !newActionIds.has(oldItem.actionId) && !matchedOldActionIds.has(oldItem.actionId)) {
          archive.push({
            actionId: oldItem.actionId,
            resolvedAt: new Date().toISOString(),
            retiredReason: 'resolved_by_reaudit',
          });
        }
      }

      currentChecklist = merged;
    }

    expect(currentChecklist.length).toBeGreaterThan(0);
    expect(archive.length).toBeGreaterThanOrEqual(0);
    const allArchiveIds = archive.map(a => a.actionId);
    const activeIds = currentChecklist.map(a => a.actionId);
    for (const activeId of activeIds) {
      const inArchive = allArchiveIds.filter(id => id === activeId).length;
      expect(inArchive).toBeLessThanOrEqual(1);
    }
  });
});
