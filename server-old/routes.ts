import type { Express } from "express";
import { createServer, type Server } from "http";
import axios from "axios";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import { auditRequestSchema, type AuditData } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

// EXACT MASTER PROMPT - DO NOT MODIFY
const MASTER_PROMPT = `You are an expert AI Search Engine Optimization analyst. Analyze the given website URL for AI search visibility across ChatGPT, Perplexity, Gemini, and Claude platforms.

IMPORTANT: Provide your response in this EXACT JSON format - do not deviate:

{
  "auditResults": {
    "overallScore": [number between 0-100],
    "letterGrade": "[A+, A, A-, B+, B, B-, C+, C, C-, D+, D, F]",
    "platformScores": {
      "chatgpt": [number between 0-100],
      "perplexity": [number between 0-100], 
      "gemini": [number between 0-100],
      "claude": [number between 0-100]
    },
    "strengths": [
      "strength 1",
      "strength 2", 
      "strength 3"
    ],
    "weaknesses": [
      "weakness 1",
      "weakness 2",
      "weakness 3"
    ],
    "technicalFindings": {
      "domainAuthority": "[High/Medium/Low]",
      "contentStructure": "[Excellent/Good/Fair/Poor]",
      "schemaMarkup": "[Implemented/Partial/Missing]",
      "entityRecognition": "[Strong/Moderate/Weak]"
    }
  },
  "contentTopics": {
    "authoritative": [
      {
        "topic": "exact question format",
        "confidence": [number between 85-95],
        "justification": "why this topic will get citations",
        "platforms": ["list of platforms likely to cite this"]
      }
    ],
    "thoughtLeadership": [
      {
        "topic": "exact question format", 
        "confidence": [number between 70-84],
        "justification": "why this topic will get citations",
        "platforms": ["list of platforms likely to cite this"]
      }
    ],
    "competitiveAdvantage": [
      {
        "topic": "exact question format",
        "confidence": [number between 50-69], 
        "justification": "why this topic will get citations",
        "platforms": ["list of platforms likely to cite this"]
      }
    ],
    "emergingOpportunity": [
      {
        "topic": "exact question format",
        "confidence": [number between 30-49],
        "justification": "why this topic will get citations", 
        "platforms": ["list of platforms likely to cite this"]
      }
    ]
  },
  "recommendations": [
    "specific actionable recommendation 1",
    "specific actionable recommendation 2",
    "specific actionable recommendation 3"
  ]
}

Analyze: {WEBSITE_URL}

Generate exactly 25 topics per category (100 total). Each topic must be in question format. Base your analysis on real AI search patterns and citation behaviors. Provide specific, actionable insights.`;

export async function registerRoutes(app: Express): Promise<Server> {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
      },
    },
  }));
  
  app.use(cors({
    origin: process.env.NODE_ENV === "production" ? false : true,
    credentials: true
  }));

  // Rate limiting - 10 requests per 15 minutes
  const auditLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting to audit endpoint
  app.use('/api/audit', auditLimiter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      service: 'AI Citation Audit API'
    });
  });

  // Audit endpoint
  app.post('/api/audit', async (req, res) => {
    try {
      // Validate request body
      const validationResult = auditRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromZodError(validationResult.error);
        return res.status(400).json({
          error: 'Invalid request data',
          details: validationError.message
        });
      }

      const { websiteUrl } = validationResult.data;

      // Prepare prompt with actual URL
      const promptWithUrl = MASTER_PROMPT.replace('{WEBSITE_URL}', websiteUrl);

      // Get API key from environment
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        console.error('PERPLEXITY_API_KEY not found in environment');
        return res.status(500).json({
          error: 'API configuration error. Please check server configuration.'
        });
      }

      // Call Perplexity API
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'llama-3.1-sonar-large-128k-online',
          messages: [
            {
              role: 'system',
              content: 'You are an expert AI Search Engine Optimization analyst. Always respond with valid JSON format.'
            },
            {
              role: 'user',
              content: promptWithUrl
            }
          ],
          max_tokens: 8000,
          temperature: 0.2,
          top_p: 0.9,
          return_citations: true,
          search_domain_filter: ['perplexity.ai'],
          return_images: false,
          return_related_questions: false,
          search_recency_filter: 'month',
          top_k: 0,
          stream: false,
          presence_penalty: 0,
          frequency_penalty: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      // Parse response
      let auditData: AuditData;
      try {
        const content = response.data.choices[0].message.content;
        auditData = JSON.parse(content);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        return res.status(500).json({
          error: 'Failed to parse AI response. Please try again.'
        });
      }

      // Validate response structure
      if (!auditData.auditResults || !auditData.contentTopics) {
        return res.status(500).json({
          error: 'Invalid response structure from AI. Please try again.'
        });
      }

      // Return successful response
      res.json({
        success: true,
        websiteUrl: websiteUrl,
        auditData: auditData,
        generatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Audit Error:', error);

      if (error.response?.status === 401) {
        return res.status(500).json({
          error: 'API authentication failed. Please check configuration.'
        });
      }

      if (error.response?.status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again in a few minutes.'
        });
      }

      if (error.code === 'ECONNABORTED') {
        return res.status(408).json({
          error: 'Request timeout. The analysis is taking too long. Please try again.'
        });
      }

      res.status(500).json({
        error: 'An unexpected error occurred. Please try again.'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
