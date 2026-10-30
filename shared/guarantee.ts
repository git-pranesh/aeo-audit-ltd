/**
 * Money-back guarantee for direct purchases: refund yourself from Settings
 * within GUARANTEE.days of buying, as long as you have run fewer than
 * GUARANTEE.maxAudits audits and downloaded nothing (PDF, CSV or AEO Pack).
 * After that the licence is yours and the sale is final. Mirrored in the
 * website's Terms and pricing page.
 */
export const GUARANTEE = { days: 14, maxAudits: 3 } as const;

export type GuaranteeReason = 'ok' | 'not_direct' | 'expired' | 'audits' | 'downloads' | 'refunded';

export interface GuaranteeStatus {
  eligible: boolean;
  reason: GuaranteeReason;
  /** End of the guarantee window (ISO). */
  until: string;
  auditsRun: number;
  downloads: number;
  maxAudits: number;
}

export interface GuaranteeUsage {
  auditsRun?: number;
  downloads?: number;
  refundRequestedAt?: string;
  refundId?: string;
}

export function guaranteeStatus(input: {
  channel: 'direct' | 'marketplace' | 'partner';
  purchasedAt: string;
  usage: GuaranteeUsage | undefined;
  now?: Date;
}): GuaranteeStatus {
  const usage = input.usage ?? {};
  const auditsRun = usage.auditsRun ?? 0;
  const downloads = usage.downloads ?? 0;
  const until = new Date(new Date(input.purchasedAt).getTime() + GUARANTEE.days * 24 * 60 * 60 * 1000).toISOString();
  const base = { until, auditsRun, downloads, maxAudits: GUARANTEE.maxAudits };
  const now = input.now ?? new Date();

  if (usage.refundRequestedAt) return { ...base, eligible: false, reason: 'refunded' };
  if (input.channel !== 'direct') return { ...base, eligible: false, reason: 'not_direct' };
  if (now.toISOString() > until) return { ...base, eligible: false, reason: 'expired' };
  if (downloads > 0) return { ...base, eligible: false, reason: 'downloads' };
  if (auditsRun >= GUARANTEE.maxAudits) return { ...base, eligible: false, reason: 'audits' };
  return { ...base, eligible: true, reason: 'ok' };
}
