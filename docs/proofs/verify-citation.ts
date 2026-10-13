/**
 * Reproducible proof for Task #16 — Citation Snapshot & Alerts (docs/00 §5, §7, §12).
 *
 * Runs the REAL citation pipeline offline by stubbing global.fetch (the only
 * external I/O in llm-router.llmCall). No API key and no network/Firestore spend.
 *
 * Run: npx tsx docs/proofs/verify-citation.ts
 */

type Canned = (prompt: string) => string;

function installFetchMock(canned: Canned) {
  (global as any).fetch = async (_url: string, opts: any) => {
    const body = JSON.parse(opts.body);
    const prompt: string = body.messages?.[0]?.content ?? '';
    const content = canned(prompt);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        };
      },
      async text() { return content; },
    };
  };
}

function line(label: string, val: unknown) {
  console.log(`${label} ${typeof val === 'object' ? JSON.stringify(val) : val}`);
}

async function main() {
  const { generateCitationSnapshot } = await import('../../server/citation-snapshot-service');
  const { getFeatureFlags } = await import('../../shared/feature-flags');
  const { detectCitationChanges } = await import('../../server/citation-history-service');

  // ── Run A: main pipeline — prompt count, mention rate, competitor >=2 filter ──
  // Every answer names 3 competitors (each in domain form). "Acme" is named only
  // when the prompt is an identity/reputation/vs-alternatives prompt. A one-off
  // competitor ("Oneoff") appears in exactly one answer to prove the >=2 rule.
  installFetchMock((prompt) => {
    let text = 'Recommended options include Alpha (alpha.com), Bravo (bravo.com), Charlie (charlie.com).';
    if (/acme/i.test(prompt)) text = 'Acme Corp is a solid choice. ' + text;
    if (/vs alternatives/i.test(prompt)) text += ' Also see Oneoff (oneoff.com).';
    return text;
  });

  const runA = await generateCitationSnapshot({
    websiteUrl: 'https://acme.io',
    industry: 'cloud-based project management software',
    companyName: 'Acme',
    keywords: ['project management', 'task tracking', 'team collaboration', 'roadmaps'],
    apiKey: 'test-key',
  });
  line('A totalPromptsChecked:', runA.totalPromptsChecked);
  line('A mentionedCount:', runA.mentionedCount);
  line('A mentionRate (=round(mentioned/total*100)):', runA.mentionRate);
  line('A competitors (name/timesFound):', runA.topCompetitorsCited.map(c => `${c.name}:${c.timesFound}`));
  line('A Oneoff excluded (appeared 1x, <2):', !runA.topCompetitorsCited.some(c => c.name.toLowerCase() === 'oneoff'));

  // ── Run B: competitor list capped at top 10 ──
  installFetchMock(() => {
    const parts = [];
    for (let i = 1; i <= 12; i++) parts.push(`C${i} (c${i}.com)`);
    return 'Top tools: ' + parts.join(', ') + '.';
  });
  const runB = await generateCitationSnapshot({
    websiteUrl: 'https://acme.io',
    industry: 'software',
    companyName: 'Acme',
    keywords: ['a', 'b'],
    apiKey: 'test-key',
  });
  line('B distinct 2+ competitors found -> returned (cap 10):', runB.topCompetitorsCited.length);

  // ── Run C: detection via DOMAIN (no name in text) ──
  installFetchMock(() => 'The best option is available at acme.io for teams.');
  const runC = await generateCitationSnapshot({
    websiteUrl: 'https://acme.io',
    industry: 'software',
    companyName: 'Acme',
    keywords: ['a'],
    apiKey: 'test-key',
  });
  line('C domain-only match -> mentionRate:', runC.mentionRate);

  // ── Run D: fewer prompts when no company name + few keywords (variable, <=12) ──
  installFetchMock(() => 'Generic answer with no brands.');
  const runD = await generateCitationSnapshot({
    websiteUrl: 'https://acme.io',
    industry: 'software',
    companyName: '',
    keywords: [],
    apiKey: 'test-key',
  });
  line('D no-name prompt count (<=12, variable):', runD.totalPromptsChecked);

  // ── Feature flags per plan: monitoring frequency + alerts ──
  const plans = ['free', 'starter', 'pro', 'enterprise', 'lifetime'];
  for (const p of plans) {
    const f = getFeatureFlags(p);
    line(`FLAGS ${p}: freq=${f.citationMonitoringFrequency} alerts=`, f.citationAlerts);
  }

  // ── detectCitationChanges: significance rules ──
  const base = { totalPromptsChecked: 12, promptResults: [] as any[], snapshotDate: '', estimatedCost: 0 };
  const bigGain = detectCitationChanges(
    { ...base, mentionRate: 60, mentionedCount: 5, topCompetitorsCited: [] },
    { runId: 'r', runAt: '', trigger: 'scheduled', mentionRate: 0, mentionedCount: 0, totalPromptsChecked: 12, topCompetitorsCited: [], promptSummaries: [] },
  );
  const small = detectCitationChanges(
    { ...base, mentionRate: 55, mentionedCount: 5, topCompetitorsCited: [] },
    { runId: 'r', runAt: '', trigger: 'scheduled', mentionRate: 50, mentionedCount: 5, totalPromptsChecked: 12, topCompetitorsCited: [], promptSummaries: [] },
  );
  const corrupt = detectCitationChanges(
    { ...base, mentionRate: 20, mentionedCount: 2, topCompetitorsCited: [] },
    { runId: 'r', runAt: '', trigger: 'scheduled', mentionRate: 100, mentionedCount: 12, totalPromptsChecked: 12, topCompetitorsCited: [], promptSummaries: [] },
  );
  const recovery = detectCitationChanges(
    { ...base, mentionRate: 60, mentionedCount: 5, topCompetitorsCited: [] },
    { runId: 'r', runAt: '', trigger: 'scheduled', mentionRate: 0, mentionedCount: 0, totalPromptsChecked: 12, topCompetitorsCited: [], promptSummaries: [], isRecovery: true },
  );
  line('CHANGES bigGain(0->60, mentions>=2) significant:', bigGain.hasSignificantChange);
  line('CHANGES small(50->55) significant:', small.hasSignificantChange);
  line('CHANGES corruptBaseline(prev 100% / 0 comp) significant:', corrupt.hasSignificantChange);
  line('CHANGES recoveryBaseline significant:', recovery.hasSignificantChange);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
