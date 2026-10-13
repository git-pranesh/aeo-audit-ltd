import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PLAN_LIMITS } from './firestore-utils';

interface PlanConfig {
  auditsPerMonth: number;
  topicsPerCategory: number;
  price: number;
  features: string[];
}

interface PlanSettings {
  free: PlanConfig;
  starter: PlanConfig;
  pro: PlanConfig;
  enterprise: PlanConfig;
  lifetime: PlanConfig;
}

// Cache for plan settings
let cachedSettings: PlanSettings | null = null;
let lastFetch: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getPlanSettings(): Promise<PlanSettings> {
  // Return cached settings if still valid
  const now = Date.now();
  if (cachedSettings && (now - lastFetch) < CACHE_DURATION) {
    return cachedSettings;
  }

  try {
    const settingsRef = doc(db, 'system', 'planSettings');
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      cachedSettings = settingsDoc.data() as PlanSettings;
      lastFetch = now;
      return cachedSettings;
    }
  } catch (error) {
    console.error('Error fetching plan settings:', error);
  }

  // Return default settings if Firestore fails
  return {
    free: PLAN_LIMITS.free,
    starter: PLAN_LIMITS.starter,
    pro: PLAN_LIMITS.pro,
    enterprise: PLAN_LIMITS.enterprise,
    lifetime: PLAN_LIMITS.lifetime
  } as PlanSettings;
}

export async function getPlanLimit(plan: string): Promise<PlanConfig> {
  const settings = await getPlanSettings();
  return settings[plan as keyof PlanSettings] || settings.free;
}

// Force refresh cache
export function clearPlanCache() {
  cachedSettings = null;
  lastFetch = 0;
}

