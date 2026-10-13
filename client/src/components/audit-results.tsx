import { useState } from "react";
import { CheckCircle, AlertTriangle, Settings, Lightbulb, Share2, Clock, Database, ChevronDown, ChevronUp, HelpCircle, BarChart3, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { AuditData, ContentTopic } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { getFeatureFlags } from "@/lib/feature-flags";
import { useEffectivePlan } from "@/contexts/ViewAsPlanContext";
import CompanyIntelligenceComponent from "./company-intelligence";
import CompetitorAnalysisComponent from "./competitor-analysis";
import CitationIntelligenceComponent from "./citation-intelligence";
import CitationSnapshot from "./citation-snapshot";
import MarketContextComponent from "./market-context";
import EnhancedTopicCard from "./enhanced-topic-card";
import EnhancedRecommendationsComponent from "./enhanced-recommendations";
import FixItPlaybook from "./fix-it-playbook";
import IndustryBenchmark from "./industry-benchmark";
import ScoreHistoryChart from "@/components/score-history-chart";
import SchemaGenerator from "./schema-generator";
import MethodologyTooltip, { MethodologyBanner } from "./methodology-tooltip";
import QuickWinsChecklist from "./quick-wins-checklist";
import { AdminGatingBadge } from "./admin-gating-badge";
import BlueprintScoreDisplay from "@/components/blueprint-score-display";

interface AuditResultsProps {
  auditData: AuditData;
  websiteUrl: string;
  auditId?: string;
  lastCitationRefreshAt?: string | null;
  // When true, renders a read-only view for the public share page: hides
  // actions that require an authenticated user (e.g. AEO file generation).
  publicView?: boolean;
}

export default function AuditResults({ auditData, websiteUrl, auditId, lastCitationRefreshAt, publicView }: AuditResultsProps) {
  const { toast } = useToast();
  const { userDoc } = useAuth();
  const effectivePlan = useEffectivePlan();
  const flags = getFeatureFlags(effectivePlan);
  const [activeTopicCategory, setActiveTopicCategory] = useState<keyof typeof auditData.contentTopics>("authoritative");
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [showScoreExplanation, setShowScoreExplanation] = useState(true);
  const [generatingFiles, setGeneratingFiles] = useState(false);

  const handleGenerateFiles = async () => {
    setGeneratingFiles(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const ci = auditData.companyIntelligence;
      const response = await fetch('/api/generate-aeo-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          websiteUrl,
          companyName: ci?.companyName,
          industry: ci?.industry,
          businessType: ci?.businessType,
          targetAudience: ci?.targetAudience,
          valueProposition: ci?.valueProposition,
          keywords: [],
          competitors: [],
          userPlan: effectivePlan,
        }),
      });

      if (response.status === 403) {
        toast({ title: 'Upgrade required', description: 'AEO file generation requires Pro plan or above.' });
        return;
      }
      if (!response.ok) throw new Error('Generation failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ci?.companyName || 'site'}-aeo-files.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Error', description: 'Could not generate files. Try again.' });
    } finally {
      setGeneratingFiles(false);
    }
  };

  const topicCategories = [
    { key: "authoritative" as const, label: "Authoritative", range: "85-95%" },
    { key: "thoughtLeadership" as const, label: "Thought Leadership", range: "70-84%" },
    { key: "competitiveAdvantage" as const, label: "Competitive Advantage", range: "50-69%" },
    { key: "emergingOpportunity" as const, label: "Emerging Opportunity", range: "30-49%" }
  ];

  // Share functionality
  const handleShare = async () => {
    const shareData = {
      title: `AI Readiness Results for ${(() => { try { return new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname; } catch { return websiteUrl; } })()}`,
      text: `AI Readiness Score: ${auditData.auditResults.overallScore}/100 (Grade: ${auditData.auditResults.letterGrade}). Get your website analyzed for AI search visibility.`,
      url: window.location.href
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast({
          title: "Shared successfully",
          description: "Audit results have been shared.",
        });
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        toast({
          title: "Copied to clipboard",
          description: "Audit results summary has been copied to your clipboard.",
        });
      }
    } catch (error) {
      console.error('Share failed:', error);
      toast({
        title: "Share failed",
        description: "Unable to share results. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get current topic count dynamically
  const getCurrentTopicCount = () => {
    return auditData.contentTopics[activeTopicCategory]?.length || 0;
  };

  // Get topics to display (limited or all)
  const getTopicsToDisplay = () => {
    const topics = auditData.contentTopics[activeTopicCategory] || [];
    return showAllTopics ? topics : topics.slice(0, 9);
  };

  const renderTopicCard = (topic: ContentTopic, index: number) => (
    <EnhancedTopicCard key={index} topic={topic} index={index} />
  );

  return (
    <section className="space-y-8">
      {/* Signal Quality Warning - shown when content signals are minimal */}
      {auditData.signalQuality === 'minimal' && (
        <Card className="bg-red-600/20 border-2 border-red-500 shadow-xl fade-in-up">
          <CardContent className="p-5 flex items-start space-x-4">
            <div className="bg-red-500 rounded-full p-2 flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-base font-bold text-red-500 mb-2">Limited Content Analysis</h3>
              <p className="text-sm text-foreground leading-relaxed">
                {auditData.auditResults.disclaimer || 
                  'We were unable to fully analyze your website content. Scores are based on available domain information and may not reflect your full content quality.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scraping Status Warning - shown when website scraping failed silently */}
      {auditData.scrapingStatus && !auditData.scrapingStatus.success && (
        <Card className="bg-orange-600/20 border-2 border-orange-500 shadow-xl fade-in-up">
          <CardContent className="p-5 flex items-start space-x-4">
            <div className="bg-orange-500 rounded-full p-2 flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-base font-bold text-orange-500 mb-2">Limited Website Access</h3>
              <p className="text-sm text-foreground leading-relaxed">
                {auditData.scrapingStatus.warning}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Large site note - shown when scraping hit the 3-minute cap */}
      {auditData.scrapingStatus?.largeSiteDetected && (
        <Card className="bg-blue-500/10 border-2 border-blue-500/40 shadow-lg fade-in-up">
          <CardContent className="p-5 flex items-start space-x-4">
            <div className="bg-blue-500 rounded-full p-2 flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-base font-bold text-blue-700 mb-2">Sampled Analysis</h3>
              <p className="text-sm text-foreground leading-relaxed">
                {auditData.scrapingStatus.largeSiteNote || 'Large site detected — analysis based on sampled pages.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Competitor Context Disclaimer */}
      <Card className="bg-blue-500/10 border border-blue-500/30 shadow-lg fade-in-up">
        <CardContent className="p-4 flex items-start space-x-3">
          <Database className="h-5 w-5 text-blue-700 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-700 mb-1">About Competitor Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Competitors shown are websites that AI platforms (ChatGPT, Perplexity, Gemini, Claude) cite when users ask questions in your industry - not necessarily your direct business competitors. This shows who you're competing against for AI visibility and citations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Content Verification Summary - shown when LLM verification was performed */}
      {auditData.contentVerification?.wasVerified && (
        <Card className="bg-emerald-500/10 border border-emerald-500/30 shadow-lg fade-in-up">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-emerald-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-emerald-700 mb-2">AI-Verified Content Analysis</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  We sampled and verified your content using AI to ensure accuracy. Numbers below show verified counts from URL candidates detected:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {auditData.contentVerification.tutorials.candidates > 0 && (
                    <div className="bg-background/50 rounded-lg p-2">
                      <div className="text-emerald-700 font-medium">Tutorials</div>
                      <div className="text-foreground">{auditData.contentVerification.tutorials.verified} verified</div>
                      <div className="text-muted-foreground">from {auditData.contentVerification.tutorials.candidates} detected</div>
                    </div>
                  )}
                  {auditData.contentVerification.caseStudies.candidates > 0 && (
                    <div className="bg-background/50 rounded-lg p-2">
                      <div className="text-emerald-700 font-medium">Case Studies</div>
                      <div className="text-foreground">{auditData.contentVerification.caseStudies.verified} verified</div>
                      <div className="text-muted-foreground">from {auditData.contentVerification.caseStudies.candidates} detected</div>
                    </div>
                  )}
                  {auditData.contentVerification.faqs.candidates > 0 && (
                    <div className="bg-background/50 rounded-lg p-2">
                      <div className="text-emerald-700 font-medium">FAQs</div>
                      <div className="text-foreground">{auditData.contentVerification.faqs.verified} verified</div>
                      <div className="text-muted-foreground">from {auditData.contentVerification.faqs.candidates} detected</div>
                    </div>
                  )}
                  {auditData.contentVerification.frameworks.candidates > 0 && (
                    <div className="bg-background/50 rounded-lg p-2">
                      <div className="text-emerald-700 font-medium">Frameworks</div>
                      <div className="text-foreground">{auditData.contentVerification.frameworks.verified} verified</div>
                      <div className="text-muted-foreground">from {auditData.contentVerification.frameworks.candidates} detected</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company Intelligence - New */}
      {auditData.companyIntelligence && (
        <CompanyIntelligenceComponent 
          companyIntelligence={auditData.companyIntelligence} 
          websiteUrl={websiteUrl} 
        />
      )}

      {/* Overall Score Card */}
      <Card className="bg-card border border-border shadow-lg fade-in-up">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Overall AI Readiness Score</h2>
            <p className="text-muted-foreground">Your website's visibility across AI platforms</p>
          </div>
          <div className="flex items-center justify-center space-x-8 mb-8">
            <div>
              <div className="text-6xl font-bold text-primary mb-2" data-testid="text-overall-score">
                {auditData.auditResults.overallScore}
              </div>
              <div className="text-sm text-muted-foreground">Overall Score</div>
            </div>
            <div className="w-px h-20 bg-border"></div>
            <div>
              <div className="text-4xl font-bold text-foreground mb-2" data-testid="text-letter-grade">
                {auditData.auditResults.letterGrade}
              </div>
              <div className="text-sm text-muted-foreground">Letter Grade</div>
            </div>
          </div>

          {/* Platform Scores Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-emerald-500/10 rounded-lg p-4">
              <div className="flex items-center justify-center mb-2">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-primary rounded-full"></div>
                </div>
              </div>
              <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1">ChatGPT</div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-chatgpt-score">
                {auditData.auditResults.platformScores.chatgpt}
              </div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-4">
              <div className="flex items-center justify-center mb-2">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-primary rounded-full"></div>
                </div>
              </div>
              <div className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Perplexity</div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-perplexity-score">
                {auditData.auditResults.platformScores.perplexity}
              </div>
            </div>
            <div className="bg-amber-500/10 rounded-lg p-4">
              <div className="flex items-center justify-center mb-2">
                <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-primary rounded-full"></div>
                </div>
              </div>
              <div className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">Gemini</div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-gemini-score">
                {auditData.auditResults.platformScores.gemini}
              </div>
            </div>
            <div className="bg-orange-500/10 rounded-lg p-4">
              <div className="flex items-center justify-center mb-2">
                <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-primary rounded-full"></div>
                </div>
              </div>
              <div className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-1">Claude</div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-claude-score">
                {auditData.auditResults.platformScores.claude}
              </div>
            </div>
          </div>
          
          {/* Why This Score - Collapsible Section */}
          {auditData.scoreExplanation && (
            <div className="mt-6 pt-4 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowScoreExplanation(!showScoreExplanation)}
                className="w-full flex items-center justify-between text-muted-foreground hover:text-foreground hover:bg-muted/30 bg-transparent"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Why These Scores?</span>
                </div>
                {showScoreExplanation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              
              {showScoreExplanation && (
                <div className="mt-4 space-y-4 animate-in slide-in-from-top-2">
                  {/* Content Signals Grid */}
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="url-pattern" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.tutorials}</div>
                      <div className="text-muted-foreground">Tutorials</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="hybrid" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.caseStudies}</div>
                      <div className="text-muted-foreground">Case Studies</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="hybrid" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.faqs}</div>
                      <div className="text-muted-foreground">FAQs</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="text-analysis" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.dataPoints}</div>
                      <div className="text-muted-foreground">Data Points</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="hybrid" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.frameworks}</div>
                      <div className="text-muted-foreground">Frameworks</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="sample-based" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.schemaMarkup}</div>
                      <div className="text-muted-foreground">Schema Types</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="sample-based" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.externalLinks}</div>
                      <div className="text-muted-foreground">External Links</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2 text-center relative">
                      <div className="absolute top-1 right-1"><MethodologyTooltip type="text-analysis" /></div>
                      <div className="font-bold text-foreground">{auditData.scoreExplanation.contentSignals.howToGuides}</div>
                      <div className="text-muted-foreground">How-To Guides</div>
                    </div>
                  </div>
                  
                  <MethodologyBanner className="mt-3" />
                  
                  {/* Platform-specific explanations */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-xs p-2 bg-emerald-50 rounded border border-emerald-500/20">
                      <BarChart3 className="h-3 w-3 text-emerald-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-emerald-700">ChatGPT:</span>{' '}
                        <span className="text-muted-foreground">{auditData.scoreExplanation.platformDrivers.chatgpt}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs p-2 bg-blue-50 rounded border border-blue-500/20">
                      <BarChart3 className="h-3 w-3 text-blue-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-blue-700">Perplexity:</span>{' '}
                        <span className="text-muted-foreground">{auditData.scoreExplanation.platformDrivers.perplexity}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs p-2 bg-amber-50 rounded border border-amber-500/20">
                      <BarChart3 className="h-3 w-3 text-amber-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-amber-700">Gemini:</span>{' '}
                        <span className="text-muted-foreground">{auditData.scoreExplanation.platformDrivers.gemini}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs p-2 bg-orange-50 rounded border border-orange-500/20">
                      <BarChart3 className="h-3 w-3 text-orange-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-orange-700">Claude:</span>{' '}
                        <span className="text-muted-foreground">{auditData.scoreExplanation.platformDrivers.claude}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Summary */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <span className="text-muted-foreground">Weakest: <span className="text-foreground font-medium">{auditData.scoreExplanation.weakestArea}</span></span>
                    </div>
                    {auditData.scoreExplanation.strongestArea && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-muted-foreground">Strongest: <span className="text-foreground font-medium">{auditData.scoreExplanation.strongestArea}</span></span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {auditId && <ScoreHistoryChart auditId={auditId} />}

      {/* AEO Blueprint Score */}
      {auditData.blueprintResult && (
        <BlueprintScoreDisplay blueprint={auditData.blueprintResult} />
      )}

      {/* Industry Benchmark Comparison */}
      {auditData.industryBenchmark && (
        <IndustryBenchmark
          benchmark={auditData.industryBenchmark}
          userScores={{
            overall: auditData.auditResults.overallScore,
            chatgpt: auditData.auditResults.platformScores.chatgpt,
            perplexity: auditData.auditResults.platformScores.perplexity,
            gemini: auditData.auditResults.platformScores.gemini,
            claude: auditData.auditResults.platformScores.claude,
          }}
        />
      )}

      {/* Quick Wins Checklist - Promoted to top for actionability */}
      {auditId && auditData.playbook && auditData.playbook.actions.length > 0 && (
        <div className="relative">
          <div className="flex items-center justify-end mb-1">
            <AdminGatingBadge feature="quickWinsLimit" label="Quick Wins" />
          </div>
          <QuickWinsChecklist auditId={auditId} playbook={auditData.playbook} />
        </div>
      )}

      {/* Findings Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Strengths - only show if there are actual strengths */}
        {auditData.auditResults.strengths && auditData.auditResults.strengths.length > 0 && (
          <Card className="bg-card border border-border shadow-lg fade-in-up">
            <CardContent className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center mr-3">
                  <CheckCircle className="h-4 w-4 text-green-700" />
                </div>
                <h3 className="text-lg font-semibold">Strengths</h3>
              </div>
              <div className="space-y-3">
                {auditData.auditResults.strengths.map((strength, index) => (
                  <div key={index} className="flex items-start space-x-3" data-testid={`strength-${index}`}>
                    <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-muted-foreground">{strength}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weaknesses */}
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center mr-3">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold">Areas for Improvement</h3>
            </div>
            <div className="space-y-3">
              {auditData.auditResults.weaknesses.map((weakness, index) => (
                <div key={index} className="flex items-start space-x-3" data-testid={`weakness-${index}`}>
                  <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-muted-foreground">{weakness}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Technical Findings */}
        <Card className="bg-card border border-border shadow-lg fade-in-up md:col-span-2 lg:col-span-1">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mr-3">
                <Settings className="h-4 w-4 text-blue-700" />
              </div>
              <h3 className="text-lg font-semibold">Technical Analysis</h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Domain Authority</span>
                <span className="text-sm font-medium text-green-700" data-testid="text-domain-authority">
                  {auditData.auditResults.technicalFindings.domainAuthority}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Content Structure</span>
                <span className="text-sm font-medium text-blue-700" data-testid="text-content-structure">
                  {auditData.auditResults.technicalFindings.contentStructure}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Schema Markup</span>
                <span className="text-sm font-medium text-green-700" data-testid="text-schema-markup">
                  {auditData.auditResults.technicalFindings.schemaMarkup}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Entity Recognition</span>
                <span className="text-sm font-medium text-yellow-600" data-testid="text-entity-recognition">
                  {auditData.auditResults.technicalFindings.entityRecognition}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Competitor Analysis - New */}
      {auditData.competitorAnalysis && (
        <CompetitorAnalysisComponent competitorAnalysis={auditData.competitorAnalysis} />
      )}

      {/* Visibility Potential / Citation Intelligence */}
      {(auditData.visibilityPotential || auditData.citationIntelligence) && (
        <CitationIntelligenceComponent 
          visibilityPotential={auditData.visibilityPotential}
          competitorGaps={auditData.competitorGaps}
          disclaimers={auditData.disclaimers}
          citationIntelligence={auditData.citationIntelligence} 
        />
      )}

      {auditData.citationSnapshot && (
        <div className="relative">
          <div className="flex items-center justify-end mb-1">
            <AdminGatingBadge feature="competitorWatchlistLimit" label="Competitors" />
          </div>
          <CitationSnapshot
            citationSnapshot={auditData.citationSnapshot}
            competitorLimit={flags.competitorWatchlistLimit}
            lastCheckedAt={lastCitationRefreshAt ?? auditData.citationSnapshot?.generatedAt ?? null}
            monitoringFrequency={flags.citationMonitoringFrequency}
          />
        </div>
      )}

      {auditData.playbook && auditData.playbook.actions.length > 0 && (
        <div className="relative">
          <div className="flex items-center justify-end mb-1">
            <AdminGatingBadge feature="playbooks" label="Playbook" />
          </div>
          <FixItPlaybook playbook={auditData.playbook} playbookMode={flags.playbooks} quickWinsLimit={flags.quickWinsLimit} />
        </div>
      )}

      {auditData.scoreExplanation && (
        <div className="relative">
          <div className="flex items-center justify-end mb-1">
            <AdminGatingBadge feature="schemaGeneratorLimit" label="Schemas" />
          </div>
          <SchemaGenerator
          companyIntelligence={auditData.companyIntelligence}
          contentSignals={{
            tutorials: auditData.scoreExplanation.contentSignals.tutorials,
            faqs: auditData.scoreExplanation.contentSignals.faqs,
            schemaMarkup: auditData.scoreExplanation.contentSignals.schemaMarkup,
            caseStudies: auditData.scoreExplanation.contentSignals.caseStudies,
          }}
          companyName={(() => { try { return new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname.replace('www.', ''); } catch { return websiteUrl; } })()}
          websiteUrl={websiteUrl}
          schemaLimit={flags.schemaGeneratorLimit}
        />
        </div>
      )}

      {!publicView && (
        <Card>
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Download className="h-4 w-4" /> AI-Ready Files
              </h3>
              <p className="text-sm text-muted-foreground">
                Download llms.txt, schema markup, robots.txt fix and more as a ZIP.
              </p>
            </div>
            <Button onClick={handleGenerateFiles} disabled={generatingFiles} data-testid="button-generate-aeo-files">
              {generatingFiles ? 'Generating…' : 'Generate AEO Files'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Content Topics Section */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">
            Content Opportunities
            <AdminGatingBadge feature="topicsPerCategory" label="Topics/cat" />
          </h2>
          <p className="text-muted-foreground">AI-generated topics to boost your AI readiness</p>
        </div>

        {/* Topic Categories Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {topicCategories.map((category) => {
            const warning = auditData.topicWarnings?.[category.key];
            return (
              <Button
                key={category.key}
                variant={activeTopicCategory === category.key ? "default" : "secondary"}
                size="sm"
                onClick={() => setActiveTopicCategory(category.key)}
                data-testid={`tab-${category.key}`}
                title={warning ? `Returned ${warning.received} of ${warning.requested} requested topics` : undefined}
              >
                <>
                  {category.label}
                  {(auditData.contentTopics[category.key]?.length ?? 0) > 0 && (
                    <span className="ml-1.5 text-[10px] bg-muted/50 text-muted-foreground rounded-full px-1.5 py-0.5 font-normal">
                      {auditData.contentTopics[category.key].length}
                    </span>
                  )}
                  {warning && (
                    <AlertTriangle className="ml-1 h-3 w-3 text-amber-500 shrink-0" aria-label="Fewer topics than requested" />
                  )}
                </>
              </Button>
            );
          })}
        </div>

        {/* Partial-result notice for the active category */}
        {(() => {
          const warning = auditData.topicWarnings?.[activeTopicCategory];
          if (!warning) return null;
          return (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 mb-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This category returned <strong>{warning.received}</strong> of <strong>{warning.requested}</strong> requested topics.
                The AI model reached its unique-topic limit for this area — all generated topics are shown.
              </span>
            </div>
          );
        })()}

        {/* Topic Content */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {getTopicsToDisplay().map((topic, index) => renderTopicCard(topic, index))}
          
          {/* Show more/less button */}
          {getCurrentTopicCount() > 9 && (
          <div className="md:col-span-2 lg:col-span-3 text-center pt-4">
              <Button 
                variant="secondary" 
                onClick={() => setShowAllTopics(!showAllTopics)}
                data-testid="button-show-more-topics"
              >
                {showAllTopics ? 'Show Less' : `Show All ${getCurrentTopicCount()} Topics`}
                <svg className={`ml-2 h-4 w-4 transform ${showAllTopics ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          </div>
          )}
        </div>
      </div>

      {/* Market Context - New */}
      {auditData.marketContext && (
        <MarketContextComponent marketContext={auditData.marketContext} />
      )}

      {/* Processing Details - New */}
      {auditData.processingDetails && (
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-muted/50 rounded-lg flex items-center justify-center mr-3">
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Analysis Details</h3>
            </div>
            <div className="grid md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium text-foreground mb-1">Depth</div>
                <div className="text-xs text-muted-foreground capitalize">{auditData.processingDetails.analysisDepth}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium text-foreground mb-1">Competitors</div>
                <div className="text-xs text-muted-foreground">{auditData.processingDetails.competitorsAnalyzed}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium text-foreground mb-1">Data Sources</div>
                <div className="text-xs text-muted-foreground">{auditData.processingDetails.dataSourcesUsed.length}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium text-foreground mb-1 flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Processing Time
                </div>
                <div className="text-xs text-muted-foreground">{auditData.processingDetails.processingTime}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {auditData.enhancedRecommendations && auditData.enhancedRecommendations.length > 0 ? (
        <EnhancedRecommendationsComponent recommendations={auditData.enhancedRecommendations} />
      ) : (
      <Card className="bg-card border border-border shadow-lg fade-in-up">
        <CardContent className="p-8">
          <div className="flex items-center mb-6">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center mr-4">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Actionable Recommendations</h2>
              <p className="text-muted-foreground">Priority actions to improve your AI citation score</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {auditData.recommendations.map((recommendation, index) => (
              <div
                key={index}
                className="flex items-start space-x-4 p-4 bg-muted/30 rounded-lg"
                data-testid={`recommendation-${index}`}
              >
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}
    </section>
  );
}
