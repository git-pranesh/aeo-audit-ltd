/**
 * Request/response types shared by the API server and the web client.
 * The server is the only writer of every field here.
 */

export interface Entitlement {
  product: 'lifetime';
  whiteLabel: boolean;
  status: 'active';
  licenseId: string;
  channel: 'direct' | 'marketplace' | 'partner';
  activatedAt: string;
}

export interface Branding {
  agencyName: string;
  logoDataUrl?: string;
  accentColor: string;
  reportTitle: string;
  footerText: string;
}

export interface MeResponse {
  uid: string;
  email: string;
  emailVerified: boolean;
  entitlement: Entitlement | null;
  openRouterKey: { last4: string; updatedAt: string } | null;
  branding: Branding | null;
  isAdmin: boolean;
  limits: FairUseLimits;
  aiModels: AiModels;
}

/** Chosen OpenRouter models; null = our recommended default. */
export interface AiModels {
  structured: string | null;
  webSearch: string | null;
  defaults: { structured: string; webSearch: string };
}

export interface CatalogEntry {
  id: string;
  name: string;
  promptPerM: number;
  completionPerM: number;
  contextLength: number;
  supportsJson: boolean;
  free: boolean;
  webSearch: boolean;
  estAuditUsd: number;
  estSnapshotUsd: number;
}

export interface FairUseLimits {
  auditsPerDay: number;
  auditsPerHour: number;
  concurrentAudits: number;
  pagesPerAudit: number;
  maxCompetitors: number;
  savedAudits: number;
  citationPrompts: number;
}

export interface ContextSuggestion {
  companyName: string;
  industry: string;
  businessType: string;
  targetAudience: string;
  valueProposition: string;
  suggestedKeywords: string[];
  evidenceQuote: string | null;
  signalQuality: 'grounded' | 'minimal';
}

export interface ConfirmedContext {
  companyName: string;
  industry: string;
  businessType: string;
  targetAudience: string;
  valueProposition: string;
  keywords: string[];
  competitors: string[];
}

export type AuditStatus = 'running' | 'completed' | 'failed';

export interface AuditSummary {
  auditId: string;
  websiteUrl: string;
  domain: string;
  status: AuditStatus;
  createdAt: string;
  completedAt?: string;
  overallScore?: number;
  letterGrade?: string;
  previousScore?: number | null;
  error?: string;
}

export interface AuditDetail extends AuditSummary {
  context: ConfirmedContext;
  auditData?: import('./schema').AuditData;
}
