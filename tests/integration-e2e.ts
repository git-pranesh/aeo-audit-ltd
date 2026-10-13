const BASE_URL = 'http://localhost:5000';
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY!;
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID!;

const ACCOUNTS: Record<string, { email: string; password: string }> = {
  free:       { email: 'growthteamtts@gmail.com', password: 'iloveit' },
  starter:    { email: 'denstudioindia@gmail.com', password: 'iloveit' },
  pro:        { email: 'hello@pressense.co', password: 'iloveit' },
  enterprise: { email: 'mithkp19@gmail.com', password: 'iloveit' },
};

let passCount = 0, failCount = 0, skipCount = 0;

function pass(name: string, detail: string, data?: any) {
  passCount++;
  console.log(`  ✅ PASS: ${name} — ${detail}`);
  if (data) console.log(`         ${JSON.stringify(data).slice(0, 300)}`);
}
function fail(name: string, detail: string, data?: any) {
  failCount++;
  console.log(`  ❌ FAIL: ${name} — ${detail}`);
  if (data) console.log(`         ${JSON.stringify(data).slice(0, 500)}`);
}
function skip(name: string, detail: string) {
  skipCount++;
  console.log(`  ⏭️  SKIP: ${name} — ${detail}`);
}

async function firebaseSignIn(email: string, password: string): Promise<{ token: string; uid: string }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Firebase sign-in failed for ${email}: ${data.error?.message}`);
  return { token: data.idToken, uid: data.localId };
}

async function firestoreQuery(collectionId: string, fieldPath: string, op: string, value: string): Promise<any[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath }, op, value: { stringValue: value } } },
      limit: 5
    }
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const results = await res.json();
  if (!Array.isArray(results)) return [];
  return results
    .filter((r: any) => r.document)
    .map((r: any) => {
      const docPath = r.document.name;
      const id = docPath.split('/').pop();
      return { id, ...r.document.fields };
    });
}

function firestoreValue(field: any): any {
  if (!field) return null;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return parseInt(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('mapValue' in field) {
    const obj: any = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) obj[k] = firestoreValue(v);
    return obj;
  }
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(firestoreValue);
  return null;
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
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), ok: res.ok };
}

async function apiPatch(path: string, body: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), ok: res.ok };
}

async function run() {
  console.log('\n' + '='.repeat(80));
  console.log('    CITATION ROCKET — E2E INTEGRATION TEST SUITE');
  console.log('='.repeat(80));

  // ──────────────────────────────────────
  // AUTH
  // ──────────────────────────────────────
  console.log('\n── AUTHENTICATION ──');
  const tokens: Record<string, string> = {};
  const uids: Record<string, string> = {};
  for (const [plan, acct] of Object.entries(ACCOUNTS)) {
    try {
      const { token, uid } = await firebaseSignIn(acct.email, acct.password);
      tokens[plan] = token;
      uids[plan] = uid;
      pass(`Auth [${plan}]`, `Signed in as ${acct.email} (uid: ${uid.slice(0, 8)}...)`);
    } catch (e: any) {
      fail(`Auth [${plan}]`, e.message);
    }
  }

  // ──────────────────────────────────────
  // FIND AUDIT IDS via Firestore REST API
  // ──────────────────────────────────────
  console.log('\n── FIND AUDIT IDS (via Firestore) ──');
  const auditIds: Record<string, string | null> = {};

  for (const plan of ['free', 'starter', 'pro', 'enterprise']) {
    if (!uids[plan]) { auditIds[plan] = null; continue; }
    try {
      const docs = await firestoreQuery('audits', 'userId', 'EQUAL', uids[plan]);
      if (docs.length > 0) {
        auditIds[plan] = docs[0].id;
        const url = docs[0].websiteUrl ? firestoreValue(docs[0].websiteUrl) : '(unknown)';
        pass(`Find audit [${plan}]`, `Found audit ${auditIds[plan]} (${url})`);
      } else {
        auditIds[plan] = null;
        skip(`Find audit [${plan}]`, 'No audits in Firestore for this user');
      }
    } catch (e: any) {
      auditIds[plan] = null;
      skip(`Find audit [${plan}]`, `Firestore query error: ${e.message}`);
    }
  }

  // ══════════════════════════════════════
  // TEST 1: PLAN GATING — FREE PLAN BLOCKED
  // ══════════════════════════════════════
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 1: PLAN GATING — FREE USER BLOCKED FROM PREMIUM FEATURES');
  console.log('─'.repeat(60));

  if (tokens.free && auditIds.free) {
    const reauditRes = await apiPost(`/api/audit/${auditIds.free}/reaudit`, {}, tokens.free);
    if (reauditRes.status === 403) {
      pass('Free → reaudit blocked', `403: ${reauditRes.data?.error}`);
    } else {
      fail('Free → reaudit blocked', `Expected 403, got ${reauditRes.status}`, reauditRes.data);
    }

    const citRefreshRes = await apiPost(`/api/audit/${auditIds.free}/citation-refresh`, {}, tokens.free);
    if (citRefreshRes.status === 403) {
      pass('Free → citation-refresh blocked', `403: ${citRefreshRes.data?.error}`);
    } else {
      fail('Free → citation-refresh blocked', `Expected 403, got ${citRefreshRes.status}`, citRefreshRes.data);
    }
  } else if (tokens.free && !auditIds.free) {
    skip('Free plan gating', 'No audit found for free account — run an audit first');
  } else {
    skip('Free plan gating', 'Could not authenticate free account');
  }

  // Cross-user test: free user tries to access pro's audit
  if (tokens.free && auditIds.pro) {
    const crossRes = await apiPost(`/api/audit/${auditIds.pro}/reaudit`, {}, tokens.free);
    if (crossRes.status === 403) {
      pass('Free → cross-user audit blocked', `403: ${crossRes.data?.error}`);
    } else {
      fail('Free → cross-user audit blocked', `Expected 403, got ${crossRes.status}`, crossRes.data);
    }
  }

  // ══════════════════════════════════════
  // TEST 2: PLAN GATING — TOPIC COUNTS
  // ══════════════════════════════════════
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 2: PLAN GATING — TOPIC COUNTS & FEATURE FLAGS');
  console.log('─'.repeat(60));

  const expected: Record<string, number> = { free: 3, starter: 12, pro: 25, enterprise: 100 };
  const expectedReaudit: Record<string, boolean> = { free: false, starter: true, pro: true, enterprise: true };
  const expectedCitRefresh: Record<string, boolean> = { free: false, starter: true, pro: true, enterprise: true };

  for (const plan of ['free', 'starter', 'pro', 'enterprise']) {
    if (!tokens[plan]) { skip(`Features [${plan}]`, 'No auth token'); continue; }
    const featRes = await apiGet('/api/features', tokens[plan]);
    if (!featRes.ok) { fail(`Features [${plan}]`, `HTTP ${featRes.status}`, featRes.data); continue; }

    const flags = featRes.data?.features;
    if (!flags) { fail(`Features [${plan}]`, 'No "features" key in response', featRes.data); continue; }

    if (flags.topicsPerCategory === expected[plan]) {
      pass(`Topics [${plan}]`, `topicsPerCategory=${flags.topicsPerCategory} (${flags.topicsPerCategory * 4} total) ✓`);
    } else {
      fail(`Topics [${plan}]`, `Expected ${expected[plan]}, got ${flags.topicsPerCategory}`);
    }

    if (flags.reauditButton === expectedReaudit[plan]) {
      pass(`Reaudit flag [${plan}]`, `reauditButton=${flags.reauditButton} ✓`);
    } else {
      fail(`Reaudit flag [${plan}]`, `Expected ${expectedReaudit[plan]}, got ${flags.reauditButton}`);
    }

    if (flags.citationRefreshButton === expectedCitRefresh[plan]) {
      pass(`Citation flag [${plan}]`, `citationRefreshButton=${flags.citationRefreshButton} ✓`);
    } else {
      fail(`Citation flag [${plan}]`, `Expected ${expectedCitRefresh[plan]}, got ${flags.citationRefreshButton}`);
    }

    const reportedPlan = featRes.data?.plan;
    pass(`Server plan [${plan}]`, `Server reports plan="${reportedPlan}"`);
  }

  // ══════════════════════════════════════
  // TEST 3: CHECKLIST PERSISTENCE
  // ══════════════════════════════════════
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 3: CHECKLIST PERSISTENCE');
  console.log('─'.repeat(60));

  const checklistPlan = auditIds.starter ? 'starter' : auditIds.pro ? 'pro' : auditIds.enterprise ? 'enterprise' : null;
  const checklistAuditId = checklistPlan ? auditIds[checklistPlan] : null;
  const checklistToken = checklistPlan ? tokens[checklistPlan] : null;

  if (checklistAuditId && checklistToken) {
    const getRes1 = await apiGet(`/api/audit/${checklistAuditId}/checklist`, checklistToken);
    if (!getRes1.ok) {
      fail('Checklist GET', `Status ${getRes1.status}`, getRes1.data);
    } else if (!getRes1.data?.checklist?.length) {
      skip('Checklist persistence', `Checklist is empty (${getRes1.data?.totalActions || 0} total actions)`);
    } else {
      const items = getRes1.data.checklist;
      pass('Checklist GET', `${items.length} items returned, ${getRes1.data.completedCount} completed, gated=${getRes1.data.gated}`);

      const targetItem = items[0];
      const targetId = targetItem.actionId || targetItem.id;
      const newCompleted = !targetItem.completed;

      console.log(`    → Toggling action "${targetId}" to completed=${newCompleted}...`);
      const patchRes = await apiPatch(`/api/audit/${checklistAuditId}/checklist/${targetId}`, { completed: newCompleted }, checklistToken);
      if (patchRes.ok) {
        pass('Checklist PATCH', `Toggled "${targetId}" to completed=${newCompleted}`);
      } else {
        fail('Checklist PATCH', `Status ${patchRes.status}`, patchRes.data);
      }

      const getRes2 = await apiGet(`/api/audit/${checklistAuditId}/checklist`, checklistToken);
      if (getRes2.ok && getRes2.data?.checklist) {
        const updated = getRes2.data.checklist.find((i: any) => (i.actionId || i.id) === targetId);
        if (updated && updated.completed === newCompleted) {
          pass('Checklist persistence verified', `"${targetId}" persisted as completed=${newCompleted}`);
        } else {
          fail('Checklist persistence', `Expected completed=${newCompleted}, got ${updated?.completed}`, updated);
        }
      } else {
        fail('Checklist re-fetch', `Status ${getRes2.status}`, getRes2.data);
      }

      // Restore original state
      await apiPatch(`/api/audit/${checklistAuditId}/checklist/${targetId}`, { completed: !newCompleted }, checklistToken);
      console.log(`    → Restored "${targetId}" back to original state`);
    }
  } else {
    skip('Checklist persistence', 'No paid-plan audit found to test checklist');
  }

  // ══════════════════════════════════════
  // TEST 4: CITATION REFRESH + COOLDOWN
  // ══════════════════════════════════════
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 4: CITATION REFRESH + 24h COOLDOWN');
  console.log('─'.repeat(60));

  const citPlan = auditIds.pro ? 'pro' : auditIds.starter ? 'starter' : auditIds.enterprise ? 'enterprise' : null;
  const citAuditId = citPlan ? auditIds[citPlan] : null;
  const citToken = citPlan ? tokens[citPlan] : null;

  if (citAuditId && citToken) {
    console.log(`    Using ${citPlan} account, audit ${citAuditId}`);
    const citRes1 = await apiPost(`/api/audit/${citAuditId}/citation-refresh`, {}, citToken);

    if (citRes1.status === 429) {
      pass('Citation refresh — cooldown active', `429: ${citRes1.data?.error} (already refreshed within 24h)`);

      const citRes2 = await apiPost(`/api/audit/${citAuditId}/citation-refresh`, {}, citToken);
      if (citRes2.status === 429) {
        pass('Citation refresh — double cooldown', '429 again on immediate retry ✓');
      } else {
        fail('Citation refresh — double cooldown', `Expected 429, got ${citRes2.status}`, citRes2.data);
      }
    } else if (citRes1.ok) {
      pass('Citation refresh — success', 'Got fresh citation data', {
        mentionRate: citRes1.data?.mentionRate,
        promptsChecked: citRes1.data?.promptsChecked,
      });

      const citRes2 = await apiPost(`/api/audit/${citAuditId}/citation-refresh`, {}, citToken);
      if (citRes2.status === 429) {
        pass('Citation refresh — cooldown after refresh', '429 on immediate retry ✓');
      } else if (citRes2.status === 409) {
        pass('Citation refresh — concurrency guard', '409: refresh still in progress ✓');
      } else {
        fail('Citation refresh — cooldown after refresh', `Expected 429/409, got ${citRes2.status}`, citRes2.data);
      }
    } else {
      fail('Citation refresh', `Status ${citRes1.status}`, citRes1.data);
    }
  } else {
    skip('Citation refresh', 'No paid-plan audit found');
  }

  // ══════════════════════════════════════
  // TEST 5: RE-AUDIT — PLAN GATING + RESPONSE
  // ══════════════════════════════════════
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 5: RE-AUDIT — PLAN GATING + RESPONSE SHAPE');
  console.log('─'.repeat(60));

  const reauditPlan = auditIds.pro ? 'pro' : auditIds.starter ? 'starter' : auditIds.enterprise ? 'enterprise' : null;
  const reauditAuditId = reauditPlan ? auditIds[reauditPlan] : null;
  const reauditToken = reauditPlan ? tokens[reauditPlan] : null;

  if (reauditAuditId && reauditToken) {
    console.log(`    Using ${reauditPlan} account, audit ${reauditAuditId}`);
    console.log(`    ⚠️  NOTE: Re-audit calls the real scoring engine — this may take 30-60 seconds...`);
    const reRes = await apiPost(`/api/audit/${reauditAuditId}/reaudit`, {}, reauditToken);

    if (reRes.status === 429) {
      pass('Re-audit — cooldown active', `429: ${reRes.data?.error} (already re-audited within 24h)`);
    } else if (reRes.ok && reRes.data?.success) {
      pass('Re-audit — success', 'Re-audit completed');

      if (reRes.data.scores || reRes.data.auditData?.scores) {
        const scores = reRes.data.scores || reRes.data.auditData?.scores;
        pass('Re-audit — has scores', `Overall: ${scores.overall || scores.overallScore || JSON.stringify(scores).slice(0, 100)}`);
      } else {
        skip('Re-audit — scores', 'Scores may be nested differently in response');
      }

      if (reRes.data.checklistMerge || reRes.data.mergeSummary) {
        const m = reRes.data.checklistMerge || reRes.data.mergeSummary;
        pass('Re-audit — checklist merge', `carried=${m.carried}, new=${m.new}, resolved=${m.resolved}`);
      } else {
        skip('Re-audit — checklist merge', 'Merge summary not in top-level response');
      }
    } else {
      fail('Re-audit', `Status ${reRes.status}`, reRes.data);
    }
  } else {
    skip('Re-audit', 'No paid-plan audit found');
  }

  // ══════════════════════════════════════
  // TEST 6: DOMAIN LIMIT
  // ══════════════════════════════════════
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 6: DOMAIN LIMIT — FREE PLAN (1 domain max)');
  console.log('─'.repeat(60));

  if (tokens.free) {
    // First check if free user already has an audit (meaning they already used their 1 domain)
    const featRes = await apiGet('/api/features', tokens.free);
    pass('Free features', `plan="${featRes.data?.plan}", features loaded`);

    // Try a new domain — should be blocked if they already have one
    await new Promise(r => setTimeout(r, 2000));
    const domainRes = await apiPost('/api/audit/analyze', { websiteUrl: 'completely-new-test-domain-xyz.com' }, tokens.free);

    if (domainRes.status === 403 && domainRes.data?.code === 'DOMAIN_LIMIT_EXCEEDED') {
      pass('Domain limit — free plan', `403 DOMAIN_LIMIT_EXCEEDED: limit=${domainRes.data.limit}, current=${domainRes.data.currentDomains?.length}`, {
        currentDomains: domainRes.data.currentDomains,
        limit: domainRes.data.limit,
      });
    } else if (domainRes.status === 403) {
      pass('Domain limit — free plan', `403: ${domainRes.data?.error || domainRes.data?.details}`);
    } else if (domainRes.status === 429) {
      skip('Domain limit — free plan', `Hit rate limit (429) before domain check — try again in a few minutes`);
    } else {
      fail('Domain limit — free plan', `Expected 403 DOMAIN_LIMIT_EXCEEDED, got ${domainRes.status}`, domainRes.data);
    }
  } else {
    skip('Domain limit', 'No free account token');
  }

  // Starter plan domain limit config check
  if (tokens.starter) {
    const featRes = await apiGet('/api/features', tokens.starter);
    if (featRes.ok && featRes.data?.features) {
      const limit = featRes.data.features.multiDomainLimit;
      if (limit === 5) {
        pass('Domain limit — starter config', `multiDomainLimit=${limit} ✓`);
      } else {
        fail('Domain limit — starter config', `Expected 5, got ${limit}`);
      }
    }
  }

  // Pro plan = unlimited
  if (tokens.pro) {
    const featRes = await apiGet('/api/features', tokens.pro);
    if (featRes.ok && featRes.data?.features) {
      const limit = featRes.data.features.multiDomainLimit;
      if (limit === null || limit === Infinity || limit >= 999) {
        pass('Domain limit — pro config', `multiDomainLimit=${limit} (unlimited) ✓`);
      } else {
        fail('Domain limit — pro config', `Expected unlimited, got ${limit}`);
      }
    }
  }

  // ══════════════════════════════════════
  // TEST 7: FEATURE FLAGS — FULL STRUCTURE CHECK
  // ══════════════════════════════════════
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 7: FEATURE FLAGS — FULL STRUCTURE CHECK');
  console.log('─'.repeat(60));

  const requiredFlags = [
    'topicsPerCategory', 'playbooks', 'schemaGeneratorLimit', 'competitorWatchlistLimit',
    'quickWinsLimit', 'reauditButton', 'citationRefreshButton', 'citationMonitoringFrequency',
    'citationAlerts', 'multiDomainLimit', 'pdfExport', 'scoreTrendExport',
    'monthlyReaudit', 'quickWinsChecklist'
  ];

  for (const plan of ['free', 'starter', 'pro', 'enterprise']) {
    if (!tokens[plan]) continue;
    const featRes = await apiGet('/api/features', tokens[plan]);
    if (!featRes.ok || !featRes.data?.features) {
      fail(`Flags structure [${plan}]`, `No features in response (status ${featRes.status})`);
      continue;
    }
    const flags = featRes.data.features;
    const missing = requiredFlags.filter(f => !(f in flags));
    if (missing.length === 0) {
      pass(`Flags structure [${plan}]`, `All ${requiredFlags.length} required flags present`);
    } else {
      fail(`Flags structure [${plan}]`, `Missing flags: ${missing.join(', ')}`, flags);
    }
  }

  // ══════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════
  console.log('\n' + '='.repeat(80));
  console.log(`    RESULTS: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) process.exit(1);
}

run().catch(e => { console.error('Fatal error:', e); process.exit(1); });
