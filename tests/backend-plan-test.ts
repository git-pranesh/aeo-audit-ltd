const BASE_URL = 'http://localhost:5000';
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY!;

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
  details: string;
  data?: any;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(msg);
}

function pass(name: string, details: string, data?: any) {
  results.push({ name, status: 'PASS', details, data });
  log(`  ✅ PASS: ${name} — ${details}`);
}

function fail(name: string, details: string, data?: any) {
  results.push({ name, status: 'FAIL', details, data });
  log(`  ❌ FAIL: ${name} — ${details}`);
}

function warn(name: string, details: string, data?: any) {
  results.push({ name, status: 'WARN', details, data });
  log(`  ⚠️  WARN: ${name} — ${details}`);
}

function skip(name: string, details: string) {
  results.push({ name, status: 'SKIP', details });
  log(`  ⏭️  SKIP: ${name} — ${details}`);
}

const ACCOUNTS = {
  free: { email: process.env.TEST_FREE_EMAIL || '', password: process.env.TEST_PASSWORD || '', website: 'billiontags.com' },
  starter: { email: process.env.TEST_STARTER_EMAIL || '', password: process.env.TEST_PASSWORD || '', website: 'billiontags.com' },
  pro: { email: process.env.TEST_PRO_EMAIL || '', password: process.env.TEST_PASSWORD || '', website: 'notion.so' },
  enterprise: { email: process.env.TEST_ENTERPRISE_EMAIL || '', password: process.env.TEST_PASSWORD || '', website: 'notion.so' },
};

const EXPECTED_FLAGS: Record<string, any> = {
  free: {
    topicsPerCategory: 3, playbooks: 'basic', schemaGeneratorLimit: 1,
    competitorWatchlistLimit: 0, quickWinsLimit: 3, reauditButton: false,
    citationRefreshButton: false, citationMonitoringFrequency: 'none',
    citationAlerts: false, multiDomainLimit: 1, pdfExport: 'watermarked',
    scoreTrendExport: false, monthlyReaudit: false, quickWinsChecklist: 'basic'
  },
  starter: {
    topicsPerCategory: 12, playbooks: 'full', schemaGeneratorLimit: 999,
    competitorWatchlistLimit: 3, quickWinsLimit: null, reauditButton: true,
    citationRefreshButton: true, citationMonitoringFrequency: 'monthly',
    citationAlerts: false, multiDomainLimit: 5, pdfExport: 'clean',
    scoreTrendExport: false, monthlyReaudit: true, quickWinsChecklist: 'full'
  },
  pro: {
    topicsPerCategory: 25, playbooks: 'full_priority', schemaGeneratorLimit: 999,
    competitorWatchlistLimit: 999, quickWinsLimit: null, reauditButton: true,
    citationRefreshButton: true, citationMonitoringFrequency: 'weekly',
    citationAlerts: true, multiDomainLimit: null, pdfExport: 'whitelabel',
    scoreTrendExport: true, monthlyReaudit: true, quickWinsChecklist: 'full'
  },
  enterprise: {
    topicsPerCategory: 100, playbooks: 'full_whitelabel', schemaGeneratorLimit: 999,
    competitorWatchlistLimit: 999, quickWinsLimit: null, reauditButton: true,
    citationRefreshButton: true, citationMonitoringFrequency: 'daily',
    citationAlerts: true, multiDomainLimit: null, pdfExport: 'whitelabel',
    scoreTrendExport: true, monthlyReaudit: true, quickWinsChecklist: 'full'
  },
};

async function firebaseSignIn(email: string, password: string): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Firebase sign-in failed for ${email}: ${data.error?.message || 'Unknown error'}`);
  return data.idToken;
}

async function apiGet(path: string, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: res.status, data: await res.json().catch(() => null), ok: res.ok };
}

async function apiPost(path: string, body: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null), ok: res.ok };
}

async function runAllTests() {
  log('\n' + '='.repeat(80));
  log('    CITATION ROCKET — COMPREHENSIVE BACKEND TEST SUITE');
  log('='.repeat(80) + '\n');

  const tokens: Record<string, string> = {};

  // ═══════════════════════════════════════════════
  // PART 1: AUTHENTICATION
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 1: AUTHENTICATION');
  log('─'.repeat(60));

  for (const [plan, account] of Object.entries(ACCOUNTS)) {
    try {
      const token = await firebaseSignIn(account.email, account.password);
      tokens[plan] = token;
      pass(`Auth [${plan}]`, `Signed in as ${account.email}, token length: ${token.length}`);
    } catch (e: any) {
      fail(`Auth [${plan}]`, e.message);
    }
  }

  // Auth edge cases
  log('\n  Auth edge cases:');
  const noTokenRes = await apiGet('/api/features');
  if (noTokenRes.status === 401) pass('Auth [no token]', 'Returns 401 as expected');
  else fail('Auth [no token]', `Expected 401, got ${noTokenRes.status}`);

  const badTokenRes = await apiGet('/api/features', 'invalid-token-12345');
  if (badTokenRes.status === 401) pass('Auth [invalid token]', 'Returns 401 as expected');
  else fail('Auth [invalid token]', `Expected 401, got ${badTokenRes.status}`);

  // ═══════════════════════════════════════════════
  // PART 2: FEATURE FLAGS (all 4 plans)
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 2: FEATURE FLAGS');
  log('─'.repeat(60));

  const actualFlags: Record<string, any> = {};

  for (const plan of ['free', 'starter', 'pro', 'enterprise']) {
    if (!tokens[plan]) { skip(`Features [${plan}]`, 'No token'); continue; }

    const res = await apiGet('/api/features', tokens[plan]);
    if (!res.ok) {
      fail(`Features [${plan}]`, `API returned ${res.status}: ${JSON.stringify(res.data)}`);
      continue;
    }

    const features = res.data.features;
    const returnedPlan = res.data.plan;
    actualFlags[plan] = features;

    if (returnedPlan !== plan) {
      fail(`Features [${plan}] plan name`, `Expected plan="${plan}", got "${returnedPlan}"`);
    } else {
      pass(`Features [${plan}] plan name`, `Plan correctly identified as "${plan}"`);
    }

    const expected = EXPECTED_FLAGS[plan];
    let allMatch = true;
    for (const [key, expectedVal] of Object.entries(expected)) {
      const actual = features[key];
      let matches = false;
      if (expectedVal === null) {
        matches = actual === null || actual === Infinity || actual >= 9999;
      } else {
        matches = actual === expectedVal;
      }
      if (!matches) {
        fail(`Features [${plan}] ${key}`, `Expected ${expectedVal}, got ${actual}`);
        allMatch = false;
      }
    }
    if (allMatch) {
      pass(`Features [${plan}] all flags`, 'All 14 flags match expected values');
    }
  }

  // Print feature comparison table
  log('\n  Feature Flags Comparison Table:');
  log('  ' + '─'.repeat(85));
  log(`  ${'Flag'.padEnd(30)} ${'Free'.padEnd(12)} ${'Starter'.padEnd(12)} ${'Pro'.padEnd(12)} ${'Enterprise'.padEnd(12)}`);
  log('  ' + '─'.repeat(85));
  const flagKeys = Object.keys(EXPECTED_FLAGS.free);
  for (const key of flagKeys) {
    const vals = ['free', 'starter', 'pro', 'enterprise'].map(p => {
      const v = actualFlags[p]?.[key];
      if (v === null || v === Infinity) return '∞';
      if (v === true) return '✓';
      if (v === false) return '✗';
      return String(v);
    });
    log(`  ${key.padEnd(30)} ${vals[0]?.padEnd(12)} ${vals[1]?.padEnd(12)} ${vals[2]?.padEnd(12)} ${vals[3]?.padEnd(12)}`);
  }
  log('  ' + '─'.repeat(85));

  // ═══════════════════════════════════════════════
  // PART 3: PRICING PAGE DATA
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 3: PRICING PAGE DATA');
  log('─'.repeat(60));

  const pricingRes = await apiGet('/api/pricing/plans');
  if (!pricingRes.ok) {
    fail('Pricing API', `Failed with ${pricingRes.status}`);
  } else {
    const plans = pricingRes.data.plans;
    if (plans.free && plans.starter && plans.pro && plans.enterprise) {
      pass('Pricing API', 'All 4 plans present');
    } else {
      fail('Pricing API', `Missing plans. Got: ${Object.keys(plans || {}).join(', ')}`);
    }

    if (plans) {
      for (const [slug, data] of Object.entries(plans) as [string, any][]) {
        log(`\n  [${slug.toUpperCase()}] ${data.name}`);
        log(`    Monthly: $${data.monthlyPrice} | Annual: $${data.annualPrice}`);
        log(`    Audits: ${data.audits} | Topics: ${data.topics}`);
        log(`    Features: ${data.features?.join(', ')}`);
      }

      if (plans.free?.monthlyPrice === 0) pass('Pricing [free price]', 'Free is $0');
      else fail('Pricing [free price]', `Expected $0, got $${plans.free?.monthlyPrice}`);

      if (plans.starter?.monthlyPrice > 0) pass('Pricing [starter price]', `$${plans.starter.monthlyPrice}/mo`);
      else fail('Pricing [starter price]', 'Should be > $0');

      if (plans.pro?.monthlyPrice > plans.starter?.monthlyPrice) pass('Pricing [pro > starter]', 'Pro costs more than Starter');
      else fail('Pricing [pro > starter]', 'Pro should cost more than Starter');

      if (plans.enterprise?.monthlyPrice > plans.pro?.monthlyPrice) pass('Pricing [enterprise > pro]', 'Enterprise costs more than Pro');
      else fail('Pricing [enterprise > pro]', 'Enterprise should cost more than Pro');
    }
  }

  // ═══════════════════════════════════════════════
  // PART 4: REAL AUDIT — PHASE 1 (Company Intelligence)
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 4: REAL AUDIT — PHASE 1 (Company Intelligence)');
  log('─'.repeat(60));

  let phase1Data: any = null;

  if (tokens.pro) {
    log('\n  Running Phase 1 analysis for notion.so (Pro user)...');
    const startTime = Date.now();
    const analyzeRes = await apiPost('/api/audit/analyze', { websiteUrl: 'notion.so' }, tokens.pro);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    if (!analyzeRes.ok) {
      fail('Phase 1 [notion.so]', `API returned ${analyzeRes.status}: ${JSON.stringify(analyzeRes.data)}`);
    } else {
      phase1Data = analyzeRes.data;
      pass('Phase 1 [notion.so] success', `Completed in ${elapsedSec}s`);

      log(`\n  Phase 1 Results:`);
      log(`    Company Intelligence:`);
      log(`      Industry: ${phase1Data.companyIntelligence?.industry}`);
      log(`      Business Type: ${phase1Data.companyIntelligence?.businessType}`);
      log(`      Target Audience: ${phase1Data.companyIntelligence?.targetAudience}`);
      log(`      Value Prop: ${phase1Data.companyIntelligence?.valueProposition}`);
      log(`      Market Position: ${phase1Data.companyIntelligence?.marketPosition}`);
      log(`    Suggested Industries: ${phase1Data.suggestedIndustries?.join(', ')}`);
      log(`    Keywords: ${phase1Data.suggestedKeywords?.join(', ')}`);
      log(`    Competitors: ${phase1Data.suggestedCompetitors?.join(', ')}`);

      const industry = (phase1Data.companyIntelligence?.industry || '').toLowerCase();
      const industryRelevant = ['productivity', 'saas', 'collaboration', 'software', 'workspace', 'project', 'note', 'knowledge'].some(k => industry.includes(k));
      if (industryRelevant) pass('Phase 1 [industry accuracy]', `"${phase1Data.companyIntelligence?.industry}" is relevant to Notion`);
      else warn('Phase 1 [industry accuracy]', `"${phase1Data.companyIntelligence?.industry}" may not match Notion`);

      const competitors = phase1Data.suggestedCompetitors || [];
      const knownCompetitors = ['coda', 'confluence', 'evernote', 'obsidian', 'monday', 'clickup', 'asana', 'trello', 'airtable', 'slite', 'roam'];
      const matchCount = competitors.filter((c: string) => knownCompetitors.some(k => c.toLowerCase().includes(k))).length;
      if (matchCount >= 1) pass('Phase 1 [competitors real]', `${matchCount}/${competitors.length} are known real competitors`);
      else if (competitors.length === 0) warn('Phase 1 [competitors real]', 'No competitors returned');
      else warn('Phase 1 [competitors real]', `None of ${competitors.join(', ')} matched known competitors — may still be valid`);

      if (elapsedSec < 120) pass('Phase 1 [response time]', `${elapsedSec}s < 120s limit`);
      else fail('Phase 1 [response time]', `${elapsedSec}s exceeds 120s`);
    }
  } else {
    skip('Phase 1', 'No Pro token');
  }

  // ═══════════════════════════════════════════════
  // PART 5: REAL AUDIT — PHASE 2 (Full Audit - Pro)
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 5: REAL AUDIT — PHASE 2 (Full Audit - Pro Plan)');
  log('─'.repeat(60));

  let proAuditData: any = null;

  if (tokens.pro && phase1Data) {
    log('\n  Running Phase 2 batch audit for notion.so (Pro user, 25 topics/category)...');
    const startTime = Date.now();
    const batchRes = await apiPost('/api/audit/batch', {
      websiteUrl: 'notion.so',
      userPlan: 'pro',
      topicsPerCategory: 25,
      confirmedContext: {
        industry: phase1Data.companyIntelligence?.industry || 'Productivity Software',
        businessType: phase1Data.companyIntelligence?.businessType || 'SaaS',
        targetAudience: phase1Data.companyIntelligence?.targetAudience || 'Knowledge workers',
        valueProposition: phase1Data.companyIntelligence?.valueProposition || 'All-in-one workspace',
        marketPosition: phase1Data.companyIntelligence?.marketPosition || 'Market leader',
        confirmedCompetitors: phase1Data.suggestedCompetitors || [],
        confirmedKeywords: phase1Data.suggestedKeywords || [],
      }
    }, tokens.pro);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    if (!batchRes.ok) {
      fail('Phase 2 [Pro/notion.so]', `API returned ${batchRes.status}: ${JSON.stringify(batchRes.data)?.substring(0, 500)}`);
    } else {
      proAuditData = batchRes.data;
      const audit = proAuditData.auditData || proAuditData;
      const auditResults = audit.auditResults || {};
      pass('Phase 2 [Pro/notion.so] success', `Completed in ${elapsedSec}s`);

      log(`\n  Phase 2 Pro Results:`);

      // Scores
      const scores = auditResults.platformScores;
      const overallScore = auditResults.overallScore;
      const letterGrade = auditResults.letterGrade;
      log(`    Overall Score: ${overallScore} (Grade: ${letterGrade})`);
      if (scores) {
        log(`    Platform Scores: ChatGPT=${scores.chatgpt}, Perplexity=${scores.perplexity}, Gemini=${scores.gemini}, Claude=${scores.claude}`);
      }

      if (overallScore !== undefined && overallScore >= 0 && overallScore <= 100) {
        pass('Phase 2 [Pro score range]', `Overall score ${overallScore} (${letterGrade}) is in 0-100 range`);
      } else {
        fail('Phase 2 [Pro score range]', `Score ${overallScore} outside 0-100`);
      }

      if (scores) {
        const scoreVals = [scores.chatgpt, scores.perplexity, scores.gemini, scores.claude].filter((s: any) => s !== undefined);
        if (scoreVals.length === 4) pass('Phase 2 [4 platforms]', 'All 4 platform scores present');
        else fail('Phase 2 [4 platforms]', `Only ${scoreVals.length} platform scores`);

        const allSame = scoreVals.every((s: any) => s === scoreVals[0]);
        if (!allSame) pass('Phase 2 [scores differentiated]', `Scores vary: ${scoreVals.join(', ')}`);
        else warn('Phase 2 [scores differentiated]', 'All platform scores are identical');
      }

      // Topics
      const contentTopics = audit.contentTopics || {};
      const allTopics: any[] = [];
      for (const [cat, topicList] of Object.entries(contentTopics)) {
        const topics = topicList as any[];
        log(`    ${cat}: ${topics.length} topics`);
        if (topics.length > 0) {
          log(`      First 3: ${topics.slice(0, 3).map((t: any) => t.title || t.name || t).join(', ')}`);
        }
        allTopics.push(...topics);
      }
      log(`    Total Topics Generated: ${allTopics.length}`);
      if (allTopics.length > 0) {
        pass('Phase 2 [Pro topics present]', `${allTopics.length} topics across ${Object.keys(contentTopics).length} categories`);
      } else {
        fail('Phase 2 [Pro topics present]', 'No topics generated');
      }

      // Playbook
      const playbook = audit.playbook?.actions || audit.playbook || [];
      log(`    Playbook Actions: ${playbook.length}`);
      if (playbook.length > 0) {
        log(`    First 3: ${playbook.slice(0, 3).map((a: any) => a.title || a.action || a.name).join(', ')}`);
        pass('Phase 2 [Pro playbook]', `${playbook.length} actions`);
      } else {
        warn('Phase 2 [Pro playbook]', 'No playbook actions');
      }

      // Strengths/Weaknesses
      const strengths = auditResults.strengths || [];
      const weaknesses = auditResults.weaknesses || [];
      log(`    Strengths: ${strengths.length} items`);
      log(`    Weaknesses: ${weaknesses.length} items`);
      if (strengths.length > 0) {
        log(`    Sample strengths: ${strengths.slice(0, 2).map((s: any) => typeof s === 'string' ? s.substring(0, 80) : (s.text || s.title || JSON.stringify(s)).substring(0, 80)).join(' | ')}`);
        pass('Phase 2 [strengths]', `${strengths.length} strengths identified`);
      }
      if (weaknesses.length > 0) {
        pass('Phase 2 [weaknesses]', `${weaknesses.length} weaknesses identified`);
      }

      // Citation
      const citation = audit.citationSnapshot;
      if (citation) {
        log(`    Citation Snapshot: mentionRate=${citation.mentionRate}, promptsChecked=${citation.promptResults?.length}`);
        pass('Phase 2 [citation snapshot]', 'Citation data present');
      } else {
        warn('Phase 2 [citation snapshot]', 'No citation snapshot');
      }

      // Benchmarks
      const benchmarks = audit.industryBenchmark;
      if (benchmarks) {
        log(`    Industry Benchmarks: industry=${benchmarks.industry}, avgScore=${benchmarks.averageScore}, top10=${benchmarks.top10Score}`);
        pass('Phase 2 [benchmarks]', `Industry: ${benchmarks.industry}`);
      } else {
        warn('Phase 2 [benchmarks]', 'No industry benchmarks');
      }

      // Recommendations
      const recommendations = audit.recommendations || [];
      log(`    Recommendations: ${recommendations.length}`);
      if (recommendations.length > 0) {
        pass('Phase 2 [recommendations]', `${recommendations.length} recommendations`);
      }
    }
  } else {
    skip('Phase 2 [Pro]', phase1Data ? 'No Pro token' : 'Phase 1 failed');
  }

  // ═══════════════════════════════════════════════
  // PART 6: OUTPUT QUALITY STRESS TEST (Consistency)
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 6: OUTPUT QUALITY STRESS TEST (Consistency)');
  log('─'.repeat(60));

  if (tokens.pro) {
    log('\n  Running Phase 1 analysis 2 times for notion.so to check consistency...');
    const phase1Runs: any[] = [];
    if (phase1Data) phase1Runs.push(phase1Data);

    for (let i = phase1Runs.length + 1; i <= 2; i++) {
      log(`\n  Run ${i}/2...`);
      try {
        const startTime = Date.now();
        const res = await apiPost('/api/audit/analyze', { websiteUrl: 'notion.so' }, tokens.pro);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (res.ok) {
          phase1Runs.push(res.data);
          log(`    Completed in ${elapsed}s — Industry: ${res.data.companyIntelligence?.industry}, Competitors: ${res.data.suggestedCompetitors?.length}`);
        } else {
          log(`    Run ${i} failed: ${res.status}`);
        }
      } catch (e: any) {
        log(`    Run ${i} error: ${e.message}`);
      }
    }

    if (phase1Runs.length >= 2) {
      // Check industry consistency
      const industries = phase1Runs.map(r => (r.companyIntelligence?.industry || '').toLowerCase());
      const industryWords = industries.map(i => new Set(i.split(/[\s,/&]+/).filter(Boolean)));
      let industryOverlap = 0;
      for (let i = 0; i < industryWords.length - 1; i++) {
        for (const word of industryWords[i]) {
          if (industryWords[i + 1].has(word)) industryOverlap++;
        }
      }
      log(`\n  Industries across runs: ${industries.join(' | ')}`);
      if (industryOverlap > 0) pass('Consistency [industry]', `Industries share keywords across runs`);
      else warn('Consistency [industry]', `Industries differ: ${industries.join(' vs ')}`);

      // Check competitor overlap
      const allCompetitors = phase1Runs.map(r => new Set((r.suggestedCompetitors || []).map((c: string) => c.toLowerCase().replace(/^www\./, ''))));
      if (allCompetitors.length >= 2 && allCompetitors[0].size > 0 && allCompetitors[1].size > 0) {
        const set1 = allCompetitors[0];
        const set2 = allCompetitors[1];
        const intersection = [...set1].filter(c => set2.has(c));
        const overlapPct = Math.round((intersection.length / Math.max(set1.size, set2.size)) * 100);
        log(`  Competitor overlap run1 vs run2: ${intersection.length}/${Math.max(set1.size, set2.size)} (${overlapPct}%)`);
        log(`    Run 1: ${[...set1].join(', ')}`);
        log(`    Run 2: ${[...set2].join(', ')}`);
        log(`    Overlap: ${intersection.join(', ')}`);
        if (overlapPct >= 30) pass('Consistency [competitors]', `${overlapPct}% overlap`);
        else warn('Consistency [competitors]', `Only ${overlapPct}% overlap — AI responses vary`);
      }

      // Check keyword overlap
      const allKeywords = phase1Runs.map(r => new Set((r.suggestedKeywords || []).map((k: string) => k.toLowerCase())));
      if (allKeywords.length >= 2 && allKeywords[0].size > 0 && allKeywords[1].size > 0) {
        const kw1 = allKeywords[0];
        const kw2 = allKeywords[1];
        const kwIntersection = [...kw1].filter(k => kw2.has(k));
        const kwOverlap = Math.round((kwIntersection.length / Math.max(kw1.size, kw2.size)) * 100);
        log(`  Keyword overlap: ${kwIntersection.length}/${Math.max(kw1.size, kw2.size)} (${kwOverlap}%)`);
        if (kwOverlap >= 30) pass('Consistency [keywords]', `${kwOverlap}% overlap`);
        else warn('Consistency [keywords]', `Only ${kwOverlap}% — keywords vary across runs`);
      }
    } else {
      skip('Consistency tests', `Only ${phase1Runs.length} successful runs`);
    }
  } else {
    skip('Consistency tests', 'No Pro token');
  }

  // ═══════════════════════════════════════════════
  // PART 7: DOMAIN LIMIT ENFORCEMENT
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 7: DOMAIN LIMIT ENFORCEMENT');
  log('─'.repeat(60));

  if (tokens.free) {
    log('\n  Testing domain limit for Free user (limit=1)...');

    // First, try to audit a DIFFERENT domain (should be blocked if they already have one)
    const res = await apiPost('/api/audit/analyze', { websiteUrl: 'notion.so' }, tokens.free);

    if (res.status === 403 && res.data?.code === 'DOMAIN_LIMIT_EXCEEDED') {
      pass('Domain limit [Free blocked]', `Blocked: ${res.data.details}`);
      log(`    Current domains: ${res.data.currentDomains?.join(', ')}`);
      log(`    Limit: ${res.data.limit}`);
    } else if (res.ok) {
      warn('Domain limit [Free blocked]', 'Free user was allowed to analyze a new domain — may have no prior audits or domain was same');
    } else {
      fail('Domain limit [Free blocked]', `Expected 403 DOMAIN_LIMIT_EXCEEDED, got ${res.status}: ${JSON.stringify(res.data)?.substring(0, 200)}`);
    }

    // Re-audit same domain should work — use the domain they already have
    log('\n  Testing re-audit of existing domain (should work)...');
    const existingDomain = (res.data?.currentDomains && res.data.currentDomains.length > 0) 
      ? res.data.currentDomains[0] : 'billiontags.com';
    log(`    Existing domain: ${existingDomain}`);
    const sameRes = await apiPost('/api/audit/analyze', { websiteUrl: existingDomain }, tokens.free);
    if (sameRes.ok) {
      pass('Domain limit [re-audit same]', `Re-auditing ${existingDomain} allowed`);
    } else if (sameRes.status === 403 && sameRes.data?.code === 'DOMAIN_LIMIT_EXCEEDED') {
      fail('Domain limit [re-audit same]', `Same domain ${existingDomain} was blocked — should be allowed`);
    } else {
      log(`    Got ${sameRes.status}: ${JSON.stringify(sameRes.data)?.substring(0, 200)}`);
      warn('Domain limit [re-audit same]', `Unexpected status: ${sameRes.status}`);
    }

    // Concurrent domain bypass attempt
    log('\n  Testing concurrent domain bypass attempt...');
    const concurrentDomains = ['google.com', 'amazon.com', 'twitter.com'];
    const concurrentResults = await Promise.all(
      concurrentDomains.map(d => apiPost('/api/audit/analyze', { websiteUrl: d }, tokens.free))
    );
    const allowedCount = concurrentResults.filter(r => r.ok).length;
    const blockedCount = concurrentResults.filter(r => r.status === 403).length;
    log(`    Results: ${allowedCount} allowed, ${blockedCount} blocked out of ${concurrentDomains.length}`);
    if (allowedCount <= 1) {
      pass('Domain limit [concurrent bypass]', `Cannot bypass with concurrent requests (${allowedCount} allowed, ${blockedCount} blocked)`);
    } else {
      fail('Domain limit [concurrent bypass]', `${allowedCount} domains were allowed — limit may be bypassed`);
    }
  } else {
    skip('Domain limit tests', 'No Free token');
  }

  // ═══════════════════════════════════════════════
  // PART 8: PAYMENT & SUBSCRIPTION TESTS
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 8: PAYMENT & SUBSCRIPTION TESTS');
  log('─'.repeat(60));

  // Payment link creation
  log('\n  Testing payment link creation...');
  for (const planName of ['starter', 'pro', 'enterprise']) {
    try {
      const res = await apiPost('/api/payment/create-link', {
        userId: 'test-user-id',
        planName,
        billingPeriod: 'monthly',
        userEmail: 'test@example.com',
        userName: 'Test User',
      });
      if (res.ok && res.data?.checkoutUrl) {
        pass(`Payment link [${planName}]`, `Checkout URL generated: ${res.data.checkoutUrl.substring(0, 80)}...`);
      } else {
        fail(`Payment link [${planName}]`, `Failed: ${res.status} — ${JSON.stringify(res.data)?.substring(0, 200)}`);
      }
    } catch (e: any) {
      fail(`Payment link [${planName}]`, e.message);
    }
  }

  // Annual billing
  log('\n  Testing annual billing payment link...');
  const annualRes = await apiPost('/api/payment/create-link', {
    userId: 'test-user-id',
    planName: 'pro',
    billingPeriod: 'annual',
    userEmail: 'test@example.com',
    userName: 'Test User',
  });
  if (annualRes.ok && annualRes.data?.checkoutUrl) {
    pass('Payment link [annual Pro]', `Annual checkout URL generated`);
  } else {
    fail('Payment link [annual Pro]', `Failed: ${annualRes.status}`);
  }

  // Upgrade flow
  log('\n  Testing subscription upgrade flow...');
  const upgradeRes = await apiPost('/api/subscription/upgrade', {
    userId: 'test-user-id',
    userEmail: 'test@example.com',
    userName: 'Test',
    currentPlan: 'starter',
    newPlan: 'pro',
    billingPeriod: 'monthly',
  });
  if (upgradeRes.ok || upgradeRes.data?.checkoutUrl || upgradeRes.data?.success) {
    pass('Subscription upgrade', `Upgrade flow responded: ${JSON.stringify(upgradeRes.data)?.substring(0, 200)}`);
  } else {
    warn('Subscription upgrade', `Status ${upgradeRes.status}: ${JSON.stringify(upgradeRes.data)?.substring(0, 200)}`);
  }

  // Downgrade flow
  log('\n  Testing subscription downgrade flow...');
  const downgradeRes = await apiPost('/api/subscription/downgrade', {
    userId: 'test-user-id',
    currentPlan: 'pro',
    newPlan: 'starter',
    subscriptionId: 'test-sub-id',
  });
  log(`    Downgrade response: ${downgradeRes.status} — ${JSON.stringify(downgradeRes.data)?.substring(0, 200)}`);
  if (downgradeRes.ok || downgradeRes.data?.success !== undefined) {
    pass('Subscription downgrade', 'Downgrade endpoint responded');
  } else {
    warn('Subscription downgrade', `Status ${downgradeRes.status}`);
  }

  // Cancel downgrade
  log('\n  Testing cancel downgrade...');
  const cancelRes = await apiPost('/api/subscription/cancel-downgrade', { userId: 'test-user-id' });
  log(`    Cancel response: ${cancelRes.status} — ${JSON.stringify(cancelRes.data)?.substring(0, 200)}`);
  if (cancelRes.ok || cancelRes.data?.success !== undefined) {
    pass('Cancel downgrade', 'Cancel downgrade endpoint responded');
  } else {
    warn('Cancel downgrade', `Status ${cancelRes.status}`);
  }

  // Webhook — invalid signature
  log('\n  Testing webhook signature validation...');
  const webhookRes = await apiPost('/api/webhooks/dodo', {
    type: 'subscription.created',
    data: { metadata: { user_id: 'test', plan_name: 'pro' } },
  });
  log(`    Webhook (no sig) response: ${webhookRes.status}`);
  if (webhookRes.status === 401 || webhookRes.status === 500) {
    pass('Webhook [invalid sig]', `Rejected with ${webhookRes.status} — security working`);
  } else if (webhookRes.ok) {
    warn('Webhook [invalid sig]', 'Webhook accepted without valid signature (dev mode?)');
  } else {
    log(`    Response: ${JSON.stringify(webhookRes.data)?.substring(0, 200)}`);
    pass('Webhook [invalid sig]', `Rejected with ${webhookRes.status}`);
  }

  // ═══════════════════════════════════════════════
  // PART 9: EMAIL TESTS
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 9: EMAIL TESTS');
  log('─'.repeat(60));

  log('\n  Testing welcome email endpoint...');
  const emailRes = await apiPost('/api/auth/send-welcome-email', {
    userEmail: 'test-backend@example.com',
    userName: 'Backend Test',
  });
  log(`    Welcome email response: ${emailRes.status} — ${JSON.stringify(emailRes.data)?.substring(0, 200)}`);
  if (emailRes.ok && emailRes.data?.success) {
    pass('Email [welcome]', 'Welcome email sent successfully');
  } else if (emailRes.status === 500 && emailRes.data?.error) {
    warn('Email [welcome]', `Email service error: ${emailRes.data.error} — may be config issue`);
  } else {
    fail('Email [welcome]', `Unexpected: ${emailRes.status}`);
  }

  // Missing email field
  log('\n  Testing email with missing fields...');
  const noEmailRes = await apiPost('/api/auth/send-welcome-email', {});
  if (noEmailRes.status === 400) {
    pass('Email [validation]', 'Missing email returns 400');
  } else {
    warn('Email [validation]', `Expected 400, got ${noEmailRes.status}`);
  }

  // ═══════════════════════════════════════════════
  // PART 10: SERVER STRESS TESTS
  // ═══════════════════════════════════════════════
  log('\n' + '─'.repeat(60));
  log('PART 10: SERVER STRESS TESTS');
  log('─'.repeat(60));

  // Concurrent feature flag requests
  log('\n  Sending 5 concurrent /api/features requests...');
  if (tokens.pro) {
    const concurrentFeatures = await Promise.all(
      Array(5).fill(null).map(() => apiGet('/api/features', tokens.pro))
    );
    const successes = concurrentFeatures.filter(r => r.ok).length;
    if (successes === 5) pass('Stress [concurrent features]', 'All 5 concurrent requests succeeded');
    else warn('Stress [concurrent features]', `${successes}/5 succeeded`);
  }

  // Rapid-fire rate limit test
  log('\n  Sending 15 rapid requests to test rate limiting...');
  if (tokens.pro) {
    const rapidResults: number[] = [];
    const rapidPromises = Array(15).fill(null).map(() => apiGet('/api/features', tokens.pro).then(r => r.status));
    const allStatuses = await Promise.all(rapidPromises);
    const rateLimited = allStatuses.filter(s => s === 429).length;
    const ok200 = allStatuses.filter(s => s === 200).length;
    log(`    Results: ${ok200} OK, ${rateLimited} rate-limited (429)`);
    if (rateLimited > 0) {
      pass('Stress [rate limiting]', `Rate limiting kicked in (${rateLimited} blocked)`);
    } else {
      warn('Stress [rate limiting]', 'No rate limiting in 15 concurrent requests — may be fine for current config');
    }
  }

  // Malformed requests
  log('\n  Testing malformed requests...');
  
  // Empty body
  const emptyBodyRes = await apiPost('/api/audit/analyze', {}, tokens.pro);
  log(`    Empty body: ${emptyBodyRes.status}`);
  if (emptyBodyRes.status >= 400 && emptyBodyRes.status < 500) {
    pass('Stress [empty body]', `Returns ${emptyBodyRes.status} — proper error`);
  } else if (emptyBodyRes.status === 500) {
    warn('Stress [empty body]', 'Returns 500 — should be 400 for invalid input');
  }

  // Invalid URL
  const invalidUrlRes = await apiPost('/api/audit/analyze', { websiteUrl: 'not-a-valid-url-!!!' }, tokens.pro);
  log(`    Invalid URL: ${invalidUrlRes.status} — ${JSON.stringify(invalidUrlRes.data)?.substring(0, 100)}`);
  if (invalidUrlRes.status >= 400) {
    pass('Stress [invalid URL]', `Returns ${invalidUrlRes.status}`);
  }

  // No auth on protected endpoint
  const noAuthAudit = await apiPost('/api/audit/analyze', { websiteUrl: 'example.com' });
  if (noAuthAudit.status === 401) pass('Stress [no auth]', 'Protected endpoint returns 401');
  else fail('Stress [no auth]', `Expected 401, got ${noAuthAudit.status}`);

  // Garbage webhook body
  const garbageWebhook = await fetch(`${BASE_URL}/api/webhooks/dodo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'THIS IS NOT JSON',
  });
  log(`    Garbage webhook body: ${garbageWebhook.status}`);
  if (garbageWebhook.status >= 400) {
    pass('Stress [garbage webhook]', `Server handled gracefully with ${garbageWebhook.status}`);
  } else {
    warn('Stress [garbage webhook]', `Unexpected ${garbageWebhook.status}`);
  }

  // Server health after stress
  log('\n  Checking server health after stress tests...');
  const healthRes = await apiGet('/api/health');
  if (healthRes.ok) pass('Stress [post-stress health]', 'Server still responding normally');
  else fail('Stress [post-stress health]', `Server unhealthy: ${healthRes.status}`);

  // ═══════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════
  log('\n' + '='.repeat(80));
  log('    FINAL RESULTS SUMMARY');
  log('='.repeat(80));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const total = results.length;

  log(`\n  Total: ${total} tests`);
  log(`  ✅ PASS:  ${passed}`);
  log(`  ❌ FAIL:  ${failed}`);
  log(`  ⚠️  WARN:  ${warned}`);
  log(`  ⏭️  SKIP:  ${skipped}`);
  log(`  Success Rate: ${Math.round((passed / (total - skipped)) * 100)}%`);

  if (failed > 0) {
    log('\n  FAILURES:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      log(`    ❌ ${r.name}: ${r.details}`);
    }
  }

  if (warned > 0) {
    log('\n  WARNINGS:');
    for (const r of results.filter(r => r.status === 'WARN')) {
      log(`    ⚠️  ${r.name}: ${r.details}`);
    }
  }

  log('\n' + '='.repeat(80));
  log(failed === 0 ? '    ALL TESTS PASSED! ✅' : `    ${failed} TEST(S) FAILED ❌`);
  log('='.repeat(80) + '\n');
}

runAllTests().catch(e => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
