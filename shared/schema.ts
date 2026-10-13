import { z } from "zod";

// Platform scores schema
export const platformScoresSchema = z.object({
  chatgpt: z.number().min(0).max(100),
  perplexity: z.number().min(0).max(100),
  gemini: z.number().min(0).max(100),
  claude: z.number().min(0).max(100)
});

// Technical findings schema
export const technicalFindingsSchema = z.object({
  domainAuthority: z.enum(["High", "Medium", "Low"]),
  contentStructure: z.enum(["Excellent", "Good", "Fair", "Poor"]),
  schemaMarkup: z.enum(["Implemented", "Partial", "Missing"]),
  entityRecognition: z.enum(["Strong", "Moderate", "Weak"])
});

// Audit results schema
export const auditResultsSchema = z.object({
  overallScore: z.number().min(0).max(100),
  letterGrade: z.enum(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"]),
  platformScores: platformScoresSchema,
  strengths: z.array(z.string()), // Can be empty if no real strengths detected
  weaknesses: z.array(z.string()).min(1), // At least 1 weakness (areas for improvement)
  technicalFindings: technicalFindingsSchema,
  disclaimer: z.string().optional()
});

// Content topic schema (enhanced with actionable metrics)
export const contentTopicSchema = z.object({
  topic: z.string(),
  confidence: z.number().min(30).max(95),
  justification: z.string(),
  platforms: z.array(z.string()),
  // Actionable metrics (replaces meaningless score impact %)
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
  effort: z.enum(['Low', 'Medium', 'High']).optional(),
  priorityTier: z.enum(['Quick Win', 'High Impact', 'Long-term']).optional(),
  timeEstimate: z.string().optional(),
  // Platform targeting and content type
  targetPlatform: z.enum(['chatgpt', 'perplexity', 'gemini', 'claude']).optional(),
  isBranded: z.boolean().optional(),
  gapFilled: z.string().optional(),
  contentType: z.enum(['tutorial', 'case-study', 'faq', 'data-driven', 'framework', 'how-to']).optional(),
  // New enhanced fields (optional for backward compatibility)
  searchVolume: z.string().optional(),
  competitionLevel: z.string().optional(),
  currentAIResponse: z.string().optional(),
  competitorGap: z.string().optional(),
  optimalContentStructure: z.object({
    format: z.string(),
    length: z.string(),
    sections: z.array(z.string()),
    contentType: z.string()
  }).optional(),
  platformOptimization: z.object({
    chatgpt: z.string(),
    perplexity: z.string(),
    gemini: z.string(),
    claude: z.string()
  }).optional(),
  citationPotential: z.object({
    currentCitations: z.string(),
    opportunityScore: z.number().min(0).max(100),
    timeToRank: z.string()
  }).optional()
});

// Per-category partial-result metadata surfaced when generation returned fewer topics than requested
export const topicWarningSchema = z.object({
  requested: z.number(),
  received: z.number()
});

// Content topics schema (flexible length for dynamic topic generation)
export const contentTopicsSchema = z.object({
  authoritative: z.array(contentTopicSchema).min(1),
  thoughtLeadership: z.array(contentTopicSchema).min(1),
  competitiveAdvantage: z.array(contentTopicSchema).min(1),
  emergingOpportunity: z.array(contentTopicSchema).min(1)
});

// New enhanced schemas
export const companyIntelligenceSchema = z.object({
  companyName: z.string().optional(),
  industry: z.string(),
  businessType: z.string(),
  targetAudience: z.string(),
  valueProposition: z.string(),
  marketPosition: z.string(),
  businessModel: z.string().optional(),
  geographicFocus: z.array(z.string()).optional(),
  serviceOfferings: z.array(z.string()).optional()
});

export const competitorAnalysisSchema = z.object({
  mainCompetitors: z.array(z.string()),
  competitorStrengths: z.array(z.string()),
  competitorWeaknesses: z.array(z.string()),
  marketOpportunities: z.array(z.string()),
  competitiveAdvantages: z.array(z.string()).optional()
});

export const citationIntelligenceSchema = z.object({
  currentCitationPresence: z.object({
    totalCitations: z.number(),
    platformBreakdown: platformScoresSchema,
    topCitedContent: z.array(z.string())
  }),
  competitorCitationAnalysis: z.object({
    competitorCitations: z.record(z.number()),
    citationGaps: z.array(z.string())
  }),
  citationOpportunities: z.array(z.string())
});

// New honest visibility potential schema (replaces fake citation counts)
export const visibilityPotentialSchema = z.object({
  overallPotential: z.string(),
  platformAlignment: z.object({
    chatgpt: z.string(),
    perplexity: z.string(),
    gemini: z.string(),
    claude: z.string()
  })
});

export const competitorGapsSchema = z.object({
  opportunityAreas: z.array(z.string()),
  contentAdvantages: z.array(z.string())
});

export const disclaimersSchema = z.object({
  note: z.string(),
  searchVolumeNote: z.string()
});

export const marketContextSchema = z.object({
  industryTrends: z.array(z.string()),
  seasonalFactors: z.object({
    peakSeason: z.string(),
    contentTiming: z.string(),
    searchTrends: z.string()
  }).optional(),
  marketSize: z.object({
    globalMarket: z.string(),
    marketGrowth: z.string(),
    targetMarketSize: z.string()
  }).optional()
});

export const enhancedRecommendationSchema = z.object({
  priority: z.enum(["High", "Medium", "Low"]),
  category: z.string(),
  recommendation: z.string(),
  implementation: z.object({
    timeframe: z.string(),
    effort: z.enum(["Low", "Medium", "High"]),
    expectedImpact: z.string(),
    specificActions: z.array(z.string())
  }).optional(),
  competitiveAdvantage: z.string().optional()
});

// Complete audit data schema (enhanced while keeping existing structure)
export const auditDataSchema = z.object({
  // Existing structure (unchanged)
  auditResults: auditResultsSchema,
  contentTopics: contentTopicsSchema,
  recommendations: z.array(z.string()).min(1),
  // Signal quality indicator for user-facing warning when content analysis was limited
  signalQuality: z.enum(['minimal', 'normal']).optional(),
  // Present when one or more topic categories returned fewer topics than requested (partial generation)
  topicWarnings: z.record(topicWarningSchema).optional(),
  // Scraping status surfaces silent scraper failures (bot blocks, JS rendering, network errors)
  scrapingStatus: z.object({
    success: z.boolean(),
    warning: z.string().nullable(),
    errorDetail: z.string().nullable(),
    largeSiteDetected: z.boolean().optional(),
    largeSiteNote: z.string().optional(),
  }).optional(),
  // Content verification summary for UI transparency (shows LLM-verified counts)
  contentVerification: z.object({
    tutorials: z.object({ candidates: z.number(), verified: z.number(), accuracy: z.number() }),
    caseStudies: z.object({ candidates: z.number(), verified: z.number(), accuracy: z.number() }),
    faqs: z.object({ candidates: z.number(), verified: z.number(), accuracy: z.number() }),
    frameworks: z.object({ candidates: z.number(), verified: z.number(), accuracy: z.number() }),
    wasVerified: z.boolean()
  }).optional(),
  // "Why This Score" explanation - shows what content signals drove each platform's score
  scoreExplanation: z.object({
    contentSignals: z.object({
      tutorials: z.number(),
      caseStudies: z.number(),
      faqs: z.number(),
      dataPoints: z.number(),
      frameworks: z.number(),
      howToGuides: z.number(),
      schemaMarkup: z.number(),
      externalLinks: z.number(),
      longFormContent: z.number()
    }),
    platformDrivers: z.object({
      chatgpt: z.string(),
      perplexity: z.string(),
      gemini: z.string(),
      claude: z.string()
    }),
    weakestArea: z.string().nullable(),
    strongestArea: z.string().nullable()
  }).optional(),
  // New enhanced fields (optional for backward compatibility)
  companyIntelligence: companyIntelligenceSchema.optional(),
  competitorAnalysis: competitorAnalysisSchema.optional(),
  citationIntelligence: citationIntelligenceSchema.optional(),
  visibilityPotential: visibilityPotentialSchema.optional(),
  competitorGaps: competitorGapsSchema.optional(),
  disclaimers: disclaimersSchema.optional(),
  marketContext: marketContextSchema.optional(),
  enhancedRecommendations: z.array(enhancedRecommendationSchema).optional(),
  playbook: z.object({
    actions: z.array(z.object({
      id: z.string(),
      priority: z.enum(['critical', 'high', 'medium', 'low']),
      title: z.string(),
      targetPlatform: z.string(),
      estimatedImpact: z.string(),
      timeToImplement: z.string(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      currentState: z.string(),
      targetState: z.string(),
      stepByStep: z.array(z.string()),
      codeSnippet: z.object({
        language: z.string(),
        code: z.string(),
        description: z.string(),
      }).optional(),
      contentTemplate: z.object({
        title: z.string(),
        outline: z.array(z.string()),
        tips: z.array(z.string()),
      }).optional(),
    })),
    quickWins: z.array(z.object({
      id: z.string(),
      priority: z.enum(['critical', 'high', 'medium', 'low']),
      title: z.string(),
      targetPlatform: z.string(),
      estimatedImpact: z.string(),
      timeToImplement: z.string(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      currentState: z.string(),
      targetState: z.string(),
      stepByStep: z.array(z.string()),
      codeSnippet: z.object({
        language: z.string(),
        code: z.string(),
        description: z.string(),
      }).optional(),
      contentTemplate: z.object({
        title: z.string(),
        outline: z.array(z.string()),
        tips: z.array(z.string()),
      }).optional(),
    })),
    estimatedScoreImprovement: z.object({
      chatgpt: z.number(),
      perplexity: z.number(),
      gemini: z.number(),
      claude: z.number(),
      overall: z.number(),
    }),
  }).optional(),
  industryBenchmark: z.object({
    industryName: z.string(),
    sampleSize: z.string(),
    averageScores: z.object({
      overall: z.number(),
      chatgpt: z.number(),
      perplexity: z.number(),
      gemini: z.number(),
      claude: z.number(),
    }),
    topPerformerScores: z.object({
      overall: z.number(),
      chatgpt: z.number(),
      perplexity: z.number(),
      gemini: z.number(),
      claude: z.number(),
    }),
    commonStrengths: z.array(z.string()),
    commonWeaknesses: z.array(z.string()),
    contentBenchmarks: z.object({
      avgTutorials: z.number(),
      avgCaseStudies: z.number(),
      avgFAQPages: z.number(),
      avgSchemaTypes: z.number(),
      avgDataPoints: z.number(),
    }),
  }).optional(),
  citationSnapshot: z.object({
    totalPromptsChecked: z.number(),
    mentionedCount: z.number(),
    mentionRate: z.number(),
    promptResults: z.array(z.object({
      prompt: z.string(),
      mentioned: z.boolean(),
      mentionContext: z.string().nullable(),
      competitorsMentioned: z.array(z.string()),
      fullResponse: z.string()
    })),
    topCompetitorsCited: z.array(z.object({
      name: z.string(),
      timesFound: z.number()
    })),
    snapshotDate: z.string(),
    generatedAt: z.string().optional(),
    estimatedCost: z.number()
  }).nullable().optional(),
  processingDetails: z.object({
    analysisDepth: z.string(),
    competitorsAnalyzed: z.number(),
    dataSourcesUsed: z.array(z.string()),
    processingTime: z.string()
  }).optional(),
  // AEO Blueprint result — 8 module scores, critical gaps, quick wins
  blueprintResult: z.any().optional()
});

// API request/response schemas
export const auditRequestSchema = z.object({
  websiteUrl: z.string().url(),
  userPlan: z.string().optional(),
  userId: z.string().optional(),
  userEmail: z.string().email().optional(),
  topicsPerCategory: z.number().optional()
});

export const auditResponseSchema = z.object({
  success: z.boolean(),
  websiteUrl: z.string(),
  auditData: auditDataSchema,
  generatedAt: z.string()
});

// Types
export type PlatformScores = z.infer<typeof platformScoresSchema>;
export type TechnicalFindings = z.infer<typeof technicalFindingsSchema>;
export type AuditResults = z.infer<typeof auditResultsSchema>;
export type ContentTopic = z.infer<typeof contentTopicSchema>;
export type ContentTopics = z.infer<typeof contentTopicsSchema>;
export type AuditData = z.infer<typeof auditDataSchema>;
export type AuditRequest = z.infer<typeof auditRequestSchema>;
export type AuditResponse = z.infer<typeof auditResponseSchema>;

// New enhanced types
export type CompanyIntelligence = z.infer<typeof companyIntelligenceSchema>;
export type CompetitorAnalysis = z.infer<typeof competitorAnalysisSchema>;
export type CitationIntelligence = z.infer<typeof citationIntelligenceSchema>;
export type VisibilityPotential = z.infer<typeof visibilityPotentialSchema>;
export type CompetitorGaps = z.infer<typeof competitorGapsSchema>;
export type Disclaimers = z.infer<typeof disclaimersSchema>;
export type MarketContext = z.infer<typeof marketContextSchema>;
export type EnhancedRecommendation = z.infer<typeof enhancedRecommendationSchema>;
