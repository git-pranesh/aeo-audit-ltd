export interface FeatureFlags {
  quickWinsChecklist: 'basic' | 'full';
  quickWinsLimit: number;
  monthlyReaudit: boolean;
  citationAlerts: boolean;
  citationRefreshButton: boolean;
  citationMonitoringFrequency: 'none' | 'monthly' | 'weekly' | 'daily';
  multiDomainLimit: number;
  reauditButton: boolean;
  topicsPerCategory: number;
  playbooks: 'basic' | 'full' | 'full_priority' | 'full_whitelabel';
  schemaGeneratorLimit: number;
  competitorWatchlistLimit: number;
  pdfExport: 'watermarked' | 'clean' | 'whitelabel';
  scoreTrendExport: boolean;
}

const PLAN_FEATURES: Record<string, FeatureFlags> = {
  free: {
    quickWinsChecklist: 'basic',
    quickWinsLimit: 3,
    monthlyReaudit: false,
    citationAlerts: false,
    citationRefreshButton: false,
    citationMonitoringFrequency: 'none',
    multiDomainLimit: 1,
    reauditButton: false,
    topicsPerCategory: 3,
    playbooks: 'basic',
    schemaGeneratorLimit: 1,
    competitorWatchlistLimit: 0,
    pdfExport: 'watermarked',
    scoreTrendExport: false,
  },
  starter: {
    quickWinsChecklist: 'full',
    quickWinsLimit: Infinity,
    monthlyReaudit: true,
    citationAlerts: false,
    citationRefreshButton: true,
    citationMonitoringFrequency: 'monthly',
    multiDomainLimit: 5,
    reauditButton: true,
    topicsPerCategory: 12,
    playbooks: 'full',
    schemaGeneratorLimit: 999,
    competitorWatchlistLimit: 3,
    pdfExport: 'clean',
    scoreTrendExport: false,
  },
  pro: {
    quickWinsChecklist: 'full',
    quickWinsLimit: Infinity,
    monthlyReaudit: true,
    citationAlerts: true,
    citationRefreshButton: true,
    citationMonitoringFrequency: 'weekly',
    multiDomainLimit: Infinity,
    reauditButton: true,
    topicsPerCategory: 25,
    playbooks: 'full_priority',
    schemaGeneratorLimit: 999,
    competitorWatchlistLimit: 999,
    pdfExport: 'whitelabel',
    scoreTrendExport: true,
  },
  enterprise: {
    quickWinsChecklist: 'full',
    quickWinsLimit: Infinity,
    monthlyReaudit: true,
    citationAlerts: true,
    citationRefreshButton: true,
    citationMonitoringFrequency: 'daily',
    multiDomainLimit: Infinity,
    reauditButton: true,
    topicsPerCategory: 100,
    playbooks: 'full_whitelabel',
    schemaGeneratorLimit: 999,
    competitorWatchlistLimit: 999,
    pdfExport: 'whitelabel',
    scoreTrendExport: true,
  },
  lifetime: {
    quickWinsChecklist: 'full',
    quickWinsLimit: Infinity,
    monthlyReaudit: true,
    citationAlerts: true,
    citationRefreshButton: true,
    citationMonitoringFrequency: 'weekly',
    multiDomainLimit: Infinity,
    reauditButton: true,
    topicsPerCategory: 25,
    playbooks: 'full_priority',
    schemaGeneratorLimit: 999,
    competitorWatchlistLimit: 999,
    pdfExport: 'whitelabel',
    scoreTrendExport: true,
  },
};

export function getFeatureFlags(plan: string): FeatureFlags {
  const normalizedPlan = (plan || 'free').toLowerCase().trim();
  return PLAN_FEATURES[normalizedPlan] || PLAN_FEATURES.free;
}
