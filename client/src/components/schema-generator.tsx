import { useState } from "react";
import { Code, Copy, Check, Braces, FileCode, Info, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import UpgradePromptCard from "./upgrade-prompt-card";

interface SchemaGeneratorProps {
  companyIntelligence?: {
    industry: string;
    businessType: string;
    targetAudience: string;
    valueProposition: string;
    marketPosition: string;
  };
  contentSignals: {
    tutorials: number;
    faqs: number;
    schemaMarkup: number;
    caseStudies: number;
  };
  companyName: string;
  websiteUrl: string;
  schemaLimit?: number;
}

interface SchemaBlock {
  id: string;
  title: string;
  description: string;
  pageType: string;
  platformHelps: string[];
  code: string;
}

const INDUSTRY_SCHEMA_MAP: Record<string, {
  primaryTypes: string[];
  defaultSchemas: string[];
}> = {
  saas: {
    primaryTypes: ["SoftwareApplication", "Product", "FAQPage", "HowTo", "Article"],
    defaultSchemas: ["SoftwareApplication", "FAQPage", "HowTo"],
  },
  ecommerce: {
    primaryTypes: ["Product", "ItemList", "FAQPage", "BreadcrumbList", "Review"],
    defaultSchemas: ["Product", "FAQPage", "BreadcrumbList"],
  },
  legal: {
    primaryTypes: ["LegalService", "LocalBusiness", "FAQPage", "Article", "Person"],
    defaultSchemas: ["LegalService", "FAQPage", "Article"],
  },
  healthcare: {
    primaryTypes: ["MedicalBusiness", "Physician", "FAQPage", "Article", "MedicalCondition"],
    defaultSchemas: ["MedicalBusiness", "FAQPage", "Article"],
  },
  realestate: {
    primaryTypes: ["RealEstateAgent", "LocalBusiness", "FAQPage", "Place", "Article"],
    defaultSchemas: ["RealEstateAgent", "FAQPage", "Article"],
  },
  marketing: {
    primaryTypes: ["ProfessionalService", "LocalBusiness", "FAQPage", "Article", "HowTo"],
    defaultSchemas: ["ProfessionalService", "FAQPage", "HowTo"],
  },
  restaurant: {
    primaryTypes: ["Restaurant", "LocalBusiness", "FAQPage", "Menu", "Review"],
    defaultSchemas: ["Restaurant", "FAQPage", "Menu"],
  },
  education: {
    primaryTypes: ["EducationalOrganization", "Course", "FAQPage", "HowTo", "Article"],
    defaultSchemas: ["EducationalOrganization", "Course", "FAQPage"],
  },
  default: {
    primaryTypes: ["Organization", "LocalBusiness", "FAQPage", "Article", "BreadcrumbList"],
    defaultSchemas: ["Organization", "FAQPage", "Article"],
  },
};

function getIndustrySchemaConfig(industry: string | undefined) {
  if (!industry) return INDUSTRY_SCHEMA_MAP.default;
  const normalized = industry.toLowerCase();
  if (normalized.includes("saas") || normalized.includes("software") || normalized.includes("tech")) {
    return INDUSTRY_SCHEMA_MAP.saas;
  }
  if (normalized.includes("ecommerce") || normalized.includes("retail") || normalized.includes("shop")) {
    return INDUSTRY_SCHEMA_MAP.ecommerce;
  }
  if (normalized.includes("legal") || normalized.includes("law") || normalized.includes("attorney")) {
    return INDUSTRY_SCHEMA_MAP.legal;
  }
  if (normalized.includes("health") || normalized.includes("medical") || normalized.includes("clinic") || normalized.includes("dental")) {
    return INDUSTRY_SCHEMA_MAP.healthcare;
  }
  if (normalized.includes("real estate") || normalized.includes("realty") || normalized.includes("property")) {
    return INDUSTRY_SCHEMA_MAP.realestate;
  }
  if (normalized.includes("marketing") || normalized.includes("agency") || normalized.includes("advertising")) {
    return INDUSTRY_SCHEMA_MAP.marketing;
  }
  if (normalized.includes("restaurant") || normalized.includes("food") || normalized.includes("cafe") || normalized.includes("dining")) {
    return INDUSTRY_SCHEMA_MAP.restaurant;
  }
  if (normalized.includes("education") || normalized.includes("school") || normalized.includes("university") || normalized.includes("course")) {
    return INDUSTRY_SCHEMA_MAP.education;
  }
  return INDUSTRY_SCHEMA_MAP.default;
}

const INDUSTRY_FAQ_MAP: Record<string, Array<{ q: string; a: string }>> = {
  legal: [
    { q: "How much does a personal injury lawyer cost?", a: "Most personal injury lawyers work on a contingency fee basis, meaning you pay nothing upfront. Fees are typically 33-40% of the settlement amount. Initial consultations are usually free." },
    { q: "When should I hire a personal injury attorney?", a: "You should consult an attorney as soon as possible after an injury, ideally within days. Early legal guidance helps preserve evidence and protects your rights to compensation." },
    { q: "How long does a personal injury case take?", a: "Most personal injury cases settle within 12-18 months. Complex cases involving severe injuries or disputed liability may take 2-3 years if they go to trial." },
    { q: "What compensation can I receive for my injury?", a: "Compensation may include medical expenses, lost wages, pain and suffering, emotional distress, and in some cases, punitive damages. The amount depends on the severity of your injuries and circumstances." },
    { q: "Do I have a valid personal injury claim?", a: "You may have a valid claim if someone else's negligence caused your injury. Key factors include proving the other party's duty of care, breach of that duty, causation, and resulting damages." },
  ],
  marketing: [
    { q: "How much does digital marketing cost for small businesses?", a: "Digital marketing costs vary widely. Small businesses typically invest $2,500-$12,000/month. SEO packages range from $1,000-$5,000/month, while PPC management starts around $1,500/month plus ad spend." },
    { q: "How long does SEO take to show results?", a: "SEO typically takes 4-6 months to show measurable results. Competitive industries may take 6-12 months. Results compound over time, with the best ROI seen after 12+ months of consistent effort." },
    { q: "What is the difference between SEO and PPC?", a: "SEO (Search Engine Optimization) focuses on earning organic search rankings through content and technical improvements. PPC (Pay-Per-Click) is paid advertising where you bid on keywords for immediate visibility." },
    { q: "How do I measure marketing ROI?", a: "Track key metrics including customer acquisition cost (CAC), customer lifetime value (CLV), conversion rates, and revenue attribution. Use tools like Google Analytics to connect marketing spend to business outcomes." },
    { q: "What marketing channels work best for B2B companies?", a: "LinkedIn, content marketing, email nurture sequences, and SEO consistently perform well for B2B. Account-based marketing (ABM) is effective for enterprise sales, while webinars drive qualified leads." },
  ],
  saas: [
    { q: "What is SaaS and how does it work?", a: "SaaS (Software as a Service) delivers applications over the internet on a subscription basis. Instead of installing software locally, users access it through a web browser, with the provider handling maintenance and updates." },
    { q: "How do you ensure data security in cloud software?", a: "We implement enterprise-grade security including AES-256 encryption at rest, TLS 1.3 in transit, SOC 2 Type II compliance, regular penetration testing, and role-based access controls with multi-factor authentication." },
    { q: "What integrations are available with your platform?", a: "Our platform integrates with 100+ popular tools including CRMs, marketing platforms, communication tools, and analytics services through native integrations and a REST API for custom connections." },
    { q: "Can I migrate my existing data to your platform?", a: "Yes, we offer assisted data migration from most competing platforms. Our onboarding team provides dedicated support including data mapping, validation, and parallel running to ensure zero data loss." },
    { q: "What support options do you offer?", a: "We provide email support on all plans, with live chat and priority support on Professional plans. Enterprise customers receive a dedicated account manager and 24/7 phone support with guaranteed SLAs." },
  ],
  healthcare: [
    { q: "Do you accept insurance?", a: "We accept most major insurance plans including Medicare, Blue Cross Blue Shield, Aetna, Cigna, and United Healthcare. Contact our office to verify coverage for your specific plan and services." },
    { q: "How do I schedule an appointment?", a: "You can schedule an appointment online through our patient portal, by calling our office during business hours, or by submitting a request form on our website. New patients should allow extra time for intake." },
    { q: "What should I bring to my first visit?", a: "Please bring your photo ID, insurance card, a list of current medications, relevant medical records, and a completed new patient form which you can download from our website." },
    { q: "Do you offer telehealth appointments?", a: "Yes, we offer telehealth video consultations for many types of visits. Virtual appointments are available through our secure patient portal and are covered by most insurance plans." },
    { q: "What are your office hours?", a: "Our office is open Monday through Friday, 8:00 AM to 5:00 PM. We offer extended hours on Tuesdays and Thursdays until 7:00 PM. Saturday appointments are available by request." },
  ],
  realestate: [
    { q: "How much is my home worth?", a: "Home values depend on location, size, condition, comparable sales, and market conditions. Request a free comparative market analysis (CMA) from our team for an accurate estimate based on recent sales in your area." },
    { q: "What are the steps to buying a home?", a: "The home buying process includes: getting pre-approved for a mortgage, working with an agent to find homes, making an offer, home inspection, appraisal, finalizing your loan, and closing. The process typically takes 30-60 days." },
    { q: "How much down payment do I need?", a: "Down payment requirements vary by loan type. Conventional loans typically require 5-20%, FHA loans as low as 3.5%, and VA/USDA loans may require 0% down. A larger down payment reduces monthly payments and may eliminate PMI." },
    { q: "Should I sell my home before buying a new one?", a: "It depends on your financial situation and market conditions. Selling first provides a known budget but may require temporary housing. Buying first avoids the rush but carries the risk of two mortgages." },
  ],
  ecommerce: [
    { q: "What is your return policy?", a: "We offer a 30-day return policy on most items. Products must be in original condition with tags attached. Free return shipping is provided for defective or incorrect items. Refunds are processed within 5-7 business days." },
    { q: "How long does shipping take?", a: "Standard shipping takes 5-7 business days. Expedited shipping (2-3 days) and overnight options are available at checkout. Orders placed before 2 PM ET ship same day. Free shipping on orders over $50." },
    { q: "Do you ship internationally?", a: "Yes, we ship to over 50 countries worldwide. International shipping typically takes 7-14 business days. Customs duties and taxes may apply and are the responsibility of the buyer." },
    { q: "How can I track my order?", a: "Once your order ships, you will receive a tracking number via email. You can also track your order through your account dashboard or by contacting our customer support team." },
    { q: "Are your products authentic?", a: "Yes, all products are 100% authentic and sourced directly from authorized manufacturers and distributors. We guarantee authenticity on every item we sell." },
  ],
  default: [
    { q: "What services do you offer?", a: "We provide a comprehensive range of services tailored to meet your needs. Visit our services page for a detailed overview of our offerings, or contact us for a personalized consultation." },
    { q: "How can I get a quote?", a: "You can request a free quote by filling out our online form, calling our office, or emailing us directly. We typically respond within 24 hours with a detailed proposal." },
    { q: "What makes you different from competitors?", a: "We differentiate through our commitment to quality, personalized approach, industry expertise, and proven track record. Our clients consistently report higher satisfaction and better outcomes." },
    { q: "Do you offer free consultations?", a: "Yes, we offer complimentary initial consultations to understand your needs and discuss how we can help. Schedule yours through our website or by calling our team." },
    { q: "What areas do you serve?", a: "We serve clients locally and nationally. Our team is equipped to handle projects of all sizes, with both in-person and remote service options available." },
  ],
};

const INDUSTRY_HOWTO_MAP: Record<string, {
  title: string;
  description: string;
  steps: Array<{ name: string; text: string }>;
}> = {
  legal: {
    title: 'How to Get Legal Help from {company}',
    description: 'A step-by-step guide to getting the legal representation you need from {company}.',
    steps: [
      { name: 'Describe Your Situation', text: 'Visit {url} and fill out the free case evaluation form, describing your legal issue.' },
      { name: 'Schedule Free Consultation', text: 'Book a no-obligation consultation by phone or video to discuss your case with an attorney.' },
      { name: 'Review Your Options', text: 'Your attorney will explain your legal options, potential outcomes, and recommended strategy.' },
      { name: 'Engage Representation', text: 'If you decide to proceed, sign the representation agreement and let your legal team start working on your case.' },
      { name: 'Stay Informed', text: 'Receive regular case updates and communicate with your legal team through the client portal.' },
    ]
  },
  marketing: {
    title: 'How to Start a Marketing Project with {company}',
    description: 'A guide to launching your marketing campaign with {company}.',
    steps: [
      { name: 'Request a Strategy Session', text: 'Visit {url} and schedule a free marketing strategy session to discuss your goals.' },
      { name: 'Get Your Custom Proposal', text: 'Receive a tailored marketing plan with recommended channels, timeline, and budget.' },
      { name: 'Approve the Strategy', text: 'Review the proposal, provide feedback, and approve the final strategy and deliverables.' },
      { name: 'Launch Your Campaign', text: 'Your dedicated team sets up campaigns, creates content, and begins execution.' },
      { name: 'Track Results', text: 'Access real-time reporting dashboards and receive monthly performance reviews.' },
    ]
  },
  saas: {
    title: 'How to Get Started with {company}',
    description: 'A step-by-step guide to setting up and using {company} for your business.',
    steps: [
      { name: 'Create Your Account', text: 'Visit {url} and sign up for a free trial or choose the plan that fits your needs.' },
      { name: 'Set Up Your Workspace', text: 'Configure your settings, add your team members, and customize your preferences.' },
      { name: 'Connect Your Tools', text: 'Integrate with your existing tools and import your data for a seamless transition.' },
      { name: 'Complete Onboarding', text: 'Follow the guided setup wizard and explore key features with interactive tutorials.' },
      { name: 'Go Live', text: 'Start using the platform with your team and monitor your dashboard for insights.' },
    ]
  },
  healthcare: {
    title: 'How to Book an Appointment with {company}',
    description: 'A step-by-step guide to scheduling your visit with {company}.',
    steps: [
      { name: 'Check Your Insurance', text: 'Visit {url} or call to verify your insurance is accepted and check coverage details.' },
      { name: 'Schedule Your Appointment', text: 'Book online through the patient portal or call during office hours to schedule.' },
      { name: 'Complete Intake Forms', text: 'Download and fill out new patient forms before your visit to save time.' },
      { name: 'Attend Your Visit', text: 'Arrive 15 minutes early with your ID, insurance card, and completed forms.' },
      { name: 'Follow Up', text: 'Access visit notes and follow-up instructions through the patient portal.' },
    ]
  },
  realestate: {
    title: 'How to Buy or Sell a Home with {company}',
    description: 'A guide to the real estate process with {company}.',
    steps: [
      { name: 'Get a Free Consultation', text: 'Contact {company} to discuss your buying or selling goals and timeline.' },
      { name: 'Get Pre-Approved or List Your Home', text: 'Buyers: get mortgage pre-approval. Sellers: get a market analysis and list your property.' },
      { name: 'Search or Show Your Property', text: 'Browse listings or host showings with your dedicated agent guiding the process.' },
      { name: 'Make or Negotiate Offers', text: 'Submit or review offers with expert negotiation support from your agent.' },
      { name: 'Close the Deal', text: 'Complete inspections, finalize financing, and close on your new home.' },
    ]
  },
  ecommerce: {
    title: 'How to Shop with {company}',
    description: 'A quick guide to finding and ordering products from {company}.',
    steps: [
      { name: 'Browse Products', text: 'Visit {url} and explore categories or use search to find what you need.' },
      { name: 'Compare Options', text: 'Read product descriptions, reviews, and compare similar items side by side.' },
      { name: 'Add to Cart and Checkout', text: 'Select your items, choose shipping options, and complete secure checkout.' },
      { name: 'Track Your Order', text: 'Receive shipping confirmation with tracking number and delivery estimates.' },
      { name: 'Return if Needed', text: 'Use the easy return process within 30 days if the product does not meet your needs.' },
    ]
  },
  default: {
    title: 'How to Get Started with {company}',
    description: 'A step-by-step guide to working with {company}.',
    steps: [
      { name: 'Visit the Website', text: 'Go to {url} and explore the services and solutions available.' },
      { name: 'Request Information', text: 'Fill out the contact form or call to discuss your specific needs.' },
      { name: 'Get a Custom Proposal', text: 'Receive a tailored recommendation based on your requirements and budget.' },
      { name: 'Start Working Together', text: 'Begin your project with a dedicated point of contact managing the process.' },
      { name: 'Review Results', text: 'Track progress and review outcomes with regular check-ins and reporting.' },
    ]
  },
};

function getIndustryKey(industry: string): string {
  const lower = (industry || '').toLowerCase();
  if (lower.includes('law') || lower.includes('legal') || lower.includes('attorney')) return 'legal';
  if (lower.includes('marketing') || lower.includes('advertising') || lower.includes('agency')) return 'marketing';
  if (lower.includes('saas') || lower.includes('software') || lower.includes('tech') || lower.includes('platform')) return 'saas';
  if (lower.includes('health') || lower.includes('medical') || lower.includes('dental') || lower.includes('clinic')) return 'healthcare';
  if (lower.includes('real estate') || lower.includes('realtor') || lower.includes('property')) return 'realestate';
  if (lower.includes('ecommerce') || lower.includes('e-commerce') || lower.includes('retail') || lower.includes('shop')) return 'ecommerce';
  return 'default';
}

function isLocalBusiness(businessType: string, industry: string): boolean {
  const lower = `${businessType} ${industry}`.toLowerCase();
  const localIndicators = ['local', 'clinic', 'office', 'store', 'shop', 'restaurant', 'salon', 'dental', 'law firm', 'attorney', 'realtor', 'real estate', 'plumber', 'electrician', 'contractor'];
  return localIndicators.some(i => lower.includes(i));
}

function generateSchemaBlocks(
  companyName: string,
  websiteUrl: string,
  industry: string,
  businessType: string,
  contentSignals: SchemaGeneratorProps['contentSignals']
): SchemaBlock[] {
  const blocks: SchemaBlock[] = [];
  const industryKey = getIndustryKey(industry);
  const faqs = INDUSTRY_FAQ_MAP[industryKey] || INDUSTRY_FAQ_MAP.default;

  if (contentSignals.faqs < 3) {
    const personalizedFaqs = faqs.map(f => ({
      q: f.q.replace(/your|our/gi, `${companyName}'s`),
      a: f.a,
    }));
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": personalizedFaqs.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": f.a
        }
      }))
    };

    blocks.push({
      id: 'faq',
      title: 'FAQ Schema (FAQPage)',
      description: `Paste this into the <head> of your FAQ or service pages. Replace questions and answers to match your business specifics.`,
      pageType: 'FAQ / Service pages',
      platformHelps: ['Gemini', 'ChatGPT'],
      code: `<script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n</script>`,
    });
  }

  if (contentSignals.tutorials < 3) {
    const howToData = INDUSTRY_HOWTO_MAP[industryKey] || INDUSTRY_HOWTO_MAP.default;

    const howToSchema = {
      "@context": "https://schema.org",
      "@type": "HowTo",
      "name": howToData.title.replace('{company}', companyName),
      "description": howToData.description.replace('{company}', companyName),
      "totalTime": "PT15M",
      "step": howToData.steps.map((s, i) => ({
        "@type": "HowToStep",
        "position": i + 1,
        "name": s.name,
        "text": s.text.replace('{company}', companyName).replace('{url}', websiteUrl),
      })),
    };

    blocks.push({
      id: 'howto',
      title: 'HowTo Schema',
      description: `Paste this into the <head> of your tutorial or getting-started pages. Customize the steps to match your actual process.`,
      pageType: 'Tutorial / Guide pages',
      platformHelps: ['ChatGPT', 'Perplexity'],
      code: `<script type="application/ld+json">\n${JSON.stringify(howToSchema, null, 2)}\n</script>`,
    });
  }

  if (contentSignals.schemaMarkup < 3) {
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": `[Your Article Title] — ${companyName}`,
      "description": "[Brief description of the article content — keep under 160 characters]",
      "author": {
        "@type": "Organization",
        "name": companyName,
        "url": websiteUrl
      },
      "publisher": {
        "@type": "Organization",
        "name": companyName,
        "url": websiteUrl,
        "logo": {
          "@type": "ImageObject",
          "url": `${websiteUrl.replace(/\/$/, '')}/logo.png`
        }
      },
      "datePublished": "[YYYY-MM-DD]",
      "dateModified": "[YYYY-MM-DD]",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `${websiteUrl.replace(/\/$/, '')}/blog/[article-slug]`
      },
      "image": `${websiteUrl.replace(/\/$/, '')}/images/[article-image].jpg`
    };

    blocks.push({
      id: 'article',
      title: 'Article Schema',
      description: `Paste this into the <head> of every blog post or article page. Replace bracketed placeholders with actual content.`,
      pageType: 'Blog posts / Articles',
      platformHelps: ['Perplexity', 'Claude', 'Gemini'],
      code: `<script type="application/ld+json">\n${JSON.stringify(articleSchema, null, 2)}\n</script>`,
    });
  }

  if (isLocalBusiness(businessType, industry)) {
    const localSchema = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": companyName,
      "url": websiteUrl,
      "telephone": "[YOUR-PHONE-NUMBER]",
      "email": "[your-email@example.com]",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "[123 Main Street]",
        "addressLocality": "[City]",
        "addressRegion": "[State]",
        "postalCode": "[ZIP Code]",
        "addressCountry": "US"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "[YOUR-LATITUDE]",
        "longitude": "[YOUR-LONGITUDE]"
      },
      "openingHoursSpecification": [
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          "opens": "09:00",
          "closes": "17:00"
        }
      ],
      "priceRange": "$$",
      "image": `${websiteUrl.replace(/\/$/, '')}/images/storefront.jpg`,
      "description": `${companyName} provides ${industry.toLowerCase()} services. ${businessType}.`
    };

    blocks.push({
      id: 'localbusiness',
      title: 'LocalBusiness Schema',
      description: `Paste this into the <head> of your homepage or contact page. Fill in your actual address, phone number, and business hours.`,
      pageType: 'Homepage / Contact page',
      platformHelps: ['Gemini', 'ChatGPT', 'Perplexity'],
      code: `<script type="application/ld+json">\n${JSON.stringify(localSchema, null, 2)}\n</script>`,
    });
  }

  return blocks;
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({ title: "Copied to clipboard", description: "Schema code copied — paste it into your page's <head> tag." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Copy failed", description: "Please select the code and copy manually.", variant: "destructive" });
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleCopy} className="gap-1.5 h-8 text-xs">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : 'Copy Code'}
    </Button>
  );
}

function SchemaCodeBlock({ block }: { block: SchemaBlock }) {
  const [expanded, setExpanded] = useState(false);
  const previewLines = block.code.split('\n').slice(0, 8).join('\n');

  return (
    <Card className="border border-border/70 shadow-md hover:shadow-lg transition-shadow">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
              {block.platformHelps.map(p => (
                <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0">
                  {p}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{block.description}</p>
          </div>
          <CopyCodeButton code={block.code} />
        </div>

        <div className="relative">
          <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-[11px] text-foreground leading-relaxed font-mono">
            <code>{expanded ? block.code : previewLines + (block.code.split('\n').length > 8 ? '\n  ...' : '')}</code>
          </pre>
          {block.code.split('\n').length > 8 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="absolute bottom-2 right-2 text-[10px] text-primary hover:text-primary/80 bg-card px-2 py-0.5 rounded border border-border"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Info className="h-3 w-3" />
          <span>Paste into the &lt;head&gt; of your {block.pageType}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SchemaGenerator({
  companyIntelligence,
  contentSignals,
  companyName,
  websiteUrl,
  schemaLimit = 999,
}: SchemaGeneratorProps) {
  const industry = companyIntelligence?.industry || 'General';
  const businessType = companyIntelligence?.businessType || 'Business';
  const schemaConfig = getIndustrySchemaConfig(companyIntelligence?.industry);

  const allSchemaBlocks = generateSchemaBlocks(
    companyName,
    websiteUrl,
    industry,
    businessType,
    contentSignals
  );

  if (allSchemaBlocks.length === 0) return null;

  const visibleBlocks = allSchemaBlocks.slice(0, schemaLimit);
  const lockedCount = allSchemaBlocks.length - visibleBlocks.length;
  const missingCount = allSchemaBlocks.length;

  return (
    <Card className="bg-card border border-border shadow-lg fade-in-up">
      <CardHeader className="pb-3 text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl">
          <Braces className="h-6 w-6 text-primary" />
          AI-Ready Schema Markup — Copy &amp; Paste
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Add these code blocks to your website's &lt;head&gt; tag to improve AI visibility
        </p>
        {companyIntelligence?.industry && (
          <p className="text-xs text-muted-foreground mt-1">
            Schema types selected for: <span className="font-medium">{companyIntelligence.industry}</span>
          </p>
        )}
        {schemaConfig.primaryTypes.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
            {schemaConfig.primaryTypes.map(t => (
              <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {missingCount > 0 && (
          <p className="text-xs text-primary/80 mt-1">
            <FileCode className="h-3.5 w-3.5 inline mr-1" />
            {missingCount} schema type{missingCount !== 1 ? 's' : ''} missing or insufficient — add these to boost your score
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          {visibleBlocks.map(block => (
            <SchemaCodeBlock key={block.id} block={block} />
          ))}
        </div>
        {lockedCount > 0 && (
          <div className="mt-4">
            <UpgradePromptCard
              targetPlan="starter"
              headline={`Generate all ${lockedCount + visibleBlocks.length} schema types for your site`}
              compact
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
