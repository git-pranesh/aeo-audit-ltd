import 'dotenv/config';
import { analyzeWebsite, runAudit } from '../server/services/audit-pipeline';
import { generateCitationSnapshot } from '../server/services/citation-snapshot';
import { requireOpenRouterKey } from '../server/services/user-service';
import { assertPublicUrl } from '../server/security/ssrf';

let spent = 0, calls = 0;
const orig = globalThis.fetch;
globalThis.fetch = (async (i: any, init: any) => {
  const r = await orig(i, init);
  if (String(i).includes('openrouter.ai/api/v1/chat')) {
    try { const j: any = await r.clone().json(); spent += Number(j?.usage?.cost ?? 0); calls++; } catch {}
  }
  return r;
}) as any;
const take = () => { const s = { usd: spent, calls }; spent = 0; calls = 0; return s; };

(async () => {
  const key = await requireOpenRouterKey('Cgo3ub7nhPesCaBJpCAe0RJXcFm2');
  const url = await assertPublicUrl('zapier.com');
  for (const model of ['deepseek/deepseek-v4-flash', 'openai/gpt-5-mini', 'anthropic/claude-sonnet-5.5']) {
    const models = { structured: { id: model, supportsJson: true } };
    try {
      const s = await analyzeWebsite(url, key, models);
      const ctx = { companyName: s.companyName, industry: s.industry, businessType: s.businessType, targetAudience: s.targetAudience, valueProposition: s.valueProposition, keywords: s.suggestedKeywords, competitors: [] };
      const t = Date.now();
      await runAudit({ auditId: `cost-${model}-${Date.now()}`, websiteUrl: url, context: ctx, apiKey: key, models });
      const c = take();
      console.log(`AUDIT ${model}: $${c.usd.toFixed(5)} in ${c.calls} calls, ${Math.round((Date.now() - t) / 1000)}s`);
    } catch (e: any) { console.log(`AUDIT ${model}: FAILED ${e.message}`); take(); }
  }
  for (const search of ['perplexity/sonar', 'perplexity/sonar-pro', 'openai/gpt-5-mini:online']) {
    try {
      await generateCitationSnapshot({ websiteUrl: url, industry: 'Automation software', companyName: 'Zapier', keywords: ['automation', 'no-code', 'AI workflows'], apiKey: key, auditId: `costs-${search}-${Date.now()}`, model: search });
      const c = take();
      console.log(`CITATION ${search}: $${c.usd.toFixed(5)} in ${c.calls} calls`);
    } catch (e: any) { console.log(`CITATION ${search}: FAILED ${e.message}`); take(); }
  }
  process.exit(0);
})();
