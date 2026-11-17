/**
 * Anonymous research copies: the long-term dataset behind benchmarks and reports.
 *
 * Every finished audit and every citation check is copied here with a fresh random id
 * and no user id, email or account link, so the copy cannot be traced back to who ran it.
 * Copies are kept when the original audit rotates out or the account is deleted
 * (disclosed in the Privacy Policy). Domains are stored for de-duplication and
 * industry grouping; they are never published individually.
 *
 *   research_audits: website, industry and the full audit result
 *   research_checks: questions, AI engines, who was mentioned, competitors cited
 *
 * Also keeps a running AI spend per account (users.aiSpend) for Admin.
 * Nothing here may fail an audit: every write is best-effort.
 */

import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';
import type { AuditData } from '../../shared/schema';

type Context = { companyName?: string; industry?: string; businessType?: string; targetAudience?: string; keywords?: string[]; competitors?: string[] };

const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
const rid = () => crypto.randomBytes(12).toString('hex');

export async function recordAuditResearch(p: {
  source: 'app' | 'preview';
  websiteUrl: string;
  domain: string;
  context: Context;
  auditData: AuditData;
  aiCostUsd?: number;
  agency?: boolean;
}): Promise<void> {
  try {
    const { citationSnapshot: _skip, ...rest } = p.auditData as AuditData & { citationSnapshot?: unknown };
    await adminDb.collection('research_audits').doc(rid()).set({
      v: 1,
      source: p.source,
      createdAt: new Date().toISOString(),
      domain: p.domain,
      websiteUrl: p.websiteUrl,
      industry: p.context.industry || '',
      businessType: p.context.businessType || '',
      targetAudience: p.context.targetAudience || '',
      keywords: (p.context.keywords ?? []).slice(0, 20),
      competitors: (p.context.competitors ?? []).slice(0, 20),
      overallScore: p.auditData.auditResults.overallScore,
      letterGrade: p.auditData.auditResults.letterGrade,
      platformScores: clean(p.auditData.auditResults.platformScores),
      ...(typeof p.aiCostUsd === 'number' ? { aiCostUsd: Number(p.aiCostUsd.toFixed(6)) } : {}),
      ...(p.agency !== undefined ? { agencyAccount: p.agency } : {}),
      auditData: clean(rest),
    });
  } catch (err: any) {
    console.warn('Research copy (audit) failed:', err?.message);
  }
}

export async function recordCheckResearch(p: {
  domain: string;
  context: Context;
  snapshot: Record<string, any>;
}): Promise<void> {
  try {
    const s = p.snapshot;
    const answers = (s.promptResults ?? []).map((r: any) => ({
      engine: r.engine ?? null,
      prompt: r.prompt ?? null,
      mentioned: !!r.mentioned,
      mentionContext: r.mentionContext ?? null,
      error: r.error ? String(r.error).slice(0, 200) : null,
      competitors: Array.isArray(r.competitorsMentioned) ? r.competitorsMentioned.slice(0, 20) : [],
      answer: typeof r.fullResponse === 'string' ? r.fullResponse.slice(0, 4000) : null,
    }));
    await adminDb.collection('research_checks').doc(rid()).set(clean({
      v: 1,
      createdAt: new Date().toISOString(),
      domain: p.domain,
      companyName: p.context.companyName || '',
      industry: p.context.industry || '',
      keywords: (p.context.keywords ?? []).slice(0, 20),
      totalAnswers: s.totalPromptsChecked ?? answers.length,
      mentionedCount: s.mentionedCount ?? 0,
      mentionRate: s.mentionRate ?? 0,
      engines: s.engines ?? null,
      topCompetitorsCited: s.topCompetitorsCited ?? [],
      aiCostUsd: s.estimatedCost ?? null,
      answers,
    }));
  } catch (err: any) {
    console.warn('Research copy (check) failed:', err?.message);
  }
}

/** Running AI spend on the account's own OpenRouter key, for Admin. */
export async function addAiSpend(uid: string, kind: 'audits' | 'checks', usd: number): Promise<void> {
  if (!(usd > 0)) return;
  try {
    await adminDb.collection('users').doc(uid).set({ aiSpend: { [kind]: FieldValue.increment(usd) } }, { merge: true });
  } catch (err: any) {
    console.warn('AI spend update failed:', err?.message);
  }
}
