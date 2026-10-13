import { useState, useEffect } from "react";
import { Search, HelpCircle, Download, Share, RotateCcw, FileText, Table, LogOut, User as UserIcon } from "lucide-react";
import citationRocketLogo from "@assets/Citation_Rocket_-_Black_1772956886857.png";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/lib/auth-service";
import { usePDFExport } from "@/hooks/use-pdf-export";
import { CSVExporter } from "@/lib/csv-exporter";
import { getFeatureFlags } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AuditForm from "@/components/audit-form";
import LoadingState from "@/components/loading-state";
import AuditResults from "@/components/audit-results";
import LoginModal from "@/components/auth/login-modal";
import SignupModal from "@/components/auth/signup-modal";
import AppSumoKeyRequiredModal from "@/components/appsumo-key-required-modal";
import type { AuditData } from "@shared/schema";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// Default content (fallback if nothing in database)
const DEFAULT_HOME_CONTENT = {
  logo: {
    icon: "🔍",
    text: "AI Readiness Score",
    subtext: "Optimize Your AI Readiness"
  },
  hero: {
    title: "Find Out Why AI Isn't Recommending Your Business — And Get the Exact Playbook to Fix It",
    subtitle: "AI Readiness Score",
    description: "Citation Rocket analyzes your website against 20+ content signals, benchmarks you against your industry, and gives you a step-by-step fix-it plan so ChatGPT, Perplexity, Gemini, and Claude start recommending you.",
    ctaButtonText: "Get Your Free AI Readiness Score",
    showHeroSection: true,
    showPlatformBadges: false
  }
};

export default function Home() {
  const { toast } = useToast();
  const { user, userDoc, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState<string>("");
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showAppSumoKeyModal, setShowAppSumoKeyModal] = useState(false);
  const [homeContent, setHomeContent] = useState<any>(DEFAULT_HOME_CONTENT);
  const [contentLoaded, setContentLoaded] = useState(false);

  // Load home page content from Firestore
  useEffect(() => {
    loadHomeContent();
  }, []);

  const loadHomeContent = async () => {
    try {
      const docRef = doc(db, 'settings', 'homePageContent');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setHomeContent(docSnap.data());
        console.log('✅ Home page content loaded from database');
      } else {
        console.log('ℹ️ No custom content, using defaults');
        setHomeContent(DEFAULT_HOME_CONTENT);
      }
    } catch (error) {
      console.error('❌ Error loading home page content:', error);
      setHomeContent(DEFAULT_HOME_CONTENT);
    } finally {
      setContentLoaded(true);
    }
  };

  const handleAuditComplete = (data: AuditData, url: string, auditId?: string) => {
    setAuditData(data);
    setWebsiteUrl(url);
    setCurrentAuditId(auditId || null);
    setIsLoading(false);
  };

  const handleNewAudit = () => {
    setAuditData(null);
    setWebsiteUrl("");
    setCurrentAuditId(null);
    setIsLoading(false);
  };

  // Share functionality - Share PDF directly
  // Moved to usePDFExport hook

  // PDF Export Hook
  const pdfMode = getFeatureFlags(userDoc?.subscriptionPlan || 'free').pdfExport;
  const { handleDownloadPDF, handleShare, isGenerating: isPDFGenerating } = usePDFExport({
    auditData,
    websiteUrl,
    pdfMode
  });

  // CSV Download functionality
  const handleDownloadCSV = () => {
    if (!auditData || !websiteUrl) return;

    try {
      const csvExporter = new CSVExporter({
        auditData,
        websiteUrl,
        generatedAt: new Date().toISOString()
      });
      
      const csvContent = csvExporter.generateFullCSV();
      const domain = (() => { try { return new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname.replace('www.', ''); } catch { return websiteUrl; } })();
      const filename = `ai-citation-audit-${domain}-${new Date().toISOString().split('T')[0]}.csv`;
      
      csvExporter.downloadCSV(filename, csvContent);
      
      toast({
        title: "CSV Report Downloaded",
        description: "Your audit data has been exported to CSV format.",
      });
    } catch (error) {
      console.error('CSV export failed:', error);
      toast({
        title: "CSV Export Failed",
        description: "Unable to export CSV report. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Logout functionality
  const handleLogout = async () => {
    try {
      await authService.signOut();
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    } catch (error: any) {
      toast({
        title: "Sign out failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user) return 'U';
    if (user.displayName) {
      return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user.email?.[0].toUpperCase() || 'U';
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img src={citationRocketLogo} alt="Citation Rocket" className="h-14" />
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => window.location.href = homeContent.helpLink || '/help'}
                data-testid="button-help"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
              
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={userDoc?.customPhotoURL || user?.photoURL || undefined} alt={user?.displayName || 'User'} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 bg-card border-border" align="end">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.displayName || 'User'}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                        {userDoc && (
                          <p className="text-xs font-semibold text-primary mt-2 capitalize">
                            {userDoc.subscriptionPlan} Plan
                          </p>
                        )}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => window.location.href = '/dashboard'}>
                      <UserIcon className="mr-2 h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                    {userDoc?.isAdmin && (
                      <DropdownMenuItem onClick={() => window.location.href = '/admin'}>
                        <span className="mr-2">🔐</span>
                        Admin Panel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => window.location.href = homeContent.helpLink || '/help'}>
                      <HelpCircle className="mr-2 h-4 w-4" />
                      Help & Support
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowLoginModal(true)}
                    data-testid="button-signin"
                  >
                Sign In
              </Button>
                  <Button 
                    size="sm" 
                    onClick={() => setShowSignupModal(true)}
                    data-testid="button-signup"
                  >
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Section - conditionally rendered (only after content loaded to prevent flash) */}
        {contentLoaded && homeContent.hero?.showHeroSection !== false && (
          <section className="text-center py-12 mb-12">
            <div className="max-w-4xl mx-auto">
              <p className="text-sm font-semibold text-primary mb-4">{homeContent.hero?.subtitle || "AI Readiness Score"}</p>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-primary to-orange-400 bg-clip-text text-transparent">
                {homeContent.hero?.title || "Find Out Why AI Isn't Recommending Your Business — And Get the Exact Playbook to Fix It"}
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                {homeContent.hero?.description || "Citation Rocket analyzes your website against 20+ content signals, benchmarks you against your industry, and gives you a step-by-step fix-it plan so ChatGPT, Perplexity, Gemini, and Claude start recommending you."}
              </p>
              {homeContent.hero?.showPlatformBadges && (
                <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
                    </div>
                    <span>{homeContent.features?.feature1Title || "ChatGPT Analysis"}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
                    </div>
                    <span>{homeContent.features?.feature2Title || "Perplexity Insights"}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
                    </div>
                    <span>{homeContent.features?.feature3Title || "Gemini Evaluation"}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
                    </div>
                    <span>{homeContent.features?.feature4Title || "Claude Assessment"}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Audit Form */}
        {!auditData && !isLoading && (
          <AuditForm 
            onLoadingStart={() => setIsLoading(true)}
            onAuditComplete={handleAuditComplete}
            onError={() => setIsLoading(false)}
            onLoginRequired={() => setShowLoginModal(true)}
            onUpgradeRequired={() => {
              window.location.href = '/pricing';
            }}
            onAppSumoKeyRequired={() => {
              console.log('🔑 AppSumo key required callback triggered - opening modal');
              setShowAppSumoKeyModal(true);
            }}
          />
        )}

        {/* Loading State */}
        {isLoading && <LoadingState />}

        {/* Results */}
        {auditData && !isLoading && (
          <>
            <AuditResults auditData={auditData} websiteUrl={websiteUrl} auditId={currentAuditId || undefined} />
            
            {/* Export Options */}
            <div className="flex flex-wrap justify-center gap-4 pt-8">
              <Button onClick={handleDownloadPDF} disabled={isPDFGenerating} data-testid="button-download-pdf">
                <FileText className="h-4 w-4 mr-2" />
                {isPDFGenerating ? 'Generating...' : 'Save as PDF'}
              </Button>
              <Button variant="secondary" onClick={handleDownloadCSV} data-testid="button-download-csv">
                <Table className="h-4 w-4 mr-2" />
                Export CSV Data
              </Button>
              <Button onClick={handleShare} disabled={isPDFGenerating} data-testid="button-share">
                <Share className="h-4 w-4 mr-2" />
                {isPDFGenerating ? 'Preparing...' : 'Share PDF Report'}
              </Button>
              <Button variant="secondary" onClick={handleNewAudit} data-testid="button-new-audit">
                <RotateCcw className="h-4 w-4 mr-2" />
                Run New Audit
              </Button>
            </div>
          </>
        )}
      </main>

      {/* Auth Modals */}
      <LoginModal 
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSwitchToSignup={() => {
          setShowLoginModal(false);
          setShowSignupModal(true);
        }}
      />
      
      <SignupModal 
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        onSwitchToLogin={() => {
          setShowSignupModal(false);
          setShowLoginModal(true);
        }}
      />

      {/* AppSumo Key Required Modal */}
      <AppSumoKeyRequiredModal
        isOpen={showAppSumoKeyModal}
        onClose={() => {
          console.log('🔑 Modal closed');
          setShowAppSumoKeyModal(false);
        }}
        onAddKey={() => {
          console.log('🔑 Add API Key button clicked - redirecting to profile');
          setShowAppSumoKeyModal(false);
          setTimeout(() => {
            window.location.href = '/profile?tab=api-config';
          }, 100);
        }}
      />

      {/* Footer */}
      <footer className="border-t border-border bg-card/30 mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>{homeContent.footer?.copyright || `© ${new Date().getFullYear()} Citation Rocket. All rights reserved.`}</p>
        </div>
      </footer>
    </div>
  );
}
