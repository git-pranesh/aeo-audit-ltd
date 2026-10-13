import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { getFeatureFlags } from './feature-flags';

function getFirestoreDb() {
  let app;
  try { app = getApp('domain-limiter-app'); } catch {
    app = initializeApp({
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    }, 'domain-limiter-app');
  }
  return getFirestore(app);
}

export function normalizeDomain(websiteUrl: string): string {
  try {
    const normalized = websiteUrl.toLowerCase();
    const url = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return websiteUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

export function extractUniqueDomains(audits: Array<{ websiteUrl: string }>): string[] {
  const domainSet = new Set<string>();
  for (const audit of audits) {
    if (audit.websiteUrl) {
      domainSet.add(normalizeDomain(audit.websiteUrl));
    }
  }
  return Array.from(domainSet);
}

export interface DomainCheckResult {
  allowed: boolean;
  currentDomains: string[];
  limit: number;
  isNewDomain: boolean;
  requestedDomain: string;
}

export async function getUserDomainCount(userId: string): Promise<{ domains: string[], count: number }> {
  const db = getFirestoreDb();
  const auditsRef = collection(db, 'audits');
  const q = query(auditsRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);

  const domains = extractUniqueDomains(
    snapshot.docs.map(doc => ({ websiteUrl: doc.data().websiteUrl }))
  );

  return { domains, count: domains.length };
}

export async function checkDomainLimit(
  userId: string,
  websiteUrl: string,
  plan: string
): Promise<DomainCheckResult> {
  const flags = getFeatureFlags(plan);
  const limit = flags.multiDomainLimit;
  const requestedDomain = normalizeDomain(websiteUrl);

  if (limit >= 999) {
    return {
      allowed: true,
      currentDomains: [],
      limit,
      isNewDomain: false,
      requestedDomain,
    };
  }

  const { domains } = await getUserDomainCount(userId);
  const isNewDomain = !domains.includes(requestedDomain);

  if (!isNewDomain) {
    return {
      allowed: true,
      currentDomains: domains,
      limit,
      isNewDomain: false,
      requestedDomain,
    };
  }

  return {
    allowed: domains.length < limit,
    currentDomains: domains,
    limit,
    isNewDomain: true,
    requestedDomain,
  };
}
