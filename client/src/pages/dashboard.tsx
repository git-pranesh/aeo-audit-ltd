import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { BarChart3, TrendingUp, Globe, ArrowRight, Settings, CheckCircle, Eye, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { auditDb, getDynamicPlanLimits } from "@/lib/firestore-utils";
import type { AuditDocument } from "@/lib/firestore-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { useEffectivePlan } from "@/contexts/ViewAsPlanContext";
import PlanBadge from "@/components/plan-badge";

const PAGE_SIZE = 25;
const MAX_VISIBLE_BADGES = 6;

export default function Dashboard() {
  const { user, userDoc, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [audits, setAudits] = useState<AuditDocument[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(true);
  const [planLimits, setPlanLimits] = useState<any>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showAllDomains, setShowAllDomains] = useState(false);

  useEffect(() => {
    getDynamicPlanLimits().then(limits => setPlanLimits(limits));
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation('/');
    }
  }, [loading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (user && userDoc) {
      loadAuditHistory();
    }
  }, [user, userDoc]);

  const loadAuditHistory = async () => {
    if (!user) return;
    setLoadingAudits(true);
    try {
      const userAudits = await auditDb.getUserAudits(user.uid, 200);
      setAudits(userAudits);
    } catch (error) {
      console.error('Error loading audit history:', error);
    } finally {
      setLoadingAudits(false);
    }
  };

  const effectivePlan = useEffectivePlan();
  const plan = effectivePlan;
  const flags = getFeatureFlags(plan);
  const domainLimit = flags.multiDomainLimit;

  const getDomain = (url: string) => {
    try {
      return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
    } catch { return url; }
  };

  const uniqueDomains = useMemo(() => {
    const domainSet = new Set<string>();
    for (const audit of audits) {
      domainSet.add(getDomain(audit.websiteUrl));
    }
    return Array.from(domainSet);
  }, [audits]);

  const filteredAudits = useMemo(() => {
    if (!domainFilter) return audits;
    return audits.filter(a => getDomain(a.websiteUrl) === domainFilter);
  }, [audits, domainFilter]);

  const visibleAudits = useMemo(() => {
    return filteredAudits.slice(0, visibleCount);
  }, [filteredAudits, visibleCount]);

  const hasMore = filteredAudits.length > visibleCount;

  const getUsagePercentage = () => {
    if (!userDoc || !planLimit) return 0;
    const limit = planLimit.auditsPerMonth;
    if (limit === -1) return 0;
    return Math.min((userDoc.auditsUsedThisMonth / limit) * 100, 100);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'bg-green-100 text-green-700';
    if (grade.startsWith('B')) return 'bg-blue-100 text-blue-700';
    if (grade.startsWith('C')) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const getChecklistProgress = (audit: AuditDocument) => {
    const checklist = audit.checklist;
    if (!checklist || checklist.length === 0) return null;
    const completed = checklist.filter(item => item.completed).length;
    return { completed, total: checklist.length, percent: Math.round((completed / checklist.length) * 100) };
  };

  const getMentionRate = (audit: AuditDocument) => {
    return audit.auditData?.citationSnapshot?.mentionRate ?? null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!userDoc) {
    return null;
  }

  const planLimit = planLimits ? planLimits[userDoc.subscriptionPlan] : null;
  const isUnlimited = planLimit?.auditsPerMonth === -1;
  const domainUsagePercent = domainLimit < 999 ? (uniqueDomains.length / domainLimit) * 100 : 0;

  const visibleDomains = showAllDomains ? uniqueDomains : uniqueDomains.slice(0, MAX_VISIBLE_BADGES);
  const hiddenDomainCount = uniqueDomains.length - MAX_VISIBLE_BADGES;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setLocation('/')}>
              ← Home
            </Button>
            <div className="flex items-center gap-3">
              <PlanBadge plan={plan} />
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5" />
                <span>{userDoc.auditsUsedThisMonth}/{isUnlimited ? '∞' : (planLimit?.auditsPerMonth || '-')}</span>
                {!isUnlimited && planLimit && (
                  <Progress value={getUsagePercentage()} className="h-1.5 w-16" />
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation('/profile')}>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {domainLimit < 999 && domainUsagePercent >= 80 && (
          <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <Globe className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="text-amber-800">
              You've used {uniqueDomains.length} of {domainLimit} domains.
              {uniqueDomains.length >= domainLimit ? ' Upgrade to audit more websites.' : ` ${domainLimit - uniqueDomains.length} remaining.`}
            </span>
            {uniqueDomains.length >= domainLimit && (
              <Button size="sm" variant="outline" className="ml-auto text-amber-700 border-amber-300 hover:bg-amber-100" onClick={() => setLocation('/pricing')}>
                Upgrade
              </Button>
            )}
          </div>
        )}

        {loadingAudits ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading your audits...</p>
          </div>
        ) : audits.length === 0 ? (
          <Card className="bg-card border border-border shadow-md">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">Get Your AI Readiness Score</h2>
              <p className="text-muted-foreground mb-4">Run your first audit to see how AI platforms view your website</p>
              <Button onClick={() => setLocation('/')}>
                Run Your First Audit
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground">Your Audits</h2>
                {uniqueDomains.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <Badge
                      variant={domainFilter === null ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setDomainFilter(null)}
                    >
                      All ({audits.length})
                    </Badge>
                    {visibleDomains.map(domain => (
                      <Badge
                        key={domain}
                        variant={domainFilter === domain ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => setDomainFilter(domainFilter === domain ? null : domain)}
                      >
                        {domain}
                      </Badge>
                    ))}
                    {hiddenDomainCount > 0 && !showAllDomains && (
                      <Badge
                        variant="outline"
                        className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setShowAllDomains(true)}
                      >
                        +{hiddenDomainCount} more
                      </Badge>
                    )}
                    {showAllDomains && hiddenDomainCount > 0 && (
                      <Badge
                        variant="outline"
                        className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setShowAllDomains(false)}
                      >
                        Show less
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation('/')}>
                + New Audit
              </Button>
            </div>

            <div className="space-y-3">
              {visibleAudits.map((audit) => {
                const progress = getChecklistProgress(audit);
                const mentionRate = getMentionRate(audit);
                const score = audit.auditData?.auditResults?.overallScore ?? 0;
                const grade = audit.auditData?.auditResults?.letterGrade ?? 'N/A';
                const platformScores = audit.auditData?.auditResults?.platformScores ?? {};

                return (
                  <Card
                    key={audit.auditId}
                    className="bg-card border border-border shadow-sm hover:border-foreground/20 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => setLocation(`/audit/${audit.auditId}`)}
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-base truncate">
                            {getDomain(audit.websiteUrl)}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(() => {
                              const d = (audit.generatedAt as any)?.toDate ? (audit.generatedAt as any).toDate() : new Date(audit.generatedAt as string);
                              return `${d.toLocaleDateString()} at ${d.toLocaleTimeString()}`;
                            })()}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center flex-shrink-0">
                          {Object.entries(platformScores).map(([platform, pScore]) => (
                            <div key={platform} className="px-2">
                              <div className="text-[9px] sm:text-[10px] text-muted-foreground capitalize">{platform}</div>
                              <div className="text-xs sm:text-sm font-semibold">{pScore as number}</div>
                            </div>
                          ))}
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
                            {score}
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getGradeColor(grade)}`}>
                            {grade}
                          </span>
                        </div>
                      </div>

                      {(progress || mentionRate !== null) && (
                        <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 flex-wrap">
                          {progress && (
                            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                              <CheckCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {progress.completed}/{progress.total} actions done
                              </span>
                              <Progress value={progress.percent} className="h-1.5 flex-1 max-w-[120px]" />
                            </div>
                          )}
                          {mentionRate !== null && (
                            <div className="flex items-center gap-1.5">
                              <Eye className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs text-muted-foreground">
                                {mentionRate}% mention rate
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-6 text-center">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                  className="gap-2"
                >
                  <ChevronDown className="h-4 w-4" />
                  Show More ({filteredAudits.length - visibleCount} remaining)
                </Button>
              </div>
            )}

            {!hasMore && filteredAudits.length > PAGE_SIZE && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Showing all {filteredAudits.length} audits
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
