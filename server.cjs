const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);

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

// API endpoint for audit
app.post('/api/audit', async (req, res) => {
  try {
    const { websiteUrl } = req.body;
    
    // Validate URL
    if (!websiteUrl || !validator.isURL(websiteUrl, { protocols: ['http', 'https'] })) {
      return res.status(400).json({ 
        error: 'Please provide a valid website URL (include http:// or https://)' 
      });
    }

    // Clean URL
    const cleanUrl = websiteUrl.trim();
    
    // Prepare prompt with actual URL
    const promptWithUrl = MASTER_PROMPT.replace('{WEBSITE_URL}', cleanUrl);
    
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
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout
      }
    );

    // Parse response
    let auditData;
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
      websiteUrl: cleanUrl,
      auditData: auditData,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});