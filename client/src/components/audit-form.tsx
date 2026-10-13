import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Globe, ArrowRight, Crown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { auditRequestSchema, type AuditRequest, type AuditData } from "@shared/schema";
import { getDynamicPlanLimits, userDb, auditDb } from "@/lib/firestore-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import BusinessContextModal, { type CompanyIntelligence, type ConfirmedContext } from "./business-context-modal";

interface AuditFormProps {
  onLoadingStart: () => void;
  onAuditComplete: (data: AuditData, url: string, auditId?: string) => void;
  onLoginRequired?: () => void;
  onUpgradeRequired?: () => void;
  onError?: () => void;
  onAppSumoKeyRequired?: () => void;
}

export default function AuditForm({ onLoadingStart, onAuditComplete, onLoginRequired, onUpgradeRequired, onError, onAppSumoKeyRequired }: AuditFormProps) {
  const { toast } = useToast();
  const { user, userDoc, isAuthenticated, loading: authLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [limitMessage, setLimitMessage] = useState('');
  const [planLimits, setPlanLimits] = useState<any>(null);
  
  // Business Context Modal state (Phase 1 → Phase 2 flow)
  const [showContextModal, setShowContextModal] = useState(false);
  const [pendingWebsiteUrl, setPendingWebsiteUrl] = useState('');
  const [analyzedContext, setAnalyzedContext] = useState<{
    companyIntelligence: CompanyIntelligence;
    suggestedIndustries: string[];
    suggestedKeywords: string[];
    suggestedCompetitors: string[];
  } | null>(null);
  // Phase 1's scraped homepage content, reused by Phase 2 so it doesn't need
  // to re-fetch/re-guess classification for the same site.
  const [phase1ScrapedContent, setPhase1ScrapedContent] = useState<{
    title?: string;
    metaDescription?: string;
    h1s?: string[];
    text?: string;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);

  // Load dynamic plan limits
  useEffect(() => {
    getDynamicPlanLimits().then(limits => setPlanLimits(limits));
  }, []);

  const form = useForm<AuditRequest>({
    resolver: zodResolver(auditRequestSchema),
    defaultValues: {
      websiteUrl: ""
    }
  });

  // Phase 2: Run batch audit with optional confirmed context
  const runBatchAudit = async (websiteUrl: string, topicsPerCategory: number, confirmedContext?: ConfirmedContext) => {
    if (!user || !userDoc) return;
    
    const auditRequest = {
      websiteUrl,
      userPlan: userDoc.subscriptionPlan,
      userId: user.uid,
      userEmail: user.email || userDoc.email,
      topicsPerCategory,
      confirmedContext, // Pass user-confirmed business context with keywords & competitors
      phase1ScrapedContent // Reuse Phase 1's scraped homepage — avoids re-scrape/re-guess
    };

    console.log(`📊 Phase 2: Generating topics${confirmedContext ? ' with CONFIRMED context' : ''}...`);

    const response = await apiRequest("POST", "/api/audit/batch", auditRequest);
    const result = await response.json();

    if (result.success && result.auditData) {
      try {
        await userDb.incrementAuditUsage(user.uid);
        console.log('✅ Audit usage incremented');
      } catch (dbError) {
        console.error('Error incrementing audit usage:', dbError);
      }

      onAuditComplete(result.auditData, result.websiteUrl, result.auditId);
      toast({
        title: "Audit Complete",
        description: "Your website analysis has been completed successfully.",
      });
    } else {
      throw new Error(result.error || "Audit failed");
    }
  };

  // Handle user confirmation from BusinessContextModal
  const handleContextConfirm = async (confirmedContext: ConfirmedContext) => {
    if (!userDoc) return;
    
    setShowContextModal(false);
    setIsGeneratingTopics(true);
    onLoadingStart();
    
    try {
      const dynamicLimits = await getDynamicPlanLimits();
      const planLimit = dynamicLimits[userDoc.subscriptionPlan];
      const topicsPerCategory = planLimit.topicsPerCategory;
      
      await runBatchAudit(pendingWebsiteUrl, topicsPerCategory, confirmedContext);
    } catch (error: any) {
      console.error('Topic generation failed:', error);
      onError?.();
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate topics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingTopics(false);
      setIsSubmitting(false);
      setAnalyzedContext(null);
      setPhase1ScrapedContent(null);
      setPendingWebsiteUrl('');
    }
  };

  const onSubmit = async (data: AuditRequest) => {
    try {
      // Wait if auth is still loading
      if (authLoading) {
        toast({
          title: "Please wait",
          description: "Loading your account...",
        });
        return;
      }

      // Check if user is authenticated
      if (!isAuthenticated || !user) {
        setShowLoginPrompt(true);
        if (onLoginRequired) {
          onLoginRequired(); // Open login modal - no toast needed
        }
        return;
      }

      // If user is authenticated but userDoc not ready yet, wait for it
      if (!userDoc) {
        toast({
          title: "Loading profile",
          description: "Please wait a moment and try again...",
        });
        return;
      }

      // Check usage limits (use dynamic limits from Firestore)
      const dynamicLimits = await getDynamicPlanLimits();
      const planLimit = dynamicLimits[userDoc.subscriptionPlan];
      const isUnlimited = planLimit.auditsPerMonth === -1;
      const topicsPerCategory = planLimit.topicsPerCategory;
      
      if (!isUnlimited && userDoc.auditsUsedThisMonth >= planLimit.auditsPerMonth) {
        setLimitMessage(`You've reached your monthly limit of ${planLimit.auditsPerMonth} audit${planLimit.auditsPerMonth > 1 ? 's' : ''}. Upgrade your plan for more audits.`);
        setShowUpgradePrompt(true);
        if (onUpgradeRequired) {
          onUpgradeRequired();
        }
        toast({
          title: "Limit Reached",
          description: "Upgrade your plan to run more audits.",
          variant: "destructive",
        });
        return;
      }

      const flags = getFeatureFlags(userDoc.subscriptionPlan);
      if (flags.multiDomainLimit < 999) {
        try {
          const enteredHostname = new URL(
            data.websiteUrl.startsWith('http') ? data.websiteUrl : `https://${data.websiteUrl}`
          ).hostname.replace(/^www\./, '').toLowerCase();

          const existingAudits = await auditDb.getUserAudits(user.uid, 100);
          const existingDomains = new Set(
            existingAudits.map(a => {
              try {
                return new URL(
                  a.websiteUrl.startsWith('http') ? a.websiteUrl : `https://${a.websiteUrl}`
                ).hostname.replace(/^www\./, '').toLowerCase();
              } catch { return ''; }
            }).filter(Boolean)
          );

          const isNewDomain = !existingDomains.has(enteredHostname);
          if (isNewDomain && existingDomains.size >= flags.multiDomainLimit) {
            setLimitMessage(
              `You've reached your domain limit (${existingDomains.size}/${flags.multiDomainLimit}). Upgrade your plan to audit more websites.`
            );
            setShowUpgradePrompt(true);
            if (onUpgradeRequired) {
              onUpgradeRequired();
            }
            toast({
              title: "Domain Limit Reached",
              description: `Your plan allows ${flags.multiDomainLimit} domain${flags.multiDomainLimit !== 1 ? 's' : ''}. Upgrade to audit more websites.`,
              variant: "destructive",
            });
            return;
          }
        } catch (domainCheckError) {
          console.warn('Client-side domain check failed, server will enforce:', domainCheckError);
        }
      }

      setIsSubmitting(true);
      setIsAnalyzing(true);
      
      // Phase 1: Analyze website and get company intelligence for confirmation
      console.log('🔍 Phase 1: Analyzing website for business context...');
      
      try {
        const analyzeResponse = await apiRequest("POST", "/api/audit/analyze", {
          websiteUrl: data.websiteUrl
        });
        const analyzeResult = await analyzeResponse.json();
        
        if (analyzeResult.success) {
          // Store the analyzed context and show confirmation modal
          setAnalyzedContext({
            companyIntelligence: analyzeResult.companyIntelligence,
            suggestedIndustries: analyzeResult.suggestedIndustries || [],
            suggestedKeywords: analyzeResult.suggestedKeywords || [],
            suggestedCompetitors: analyzeResult.suggestedCompetitors || []
          });
          setPhase1ScrapedContent(analyzeResult.scrapedContent || null);
          setPendingWebsiteUrl(data.websiteUrl);
          setIsAnalyzing(false);
          setIsSubmitting(false);
          setShowContextModal(true);
          
          toast({
            title: "Analysis Complete",
            description: "Please verify your business details before we generate topics.",
          });
          return; // Wait for user confirmation
        } else {
          throw new Error(analyzeResult.error || "Analysis failed");
        }
      } catch (analyzeError: any) {
        console.error('Phase 1 analysis failed:', analyzeError);
        setIsAnalyzing(false);
        setIsSubmitting(false);
        onError?.();
        
        // DO NOT fallback to unconfirmed batch mode - require user confirmation
        toast({
          title: "Analysis Failed",
          description: "We couldn't analyze this website. Please try again or contact support.",
          variant: "destructive",
        });
        return; // Block - do not proceed without confirmation
      }
    } catch (error: any) {
      console.error("Audit error:", error);
      
      setIsSubmitting(false);
      onError?.(); // Stop loading animation
      
      // Parse error message - apiRequest throws errors like "400: {json}"
      const errorMessage = error.message || '';
      
      // Try to extract JSON from error message
      let errorData: any = null;
      try {
        // Error format is "400: {json}" or just plain text
        const jsonMatch = errorMessage.match(/\{.*\}/);
        if (jsonMatch) {
          errorData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Not JSON, continue
      }
      
      if (errorData?.code === 'DOMAIN_LIMIT_EXCEEDED') {
        setLimitMessage(
          errorData.details || `You've reached your domain limit (${errorData.currentDomains?.length || '?'}/${errorData.limit || '?'}). Upgrade your plan to audit more websites.`
        );
        setShowUpgradePrompt(true);
        if (onUpgradeRequired) {
          onUpgradeRequired();
        }
        return;
      }

      if (errorData?.code === 'APPSUMO_KEY_REQUIRED' || 
          errorMessage.includes('APPSUMO_KEY_REQUIRED') ||
          errorMessage.toLowerCase().includes('appsumo') ||
          (errorMessage.toLowerCase().includes('api key') && errorMessage.toLowerCase().includes('required'))) {
        
        console.log('🔑 Detected AppSumo key requirement - showing modal');
        
        // Show modal
        if (onAppSumoKeyRequired) {
          onAppSumoKeyRequired();
        } else {
          // Fallback: direct redirect
          window.location.href = '/profile?tab=api-config';
        }
        return;
      }
      
      // Show generic error for other errors
      toast({
        title: "Audit Failed",
        description: errorData?.details || errorData?.error || error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="mb-12">
      <div className="max-w-2xl mx-auto">
        {/* Login Prompt */}
        {showLoginPrompt && !isAuthenticated && (
          <Alert className="mb-4 bg-blue-500/10 border-blue-500/30">
            <AlertCircle className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-blue-700">
              Please sign in or create an account to run audits and save your results.
            </AlertDescription>
          </Alert>
        )}

        {/* Upgrade Prompt */}
        {showUpgradePrompt && (
          <Alert className="mb-4 bg-orange-500/10 border-orange-500/30">
            <Crown className="h-4 w-4 text-orange-700" />
            <AlertDescription className="text-orange-700">
              <div className="flex items-center justify-between">
                <span>{limitMessage}</span>
                <Button 
                  size="sm" 
                  variant="default" 
                  className="ml-4"
                  onClick={() => window.location.href = '/pricing'}
                >
                  Upgrade Now
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Usage Warning (when close to limit) */}
        {userDoc && !showUpgradePrompt && (
          (() => {
            const currentPlanLimit = planLimits?.[userDoc.subscriptionPlan];
            if (!currentPlanLimit) return null;
            
            const isUnlimited = currentPlanLimit.auditsPerMonth === -1;
            const remaining = currentPlanLimit.auditsPerMonth - userDoc.auditsUsedThisMonth;
            
            if (!isUnlimited && remaining === 1) {
              return (
                <Alert className="mb-4 bg-yellow-500/10 border-yellow-500/30">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-700">
                    This is your last audit for this month. Upgrade to run unlimited audits.
                  </AlertDescription>
                </Alert>
              );
            }
            return null;
          })()
        )}

        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-center">Get Your AI Readiness Score</h2>
            
            {/* Plan Info Display */}
            {userDoc && planLimits && (
              <div className="mb-6 text-center text-sm">
                <span className="text-muted-foreground">You're on the </span>
                <span className="font-semibold text-primary capitalize">{userDoc.subscriptionPlan}</span>
                <span className="text-muted-foreground"> plan - </span>
                <span className="font-semibold text-foreground">
                  {planLimits[userDoc.subscriptionPlan]?.auditsPerMonth === -1 
                    ? 'Unlimited audits' 
                    : `${userDoc.auditsUsedThisMonth}/${planLimits[userDoc.subscriptionPlan]?.auditsPerMonth} audits used this month`
                  }
                </span>
              </div>
            )}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <Label htmlFor="websiteUrl" className="block text-sm font-medium mb-3">
                  Website URL
                </Label>
                <div className="relative">
                  <Input
                    id="websiteUrl"
                    type="url"
                    placeholder="https://example.com"
                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary pr-10"
                    {...form.register("websiteUrl")}
                    disabled={isSubmitting}
                    data-testid="input-website-url"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {form.formState.errors.websiteUrl && (
                  <p className="text-sm text-destructive mt-2">
                    {form.formState.errors.websiteUrl.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Enter your website URL to begin the analysis
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground py-3 px-6 rounded-lg font-semibold hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting}
                data-testid="button-submit-audit"
              >
                <span>
                  {isSubmitting ? "Analyzing..." : "Analyze My Website"}
                </span>
                {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      
      {/* Business Context Confirmation Modal */}
      {analyzedContext && (
        <BusinessContextModal
          isOpen={showContextModal}
          onClose={() => {
            setShowContextModal(false);
            setIsSubmitting(false);
            setAnalyzedContext(null);
            setPhase1ScrapedContent(null);
            setPendingWebsiteUrl('');
          }}
          onConfirm={handleContextConfirm}
          websiteUrl={pendingWebsiteUrl}
          companyIntelligence={analyzedContext.companyIntelligence}
          suggestedIndustries={analyzedContext.suggestedIndustries}
          suggestedKeywords={analyzedContext.suggestedKeywords}
          detectedCompetitors={analyzedContext.suggestedCompetitors}
          isLoading={isGeneratingTopics}
        />
      )}
    </section>
  );
}
