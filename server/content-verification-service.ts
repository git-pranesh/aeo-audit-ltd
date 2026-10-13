/**
 * Content Verification Service
 * 
 * Uses LLM to verify that detected content types (case studies, tutorials, FAQs, etc.)
 * are actually what they claim to be, not just URL pattern matches.
 * 
 * This solves the over-counting problem where /case-studies/page/2 or /case-studies?filter=healthcare
 * would be incorrectly counted as case studies.
 */

import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type ContentType = 'case_study' | 'tutorial' | 'faq' | 'blog_post' | 'research' | 'framework' | 'documentation' | 'other';

export interface VerificationResult {
  url: string;
  isValid: boolean;
  actualType: ContentType;
  confidence: number;
  reason: string;
}

export interface VerificationSummary {
  contentType: string;
  candidateCount: number;
  sampledCount: number;
  validCount: number;
  accuracyRate: number;
  adjustedCount: number;
  verifiedUrls: VerificationResult[];
}

/**
 * Junk URL patterns that should be filtered out before verification
 */
const JUNK_URL_PATTERNS = [
  /\/page\/\d+/i,                    // Pagination: /page/2
  /[?&]page=\d+/i,                   // Query pagination: ?page=2
  /[?&]p=\d+/i,                      // Short pagination: ?p=2
  /[?&]category=/i,                  // Category filters
  /[?&]tag=/i,                       // Tag filters
  /[?&]filter=/i,                    // Generic filters
  /[?&]sort=/i,                      // Sort options
  /[?&]order=/i,                     // Order options
  /\/thank-you/i,                    // Thank you pages
  /\/thanks/i,                       // Thanks pages
  /\/subscribe/i,                    // Subscribe pages
  /\/unsubscribe/i,                  // Unsubscribe pages
  /\/feed\/?$/i,                     // RSS feeds
  /\.xml$/i,                         // XML files (sitemaps)
  /\/amp\/?$/i,                      // AMP pages
  /\/print\/?$/i,                    // Print versions
  /\/share/i,                        // Share pages
  /\/login/i,                        // Login pages
  /\/signup/i,                       // Signup pages
  /\/register/i,                     // Register pages
  /\/cart/i,                         // Cart pages
  /\/checkout/i,                     // Checkout pages
  /\/search/i,                       // Search pages
  /\/#/,                             // Hash fragments
];

/**
 * Filter out junk URLs that are clearly not real content
 */
export function filterJunkUrls(urls: string[]): string[] {
  return urls.filter(url => {
    const lowerUrl = url.toLowerCase();
    return !JUNK_URL_PATTERNS.some(pattern => pattern.test(lowerUrl));
  });
}

/**
 * Fetch page content for verification
 */
async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)',
        'Accept': 'text/html',
      },
      maxRedirects: 3,
    });
    
    // Extract text content, limit to first 5000 chars for LLM
    const html = response.data;
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
    
    return textContent;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Use LLM to verify if a page is actually the claimed content type
 */
async function verifyContentType(
  url: string,
  pageContent: string,
  claimedType: ContentType
): Promise<VerificationResult> {
  const typeDescriptions: Record<ContentType, string> = {
    case_study: 'A case study describes a specific customer/client success story with concrete results, metrics, and implementation details',
    tutorial: 'A tutorial is a step-by-step guide teaching how to accomplish a specific task or learn a skill',
    faq: 'An FAQ page contains multiple questions and answers addressing common user queries',
    blog_post: 'A blog post is an article sharing insights, news, or opinions on a topic',
    research: 'Research content contains data, statistics, studies, or in-depth analysis',
    framework: 'Framework content describes a methodology, model, or structured approach',
    documentation: 'Documentation provides technical reference information about a product or service',
    other: 'Content that does not fit the above categories',
  };

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        {
          role: 'system',
          content: `You are a content classification expert. Analyze web page content and determine its true type.
          
Your task: Verify if the content is actually a "${claimedType}".

Definition of ${claimedType}: ${typeDescriptions[claimedType]}

Respond with JSON only:
{
  "isValid": boolean,
  "actualType": "case_study" | "tutorial" | "faq" | "blog_post" | "research" | "framework" | "documentation" | "other",
  "confidence": number between 0 and 1,
  "reason": "brief explanation"
}`
        },
        {
          role: 'user',
          content: `URL: ${url}

Page content (first 5000 chars):
${pageContent}

Is this actually a ${claimedType}?`
        }
      ],
      temperature: 0.1,
      max_completion_tokens: 256,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        url,
        isValid: parsed.isValid === true,
        actualType: parsed.actualType || 'other',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reason: parsed.reason || 'No reason provided',
      };
    }
    
    // Fallback if JSON parsing fails
    return {
      url,
      isValid: false,
      actualType: 'other',
      confidence: 0,
      reason: 'Failed to parse LLM response',
    };
  } catch (error) {
    console.error(`LLM verification failed for ${url}:`, error instanceof Error ? error.message : 'Unknown error');
    return {
      url,
      isValid: false,
      actualType: 'other',
      confidence: 0,
      reason: `Verification error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Sample and verify URLs for a given content type
 * 
 * @param candidateUrls - URLs that matched the content type pattern
 * @param contentType - The claimed content type
 * @param sampleSize - Number of URLs to verify (default: 5)
 * @returns Verification summary with adjusted count
 */
export async function verifySampleUrls(
  candidateUrls: string[],
  contentType: ContentType,
  sampleSize: number = 5
): Promise<VerificationSummary> {
  // Step 1: Filter out junk URLs
  const filteredUrls = filterJunkUrls(candidateUrls);
  
  // Step 2: Sample random URLs for verification
  const shuffled = [...filteredUrls].sort(() => Math.random() - 0.5);
  const sampled = shuffled.slice(0, Math.min(sampleSize, filteredUrls.length));
  
  // Step 3: Verify each sampled URL
  const verificationResults: VerificationResult[] = [];
  
  for (const url of sampled) {
    const content = await fetchPageContent(url);
    if (content) {
      const result = await verifyContentType(url, content, contentType);
      verificationResults.push(result);
    } else {
      verificationResults.push({
        url,
        isValid: false,
        actualType: 'other',
        confidence: 0,
        reason: 'Failed to fetch page content',
      });
    }
  }
  
  // Step 4: Calculate accuracy rate
  const validCount = verificationResults.filter(r => r.isValid).length;
  const accuracyRate = sampled.length > 0 ? validCount / sampled.length : 0;
  
  // Step 5: Adjust total count based on accuracy
  const adjustedCount = Math.round(filteredUrls.length * accuracyRate);
  
  return {
    contentType,
    candidateCount: candidateUrls.length,
    sampledCount: sampled.length,
    validCount,
    accuracyRate,
    adjustedCount,
    verifiedUrls: verificationResults,
  };
}

/**
 * Verify all content types for a website
 */
export interface ContentVerificationInput {
  tutorialUrls: string[];
  caseStudyUrls: string[];
  faqUrls: string[];
  researchUrls: string[];
  frameworkUrls: string[];
}

export interface ContentVerificationOutput {
  tutorials: VerificationSummary;
  caseStudies: VerificationSummary;
  faqs: VerificationSummary;
  research: VerificationSummary;
  frameworks: VerificationSummary;
}

export async function verifyAllContentTypes(
  input: ContentVerificationInput,
  sampleSize: number = 5
): Promise<ContentVerificationOutput> {
  console.log('🔍 Starting content verification with LLM...');
  
  const [tutorials, caseStudies, faqs, research, frameworks] = await Promise.all([
    verifySampleUrls(input.tutorialUrls, 'tutorial', sampleSize),
    verifySampleUrls(input.caseStudyUrls, 'case_study', sampleSize),
    verifySampleUrls(input.faqUrls, 'faq', sampleSize),
    verifySampleUrls(input.researchUrls, 'research', sampleSize),
    verifySampleUrls(input.frameworkUrls, 'framework', sampleSize),
  ]);
  
  console.log('✅ Content verification complete');
  console.log(`   Tutorials: ${tutorials.candidateCount} candidates → ${tutorials.adjustedCount} verified`);
  console.log(`   Case Studies: ${caseStudies.candidateCount} candidates → ${caseStudies.adjustedCount} verified`);
  console.log(`   FAQs: ${faqs.candidateCount} candidates → ${faqs.adjustedCount} verified`);
  console.log(`   Research: ${research.candidateCount} candidates → ${research.adjustedCount} verified`);
  console.log(`   Frameworks: ${frameworks.candidateCount} candidates → ${frameworks.adjustedCount} verified`);
  
  return { tutorials, caseStudies, faqs, research, frameworks };
}
