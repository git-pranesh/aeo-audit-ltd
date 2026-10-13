import type { ContentSignals } from './content-signal-service';
import { adviceTopicOf, isAdviceRelevant } from './industry';
import { getBenchmarks } from './scoring-service';

export interface PlaybookAction {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  targetPlatform: string;
  estimatedImpact: string;
  timeToImplement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  currentState: string;
  targetState: string;
  stepByStep: string[];
  codeSnippet?: {
    language: string;
    code: string;
    description: string;
  };
  contentTemplate?: {
    title: string;
    outline: string[];
    tips: string[];
  };
}

export interface PlaybookResult {
  actions: PlaybookAction[];
  quickWins: PlaybookAction[];
  estimatedScoreImprovement: {
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
    overall: number;
  };
}

interface CompanyContext {
  industry: string;
  businessType: string;
  targetAudience?: string;
  valueProposition?: string;
}

function createCanonicalActionId(title: string, targetPlatform: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  return `${slug}-${targetPlatform.toLowerCase()}`;
}

const INDUSTRY_EXAMPLES: Record<string, {
  faqQuestions: string[];
  tutorialTopics: string[];
  caseStudyTitle: string;
  frameworkName: string;
  frameworkProblem: string;
  dataSourceSuggestions: string[];
}> = {
  SaaS: {
    faqQuestions: [
      "How does your software integrate with existing tools?",
      "What security certifications does your platform hold?",
      "How long does implementation typically take?",
    ],
    tutorialTopics: [
      "Getting Started with [Your Product]",
      "How to Set Up Automated Workflows",
      "Migrating from [Competitor] to [Your Product]",
    ],
    caseStudyTitle: "[Customer Name]: How They Reduced [Pain Point] by X% Using [Your Product]",
    frameworkName: "The [Your Brand] Implementation Framework",
    frameworkProblem: "complex software adoption and change management",
    dataSourceSuggestions: ["Gartner reports", "G2 benchmarks", "your own product usage data"],
  },
  "E-commerce": {
    faqQuestions: [
      "What is your return policy?",
      "How long does shipping take?",
      "Do you offer wholesale pricing?",
    ],
    tutorialTopics: [
      "How to Choose the Right [Product Category]",
      "Complete Buyer's Guide to [Product]",
      "How to Care for Your [Product]",
    ],
    caseStudyTitle: "[Customer Name]: How They Achieved [Result] with [Your Products]",
    frameworkName: "The [Your Brand] Product Selection Framework",
    frameworkProblem: "choosing the right product for specific needs",
    dataSourceSuggestions: ["industry market size reports", "customer satisfaction surveys", "product comparison data"],
  },
  Legal: {
    faqQuestions: [
      "What should I do immediately after [legal event]?",
      "How long does a [case type] case typically take?",
      "What are your fees and how is billing structured?",
    ],
    tutorialTopics: [
      "Step-by-Step Guide to [Legal Process]",
      "How to Prepare for Your First Consultation",
      "Understanding Your Rights in [Situation]",
    ],
    caseStudyTitle: "[Case Type] Success: How We Helped a Client [Achieve Outcome]",
    frameworkName: "The [Your Firm] Case Evaluation Framework",
    frameworkProblem: "navigating complex legal decisions with confidence",
    dataSourceSuggestions: ["court records and statistics", "bar association data", "government legal aid reports", "industry legal benchmarks"],
  },
  Healthcare: {
    faqQuestions: [
      "What should I expect during my first appointment?",
      "Do you accept [Insurance Provider]?",
      "How do I prepare for [Procedure or Treatment]?",
    ],
    tutorialTopics: [
      "How to Manage [Condition] at Home",
      "Step-by-Step Guide to [Treatment Process]",
      "What to Expect After [Procedure]",
    ],
    caseStudyTitle: "Patient Story: How [Treatment Approach] Helped a Patient [Achieve Outcome]",
    frameworkName: "The [Your Practice] Patient Care Framework",
    frameworkProblem: "navigating healthcare decisions and treatment planning",
    dataSourceSuggestions: ["peer-reviewed medical journals", "CDC and WHO data", "NHS or government health statistics", "clinical trial data"],
  },
  "Real Estate": {
    faqQuestions: [
      "What is the current market like in [Area]?",
      "How long does it take to buy or sell a property?",
      "What fees should I expect when buying or selling?",
    ],
    tutorialTopics: [
      "How to Buy Your First Home in [City/Region]",
      "Step-by-Step Guide to Selling Your Property",
      "How to Evaluate a Neighbourhood Before Buying",
    ],
    caseStudyTitle: "[Client Type] Story: How We Helped Them [Buy/Sell] in [Market Condition]",
    frameworkName: "The [Your Brand] Property Evaluation Framework",
    frameworkProblem: "making confident property decisions in a complex market",
    dataSourceSuggestions: ["local council property data", "Land Registry statistics", "Rightmove or Zillow market reports", "Office for National Statistics housing data"],
  },
  Marketing: {
    faqQuestions: [
      "How long before I see results from [Service]?",
      "What metrics do you report on?",
      "How do you differ from other agencies?",
    ],
    tutorialTopics: [
      "How to Run Your First [Channel] Campaign",
      "Step-by-Step Guide to [Marketing Process]",
      "How to Measure ROI on [Service Type]",
    ],
    caseStudyTitle: "[Client Name]: How We Grew Their [Metric] by X% in [Timeframe]",
    frameworkName: "The [Your Agency] Growth Framework",
    frameworkProblem: "achieving consistent, measurable marketing results",
    dataSourceSuggestions: ["HubSpot State of Marketing report", "Statista marketing benchmarks", "Google Ads industry benchmarks", "your own client outcome data"],
  },
  Restaurant: {
    faqQuestions: [
      "Do you take reservations and how far in advance?",
      "Do you cater for dietary requirements such as vegan or gluten-free?",
      "Do you offer private dining or event hire?",
    ],
    tutorialTopics: [
      "How to Make [Signature Dish] at Home",
      "Pairing Guide: [Food] and [Drink]",
      "Behind the Scenes: How We Source Our Ingredients",
    ],
    caseStudyTitle: "Event Success: How We Catered [Event Type] for [Client/Occasion]",
    frameworkName: "The [Your Restaurant] Seasonal Menu Framework",
    frameworkProblem: "creating memorable dining experiences with seasonal, local ingredients",
    dataSourceSuggestions: ["UK Food Standards Agency data", "Michelin Guide insights", "local tourism board statistics", "OpenTable dining trend reports"],
  },
  Education: {
    faqQuestions: [
      "What qualifications or outcomes can students expect?",
      "How is the course or programme structured?",
      "What support is available for students?",
    ],
    tutorialTopics: [
      "How to Get Started with [Subject or Skill]",
      "Beginner's Guide to [Topic]",
      "How to Study Effectively for [Exam or Certification]",
    ],
    caseStudyTitle: "Student Success: How [Student/Cohort] Achieved [Outcome] with [Your Programme]",
    frameworkName: "The [Your Institution] Learning Outcomes Framework",
    frameworkProblem: "structuring effective learning pathways for real-world outcomes",
    dataSourceSuggestions: ["UCAS or government education statistics", "Ofsted or accreditation body reports", "employer skills gap surveys", "alumni outcome data"],
  },
  B2B: {
    faqQuestions: [
      "What ROI can I expect from your solution?",
      "How does your pricing model work?",
      "What onboarding support do you provide?",
    ],
    tutorialTopics: [
      "How to Evaluate [Your Category] Solutions",
      "Step-by-Step Guide to [Key Process]",
      "Best Practices for [Industry Challenge]",
    ],
    caseStudyTitle: "[Customer Name]: How They Achieved [X ROI] Using [Your Solution]",
    frameworkName: "The [Your Brand] Decision Framework",
    frameworkProblem: "evaluating and selecting the right B2B solution",
    dataSourceSuggestions: ["Forrester research", "McKinsey reports", "your own customer outcome data"],
  },
  default: {
    faqQuestions: [
      "What makes your solution different from competitors?",
      "How do I get started?",
      "What support options are available?",
    ],
    tutorialTopics: [
      "Getting Started Guide",
      "How to Get the Most from [Your Product/Service]",
      "Common Mistakes to Avoid in [Your Industry]",
    ],
    caseStudyTitle: "[Customer Name]: How They Achieved [Key Result] with [Your Brand]",
    frameworkName: "The [Your Brand] Success Framework",
    frameworkProblem: "achieving optimal results in your domain",
    dataSourceSuggestions: ["industry reports", "government statistics", "original research surveys"],
  },
};

function getIndustryExamples(industry: string, businessType: string) {
  const search = (industry + " " + businessType).toLowerCase();
  if (search.includes("saas") || search.includes("software") || search.includes("developer") || search.includes("api") || search.includes("platform")) {
    return INDUSTRY_EXAMPLES["SaaS"];
  }
  if (search.includes("ecommerce") || search.includes("e-commerce") || search.includes("retail") || search.includes("shop") || search.includes("store")) {
    return INDUSTRY_EXAMPLES["E-commerce"];
  }
  if (search.includes("legal") || search.includes("law") || search.includes("attorney") || search.includes("solicitor")) {
    return INDUSTRY_EXAMPLES["Legal"];
  }
  if (search.includes("health") || search.includes("medical") || search.includes("clinic") || search.includes("dental") || search.includes("pharma")) {
    return INDUSTRY_EXAMPLES["Healthcare"];
  }
  if (search.includes("real estate") || search.includes("realty") || search.includes("property") || search.includes("mortgage")) {
    return INDUSTRY_EXAMPLES["Real Estate"];
  }
  if (search.includes("marketing") || search.includes("agency") || search.includes("advertising") || search.includes("seo") || search.includes("digital")) {
    return INDUSTRY_EXAMPLES["Marketing"];
  }
  if (search.includes("restaurant") || search.includes("food") || search.includes("cafe") || search.includes("dining") || search.includes("catering")) {
    return INDUSTRY_EXAMPLES["Restaurant"];
  }
  if (search.includes("education") || search.includes("school") || search.includes("university") || search.includes("course") || search.includes("training")) {
    return INDUSTRY_EXAMPLES["Education"];
  }
  if (search.includes("b2b") || search.includes("enterprise") || search.includes("wholesale") || search.includes("consulting")) {
    return INDUSTRY_EXAMPLES["B2B"];
  }
  return INDUSTRY_EXAMPLES["default"];
}

export function generatePlaybook(
  contentSignals: ContentSignals,
  scoringResult: { platformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number }; overallScore: number },
  companyIntelligence: CompanyContext,
  companyName: string
): PlaybookResult {
  const actions: PlaybookAction[] = [];
  const industry = companyIntelligence?.industry || 'General';
  const businessType = companyIntelligence?.businessType || 'Business';
  const examples = getIndustryExamples(industry, businessType);
  // Industry-aware playbook thresholds (matches scoring-service benchmarks)
  const benchmarks = getBenchmarks(
    companyIntelligence?.industry || '',
    contentSignals.totalPageCount || 0
  );
  const usedIds = new Set<string>();
  function getActionId(title: string, platform: string): string {
    let id = createCanonicalActionId(title, platform);
    let counter = 2;
    while (usedIds.has(id)) {
      id = `${createCanonicalActionId(title, platform)}-${counter++}`;
    }
    usedIds.add(id);
    return id;
  }

  if (contentSignals.faqSectionCount < benchmarks.faqSections) {
    const gap = benchmarks.faqSections - contentSignals.faqSectionCount;
    const safeGap = Math.max(gap, 0);
    const faqQuestionsJson = examples.faqQuestions.map(q =>
      `        {\n          "@type": "Question",\n          "name": "${q}",\n          "acceptedAnswer": {\n            "@type": "Answer",\n            "text": "[YOUR ANSWER HERE - aim for 2-3 sentences]"\n          }\n        }`
    ).join(',\n');

    actions.push({
      id: getActionId('Add FAQ Schema to Your Top Pages', 'chatgpt'),
      priority: contentSignals.faqSectionCount === 0 ? 'critical' : 'high',
      title: 'Add FAQ Schema to Your Top Pages',
      targetPlatform: 'chatgpt',
      estimatedImpact: 'Up to about 9 points on the ChatGPT estimate',
      timeToImplement: '30 minutes',
      difficulty: 'easy',
      currentState: `${contentSignals.faqSectionCount} FAQ sections detected`,
      targetState: `${benchmarks.faqSections}+ FAQ schemas across key pages`,
      stepByStep: [
        `Identify your top ${Math.max(safeGap, 3)} most-visited pages`,
        'Write 3-5 frequently asked questions for each page based on real customer inquiries',
        'Add the FAQ JSON-LD schema markup to each page\'s <head> section',
        'Test with Google Rich Results Test (search.google.com/test/rich-results)',
        'Monitor for FAQ rich snippets appearing in search within 1-2 weeks',
      ],
      codeSnippet: {
        language: 'json',
        code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
${faqQuestionsJson}
  ]
}
</script>`,
        description: `FAQ Schema markup customized for ${industry}. Paste this into your page's <head> tag and replace the placeholder answers.`,
      },
    });
  }

  if (contentSignals.tutorialCount < benchmarks.tutorials) {
    const topicList = examples.tutorialTopics.map(t => t.replace('[Your Product]', companyName));
    actions.push({
      id: getActionId('Create Step-by-Step Tutorial Content', 'chatgpt'),
      priority: contentSignals.tutorialCount === 0 ? 'critical' : 'high',
      title: 'Create Step-by-Step Tutorial Content',
      targetPlatform: 'chatgpt',
      estimatedImpact: 'Up to about 13 points on the ChatGPT estimate',
      timeToImplement: '2-4 hours per tutorial',
      difficulty: 'medium',
      currentState: `${contentSignals.tutorialCount} tutorials detected`,
      targetState: `15+ tutorials covering key user tasks`,
      stepByStep: [
        'List the top 10 tasks your customers need help with',
        'For each task, write a step-by-step tutorial with numbered instructions',
        'Include screenshots or diagrams at each major step',
        'Add a "Prerequisites" section and "What You\'ll Learn" summary at the top',
        'End each tutorial with "Next Steps" linking to related tutorials',
        'Publish under a /tutorials/ or /learn/ URL path for clear organization',
      ],
      contentTemplate: {
        title: topicList[0] || `How to [Accomplish Key Task] with ${companyName}`,
        outline: [
          'What You\'ll Learn (2-3 sentence overview)',
          'Prerequisites (what the reader needs before starting)',
          'Step 1: [First action with clear instruction]',
          'Step 2: [Second action with explanation]',
          'Step 3: [Third action with expected result]',
          'Step 4: [Fourth action with tips]',
          'Step 5: [Final action and verification]',
          'Troubleshooting Common Issues',
          'Next Steps & Related Tutorials',
        ],
        tips: [
          'Use numbered steps, not paragraphs. AI models parse structured content better',
          'Include the exact button names, menu paths, or commands the user should follow',
          `Write for a reader who has never used ${companyName} before`,
          'Add a time estimate (e.g., "This tutorial takes about 10 minutes")',
        ],
      },
    });
  }

  if (contentSignals.schemaTypeCount < 4) {
    actions.push({
      id: getActionId('Implement Article & Breadcrumb Schema Markup', 'gemini'),
      priority: contentSignals.schemaTypeCount === 0 ? 'critical' : 'high',
      title: 'Implement Article & Breadcrumb Schema Markup',
      targetPlatform: 'gemini',
      estimatedImpact: `Up to about 16 points on the Gemini estimate`,
      timeToImplement: '1-2 hours',
      difficulty: 'easy',
      currentState: `${contentSignals.schemaTypeCount} schema types detected`,
      targetState: `4+ schema types (Organization, Article, FAQPage, BreadcrumbList)`,
      stepByStep: [
        'Add Organization schema to your homepage',
        'Add Article schema to every blog post and content page',
        'Add FAQPage schema only where the questions and answers are visible on the page',
        'Add BreadcrumbList schema to all pages for navigation context',
        'Validate with validator.schema.org and Google\'s Rich Results Test',
      ],
      codeSnippet: {
        language: 'json',
        code: `<!-- Article Schema - add to blog posts -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[Your Article Title]",
  "author": {
    "@type": "Organization",
    "name": "${companyName}"
  },
  "publisher": {
    "@type": "Organization",
    "name": "${companyName}"
  },
  "datePublished": "[YYYY-MM-DD]",
  "dateModified": "[YYYY-MM-DD]",
  "description": "[2-3 sentence summary]"
}
</script>

<!-- BreadcrumbList Schema - add to inner pages -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "[https://yoursite.com/]" },
    { "@type": "ListItem", "position": 2, "name": "[Section]", "item": "[https://yoursite.com/section/]" },
    { "@type": "ListItem", "position": 3, "name": "[Page title]" }
  ]
}
</script>`,
        description: `Schema markup templates for ${companyName}. Add Article schema to content pages and BreadcrumbList to inner pages. Ready-made versions are in your AEO Pack.`,
      },
    });
  }

  if (contentSignals.caseStudyCount < benchmarks.caseStudies) {
    const csTitle = examples.caseStudyTitle.replace('[Your Product]', companyName).replace('[Your Brand]', companyName);
    actions.push({
      id: getActionId('Publish Customer Case Studies', 'claude'),
      priority: contentSignals.caseStudyCount === 0 ? 'critical' : 'high',
      title: 'Publish Customer Case Studies',
      targetPlatform: 'claude',
      estimatedImpact: 'Up to about 3 points on the Claude estimate',
      timeToImplement: '3-5 hours per case study',
      difficulty: 'medium',
      currentState: `${contentSignals.caseStudyCount} case studies detected`,
      targetState: `8+ case studies across different use cases`,
      stepByStep: [
        'Identify 3-5 customers with strong, measurable results',
        'Interview each customer about their challenge, solution, and outcomes',
        'Write each case study following the template below',
        'Include at least 3 specific metrics or data points per case study',
        'Publish under a /case-studies/ or /customers/ URL path',
        'Add customer quotes with attribution for credibility',
      ],
      contentTemplate: {
        title: csTitle,
        outline: [
          'Executive Summary (2-3 sentences with key result)',
          'The Challenge (what problem the customer faced)',
          'Why They Chose [Your Solution] (decision criteria)',
          'The Solution (how they implemented it)',
          'Implementation Timeline (phases and milestones)',
          'Results & Key Metrics (quantified outcomes)',
          'Customer Quote (direct attribution)',
          'What\'s Next (future plans)',
        ],
        tips: [
          'Lead with the most impressive metric in the title (e.g., "Reduced costs by 40%")',
          'Include at least one direct customer quote: AI models treat attributed quotes as high-authority signals',
          'Use specific numbers, not vague claims ("saved 120 hours/month" not "saved time")',
          'Mention the industry and company size so AI models can match it to relevant queries',
        ],
      },
    });
  }

  if (contentSignals.dataPointCount < benchmarks.dataPoints) {
    actions.push({
      id: getActionId('Add Statistics and Data to Existing Content', 'perplexity'),
      priority: contentSignals.dataPointCount < 5 ? 'critical' : 'high',
      title: 'Add Statistics and Data to Existing Content',
      targetPlatform: 'perplexity',
      estimatedImpact: 'Up to about 18 points on the Perplexity estimate',
      timeToImplement: '2-3 hours',
      difficulty: 'easy',
      currentState: `${contentSignals.dataPointCount} data points detected`,
      targetState: `30+ data points across your content`,
      stepByStep: [
        'Identify your top 5 most-visited content pages',
        `Research 3-5 relevant statistics per page from sources like ${examples.dataSourceSuggestions.join(', ')}`,
        'Add statistics with proper citations: "According to [Source], [statistic]"',
        'Include a "Key Statistics" or "By the Numbers" section on relevant pages',
        'Update statistics annually and note the date: "As of 2026, ..."',
        'Link to original sources for each data point',
      ],
    });
  }

  if (contentSignals.frameworkMentionCount < benchmarks.frameworkMentions) {
    const fwName = examples.frameworkName.replace('[Your Brand]', companyName);
    const fwProblem = examples.frameworkProblem;
    actions.push({
      id: getActionId('Create a Proprietary Framework Article', 'claude'),
      priority: contentSignals.frameworkMentionCount === 0 ? 'high' : 'medium',
      title: 'Create a Proprietary Framework Article',
      targetPlatform: 'claude',
      estimatedImpact: 'Up to about 16 points on the Claude estimate',
      timeToImplement: '3-4 hours',
      difficulty: 'medium',
      currentState: `${contentSignals.frameworkMentionCount} framework mentions detected`,
      targetState: `8+ framework references across your content`,
      stepByStep: [
        `Name your framework something memorable (e.g., "${fwName}")`,
        'Define 3-5 clear phases or steps in the framework',
        'Write a dedicated article explaining the framework in depth',
        'Reference the framework across your other content pieces',
        'Create a visual diagram or infographic of the framework',
        'Use the framework name consistently so AI models learn to associate it with your brand',
      ],
      contentTemplate: {
        title: fwName,
        outline: [
          `Introduction: Why ${fwProblem} needs a structured approach`,
          'The Problem: Common mistakes and their consequences',
          'Overview: The framework at a glance (include visual)',
          'Phase 1: [Name]: [What to do and why]',
          'Phase 2: [Name]: [What to do and why]',
          'Phase 3: [Name]: [What to do and why]',
          'Phase 4: [Name]: [What to do and why]',
          'When to Use This Framework (ideal scenarios)',
          'Real-World Examples (link to case studies)',
          'Download: Framework Checklist (lead magnet opportunity)',
        ],
        tips: [
          'Frameworks signal thought leadership, and Claude heavily weights this type of content',
          'Give each phase a distinct, memorable name rather than generic labels',
          'Reference your framework in other content: "Using Phase 2 of our framework..."',
          'Include a downloadable version (PDF/checklist) to increase engagement and backlinks',
        ],
      },
    });
  }

  if (contentSignals.externalLinkCount < benchmarks.externalLinks) {
    actions.push({
      id: getActionId('Add Research Citations to Key Pages', 'perplexity'),
      priority: contentSignals.externalLinkCount < 3 ? 'high' : 'medium',
      title: 'Add Research Citations to Key Pages',
      targetPlatform: 'perplexity',
      estimatedImpact: 'Up to about 9 points on the Perplexity estimate',
      timeToImplement: '1-2 hours',
      difficulty: 'easy',
      currentState: `${contentSignals.externalLinkCount} external citations detected`,
      targetState: `50+ quality external links across your content`,
      stepByStep: [
        'Audit your top 10 content pages for citation gaps',
        'For each page, identify 2-3 claims that should be backed by sources',
        'Find authoritative sources: academic papers, industry reports, government data',
        'Add inline citations: "Research by [Source] shows that [claim] ([link])"',
        'Avoid linking to direct competitors; use neutral industry sources',
        'Check that all links are current and not broken',
      ],
    });
  }

  if (contentSignals.howToGuideCount < benchmarks.howToGuides) {
    actions.push({
      id: getActionId('Convert Tutorials into How-To Guides', 'chatgpt'),
      priority: 'medium',
      title: 'Convert Tutorials into How-To Guides',
      targetPlatform: 'chatgpt',
      estimatedImpact: 'Up to about 10 points on the ChatGPT estimate',
      timeToImplement: '1-2 hours',
      difficulty: 'easy',
      currentState: `${contentSignals.howToGuideCount} how-to guides detected`,
      targetState: `12+ how-to guides optimized for AI search`,
      stepByStep: [
        'Identify existing tutorials that answer "how to" questions',
        'Restructure titles to start with "How to..." for better AI matching',
        'Ensure each guide has clear numbered steps',
        'Mark up the steps as a numbered list (ol) so AI can quote them in order',
        'Include estimated time and difficulty level at the top',
      ],
    });
  }

  if (contentSignals.longFormContentScore < 50) {
    actions.push({
      id: getActionId('Develop Long-Form Authoritative Content', 'claude'),
      priority: 'medium',
      title: 'Develop Long-Form Authoritative Content',
      targetPlatform: 'claude',
      estimatedImpact: 'Up to about 13 points on the Claude estimate',
      timeToImplement: '4-6 hours per piece',
      difficulty: 'hard',
      currentState: `Long-form content score: ${contentSignals.longFormContentScore}/100`,
      targetState: `Long-form score of 70+ with in-depth articles`,
      stepByStep: [
        'Identify 3-5 core topics where you have unique expertise',
        'Write comprehensive articles of 2,000+ words each',
        'Include multiple sections with clear headings (H2, H3)',
        'Add original analysis, not just summaries of others\' work',
        'Include comparison tables, pros/cons lists, and decision frameworks',
        'Update quarterly to maintain freshness and accuracy',
      ],
    });
  }

  if (contentSignals.blogPostCount < benchmarks.blogPosts) {
    actions.push({
      id: getActionId('Start Regular Blog Publishing', 'all'),
      priority: contentSignals.blogPostCount < 5 ? 'critical' : 'high',
      title: 'Start Regular Blog Publishing',
      targetPlatform: 'all',
      estimatedImpact: 'Up to about 5 points on the ChatGPT estimate, less on the others',
      timeToImplement: 'Ongoing, 4-8 hours per post',
      difficulty: 'medium',
      currentState: `${contentSignals.blogPostCount} blog posts detected`,
      targetState: '50+ blog posts covering key topics',
      stepByStep: [
        'Create an editorial calendar with 2-4 posts/month',
        'Focus on topics from your Content Opportunities above',
        'Each post should be 1,500-2,500 words for AI depth',
        'Include statistics, quotes, and external references',
        'Add Article schema markup to every post',
        'Internal link between related posts',
      ],
    });
  }

  if (contentSignals.documentationPageCount < 10) {
    actions.push({
      id: getActionId('Build Comprehensive Documentation', 'perplexity'),
      priority: 'high',
      title: 'Build Comprehensive Documentation',
      targetPlatform: 'perplexity',
      estimatedImpact: 'Not scored directly; helps AI assistants answer product questions accurately',
      timeToImplement: '2-4 weeks for initial documentation',
      difficulty: 'hard',
      currentState: `${contentSignals.documentationPageCount} documentation pages detected`,
      targetState: '20+ documentation pages',
      stepByStep: [
        'Create a getting-started guide for new users',
        'Document each major feature or service with examples',
        'Add API reference if you have an API',
        'Build integration guides for popular tools',
        'Create a troubleshooting section with common issues',
        'Organize under /docs/ or /documentation/ URL path',
      ],
    });
  }

  if (contentSignals.statisticMentionCount < 10) {
    actions.push({
      id: getActionId('Publish Original Research or Industry Report', 'perplexity'),
      priority: 'medium',
      title: 'Publish Original Research or Industry Report',
      targetPlatform: 'perplexity',
      estimatedImpact: 'Up to about 13 points on the Perplexity estimate',
      timeToImplement: '1-2 weeks for a full report',
      difficulty: 'hard',
      currentState: `${contentSignals.statisticMentionCount} statistical references detected`,
      targetState: '15+ statistics across your content',
      stepByStep: [
        'Survey your customers or analyze your internal data',
        'Identify 10-15 data points that are unique to you',
        'Publish as an annual industry report or benchmark',
        'Include methodology section for credibility',
        'Create charts and visualizations',
        'Pitch to industry publications for backlinks',
      ],
    });
  }

  if (contentSignals.nuancedTermCount < 10 && contentSignals.blogPostCount >= 5) {
    actions.push({
      id: getActionId('Deepen Existing Content with Analysis', 'claude'),
      priority: 'medium',
      title: 'Deepen Existing Content with Analysis',
      targetPlatform: 'claude',
      estimatedImpact: 'Up to about 11 points on the Claude estimate',
      timeToImplement: '2-3 hours per article',
      difficulty: 'medium',
      currentState: 'Limited analytical depth detected in existing content',
      targetState: 'Content with nuanced analysis, trade-offs, and expert perspectives',
      stepByStep: [
        'Identify your top 10 most-read articles',
        'Add "however" / "on the other hand" analysis',
        'Include trade-offs and considerations sections',
        'Add "when to use this" vs "when NOT to use this"',
        'Reference opposing viewpoints fairly',
        'Claude rewards nuanced, balanced content',
      ],
    });
  }

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  // Keep only advice that fits this kind of business; express targets with the
  // industry benchmark; and never claim content is missing when we only sampled.
  const targetFor: Record<string, number> = {
    'Create Step-by-Step Tutorial Content': benchmarks.tutorials,
    'Publish Customer Case Studies': benchmarks.caseStudies,
    'Start Regular Blog Publishing': benchmarks.blogPosts,
    'Add Statistics and Data to Existing Content': benchmarks.dataPoints,
    'Create a Proprietary Framework Article': benchmarks.frameworkMentions,
    'Add Research Citations to Key Pages': benchmarks.externalLinks,
    'Convert Tutorials into How-To Guides': benchmarks.howToGuides,
    'Publish Original Research or Industry Report': benchmarks.statistics,
  };
  const relevant = actions.filter((a) => {
    const topic = adviceTopicOf(a.title);
    return !topic || isAdviceRelevant(industry, topic);
  });
  for (const a of relevant) {
    const target = targetFor[a.title];
    if (target) a.targetState = a.targetState.replace(/^\d+\+/, `${target}+`);
    if (/^0 [a-z -]+ detected$/i.test(a.currentState)) {
      a.currentState = `None found in the pages and sitemap we checked`;
    }
  }
  actions.length = 0;
  actions.push(...relevant);

  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const quickWins = actions.filter(a =>
    a.difficulty === 'easy' && (a.priority === 'critical' || a.priority === 'high')
  );

  const estimatedScoreImprovement = calculateEstimatedImprovement(
    contentSignals,
    scoringResult.platformScores,
    companyIntelligence?.industry || '',
    contentSignals.totalPageCount || 0
  );

  return {
    actions,
    quickWins,
    estimatedScoreImprovement,
  };
}

function calculateEstimatedImprovement(
  signals: ContentSignals,
  currentScores: { chatgpt: number; perplexity: number; gemini: number; claude: number },
  industry: string = '',
  totalPageCount: number = 0
): PlaybookResult['estimatedScoreImprovement'] {
  const benchmarks = getBenchmarks(industry, totalPageCount || signals.totalPageCount || 0);
  // Defensive divisor: guarantee >0 to avoid div-by-zero in any newsite/edge benchmark.
  const div = (n: number) => Math.max(n, 1);

  let contentDepthGain = 0;
  let structureGain = 0;
  let researchGain = 0;
  let authorityGain = 0;

  if (signals.tutorialCount < benchmarks.tutorials) {
    contentDepthGain += Math.min(10, ((benchmarks.tutorials - signals.tutorialCount) / div(benchmarks.tutorials)) * 10);
  }
  if (signals.faqSectionCount < benchmarks.faqSections) {
    contentDepthGain += Math.min(7, ((benchmarks.faqSections - signals.faqSectionCount) / div(benchmarks.faqSections)) * 7);
  }
  if (signals.caseStudyCount < benchmarks.caseStudies) {
    contentDepthGain += Math.min(4, ((benchmarks.caseStudies - signals.caseStudyCount) / div(benchmarks.caseStudies)) * 6);
  }
  if (signals.howToGuideCount < benchmarks.howToGuides) {
    contentDepthGain += Math.min(4, ((benchmarks.howToGuides - signals.howToGuideCount) / div(benchmarks.howToGuides)) * 8);
  }

  if (signals.schemaTypeCount < benchmarks.schemaTypes) {
    structureGain += Math.min(8, ((benchmarks.schemaTypes - signals.schemaTypeCount) / div(benchmarks.schemaTypes)) * 10);
  }

  if (signals.dataPointCount < benchmarks.dataPoints) {
    researchGain += Math.min(7, ((benchmarks.dataPoints - signals.dataPointCount) / div(benchmarks.dataPoints)) * 10);
  }
  if (signals.externalLinkCount < benchmarks.externalLinks) {
    researchGain += Math.min(4, ((benchmarks.externalLinks - signals.externalLinkCount) / div(benchmarks.externalLinks)) * 5);
  }

  if (signals.frameworkMentionCount < benchmarks.frameworkMentions) {
    authorityGain += Math.min(5, ((benchmarks.frameworkMentions - signals.frameworkMentionCount) / div(benchmarks.frameworkMentions)) * 6);
  }
  if (signals.longFormContentScore < benchmarks.longFormScore) {
    authorityGain += Math.min(4, ((benchmarks.longFormScore - signals.longFormContentScore) / div(benchmarks.longFormScore)) * 5);
  }

  const PLATFORM_WEIGHTS = {
    chatgpt: { contentDepth: 0.45, structureTechnical: 0.25, researchCitations: 0.15, authority: 0.15 },
    perplexity: { contentDepth: 0.15, structureTechnical: 0.20, researchCitations: 0.45, authority: 0.20 },
    gemini: { contentDepth: 0.25, structureTechnical: 0.40, researchCitations: 0.20, authority: 0.15 },
    claude: { contentDepth: 0.20, structureTechnical: 0.15, researchCitations: 0.25, authority: 0.40 },
  };

  const normalizedContentGain = (contentDepthGain / 35) * 100;
  const normalizedStructureGain = (structureGain / 25) * 100;
  const normalizedResearchGain = (researchGain / 25) * 100;
  const normalizedAuthorityGain = (authorityGain / 15) * 100;

  const improvements = {
    chatgpt: Math.round(
      normalizedContentGain * PLATFORM_WEIGHTS.chatgpt.contentDepth +
      normalizedStructureGain * PLATFORM_WEIGHTS.chatgpt.structureTechnical +
      normalizedResearchGain * PLATFORM_WEIGHTS.chatgpt.researchCitations +
      normalizedAuthorityGain * PLATFORM_WEIGHTS.chatgpt.authority
    ),
    perplexity: Math.round(
      normalizedContentGain * PLATFORM_WEIGHTS.perplexity.contentDepth +
      normalizedStructureGain * PLATFORM_WEIGHTS.perplexity.structureTechnical +
      normalizedResearchGain * PLATFORM_WEIGHTS.perplexity.researchCitations +
      normalizedAuthorityGain * PLATFORM_WEIGHTS.perplexity.authority
    ),
    gemini: Math.round(
      normalizedContentGain * PLATFORM_WEIGHTS.gemini.contentDepth +
      normalizedStructureGain * PLATFORM_WEIGHTS.gemini.structureTechnical +
      normalizedResearchGain * PLATFORM_WEIGHTS.gemini.researchCitations +
      normalizedAuthorityGain * PLATFORM_WEIGHTS.gemini.authority
    ),
    claude: Math.round(
      normalizedContentGain * PLATFORM_WEIGHTS.claude.contentDepth +
      normalizedStructureGain * PLATFORM_WEIGHTS.claude.structureTechnical +
      normalizedResearchGain * PLATFORM_WEIGHTS.claude.researchCitations +
      normalizedAuthorityGain * PLATFORM_WEIGHTS.claude.authority
    ),
    overall: 0,
  };

  improvements.chatgpt = Math.min(improvements.chatgpt, 100 - currentScores.chatgpt);
  improvements.perplexity = Math.min(improvements.perplexity, 100 - currentScores.perplexity);
  improvements.gemini = Math.min(improvements.gemini, 100 - currentScores.gemini);
  improvements.claude = Math.min(improvements.claude, 100 - currentScores.claude);

  improvements.overall = Math.round(
    (improvements.chatgpt + improvements.perplexity + improvements.gemini + improvements.claude) / 4
  );

  return improvements;
}
