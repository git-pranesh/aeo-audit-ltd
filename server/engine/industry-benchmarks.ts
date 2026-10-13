import { detectIndustryKey } from './industry';

export interface IndustryBenchmark {
  industryName: string;
  sampleSize: string;
  averageScores: {
    overall: number;
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
  topPerformerScores: {
    overall: number;
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
  commonStrengths: string[];
  commonWeaknesses: string[];
  contentBenchmarks: {
    avgTutorials: number;
    avgCaseStudies: number;
    avgFAQPages: number;
    avgSchemaTypes: number;
    avgDataPoints: number;
  };
}

const INDUSTRY_BENCHMARKS: Record<string, IndustryBenchmark> = {
  legal: {
    industryName: 'Legal Services',
    sampleSize: 'Based on AI readiness scoring patterns observed across the Legal Services industry',
    averageScores: { overall: 28, chatgpt: 22, perplexity: 30, gemini: 25, claude: 35 },
    topPerformerScores: { overall: 58, chatgpt: 52, perplexity: 60, gemini: 55, claude: 65 },
    commonStrengths: [
      'Strong case study content from client outcomes',
      'Detailed practice area pages with structured information',
      'FAQ sections addressing common legal questions',
    ],
    commonWeaknesses: [
      'Very few tutorial or how-to guides',
      'Limited schema markup implementation',
      'Lack of data-driven content with statistics',
      'Minimal long-form educational content',
    ],
    contentBenchmarks: { avgTutorials: 1, avgCaseStudies: 4, avgFAQPages: 3, avgSchemaTypes: 1, avgDataPoints: 8 },
  },

  marketing: {
    industryName: 'Marketing & Digital Agency',
    sampleSize: 'Based on AI readiness scoring patterns observed across the Marketing & Digital Agency industry',
    averageScores: { overall: 45, chatgpt: 48, perplexity: 42, gemini: 40, claude: 50 },
    topPerformerScores: { overall: 72, chatgpt: 75, perplexity: 70, gemini: 68, claude: 76 },
    commonStrengths: [
      'Extensive blog content with tutorials and guides',
      'Strong case study portfolios showcasing client results',
      'Good use of data points and industry statistics',
    ],
    commonWeaknesses: [
      'Inconsistent schema markup despite technical knowledge',
      'Content often promotional rather than educational',
      'Frameworks mentioned but rarely original or proprietary',
    ],
    contentBenchmarks: { avgTutorials: 8, avgCaseStudies: 6, avgFAQPages: 4, avgSchemaTypes: 2, avgDataPoints: 35 },
  },

  saas: {
    industryName: 'SaaS & Software',
    sampleSize: 'Based on AI readiness scoring patterns observed across the SaaS & Software industry',
    averageScores: { overall: 48, chatgpt: 55, perplexity: 45, gemini: 50, claude: 42 },
    topPerformerScores: { overall: 78, chatgpt: 82, perplexity: 74, gemini: 80, claude: 76 },
    commonStrengths: [
      'Comprehensive documentation and knowledge bases',
      'Strong tutorial and how-to content for products',
      'Good schema markup on product and pricing pages',
    ],
    commonWeaknesses: [
      'Case studies often locked behind lead generation forms',
      'Limited original research or proprietary data',
      'External citations and references often missing',
    ],
    contentBenchmarks: { avgTutorials: 12, avgCaseStudies: 3, avgFAQPages: 5, avgSchemaTypes: 3, avgDataPoints: 20 },
  },

  healthcare: {
    industryName: 'Healthcare & Medical',
    sampleSize: 'Based on AI readiness scoring patterns observed across the Healthcare & Medical industry',
    averageScores: { overall: 35, chatgpt: 30, perplexity: 38, gemini: 32, claude: 40 },
    topPerformerScores: { overall: 62, chatgpt: 58, perplexity: 65, gemini: 60, claude: 66 },
    commonStrengths: [
      'Strong FAQ content addressing patient questions',
      'Good use of structured data for medical services',
      'Content backed by medical citations and research',
    ],
    commonWeaknesses: [
      'Limited how-to or tutorial style content',
      'Case studies often lack quantifiable outcomes',
      'Regulatory concerns limit content depth and boldness',
    ],
    contentBenchmarks: { avgTutorials: 2, avgCaseStudies: 3, avgFAQPages: 6, avgSchemaTypes: 2, avgDataPoints: 25 },
  },

  realestate: {
    industryName: 'Real Estate',
    sampleSize: 'Based on AI readiness scoring patterns observed across the Real Estate industry',
    averageScores: { overall: 20, chatgpt: 15, perplexity: 22, gemini: 18, claude: 25 },
    topPerformerScores: { overall: 48, chatgpt: 42, perplexity: 50, gemini: 45, claude: 55 },
    commonStrengths: [
      'Local market data and neighborhood guides',
      'Property listing pages with structured data',
      'FAQ sections about buying/selling process',
    ],
    commonWeaknesses: [
      'Very few educational tutorials or guides',
      'Almost no case studies or success stories',
      'Limited schema markup beyond basic property listings',
      'Lack of original research or market analysis content',
    ],
    contentBenchmarks: { avgTutorials: 1, avgCaseStudies: 1, avgFAQPages: 2, avgSchemaTypes: 1, avgDataPoints: 10 },
  },

  ecommerce: {
    industryName: 'E-commerce & Retail',
    sampleSize: 'Based on AI readiness scoring patterns observed across the E-commerce & Retail industry',
    averageScores: { overall: 32, chatgpt: 28, perplexity: 30, gemini: 38, claude: 32 },
    topPerformerScores: { overall: 60, chatgpt: 55, perplexity: 58, gemini: 68, claude: 60 },
    commonStrengths: [
      'Product pages with detailed structured data and schema',
      'Strong FAQ sections for shipping, returns, and products',
      'Good use of product comparison and buying guides',
    ],
    commonWeaknesses: [
      'Limited tutorial or educational content beyond products',
      'Few case studies or customer success stories',
      'Data points often limited to product specifications',
      'Content rarely cites external research or authorities',
    ],
    contentBenchmarks: { avgTutorials: 2, avgCaseStudies: 1, avgFAQPages: 4, avgSchemaTypes: 3, avgDataPoints: 15 },
  },

  default: {
    industryName: 'General Industry',
    sampleSize: 'Based on AI readiness scoring patterns observed across multiple industries',
    averageScores: { overall: 32, chatgpt: 30, perplexity: 32, gemini: 30, claude: 36 },
    topPerformerScores: { overall: 65, chatgpt: 62, perplexity: 66, gemini: 64, claude: 68 },
    commonStrengths: [
      'Businesses with blogs tend to have more AI-visible content',
      'FAQ pages significantly improve structured data signals',
      'Companies with documentation outperform those without',
    ],
    commonWeaknesses: [
      'Most websites lack structured schema markup',
      'Tutorial and how-to content is rare outside tech',
      'Original research and data-backed content is uncommon',
      'Case studies are often too short to provide useful signals',
    ],
    contentBenchmarks: { avgTutorials: 3, avgCaseStudies: 2, avgFAQPages: 3, avgSchemaTypes: 2, avgDataPoints: 15 },
  },
};

export function getIndustryBenchmarks(industry: string): IndustryBenchmark {
  const key = detectIndustryKey(industry);
  return (key && INDUSTRY_BENCHMARKS[key]) || INDUSTRY_BENCHMARKS.default;
}
