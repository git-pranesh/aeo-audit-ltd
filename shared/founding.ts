/**
 * Founding 1,000: the first 1,000 direct licences are sold in price steps, then
 * the price settles at PRICE_AFTER for good. The count is real (licences sold
 * through Dodo, minus refunds and chargebacks) and is read by the website and
 * the app from /api/public/founding. Mirror any change in site/lib/site.ts.
 */

export const FOUNDING_TOTAL = 1000;

export interface PlanPrices {
  lifetime: number;
  agency: number;
}

/** Each step applies while `sold < upTo`. */
export const PRICE_STEPS: { upTo: number; prices: PlanPrices }[] = [
  { upTo: 300, prices: { lifetime: 99, agency: 149 } },
  { upTo: 700, prices: { lifetime: 119, agency: 169 } },
  { upTo: 1000, prices: { lifetime: 139, agency: 189 } },
];

export const PRICE_AFTER: PlanPrices = { lifetime: 149, agency: 199 };

export interface FoundingStatus {
  sold: number;
  total: number;
  /** 1-based step, or 0 once all founding licences are gone. */
  step: number;
  /** Licences left at the current price (0 after the founding run). */
  remainingInStep: number;
  /** Founding licences left in total. */
  remaining: number;
  prices: PlanPrices;
  /** Prices at the next step, or null when the current price is the final one. */
  next: PlanPrices | null;
  founding: boolean;
}

export function foundingStatus(sold: number): FoundingStatus {
  const n = Math.max(0, Math.floor(sold));
  for (let i = 0; i < PRICE_STEPS.length; i++) {
    const s = PRICE_STEPS[i];
    if (n < s.upTo) {
      const next = PRICE_STEPS[i + 1]?.prices ?? PRICE_AFTER;
      return {
        sold: n,
        total: FOUNDING_TOTAL,
        step: i + 1,
        remainingInStep: s.upTo - n,
        remaining: FOUNDING_TOTAL - n,
        prices: s.prices,
        next,
        founding: true,
      };
    }
  }
  return { sold: n, total: FOUNDING_TOTAL, step: 0, remainingInStep: 0, remaining: 0, prices: PRICE_AFTER, next: null, founding: false };
}
