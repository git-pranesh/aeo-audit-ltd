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
  /** sponsored: the capped trial key an admin invite provided (until the customer saves their own). */
  openRouterKey: { last4: string; updatedAt: string; sponsored?: boolean } | null;
  branding: Branding | null;
  isAdmin: boolean;
  limits: FairUseLimits;
  aiModels: AiModels;
  /** Present only on the response that created the account: the Meta CompleteRegistration event id to fire in the browser. */
  metaRegistrationEventId?: string;
  /** Licenses bought with this email that could not attach because the account already has one. */
  unusedPurchases?: { licenseId: string; whiteLabel: boolean; createdAt: string | null }[];
  /** Money-back guarantee state for direct purchases; null without a licence. */
  guarantee: import('./guarantee').GuaranteeStatus | null;
}

/** Free preview audit (website, no account): the deterministic part of a full audit. */
export interface PreviewResult {
  domain: string;
  websiteUrl: string;
  score: number;
  grade: string;
  platformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number };
  searchBotsBlocked: string[];
  llmsTxt: boolean;
  sitemap: boolean;
  issues: string[];
  fixes: { title: string; priority: string; timeToImplement: string }[];
  totalFixes: number;
  totalIssues: number;
  checkedAt: string;
  cached: boolean;
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

/** One finished citation check, kept after the full answers are replaced. */
export interface CheckSummary {
  date: string;
  engines: string[];
  totalAnswers: number;
  mentioned: number;
  /** Answers where the question did not contain the business name. */
  openTotal: number;
  openNamed: number;
  cost: number;
}

/** Every audit and citation check saved for one website. */
export interface AuditHistory {
  scores: { date: string; score: number; grade?: string; auditId: string }[];
  checks: CheckSummary[];
}

/** Spending on the account's OpenRouter key, read live from OpenRouter. */
export interface KeyUsage {
  limit: number | null;
  limitRemaining: number | null;
  usage: number | null;
  sponsored: boolean;
}

/** Admin invite: a partner licence plus a capped OpenRouter key, handed out as one link. */
export interface AdminInvite {
  id: string;
  name: string;
  note?: string;
  capUsd: number;
  whiteLabel: boolean;
  status: 'available' | 'active' | 'revoked' | 'refunded';
  createdAt: string;
  createdBy: string;
  activatedAt?: string;
  activatedEmail: string | null;
  audits: number;
  /** Live from OpenRouter; null when the lookup failed. */
  key: { usage: number; limit: number | null; limitRemaining: number | null; disabled: boolean; lastUsedAt: string | null } | null;
  /** The link can still be copied (unused invite). */
  linkAvailable: boolean;
}

/** What /api/public/invite/:code reveals before sign-in. */
export interface PublicInvite {
  valid: boolean;
  name?: string;
  status?: 'open' | 'used' | 'inactive';
  whiteLabel?: boolean;
  capUsd?: number;
}

/** What /api/public/review/:id reveals: whether the review link works and who it is for. */
export interface PublicReviewRequest {
  valid: boolean;
  firstName?: string;
  submitted?: boolean;
}

/** A testimonial as the admin sees it (all statuses). */
export interface AdminTestimonial {
  id: string;
  requestName: string;
  note?: string;
  createdAt: string;
  createdBy: string;
  status: 'requested' | 'hidden' | 'shown';
  pinned: boolean;
  submittedAt?: string;
  rating?: number;
  text?: string;
  name?: string;
  role?: string;
  company?: string;
  linkedin?: string;
  submittedByEmail?: string;
  link: string;
  /** Data URL or Google photo URL; admin responses only. */
  photo: string | null;
}

/** A shown testimonial, as the website receives it. */
export interface PublicTestimonial {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  linkedin: string | null;
  rating: number;
  text: string;
  photo: string | null;
  pinned: boolean;
  date: string;
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
