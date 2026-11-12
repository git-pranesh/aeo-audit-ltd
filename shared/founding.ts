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

/**
 * A dated sale (Black Friday 2026). While it runs, checkout charges the sale
 * prices and `regularPrices` keeps the step price for the struck-through label.
 * Sales still count toward the founding steps. Dodo's Pay What You Want minimum
 * on both products must be at or below these prices, or checkout fails.
 */
export interface Sale {
  name: string;
  percentOff: number;
  prices: PlanPrices;
  /** ISO times; the sale runs while startsAt <= now < endsAt. */
  startsAt: string;
  endsAt: string;
}

export const SALE: Sale | null = {
  name: 'Black Friday',
  percentOff: 40,
  prices: { lifetime: 59, agency: 89 },
  startsAt: '2026-11-20T00:00:00Z',
  // End of 2 December in US Pacific time.
  endsAt: '2026-12-03T08:00:00Z',
};

export interface SaleStatus extends Sale {
  active: boolean;
  upcoming: boolean;
}

export function saleStatus(now: number = Date.now()): SaleStatus | null {
  if (!SALE) return null;
  const start = Date.parse(SALE.startsAt);
  const end = Date.parse(SALE.endsAt);
  if (now >= end) return null;
  return { ...SALE, active: now >= start, upcoming: now < start };
}

export interface FoundingStatus {
  sold: number;
  total: number;
  /** 1-based step, or 0 once all founding licences are gone. */
  step: number;
  /** Licences left at the current price (0 after the founding run). */
  remainingInStep: number;
  /** Founding licences left in total. */
  remaining: number;
  /** What checkout charges now (the sale price while a sale runs). */
  prices: PlanPrices;
  /** The step price, before any sale. */
  regularPrices: PlanPrices;
  /** The current or next dated sale, or null. */
  sale: SaleStatus | null;
  /** Prices at the next step, or null when the current price is the final one. */
  next: PlanPrices | null;
  founding: boolean;
}

export function foundingStatus(sold: number, now: number = Date.now()): FoundingStatus {
  const n = Math.max(0, Math.floor(sold));
  const sale = saleStatus(now);
  const charge = (p: PlanPrices) => (sale?.active ? sale.prices : p);
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
        prices: charge(s.prices),
        regularPrices: s.prices,
        sale,
        next,
        founding: true,
      };
    }
  }
  return { sold: n, total: FOUNDING_TOTAL, step: 0, remainingInStep: 0, remaining: 0, prices: charge(PRICE_AFTER), regularPrices: PRICE_AFTER, sale, next: null, founding: false };
}
