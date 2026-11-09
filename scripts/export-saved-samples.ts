// Copies audits already run in the live app (saved in Firestore) into the marketing site's
// sample-audit files. No AI calls: the AEO pack is built from the saved audit, as the app does.
// Usage: npx tsx scripts/export-saved-samples.ts <account-email> <outDir>
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { adminDb } from '../server/firebase-admin';
import { generateAeoFiles } from '../server/services/aeo-pack';
import { MODEL_MAP } from '../server/services/openrouter';
import { ENGINES } from '../shared/engines';

const SAMPLES = [
  { slug: 'zapier', id: '5b2bb1df1aba74440cac9344', category: 'B2B SaaS / automation' },
  { slug: 'notion', id: '27d9a2c171fece1f4b3782bc', category: 'SaaS / workspace' },
  { slug: 'hubspot', id: 'ff61b742a19ad133d78fc7ff', category: 'B2B SaaS / CRM and marketing' },
  { slug: 'calendly', id: '4dd131c321884ab0008d4a5d', category: 'SaaS / scheduling' },
  { slug: 'plausible', id: '6ce8f8d4d6cb4a44527c9114', category: 'SaaS / web analytics' },
];

const [email, outDir] = process.argv.slice(2);
const users = await adminDb.collection('users').where('email', '==', email).limit(1).get();
if (users.empty) throw new Error(`No user ${email}`);
const user = users.docs[0];
const analysisModel = user.data().aiModels?.structured?.id ?? MODEL_MAP.structured;
fs.mkdirSync(outDir, { recursive: true });

for (const s of SAMPLES) {
  const doc = await adminDb.collection('audits').doc(s.id).get();
  const a = doc.data();
  if (!a || a.userId !== user.id || a.status !== 'completed' || !a.auditData?.citationSnapshot) throw new Error(`${s.slug}: not a finished audit with a check`);
  const ctx = a.context;
  const aeoFiles = await generateAeoFiles({
    websiteUrl: a.websiteUrl, companyName: ctx.companyName || a.domain, industry: ctx.industry, businessType: ctx.businessType,
    targetAudience: ctx.targetAudience, valueProposition: ctx.valueProposition, keywords: ctx.keywords,
    signals: a.aeoInputs.signals, sitemapUrls: a.aeoInputs.sitemapUrls, facts: a.aeoInputs.facts,
    sitemapLocation: a.aeoInputs.sitemapLocation, hasLlmsTxt: a.aeoInputs.hasLlmsTxt,
  });
  const out = {
    slug: s.slug, category: s.category, websiteUrl: a.websiteUrl,
    auditedAt: a.completedAt ?? a.createdAt,
    auditSeconds: Math.round((Date.parse(a.completedAt) - Date.parse(a.createdAt)) / 1000),
    models: { analysis: analysisModel, citation: ENGINES.map((e) => e.model).join(', ') },
    context: ctx, auditData: a.auditData, citationSnapshot: a.auditData.citationSnapshot, aeoFiles,
    appAuditId: s.id,
  };
  fs.writeFileSync(path.join(outDir, `${s.slug}.json`), JSON.stringify(out, null, 1));
  console.log(`${s.slug}: score ${a.overallScore} ${a.letterGrade}, check $${out.citationSnapshot.estimatedCost}, ${out.auditSeconds}s`);
}
process.exit(0);
