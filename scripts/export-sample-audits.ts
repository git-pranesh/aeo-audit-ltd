// Runs full audits through the production pipeline and saves the complete
// output for the marketing site's sample audits.
// Usage: npx tsx scripts/export-sample-audits.ts <account-email> <outDir> [slug...]
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { adminDb } from '../server/firebase-admin';
import { requireOpenRouterKey } from '../server/services/user-service';
import { analyzeWebsite, runAudit } from '../server/services/audit-pipeline';
import { generateCitationSnapshot } from '../server/services/citation-snapshot';
import { generateAeoFiles } from '../server/services/aeo-pack';
import { MODEL_MAP } from '../server/services/openrouter';

const SITES = [
  { slug: 'morgan-and-morgan', url: 'https://www.morganandmorgan.com', category: 'Legal / personal injury', competitors: [] as string[] },
  { slug: 'zapier', url: 'https://zapier.com', category: 'B2B SaaS / automation', competitors: ['make.com'] },
  { slug: 'allbirds', url: 'https://www.allbirds.com', category: 'E-commerce / footwear', competitors: ['rothys.com'] },
  { slug: 'shake-shack', url: 'https://shakeshack.com', category: 'Restaurant chain', competitors: ['fiveguys.com'] },
  { slug: 'charity-water', url: 'https://www.charitywater.org', category: 'Nonprofit', competitors: ['water.org'] },
];

const [email, outDir, ...only] = process.argv.slice(2);
const users = await adminDb.collection('users').where('email', '==', email).limit(1).get();
if (users.empty) throw new Error(`No user ${email}`);
const apiKey = await requireOpenRouterKey(users.docs[0].id);
fs.mkdirSync(outDir, { recursive: true });

for (const site of SITES.filter((s) => !only.length || only.includes(s.slug))) {
  console.log(`\n=== ${site.slug}`);
  const started = Date.now();
  const suggestion = await analyzeWebsite(site.url, apiKey);
  const context = { companyName: suggestion.companyName, industry: suggestion.industry, businessType: suggestion.businessType, targetAudience: suggestion.targetAudience, valueProposition: suggestion.valueProposition, keywords: suggestion.suggestedKeywords, competitors: site.competitors };
  const { auditData, aeoInputs } = await runAudit({ auditId: `sample-${site.slug}`, websiteUrl: site.url, context, apiKey });
  const auditSeconds = Math.round((Date.now() - started) / 1000);
  // Re-use a citation check already saved in outDir (KEEP_CITATION=1) to avoid paying for it twice.
  const existing = path.join(outDir, `${site.slug}.json`);
  const kept = process.env.KEEP_CITATION && fs.existsSync(existing) ? JSON.parse(fs.readFileSync(existing, 'utf8')).citationSnapshot : null;
  const snapshot = kept ?? await generateCitationSnapshot({
    websiteUrl: site.url, industry: context.industry, companyName: context.companyName, keywords: context.keywords, apiKey,
  });
  const aeoFiles = await generateAeoFiles({
    websiteUrl: site.url, companyName: context.companyName, industry: context.industry, businessType: context.businessType,
    targetAudience: context.targetAudience, valueProposition: context.valueProposition, keywords: context.keywords,
    signals: aeoInputs.signals, sitemapUrls: aeoInputs.sitemapUrls, facts: aeoInputs.facts,
    sitemapLocation: aeoInputs.sitemapLocation, hasLlmsTxt: aeoInputs.hasLlmsTxt,
  });
  const out = {
    slug: site.slug, category: site.category, websiteUrl: site.url,
    auditedAt: new Date().toISOString(), auditSeconds,
    models: { analysis: MODEL_MAP.structured, citation: MODEL_MAP.webSearch },
    context, auditData, citationSnapshot: snapshot, aeoFiles,
  };
  fs.writeFileSync(path.join(outDir, `${site.slug}.json`), JSON.stringify(out, null, 1));
  console.log(`saved ${site.slug}: score ${auditData.auditResults?.overallScore} mentioned ${snapshot.mentionRate ?? ''}`);
}
process.exit(0);
