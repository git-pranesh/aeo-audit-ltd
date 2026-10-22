/**
 * Meta Pixel for the app. Loads only when META_PIXEL_ID is set and the visitor
 * may be tracked: outside the EEA/UK/CH, or after they accepted the consent
 * banner (choice shared with citationrocket.com through a .citationrocket.com cookie).
 */
import { CONSENT_COOKIE, META_PIXEL_ID, REGION_COOKIE } from "@shared/meta";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

const readCookie = (name: string) =>
  document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

export type ConsentState = "allowed" | "denied" | "ask";

/** Visitors not marked by the website are asked, to be safe. */
export function consentState(): ConsentState {
  const consent = readCookie(CONSENT_COOKIE);
  if (consent === "granted") return "allowed";
  if (consent === "denied") return "denied";
  return readCookie(REGION_COOKIE) === "open" ? "allowed" : "ask";
}

export function saveConsent(granted: boolean) {
  const domain = location.hostname.endsWith("citationrocket.com") ? "; domain=.citationrocket.com" : "";
  document.cookie = `${CONSENT_COOKIE}=${granted ? "granted" : "denied"}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax; Secure${domain}`;
  if (granted) loadPixel();
  else pending.length = 0;
}

let loaded = false;
/** Events triggered while we wait for the consent answer; sent only if the visitor accepts. */
const pending: unknown[][] = [];
export function loadPixel() {
  if (loaded || !META_PIXEL_ID || consentState() !== "allowed") return;
  loaded = true;
  // Meta's standard base code. It also records PageViews on in-app navigation.
  const n: Fbq = function (...args: unknown[]) {
    n.callMethod ? n.callMethod(...args) : n.queue!.push(args);
  } as Fbq;
  if (!window._fbq) window._fbq = n;
  n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  window.fbq = n;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  // Only our own events: no automatic button-click or page-metadata events.
  window.fbq("set", "autoConfig", false, META_PIXEL_ID)
  window.fbq("init", META_PIXEL_ID);
  window.fbq("track", "PageView");
  for (const args of pending.splice(0)) window.fbq(...args);
}

/** Standard event with an id shared with the matching server event. */
export function trackMeta(event: string, params: Record<string, unknown> = {}, eventID?: string) {
  const args = ["track", event, params, ...(eventID ? [{ eventID }] : [])];
  if (window.fbq) window.fbq(...args);
  else if (META_PIXEL_ID && consentState() === "ask") pending.push(args);
}
