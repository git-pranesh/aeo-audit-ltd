/**
 * Meta (Facebook) Pixel + Conversions API settings shared by browser and server.
 * Tracking is switched off while META_PIXEL_ID is empty.
 */
export const META_PIXEL_ID = '1109689344985476';

/** DM Champ website chat widget (same bot as citationrocket.com). */
export const CHAT_WIDGET_SRC = 'https://api.dmchamp.com/v1/chat-widget/0lMeDTT5zMPsR7OXhrEM';

/** Google Analytics 4 measurement id (same stream as citationrocket.com). */
export const GA_MEASUREMENT_ID = 'G-J12JW6JMPR';

/** Purchase value reported to Meta: the USD list price of each license. */
export const PLAN_VALUE_USD = { lifetime: 99, agency: 149 } as const;
export type MetaPlan = keyof typeof PLAN_VALUE_USD;

/** HellYeah X-Ray (ad conversion tracking for HellYeah campaigns); same id as citationrocket.com. */
export const XRAY_WEBSITE_ID = '01a188c5-121c-7000-8914-9c4ee203853a';
/** X-Ray's attribution cookie (visitor id and ad click ids), set on .citationrocket.com by the website and the app. */
export const XRAY_COOKIE = 'hy_attr';

/** Set by citationrocket.com on .citationrocket.com: 'consent' when the visitor is in the EEA, UK or Switzerland, else 'open'. */
export const REGION_COOKIE = 'cr_region';
/** 'granted' or 'denied', chosen in the consent banner (shared by the website and the app). */
export const CONSENT_COOKIE = 'cr_consent';
