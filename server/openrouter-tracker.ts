import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';

// Initialize Firebase client SDK on server
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};

let db: any;
try {
  const app = initializeApp(firebaseConfig, 'tracking-app');
  db = getFirestore(app);
} catch (e: any) {
  if (e.code === 'app/duplicate-app') {
    const app = getApp('tracking-app');
    db = getFirestore(app);
  } else {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface ApiCallData {
  auditId: string;
  type: 'company_intel' | 'competitor' | 'topic_authoritative' | 'topic_thought_leadership' | 'topic_competitive' | 'topic_emerging';
  model: string;
  tokens: TokenUsage;
  userId?: string;
  websiteUrl: string;
  responseTime: number;
  status: 'success' | 'error';
  errorMessage?: string;
  promptLength?: number;
  responseLength?: number;
  httpStatus?: number;
}

interface ApiStatusData {
  lastCheck: Date;
  status: 'healthy' | 'warning' | 'critical';
  lastError?: {
    code: number;
    message: string;
    timestamp: Date;
  };
  errors24h: {
    total: number;
    auth401: number;
    payment402: number;
    rateLimit429: number;
    other: number;
  };
  successRate24h: number;
}

interface AuditData {
  auditId: string;
  timestamp: Date;
  userId: string;
  userEmail?: string;
  websiteUrl: string;
  planName: string;
  status: 'in_progress' | 'completed' | 'failed';
  duration?: number;
  topicsGenerated?: number;
  openRouterUsage?: {
    totalCalls: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    breakdown: {
      companyIntel?: { tokens: number; cost: number };
      competitor?: { tokens: number; cost: number };
      topicGeneration?: { tokens: number; cost: number };
    };
  };
}

/**
 * Tracks usage/cost/health of all AI calls made through OpenRouter.
 *
 * Naming history: this service and its Firestore collections were originally
 * named after "Perplexity" from an early direct-API integration. All AI calls
 * are now routed exclusively through OpenRouter (see server/llm-router.ts and
 * server/openrouter-key-service.ts) - there is no direct Perplexity
 * integration anymore. Collections were renamed accordingly:
 *   perplexity_calls          -> openrouter_calls
 *   perplexity_stats/*        -> openrouter_stats/*
 *   system/perplexityApiStatus -> system/openRouterApiStatus
 *   audits.perplexityUsage    -> audits.openRouterUsage
 * Run `tsx server/scripts/migrate-perplexity-to-openrouter.ts` once to copy
 * any pre-existing historical data from the old collections/fields into the
 * new ones (see that script for details).
 */
class OpenRouterTracker {
  /**
   * Calculate cost based on OpenRouter's pricing for the perplexity/sonar-pro model
   * Input: $3 per 1M tokens = $0.000003 per token
   * Output: $15 per 1M tokens = $0.000015 per token
   */
  calculateCost(inputTokens: number, outputTokens: number, model: string = 'sonar-pro'): number {
    const inputCost = inputTokens * 0.000003;
    const outputCost = outputTokens * 0.000015;
    const totalCost = inputCost + outputCost;
    return Math.round(totalCost * 1000000) / 1000000; // Round to 6 decimal places
  }

  /**
   * Generate unique audit ID
   */
  generateAuditId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `audit_${timestamp}_${random}`;
  }

  /**
   * Create audit record in Firestore
   */
  async createAudit(data: {
    auditId: string;
    userId: string;
    userEmail?: string;
    websiteUrl: string;
    planName: string;
  }): Promise<void> {
    try {
      const auditData: AuditData = {
        auditId: data.auditId,
        timestamp: new Date(),
        userId: data.userId,
        userEmail: data.userEmail,
        websiteUrl: data.websiteUrl,
        planName: data.planName,
        status: 'in_progress',
        openRouterUsage: {
          totalCalls: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          breakdown: {}
        }
      };

      await setDoc(doc(db, 'audits', data.auditId), auditData);
      console.log(`✅ Audit created: ${data.auditId}`);
    } catch (error) {
      console.error('❌ Error creating audit:', error);
      throw error;
    }
  }

  /**
   * Log individual API call
   */
  async logApiCall(data: ApiCallData): Promise<void> {
    try {
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const cost = this.calculateCost(data.tokens.input, data.tokens.output, data.model);

      const callData = {
        callId,
        auditId: data.auditId,
        timestamp: new Date(),
        type: data.type,
        model: data.model,
        tokens: data.tokens,
        cost,
        userId: data.userId || 'anonymous',
        websiteUrl: data.websiteUrl,
        responseTime: data.responseTime,
        status: data.status,
        errorMessage: data.errorMessage || null,
        promptLength: data.promptLength || 0,
        responseLength: data.responseLength || 0
      };

      await setDoc(doc(db, 'openrouter_calls', callId), callData);
      console.log(`📊 API call logged: ${data.type} - $${cost.toFixed(6)}`);
    } catch (error) {
      console.error('❌ Error logging API call:', error);
      // Don't throw - we don't want to fail the audit if logging fails
    }
  }

  /**
   * Complete audit and calculate total costs
   */
  async completeAudit(auditId: string, options: {
    status: 'completed' | 'failed';
    duration: number;
    topicsGenerated?: number;
    errorMessage?: string;
  }): Promise<void> {
    try {
      // Get all API calls for this audit
      const callsQuery = query(
        collection(db, 'openrouter_calls'),
        where('auditId', '==', auditId)
      );
      const callsSnapshot = await getDocs(callsQuery);

      let totalCalls = 0;
      let totalTokens = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let totalCost = 0;

      const breakdown = {
        companyIntel: { tokens: 0, cost: 0 },
        competitor: { tokens: 0, cost: 0 },
        topicGeneration: { tokens: 0, cost: 0 }
      };

      callsSnapshot.forEach((doc) => {
        const call = doc.data();
        totalCalls++;
        totalTokens += call.tokens.total;
        inputTokens += call.tokens.input;
        outputTokens += call.tokens.output;
        totalCost += call.cost;

        // Categorize by type
        if (call.type === 'company_intel') {
          breakdown.companyIntel.tokens += call.tokens.total;
          breakdown.companyIntel.cost += call.cost;
        } else if (call.type === 'competitor') {
          breakdown.competitor.tokens += call.tokens.total;
          breakdown.competitor.cost += call.cost;
        } else if (call.type.startsWith('topic_')) {
          breakdown.topicGeneration.tokens += call.tokens.total;
          breakdown.topicGeneration.cost += call.cost;
        }
      });

      // Update audit record
      const auditRef = doc(db, 'audits', auditId);
      await setDoc(auditRef, {
        status: options.status,
        duration: options.duration,
        topicsGenerated: options.topicsGenerated || 0,
        errorMessage: options.errorMessage || null,
        openRouterUsage: {
          totalCalls,
          totalTokens,
          inputTokens,
          outputTokens,
          totalCost: Math.round(totalCost * 1000000) / 1000000,
          breakdown
        },
        completedAt: Timestamp.now()
      }, { merge: true });

      console.log(`✅ Audit completed: ${auditId} - Total cost: $${totalCost.toFixed(6)}`);

      // Update aggregated stats
      await this.updateAggregatedStats(auditId, totalCost, options.status);
    } catch (error) {
      console.error('❌ Error completing audit:', error);
      throw error;
    }
  }

  /**
   * Update daily/monthly/overall aggregated stats
   */
  async updateAggregatedStats(auditId: string, cost: number, status: string): Promise<void> {
    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const monthStr = dateStr.substring(0, 7); // YYYY-MM

      // Get audit details
      const auditRef = doc(db, 'audits', auditId);
      const auditDoc = await getDoc(auditRef);
      const audit = auditDoc.data() as AuditData;

      // Update daily stats
      const dailyRef = doc(db, 'openrouter_stats', 'daily', 'dates', dateStr);
      const dailyDoc = await getDoc(dailyRef);

      if (dailyDoc.exists()) {
        const dailyData = dailyDoc.data() || {};
        await setDoc(dailyRef, {
          totalAudits: (dailyData.totalAudits || 0) + 1,
          totalCalls: (dailyData.totalCalls || 0) + (audit.openRouterUsage?.totalCalls || 0),
          totalTokens: (dailyData.totalTokens || 0) + (audit.openRouterUsage?.totalTokens || 0),
          totalCost: (dailyData.totalCost || 0) + cost,
          successfulAudits: (dailyData.successfulAudits || 0) + (status === 'completed' ? 1 : 0),
          failedAudits: (dailyData.failedAudits || 0) + (status === 'failed' ? 1 : 0),
          byPlan: {
            ...dailyData.byPlan,
            [audit.planName]: {
              audits: ((dailyData.byPlan?.[audit.planName]?.audits) || 0) + 1,
              cost: ((dailyData.byPlan?.[audit.planName]?.cost) || 0) + cost
            }
          }
        }, { merge: true });
      } else {
        await setDoc(dailyRef, {
          date: dateStr,
          totalAudits: 1,
          totalCalls: audit.openRouterUsage?.totalCalls || 0,
          totalTokens: audit.openRouterUsage?.totalTokens || 0,
          totalCost: cost,
          successfulAudits: status === 'completed' ? 1 : 0,
          failedAudits: status === 'failed' ? 1 : 0,
          byPlan: {
            [audit.planName]: { audits: 1, cost }
          }
        });
      }

      // Update monthly stats
      const monthlyRef = doc(db, 'openrouter_stats', 'monthly', 'months', monthStr);
      const monthlyDoc = await getDoc(monthlyRef);

      if (monthlyDoc.exists()) {
        const monthlyData = monthlyDoc.data() || {};
        await setDoc(monthlyRef, {
          totalAudits: (monthlyData.totalAudits || 0) + 1,
          totalCalls: (monthlyData.totalCalls || 0) + (audit.openRouterUsage?.totalCalls || 0),
          totalTokens: (monthlyData.totalTokens || 0) + (audit.openRouterUsage?.totalTokens || 0),
          totalCost: (monthlyData.totalCost || 0) + cost,
          successfulAudits: (monthlyData.successfulAudits || 0) + (status === 'completed' ? 1 : 0),
          failedAudits: (monthlyData.failedAudits || 0) + (status === 'failed' ? 1 : 0),
          byPlan: {
            ...monthlyData.byPlan,
            [audit.planName]: {
              audits: ((monthlyData.byPlan?.[audit.planName]?.audits) || 0) + 1,
              cost: ((monthlyData.byPlan?.[audit.planName]?.cost) || 0) + cost
            }
          }
        }, { merge: true });
      } else {
        await setDoc(monthlyRef, {
          month: monthStr,
          totalAudits: 1,
          totalCalls: audit.openRouterUsage?.totalCalls || 0,
          totalTokens: audit.openRouterUsage?.totalTokens || 0,
          totalCost: cost,
          successfulAudits: status === 'completed' ? 1 : 0,
          failedAudits: status === 'failed' ? 1 : 0,
          byPlan: {
            [audit.planName]: { audits: 1, cost }
          }
        });
      }

      // Update overall lifetime stats
      const lifetimeRef = doc(db, 'openrouter_stats', 'overall', 'lifetime', 'all_time');
      const lifetimeDoc = await getDoc(lifetimeRef);

      if (lifetimeDoc.exists()) {
        const lifetimeData = lifetimeDoc.data() || {};
        await setDoc(lifetimeRef, {
          totalAudits: (lifetimeData.totalAudits || 0) + 1,
          totalCalls: (lifetimeData.totalCalls || 0) + (audit.openRouterUsage?.totalCalls || 0),
          totalTokens: (lifetimeData.totalTokens || 0) + (audit.openRouterUsage?.totalTokens || 0),
          totalCost: (lifetimeData.totalCost || 0) + cost,
          successfulAudits: (lifetimeData.successfulAudits || 0) + (status === 'completed' ? 1 : 0),
          failedAudits: (lifetimeData.failedAudits || 0) + (status === 'failed' ? 1 : 0),
          byPlan: {
            ...lifetimeData.byPlan,
            [audit.planName]: {
              audits: ((lifetimeData.byPlan?.[audit.planName]?.audits) || 0) + 1,
              cost: ((lifetimeData.byPlan?.[audit.planName]?.cost) || 0) + cost
            }
          }
        }, { merge: true });
      } else {
        await setDoc(lifetimeRef, {
          totalAudits: 1,
          totalCalls: audit.openRouterUsage?.totalCalls || 0,
          totalTokens: audit.openRouterUsage?.totalTokens || 0,
          totalCost: cost,
          successfulAudits: status === 'completed' ? 1 : 0,
          failedAudits: status === 'failed' ? 1 : 0,
          byPlan: {
            [audit.planName]: { audits: 1, cost }
          }
        });
      }

      console.log('📊 Aggregated stats updated');
    } catch (error) {
      console.error('❌ Error updating aggregated stats:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Update API status when errors occur (401, 402, 429)
   * This helps admin monitor credit/rate limit issues
   */
  async updateApiStatus(httpStatus: number, errorMessage?: string): Promise<void> {
    try {
      const statusRef = doc(db, 'system', 'openRouterApiStatus');
      const statusDoc = await getDoc(statusRef);
      const currentData = statusDoc.exists() ? statusDoc.data() : {};

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get current errors24h counters
      let errors24h = currentData.errors24h || {
        total: 0,
        auth401: 0,
        payment402: 0,
        rateLimit429: 0,
        other: 0,
        lastReset: now.toISOString()
      };

      // Reset counters if more than 24h old
      if (errors24h.lastReset) {
        const lastReset = new Date(errors24h.lastReset);
        if (lastReset < twentyFourHoursAgo) {
          errors24h = {
            total: 0,
            auth401: 0,
            payment402: 0,
            rateLimit429: 0,
            other: 0,
            lastReset: now.toISOString()
          };
        }
      }

      // Increment error counters
      errors24h.total++;
      if (httpStatus === 401) {
        errors24h.auth401++;
      } else if (httpStatus === 402) {
        errors24h.payment402++;
      } else if (httpStatus === 429) {
        errors24h.rateLimit429++;
      } else {
        errors24h.other++;
      }

      // Determine status level
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (httpStatus === 402 || errors24h.payment402 > 0) {
        status = 'critical'; // Payment required = credits exhausted
      } else if (httpStatus === 401 || errors24h.auth401 > 0) {
        status = 'critical'; // Auth issues = API key problem
      } else if (httpStatus === 429 || errors24h.rateLimit429 > 3) {
        status = 'warning'; // Rate limited
      } else if (errors24h.total > 10) {
        status = 'warning'; // Many errors
      }

      const statusData = {
        lastCheck: Timestamp.now(),
        status,
        lastError: {
          code: httpStatus,
          message: errorMessage || `HTTP ${httpStatus} error`,
          timestamp: Timestamp.now()
        },
        errors24h,
        // Get success rate from recent calls
        successRate24h: await this.calculateSuccessRate24h()
      };

      await setDoc(statusRef, statusData, { merge: true });
      console.log(`⚠️ API status updated: ${status} (HTTP ${httpStatus})`);
    } catch (error) {
      console.error('❌ Error updating API status:', error);
    }
  }

  /**
   * Calculate success rate over last 24 hours
   */
  async calculateSuccessRate24h(): Promise<number> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Query recent calls
      const callsQuery = query(
        collection(db, 'openrouter_calls'),
        where('timestamp', '>=', Timestamp.fromDate(twentyFourHoursAgo))
      );
      const callsSnapshot = await getDocs(callsQuery);
      
      let total = 0;
      let successful = 0;
      
      callsSnapshot.forEach((doc) => {
        total++;
        if (doc.data().status === 'success') {
          successful++;
        }
      });
      
      return total > 0 ? Math.round((successful / total) * 100) : 100;
    } catch (error) {
      console.error('❌ Error calculating success rate:', error);
      return 100;
    }
  }

  /**
   * Record a successful API call (to update healthy status)
   */
  async recordHealthyCall(): Promise<void> {
    try {
      const statusRef = doc(db, 'system', 'openRouterApiStatus');
      const statusDoc = await getDoc(statusRef);
      
      if (statusDoc.exists()) {
        const data = statusDoc.data();
        // Only update to healthy if no recent critical errors
        if (data.errors24h?.payment402 === 0 && data.errors24h?.auth401 === 0) {
          await setDoc(statusRef, {
            lastCheck: Timestamp.now(),
            status: 'healthy',
            successRate24h: await this.calculateSuccessRate24h()
          }, { merge: true });
        }
      } else {
        // First call - initialize as healthy
        await setDoc(statusRef, {
          lastCheck: Timestamp.now(),
          status: 'healthy',
          errors24h: {
            total: 0,
            auth401: 0,
            payment402: 0,
            rateLimit429: 0,
            other: 0,
            lastReset: new Date().toISOString()
          },
          successRate24h: 100
        });
      }
    } catch (error) {
      console.error('❌ Error recording healthy call:', error);
    }
  }
}

export const openRouterTracker = new OpenRouterTracker();
/** @deprecated Use `openRouterTracker` instead. Kept as an alias so any stray imports keep working. */
export const perplexityTracker = openRouterTracker;
export type { TokenUsage, ApiCallData, AuditData, ApiStatusData };
