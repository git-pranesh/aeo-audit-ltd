/**
 * Meta (Facebook) Pixel + Conversions API settings shared by browser and server.
 * Tracking is switched off while META_PIXEL_ID is empty.
 */
export const META_PIXEL_ID = '1148542264388952';

/** Purchase value reported to Meta: the USD list price of each license. */
export const PLAN_VALUE_USD = { lifetime: 99, agency: 149 } as const;
export type MetaPlan = keyof typeof PLAN_VALUE_USD;

/** Set by citationrocket.com on .citationrocket.com: 'consent' when the visitor is in the EEA, UK or Switzerland, else 'open'. */
export const REGION_COOKIE = 'cr_region';
/** 'granted' or 'denied', chosen in the consent banner (shared by the website and the app). */
export const CONSENT_COOKIE = 'cr_consent';
