import axios from 'axios';
import { llmCall } from './llm-router';
import { getMasterPrompt } from './prompt-service';
import { openRouterTracker } from './openrouter-tracker';
import { ContentSignals, PlatformScores } from './content-signal-service';

// Company Intelligence - verified business context
export interface CompanyIntelligence {
  industry: string;
  businessType: string;
  targetAudience: string;
  valueProposition: string;
  marketPosition: string;
}

// Content signal context for topic generation
export interface TopicGenerationContext {
  signals: ContentSignals;
  platformScores: PlatformScores;
  lowestPlatform: 'chatgpt' | 'perplexity' | 'gemini' | 'claude';
  signalGaps: {
    tutorials: number;
    caseStudies: number;
    faqs: number;
    dataPoints: number;
    frameworks: number;
    howToGuides: number;
  };
  companyIntelligence: CompanyIntelligence;
  selectedKeywords?: string[];
  confirmedCompetitors?: string[];
}

// Helper function to extract domain name from URL
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
    return match ? match[1] : url;
  }
}

// Helper to check if error indicates website access issues (broad detection for fallback)
function shouldTriggerFallback(error: any): boolean {
  const errorMessage = (error.message || '').toLowerCase();
  const responseContent = (error.response?.data?.choices?.[0]?.message?.content || '').toLowerCase();
  const combinedText = errorMessage + ' ' + responseContent;
  
  // Check for accessibility-related terms in error/response
  const accessibilityTerms = ['inaccessible', 'cannot access', 'failed to fetch', 'timeout', 'unreachable', 
                               'enotfound', 'econnrefused', 'network error', 'could not', 'unable to'];
  if (accessibilityTerms.some(term => combinedText.includes(term))) return true;
  
  // Check for network/timeout errors from axios
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || 
      error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') return true;
  
  // Check for server errors (5xx) that might indicate site issues
  const httpStatus = error.response?.status || 0;
  if (httpStatus >= 500 && httpStatus < 600) return true;
  
  return false;
}

interface TopicBatch {
  topics: any[];
  batchNumber: number;
}

interface DeduplicationResult {
  uniqueTopics: any[];
  duplicatesRemoved: number;
  originalCount: number;
}

export class BatchTopicGenerator {
  private apiKey: string;
  private auditId: string;
  private userId?: string;
  private context?: TopicGenerationContext;
  
  constructor(apiKey: string, auditId: string, userId?: string, context?: TopicGenerationContext) {
    this.apiKey = apiKey;
    this.auditId = auditId;
    this.userId = userId;
    this.context = context;
  }
  
  /**
   * Build company intelligence context for prompts - MANDATORY for accurate topic generation
   */
  private buildCompanyContext(): string {
    if (!this.context?.companyIntelligence) return '';
    
    const ci = this.context.companyIntelligence;
    
    return `
COMPANY CONTEXT (MANDATORY - USE THIS, DO NOT INFER FROM DOMAIN NAME):
- Industry: ${ci.industry}
- Business Type: ${ci.businessType}
- Target Audience: ${ci.targetAudience}
- Value Proposition: ${ci.valueProposition}
- Market Position: ${ci.marketPosition}

CRITICAL: Generate topics ONLY for the "${ci.industry}" industry serving "${ci.targetAudience}".
DO NOT infer industry from the domain name. The domain name may be misleading.

${this.buildKeywordsContext()}
${this.buildCompetitorsContext()}
`;
  }
  
  /**
   * Build keywords context for prompts - prioritizes topics for selected keywords
   */
  private buildKeywordsContext(): string {
    if (!this.context?.selectedKeywords || this.context.selectedKeywords.length === 0) return '';
    
    const keywords = this.context.selectedKeywords;
    const topPriority = keywords.slice(0, 3);
    const secondary = keywords.slice(3);
    
    return `
USER-SELECTED KEYWORDS (in priority order):
- TOP PRIORITY (generate more topics for these): ${topPriority.join(', ')}
${secondary.length > 0 ? `- SECONDARY: ${secondary.join(', ')}` : ''}

KEYWORD STRATEGY:
1. Generate at least 2-3 topics for each TOP PRIORITY keyword
2. Ensure every generated topic relates to at least one selected keyword
3. Keywords were selected by the user - they know their business best
`;
  }
  
  /**
   * Build competitors context for prompts - helps generate competitive topics
   */
  private buildCompetitorsContext(): string {
    if (!this.context?.confirmedCompetitors || this.context.confirmedCompetitors.length === 0) {
      return `
NO COMPETITORS PROVIDED:
The user has NOT provided any competitors. DO NOT mention any competitor names in topic justifications.
Focus on content gaps and platform alignment instead of competitive positioning.
`;
    }
    
    const competitors = this.context.confirmedCompetitors;
    
    return `
CONFIRMED COMPETITORS TO OUTRANK (ONLY these - do NOT invent others):
${competitors.map((c, i) => `${i + 1}. ${c}`).join('\n')}

COMPETITIVE STRATEGY:
1. You may ONLY mention the competitors listed above in justifications
2. Generate topics that can compete with content these competitors likely have
3. Focus on topics where the user can provide unique value vs these competitors
4. Suggest topics that address gaps these competitors might not cover well
5. NEVER invent or assume other competitor names not in this list
`;
  }
  
  /**
   * Build signal-aware context for prompts
   */
  private buildSignalContext(): string {
    if (!this.context) return '';
    
    const { signals, platformScores, lowestPlatform, signalGaps } = this.context;
    
    // Determine what content types are missing
    const missingContent: string[] = [];
    if (signalGaps.tutorials > 0) missingContent.push(`${signalGaps.tutorials} more tutorials`);
    if (signalGaps.caseStudies > 0) missingContent.push(`${signalGaps.caseStudies} more case studies`);
    if (signalGaps.faqs > 0) missingContent.push(`${signalGaps.faqs} more FAQ sections`);
    if (signalGaps.dataPoints > 0) missingContent.push(`${signalGaps.dataPoints} more data-driven articles`);
    if (signalGaps.frameworks > 0) missingContent.push(`${signalGaps.frameworks} more framework/methodology content`);
    if (signalGaps.howToGuides > 0) missingContent.push(`${signalGaps.howToGuides} more how-to guides`);
    
    // Build platform-specific recommendation
    const platformFocus: Record<string, string> = {
      chatgpt: 'tutorials, FAQs, and step-by-step how-to guides',
      perplexity: 'data-driven research content with citations and statistics',
      gemini: 'well-structured content with schema markup and clear headings',
      claude: 'case studies, frameworks, and nuanced analytical content'
    };
    
    return `
WEBSITE CONTENT ANALYSIS (ACTUAL DATA - USE THIS):
- Current Platform Scores: ChatGPT ${platformScores.chatgpt}, Perplexity ${platformScores.perplexity}, Gemini ${platformScores.gemini}, Claude ${platformScores.claude}
- WEAKEST PLATFORM: ${lowestPlatform.toUpperCase()} (${platformScores[lowestPlatform]} points) - prioritize topics that improve ${platformFocus[lowestPlatform]}
- Current Content Found: ${signals.tutorialCount} tutorials, ${signals.caseStudyCount} case studies, ${signals.faqSectionCount} FAQ sections, ${signals.dataPointCount} data points, ${signals.howToGuideCount} how-to guides
- CONTENT GAPS TO FILL: ${missingContent.length > 0 ? missingContent.join(', ') : 'Site has good coverage'}

TOPIC PRIORITIZATION (based on actual gaps):
1. Topics that would add ${platformFocus[lowestPlatform]} (highest priority - improves weakest platform)
2. Topics that fill identified content gaps
3. Topics that leverage existing content strengths
`;
  }
  
  /**
   * Get actionable metrics for topics (replaces meaningless score impact %)
   * Returns difficulty, effort estimate, and priority tier based on category and content type
   */
  private getActionableMetrics(category: string, contentType?: string): {
    difficulty: 'Easy' | 'Medium' | 'Hard';
    effort: 'Low' | 'Medium' | 'High';
    priorityTier: 'Quick Win' | 'High Impact' | 'Long-term';
    timeEstimate: string;
  } {
    // Content type determines base difficulty
    const contentDifficulty: Record<string, 'Easy' | 'Medium' | 'Hard'> = {
      'faq': 'Easy',
      'tutorial': 'Medium',
      'how-to': 'Medium',
      'case-study': 'Hard',
      'data-driven': 'Hard',
      'framework': 'Hard'
    };
    
    // Category influences priority tier
    const categoryTiers: Record<string, 'Quick Win' | 'High Impact' | 'Long-term'> = {
      authoritative: 'High Impact',
      thoughtLeadership: 'Long-term',
      competitiveAdvantage: 'High Impact',
      emergingOpportunity: 'Quick Win'
    };
    
    // Time estimates based on content type
    const timeEstimates: Record<string, string> = {
      'faq': '1-2 hours',
      'tutorial': '3-5 hours',
      'how-to': '2-4 hours',
      'case-study': '5-10 hours',
      'data-driven': '5-10 hours',
      'framework': '8-15 hours'
    };
    
    const difficulty = contentDifficulty[contentType || 'tutorial'] || 'Medium';
    const priorityTier = categoryTiers[category] || 'High Impact';
    
    // Effort correlates with difficulty
    const effortMap: Record<string, 'Low' | 'Medium' | 'High'> = {
      'Easy': 'Low',
      'Medium': 'Medium',
      'Hard': 'High'
    };
    
    return {
      difficulty,
      effort: effortMap[difficulty],
      priorityTier,
      timeEstimate: timeEstimates[contentType || 'tutorial'] || '3-5 hours'
    };
  }
  
  /**
   * Get brand ratio guidance - 70% industry topics, 30% branded
   */
  private getBrandingGuidance(): string {
    return `
TOPIC BRANDING BALANCE (CRITICAL):
- 70% INDUSTRY-LEVEL TOPICS: Generic questions someone would ask regardless of which vendor they use
  Example: "How to reduce claim denials in medical billing" (NOT "How to use [brand] to reduce claim denials")
- 30% BRANDED TOPICS: Specific to this company's products/features
  Example: "How to set up [product name] for appointment scheduling"

This balance is essential because:
1. Industry topics capture more search traffic and get cited by AI when users haven't decided on a vendor
2. Branded topics capture users already considering this company
3. Over-branding makes content look promotional and reduces AI citation likelihood`;
  }

  /**
   * Generate a single batch of topics for a specific category
   */
  async generateBatch(
    websiteUrl: string,
    category: 'authoritative' | 'thoughtLeadership' | 'competitiveAdvantage' | 'emergingOpportunity',
    batchSize: number,
    batchNumber: number,
    existingTopics: string[] = []
  ): Promise<any[]> {
    console.log(`\n📦 Generating batch ${batchNumber} for ${category} (${batchSize} topics)`);
    
    const confidenceRanges = {
      authoritative: '85-95',
      thoughtLeadership: '70-84',
      competitiveAdvantage: '50-69',
      emergingOpportunity: '30-49'
    };

    const categoryDescriptions = {
      authoritative: 'high-authority topics where the website has strong expertise',
      thoughtLeadership: 'industry thought leadership and trend analysis topics',
      competitiveAdvantage: 'topics that highlight what makes THIS company unique vs competitors',
      emergingOpportunity: 'future trends and emerging market opportunities'
    };

    // Build exclusion list from existing topics
    const exclusionText = existingTopics.length > 0
      ? `\nALREADY GENERATED (DO NOT REPEAT): ${existingTopics.join(', ')}`
      : '';

    const domainName = extractDomain(websiteUrl);
    const companyContext = this.buildCompanyContext();
    const signalContext = this.buildSignalContext();
    const brandingGuidance = this.getBrandingGuidance();
    
    // Calculate branded vs industry topic ratio for this batch
    const brandedCount = Math.ceil(batchSize * 0.3);
    const industryCount = batchSize - brandedCount;
    
    const batchPrompt = `You are an AI SEO analyst specializing in AEO (Answer Engine Optimization). Generate EXACTLY ${batchSize} unique topics for the "${category}" category for ${websiteUrl}.
${companyContext}
CATEGORY FOCUS: ${categoryDescriptions[category]}
CONFIDENCE RANGE: ${confidenceRanges[category]}%
${signalContext}
${brandingGuidance}

FOR THIS BATCH: Generate ${industryCount} INDUSTRY-LEVEL topics and ${brandedCount} BRANDED topics.

CRITICAL ANTI-HALLUCINATION RULES:
1. Each topic must be a SPECIFIC QUESTION related to the industry specified in COMPANY CONTEXT above
2. Topics must be UNIQUE - no duplicates
3. Search volumes: ONLY use "Estimated: [range]/month" format - NEVER make up exact numbers like "2,400/month"
4. Confidence scores indicate content alignment potential, NOT citation counts
5. NO generic text or fabricated metrics
6. PRIORITIZE topics that address the weakest platform and fill content gaps listed above
7. Mark each topic as "branded" or "industry" in the isBranded field
8. NEVER infer industry from domain name - use ONLY the COMPANY CONTEXT provided above
9. NEVER mention competitor names in justifications UNLESS they are listed in CONFIRMED COMPETITORS above - if no competitors provided, do NOT invent any
10. justification field must describe content gaps and platform alignment - NEVER reference competitors that weren't explicitly provided${exclusionText}

FORBIDDEN OUTPUTS (DELETE if generated):
- Exact search volumes like "2,400/month" - use "Estimated: 1,500-3,000/month" instead
- Claims about citation counts or frequency
- Specific numbers you cannot verify
- Competitor names that are NOT in the CONFIRMED COMPETITORS list above
- Fake competitor domains like "example-competitor.com" or industry-generic names

Return ONLY a JSON array of ${batchSize} topics in this format:
[
  {
    "topic": "Specific question (industry-level OR branded depending on isBranded)",
    "confidence": [number in ${confidenceRanges[category]} range],
    "justification": "Why this aligns with the website's expertise AND how it addresses a content gap",
    "targetPlatform": "chatgpt|perplexity|gemini|claude (which platform this topic helps MOST)",
    "searchVolume": "Estimated: 800-2,000/month",
    "competitionLevel": "Low/Medium/High",
    "contentType": "tutorial|case-study|faq|data-driven|framework|how-to",
    "isBranded": true/false,
    "gapFilled": "tutorials|case-studies|faqs|data-points|frameworks (which content gap this fills)"
  }
]

Generate ${batchSize} completely unique topics now.`;

    const callStartTime = Date.now();
    try {
      const llmResult = await llmCall({
        task: 'topicGeneration',
        messages: [
          {
            role: 'system',
            content: `You are an AI SEO analyst. Generate ${batchSize} unique topics. Return ONLY a JSON array, no other text.`
          },
          {
            role: 'user',
            content: batchPrompt
          }
        ],
        maxTokens: 4000,
        temperature: 0.3,
        byokKey: this.apiKey,
        auditId: this.auditId,
      });

      const content = llmResult.content;
      const usage = { prompt_tokens: llmResult.inputTokens, completion_tokens: llmResult.outputTokens, total_tokens: llmResult.inputTokens + llmResult.outputTokens };
      
      // Map category to tracking type
      const typeMap = {
        'authoritative': 'topic_authoritative' as const,
        'thoughtLeadership': 'topic_thought_leadership' as const,
        'competitiveAdvantage': 'topic_competitive' as const,
        'emergingOpportunity': 'topic_emerging' as const
      };
      
      // Log API call
      await openRouterTracker.logApiCall({
        auditId: this.auditId,
        type: typeMap[category],
        model: 'via-llm-router',
        tokens: {
          input: usage?.prompt_tokens || 0,
          output: usage?.completion_tokens || 0,
          total: usage?.total_tokens || 0
        },
        userId: this.userId,
        websiteUrl,
        responseTime: Date.now() - callStartTime,
        status: 'success',
        promptLength: batchPrompt.length,
        responseLength: content.length
      });
      
      // Record successful call for API health monitoring
      await openRouterTracker.recordHealthyCall();
      
      // Extract JSON array from response with robust repair
      let jsonString = content;
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonString = arrayMatch[0];
      } else {
        // Array might be truncated - find opening bracket
        const firstBracket = content.indexOf('[');
        if (firstBracket !== -1) {
          jsonString = content.substring(firstBracket);
        }
      }

      // Attempt to parse, with repair if needed
      let topics: any[];
      try {
        topics = JSON.parse(jsonString);
      } catch (parseError) {
        console.log(`⚠️ Batch ${batchNumber} JSON parse failed, attempting repair...`);
        
        // Repair truncated JSON array
        let repaired = jsonString.trim();
        
        // Check for unclosed strings
        let inString = false;
        for (let i = 0; i < repaired.length; i++) {
          if (repaired[i] === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
            inString = !inString;
          }
        }
        if (inString) {
          repaired += '"';
        }
        
        // Remove incomplete last object in array
        const lastCompleteObject = repaired.lastIndexOf('},');
        if (lastCompleteObject > 0) {
          repaired = repaired.substring(0, lastCompleteObject + 1);
        }
        
        // Remove trailing commas and balance brackets
        repaired = repaired.replace(/,(\s*)$/, '$1');
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
        
        topics = JSON.parse(repaired);
        console.log(`✅ Batch ${batchNumber} JSON repaired successfully`);
      }
      
      console.log(`✅ Batch ${batchNumber} generated: ${topics.length} topics`);
      
      return Array.isArray(topics) ? topics : [];
    } catch (error: any) {
      // Log failed API call
      const typeMap = {
        'authoritative': 'topic_authoritative' as const,
        'thoughtLeadership': 'topic_thought_leadership' as const,
        'competitiveAdvantage': 'topic_competitive' as const,
        'emergingOpportunity': 'topic_emerging' as const
      };
      
      // Extract HTTP status code if available
      const httpStatus = error.response?.status || 0;
      
      await openRouterTracker.logApiCall({
        auditId: this.auditId,
        type: typeMap[category],
        model: 'via-llm-router',
        tokens: { input: 0, output: 0, total: 0 },
        userId: this.userId,
        websiteUrl,
        responseTime: Date.now() - callStartTime,
        status: 'error',
        errorMessage: error.message,
        httpStatus
      });
      
      // Update API status for credit/rate limit issues
      if (httpStatus === 401 || httpStatus === 402 || httpStatus === 429) {
        await openRouterTracker.updateApiStatus(httpStatus, error.message);
      }
      
      console.error(`❌ Batch ${batchNumber} failed:`, error.message);
      
      // Check if error is related to website accessibility and retry with company context
      if (shouldTriggerFallback(error)) {
        console.log(`🔄 Website inaccessible, retrying batch ${batchNumber} with company context...`);
        
        const companyContextFallback = this.buildCompanyContext();
        
        const fallbackPrompt = `You are an AI SEO analyst specializing in AEO (Answer Engine Optimization). The website ${websiteUrl} is currently inaccessible. Use the COMPANY CONTEXT provided below to generate topics.
${companyContextFallback}
CATEGORY FOCUS: ${categoryDescriptions[category]}
CONFIDENCE RANGE: ${confidenceRanges[category]}%
${brandingGuidance}

FOR THIS BATCH: Generate ${industryCount} INDUSTRY-LEVEL topics and ${brandedCount} BRANDED topics.

CRITICAL ANTI-HALLUCINATION RULES:
1. Generate topics ONLY for the industry specified in COMPANY CONTEXT above
2. NEVER infer industry from domain name - the domain name may be misleading
3. Generate ${batchSize} SPECIFIC question topics for the specified industry and target audience
4. Search volumes: ONLY use "Estimated: [range]/month" format - NEVER make up exact numbers
5. Confidence scores indicate content alignment potential, NOT citation counts
6. Mark each topic as "branded" or "industry" in the isBranded field${exclusionText}

Return ONLY a JSON array of ${batchSize} topics in this format:
[
  {
    "topic": "Specific question (industry-level OR branded depending on isBranded)",
    "confidence": [number in ${confidenceRanges[category]} range],
    "justification": "Why this topic aligns with the industry and target audience in COMPANY CONTEXT",
    "targetPlatform": "chatgpt|perplexity|gemini|claude",
    "searchVolume": "Estimated: 800-2,000/month",
    "competitionLevel": "Low/Medium/High",
    "contentType": "tutorial|case-study|faq|data-driven|framework|how-to",
    "isBranded": true/false,
    "gapFilled": "tutorials|case-studies|faqs|data-points|frameworks"
  }
]`;

        try {
          const fallbackLlmResult = await llmCall({
            task: 'topicGeneration',
            messages: [
              { role: 'system', content: `You are an AI SEO analyst. Generate ${batchSize} unique topics for the industry specified in the company context. Return ONLY a JSON array.` },
              { role: 'user', content: fallbackPrompt }
            ],
            maxTokens: 4000,
            temperature: 0.3,
            byokKey: this.apiKey,
            auditId: this.auditId,
          });

          const fallbackContent = fallbackLlmResult.content;

          // Log fallback API call
          await openRouterTracker.logApiCall({
            auditId: this.auditId,
            type: typeMap[category],
            model: 'via-llm-router',
            tokens: {
              input: fallbackLlmResult.inputTokens,
              output: fallbackLlmResult.outputTokens,
              total: fallbackLlmResult.inputTokens + fallbackLlmResult.outputTokens
            },
            userId: this.userId,
            websiteUrl,
            responseTime: Date.now() - callStartTime,
            status: 'success',
            promptLength: fallbackPrompt.length,
            responseLength: fallbackContent.length
          });

          // Parse fallback response with robust JSON repair (same as main path)
          let jsonString = fallbackContent;
          const arrayMatch = fallbackContent.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            jsonString = arrayMatch[0];
          } else {
            const firstBracket = fallbackContent.indexOf('[');
            if (firstBracket !== -1) {
              jsonString = fallbackContent.substring(firstBracket);
            }
          }

          let topics = [];
          try {
            topics = JSON.parse(jsonString);
          } catch (parseError) {
            console.log(`⚠️ Fallback batch ${batchNumber} JSON parse failed, attempting repair...`);
            // Robust JSON repair for truncated/malformed responses
            let repaired = jsonString.trim();
            let inString = false;
            for (let i = 0; i < repaired.length; i++) {
              if (repaired[i] === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
                inString = !inString;
              }
            }
            if (inString) repaired += '"';
            
            const lastCompleteObject = repaired.lastIndexOf('},');
            if (lastCompleteObject > 0) {
              repaired = repaired.substring(0, lastCompleteObject + 1);
            }
            
            repaired = repaired.replace(/,(\s*)$/, '$1');
            const openBrackets = (repaired.match(/\[/g) || []).length;
            const closeBrackets = (repaired.match(/\]/g) || []).length;
            const openBraces = (repaired.match(/\{/g) || []).length;
            const closeBraces = (repaired.match(/\}/g) || []).length;
            repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
            repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
            
            try {
              topics = JSON.parse(repaired);
              console.log(`✅ Fallback batch ${batchNumber} JSON repaired successfully`);
            } catch (repairError) {
              console.error(`❌ Fallback batch ${batchNumber} JSON repair failed:`, repairError);
              return [];
            }
          }
          
          console.log(`✅ Batch ${batchNumber} generated via fallback: ${topics.length} topics`);
          return Array.isArray(topics) ? topics : [];
        } catch (fallbackError: any) {
          console.error(`❌ Fallback for batch ${batchNumber} also failed:`, fallbackError.message);
        }
      }
      
      return [];
    }
  }

  /**
   * Normalize topic objects to ensure consistent schema
   * Adds missing fields with sensible defaults, including actionable metrics
   */
  private normalizeTopics(topics: any[], category: string): any[] {
    const validContentTypes = ['tutorial', 'case-study', 'faq', 'data-driven', 'framework', 'how-to'];
    
    return topics.map(topic => {
      if (!topic || typeof topic !== 'object') return null;
      
      // Determine content type first so we can calculate metrics
      const contentType = validContentTypes.includes(topic.contentType) 
        ? topic.contentType 
        : this.inferContentType(topic.topic || '', topic.justification || '');
      
      // Get actionable metrics based on category and content type
      const metrics = this.getActionableMetrics(category, contentType);
      
      return {
        ...topic,
        // Replace scoreImpact with actionable metrics
        difficulty: topic.difficulty || metrics.difficulty,
        effort: topic.effort || metrics.effort,
        priorityTier: topic.priorityTier || metrics.priorityTier,
        timeEstimate: topic.timeEstimate || metrics.timeEstimate,
        // Ensure contentType exists and is valid
        contentType,
        // Ensure isBranded exists (default to false for industry-level)
        isBranded: topic.isBranded === true,
        // Ensure targetPlatform exists (default to chatgpt as most common)
        targetPlatform: topic.targetPlatform || 'chatgpt',
        // Ensure gapFilled exists
        gapFilled: topic.gapFilled || this.inferGapFilled(contentType),
        // Ensure platforms is an array (for backward compatibility)
        platforms: Array.isArray(topic.platforms) ? topic.platforms : [topic.targetPlatform || 'chatgpt']
      };
    }).filter(Boolean);
  }
  
  /**
   * Infer which gap is filled based on content type
   */
  private inferGapFilled(contentType: string): string {
    const gapMap: Record<string, string> = {
      'tutorial': 'tutorials',
      'how-to': 'tutorials',
      'case-study': 'case-studies',
      'faq': 'faqs',
      'data-driven': 'data-points',
      'framework': 'frameworks'
    };
    return gapMap[contentType] || 'tutorials';
  }
  
  /**
   * Infer content type from topic text when not provided
   */
  private inferContentType(topic: string, justification: string): string {
    const text = (topic + ' ' + justification).toLowerCase();
    
    if (/tutorial|guide|step.by.step|how.to/i.test(text)) return 'tutorial';
    if (/case.study|success.story|customer|client/i.test(text)) return 'case-study';
    if (/faq|question|answer|common/i.test(text)) return 'faq';
    if (/data|research|statistic|study|report/i.test(text)) return 'data-driven';
    if (/framework|methodology|process|strategy/i.test(text)) return 'framework';
    if (/how|what|why|when|best/i.test(text)) return 'how-to';
    
    return 'how-to'; // Default
  }

  /**
   * Deduplicate topics by comparing similarity
   */
  deduplicateTopics(topics: any[]): DeduplicationResult {
    console.log(`\n🔍 Deduplicating ${topics.length} topics...`);
    
    const uniqueTopics: any[] = [];
    const seenTopics = new Set<string>();
    let duplicatesRemoved = 0;

    for (const topic of topics) {
      // Validate topic structure
      if (!topic || typeof topic.topic !== 'string') {
        // console.warn('⚠️ Skipping invalid topic format:', topic); // Optional logging
        continue;
      }

      // Normalize topic for comparison
      const normalizedTopic = topic.topic
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, ''); // Remove punctuation

      // Check for exact duplicates
      if (seenTopics.has(normalizedTopic)) {
        duplicatesRemoved++;
        continue;
      }

      // Check for semantic similarity (simple keyword overlap)
      const isDuplicate = uniqueTopics.some(existing => {
        const existingNormalized = existing.topic
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '');

        // Calculate word overlap
        const topicWords = new Set<string>(normalizedTopic.split(/\s+/));
        const existingWords = new Set<string>(existingNormalized.split(/\s+/));
        
        const intersection = new Set<string>(
          Array.from(topicWords).filter((word: string) => existingWords.has(word) && word.length > 3)
        );

        const similarity = intersection.size / Math.min(topicWords.size, existingWords.size);
        
        // If 70%+ word overlap, consider duplicate
        return similarity > 0.7;
      });

      if (isDuplicate) {
        duplicatesRemoved++;
      } else {
        uniqueTopics.push(topic);
        seenTopics.add(normalizedTopic);
      }
    }

    console.log(`✅ Deduplication complete:`);
    console.log(`   Original: ${topics.length} topics`);
    console.log(`   Unique: ${uniqueTopics.length} topics`);
    console.log(`   Removed: ${duplicatesRemoved} duplicates`);

    return {
      uniqueTopics,
      duplicatesRemoved,
      originalCount: topics.length
    };
  }

  /**
   * Generate topics in batches until reaching target count
   */
  async generateTopicsForCategory(
    websiteUrl: string,
    category: 'authoritative' | 'thoughtLeadership' | 'competitiveAdvantage' | 'emergingOpportunity',
    targetCount: number
  ): Promise<any[]> {
    console.log(`\n========== Generating ${targetCount} ${category} Topics ==========`);
    
    const batchSize = 10;
    let allTopics: any[] = [];
    let batchNumber = 1;
    let attempts = 0;
    const maxAttempts = 5; // Safety limit — fail fast instead of hanging for minutes
    let stagnantRounds = 0; // consecutive attempts that added zero new unique topics
    const maxStagnantRounds = 2;

    while (allTopics.length < targetCount && attempts < maxAttempts) {
      attempts++;
      
      // Get list of existing topic titles for exclusion
      const existingTopicTitles = allTopics.map(t => t.topic);
      const countBeforeBatch = allTopics.length;
      
      // Generate batch
      const batchTopics = await this.generateBatch(
        websiteUrl,
        category,
        batchSize,
        batchNumber,
        existingTopicTitles
      );

      if (batchTopics.length === 0) {
        console.log(`⚠️ Batch ${batchNumber} returned no topics, skipping...`);
        stagnantRounds++;
        if (stagnantRounds >= maxStagnantRounds) {
          console.log(`⛔ ${stagnantRounds} consecutive attempts produced no new topics for ${category} — stopping early with ${allTopics.length}/${targetCount} topics.`);
          break;
        }
        batchNumber++;
        continue;
      }

      // Add to collection
      allTopics.push(...batchTopics);
      
      // Deduplicate after each batch
      const deduped = this.deduplicateTopics(allTopics);
      allTopics = deduped.uniqueTopics;

      console.log(`📊 Progress: ${allTopics.length}/${targetCount} unique topics`);

      // Break early if retries keep producing duplicates instead of new unique topics
      if (allTopics.length === countBeforeBatch) {
        stagnantRounds++;
        if (stagnantRounds >= maxStagnantRounds) {
          console.log(`⛔ ${stagnantRounds} consecutive attempts added no new unique topics for ${category} — stopping early with ${allTopics.length}/${targetCount} topics.`);
          break;
        }
      } else {
        stagnantRounds = 0;
      }

      batchNumber++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Final deduplication
    const finalDeduped = this.deduplicateTopics(allTopics);
    let finalTopics = finalDeduped.uniqueTopics.slice(0, targetCount);
    
    // Normalize all topics to ensure consistent schema
    finalTopics = this.normalizeTopics(finalTopics, category);

    if (finalTopics.length < targetCount) {
      console.warn(`⚠️ ${category} only reached ${finalTopics.length}/${targetCount} unique topics after ${attempts} attempt(s) — returning partial results instead of failing the audit.`);
    }

    console.log(`\n✅ ${category} complete: ${finalTopics.length} unique topics generated`);
    console.log(`========================================\n`);

    return finalTopics;
  }
}

