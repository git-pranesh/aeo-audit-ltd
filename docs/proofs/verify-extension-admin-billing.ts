/**
 * Reproducible proof for Task #17 — Extension, Models, Admin, Billing & Account
 * (docs/00 §6, §7, §10, §13, §14; docs/02 §1, §5; docs/03 §1, §2; docs/06 Email).
 *
 * Executes the REAL importable modules (no network, no Firestore spend) and
 * asserts structural claims by reading the shipped source files with line refs.
 *
 * Run: npx tsx docs/proofs/verify-extension-admin-billing.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function assert(id: string, cond: boolean, detail: string) {
  const tag = cond ? '✅ PASS' : '❌ FAIL';
  if (cond) pass++; else fail++;
  console.log(`${tag} ${id}  ${detail}`);
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

async function main() {
  // ── EA-05 / EA-06: live model routing (executes MODEL_MAP) ──────────────────
  const { MODEL_MAP } = await import('../../server/llm-router');
  assert('EA-05', MODEL_MAP.contentVerification === 'deepseek/deepseek-v4-flash',
    `contentVerification=${MODEL_MAP.contentVerification} (doc00 correct; doc06/07 "gpt-4.1-nano" is OUTDATED)`);
  assert('EA-06', MODEL_MAP.companyResearch === 'perplexity/sonar'
    && MODEL_MAP.citationSnapshot === 'perplexity/sonar'
    && MODEL_MAP.perplexitySonarPro === 'perplexity/sonar-pro'
    && MODEL_MAP.fallback === 'openai/gpt-4o-mini',
    `research/citation=sonar, deep=sonar-pro, fallback=${MODEL_MAP.fallback}`);

  // ── EA-07: API plan quotas (executes API_PLAN_LIMITS) ───────────────────────
  const { API_PLAN_LIMITS } = await import('../../server/api-key-service');
  assert('EA-07', API_PLAN_LIMITS.free === 50 && API_PLAN_LIMITS.starter === 500
    && API_PLAN_LIMITS.professional === 5000 && API_PLAN_LIMITS.enterprise === 20000,
    `quotas=${JSON.stringify(API_PLAN_LIMITS)}`);

  // ── EA-01/02/03/04: Chrome extension (read shipped manifest + content.js) ────
  const manifest = JSON.parse(read('extension/manifest.json'));
  const content = read('extension/content.js');
  assert('EA-01', /scoreSchemaCompleteness|scoreFreshness|checkRedditPresence/.test(content)
    && manifest.content_scripts?.[0]?.matches?.includes('https://*/*'),
    'content.js audits current tab client-side (content_scripts on all pages)');
  assert('EA-02', ['Answer Capsule', 'Schema', 'Freshness', 'Fan-Out', 'Bot Access']
    .every((m) => content.includes(m)),
    '5 module labels present in content.js');
  assert('EA-03', content.includes('OAI-SearchBot') && /llmsTxtExists/.test(content)
    && /checkRedditPresence/.test(content),
    'robots.txt AI-bot check + llms.txt existence + Reddit background check');
  assert('EA-04', manifest.manifest_version === 3 && !!manifest.side_panel
    && Array.isArray(manifest.permissions) && manifest.permissions.includes('sidePanel'),
    `MV3 + side_panel + chrome.* perms (v${manifest.manifest_version})`);

  // ── EA-08: /api/keys/checkout returns 503 (source assertion) ─────────────────
  const routes = read('server/routes.ts');
  const checkoutIdx = routes.indexOf("app.post('/api/keys/checkout'");
  const checkoutBlock = routes.slice(checkoutIdx, checkoutIdx + 200);
  assert('EA-08', checkoutIdx > 0 && /status\(503\)/.test(checkoutBlock)
    && /API billing is not yet available/.test(checkoutBlock),
    'POST /api/keys/checkout → 503 "API billing is not yet available"');

  // ── EA-09: admin allowlist (exactly ONE email) OR isAdmin flag ───────────────
  const adminUtils = read('client/src/lib/admin-utils.ts');
  const allowlistMatch = adminUtils.match(/ADMIN_EMAILS\s*=\s*\[([\s\S]*?)\]/);
  const allowlist = (allowlistMatch?.[1].match(/'[^']+'|"[^"]+"/g) || [])
    .map((s) => s.slice(1, -1));
  assert('EA-09',
    allowlist.length === 1 && allowlist[0] === 'hello@pressense.co'
    && /userDoc\?\.isAdmin/.test(adminUtils),
    `CONFLICT: ADMIN_EMAILS = [${allowlist.join(', ')}] — exactly ${allowlist.length} email, NOT "+2"; isAdmin flag also honored`);

  // ── EA-10: admin dashboard tabs (source assertion) ──────────────────────────
  const adminDash = read('client/src/pages/admin/admin-dashboard.tsx');
  const tabVals = [...adminDash.matchAll(/TabsTrigger value="([^"]+)"/g)].map((m) => m[1]);
  assert('EA-10', tabVals.includes('users') && tabVals.includes('prompts')
    && tabVals.includes('home-content') && tabVals.includes('api-usage')
    && tabVals.includes('demo') && !tabVals.includes('view-as-plan'),
    `CONFLICT: tabs=[${tabVals.join(',')}] — no "View-As-Plan" tab (it is a toggle component); more tabs than documented`);

  // ── EA-11: Firebase email/password auth ─────────────────────────────────────
  const authSvc = read('client/src/lib/auth-service.ts');
  assert('EA-11', /firebase\/auth/.test(authSvc)
    && /createUserWithEmailAndPassword|signInWithEmailAndPassword/.test(authSvc),
    'Firebase email/password auth in auth-service.ts');

  // ── EA-12: profile tabs (source assertion) ──────────────────────────────────
  const profile = read('client/src/pages/profile.tsx');
  const pTabs = [...profile.matchAll(/TabsTrigger value="([^"]+)"/g)].map((m) => m[1]);
  assert('EA-12', ['profile', 'security', 'subscription', 'billing', 'usage', 'api-config']
    .every((t) => pTabs.includes(t)),
    `tabs=[${pTabs.join(',')}] — doc omits "notifications" tab present in code`);

  // ── EA-13: upgrade immediate / downgrade at period end ──────────────────────
  const subSvc = read('server/subscription-service.ts');
  assert('EA-13', /effective at period end/i.test(subSvc)
    && /setMonth\(effectiveDate\.getMonth\(\) \+ 1\)/.test(subSvc)
    && /upgradeSubscription/.test(subSvc),
    'downgrade effectiveDate = first day of next month; upgrade via immediate checkout');

  // ── EA-14: Dodo webhook Svix verification, fail-closed in prod ──────────────
  const whIdx = routes.indexOf("app.post('/api/webhooks/dodo'");
  const whBlock = routes.slice(whIdx, whIdx + 3000);
  assert('EA-14', whIdx > 0 && /verifyWebhookSignature/.test(whBlock)
    && /svix-signature/.test(whBlock) && /DODO_WEBHOOK_SECRET not configured in production/.test(whBlock),
    'Svix signature verify; prod rejects when DODO_WEBHOOK_SECRET missing (fail-closed)');

  // ── EA-15: only percentage coupons; fixed rejected (source assertion) ───────
  const dodo = read('server/dodo-service.ts');
  assert('EA-15', /only supports 'percentage'/.test(dodo)
    && /Fixed discounts not supported by DODO/.test(dodo),
    'createDiscount converts/rejects fixed; percentage-only');

  // ── EA-16: Resend transactional + Loops lifecycle; MailerSend not set ───────
  const emailSvc = read('server/email-service.ts');
  const loopsSvc = read('server/loops-service.ts');
  const mailerSet = !!process.env.MAILERSEND_API_KEY;
  assert('EA-16', /RESEND_API_KEY/.test(emailSvc) && /new Resend/.test(emailSvc)
    && /loops/i.test(loopsSvc) && !mailerSet,
    `Resend transactional + Loops lifecycle; MAILERSEND_API_KEY set=${mailerSet}`);

  // ── EA-17: in-app cancel + invoice download NOT implemented ─────────────────
  const cancelUi = read('client/src/components/profile/subscription-management.tsx');
  const invoiceUi = read('client/src/components/profile/billing-history.tsx');
  assert('EA-17', /TODO: Implement actual DODO API cancellation/.test(cancelUi)
    && /TODO: Implement actual invoice download from DODO API/.test(invoiceUi),
    'both cancellation and invoice download are TODO stubs');

  console.log(`\n── Task #17 proof: ${pass} passed, ${fail} failed ──`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
