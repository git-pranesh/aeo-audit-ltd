import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Download, Share2, FileText, Table, RefreshCw, TrendingUp, TrendingDown, Lock, Activity, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { auditDb, type AuditDocument } from "@/lib/firestore-utils";
import { CSVExporter } from "@/lib/csv-exporter";
import { usePDFExport } from "@/hooks/use-pdf-export";
import { getFeatureFlags } from "@/lib/feature-flags";
import { useEffectivePlan } from "@/contexts/ViewAsPlanContext";
import { apiRequest } from "@/lib/queryClient";
import AuditResults from "@/components/audit-results";
import CitationHistoryTimeline from "@/components/citation-history-timeline";
import { AdminGatingBadge } from "@/components/admin-gating-badge";
import ScoreTrendChart from "@/components/score-trend-chart";

function toDate(val: any): Date {
  if (!val) return new Date();
  return typeof val.toDate === 'function' ? val.toDate() : new Date(val);
}

interface ScoreComparison {
  previousScores: {
    overallScore: number;
    platformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number };
  };
  currentScores: {
    overallScore: number;
    platformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number };
  };
}

interface ChecklistMeta {
  carriedOverCount: number;
  carriedOverCompletedCount: number;
  newCount: number;
  resolvedCount: number;
  lastMergedAt: string;
}

export default function AuditDetail() {
  const { toast } = useToast();
  const { user, userDoc, isAuthenticated, loading: authLoading } = useAuth();
  const [, params] = useRoute("/audit/:auditId");
  const [, setLocation] = useLocation();
  const [audit, setAudit] = useState<AuditDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [reauditing, setReauditing] = useState(false);
  const [scoreComparison, setScoreComparison] = useState<ScoreComparison | null>(null);
  const [citationRefreshing, setCitationRefreshing] = useState(false);
  const [citationChanges, setCitationChanges] = useState<any | null>(null);
  const [checklistMeta, setChecklistMeta] = useState<ChecklistMeta | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/');
      return;
    }

    if (params?.auditId && user) {
      loadAuditDetails(params.auditId);
    }
  }, [params?.auditId, authLoading, isAuthenticated, user?.uid]);

  const isAdminUser = !!userDoc?.isAdmin;

  const shareUrl = audit?.isPublic && audit?.shareToken
    ? `${window.location.origin}/share/${audit.shareToken}`
    : null;

  const handleEnableShareLink = async () => {
    if (!params?.auditId) return;
    setShareBusy(true);
    try {
      const res = await apiRequest('POST', `/api/admin/audits/${params.auditId}/share`);
      const data = await res.json();
      setAudit(prev => prev ? { ...prev, isPublic: true, shareToken: data.shareToken } : prev);
      toast({ title: "Public link enabled", description: "Anyone with the link can now view this report." });
    } catch (error) {
      console.error('Error enabling share link:', error);
      toast({ title: "Failed to enable link", variant: "destructive" });
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShareLink = async () => {
    if (!params?.auditId) return;
    setShareBusy(true);
    try {
      await apiRequest('DELETE', `/api/admin/audits/${params.auditId}/share`);
      setAudit(prev => prev ? { ...prev, isPublic: false, shareToken: null } : prev);
      toast({ title: "Public link revoked", description: "The old link no longer works." });
    } catch (error) {
      console.error('Error revoking share link:', error);
      toast({ title: "Failed to revoke link", variant: "destructive" });
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShareUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied" });
  };

  const handleCopyEmbedSnippet = () => {
    if (!shareUrl) return;
    const snippet = `<iframe src="${shareUrl}" width="100%" height="900" style="border:0" title="AI Citation Report"></iframe>`;
    navigator.clipboard.writeText(snippet);
    toast({ title: "Embed snippet copied" });
  };

  const loadAuditDetails = async (auditId: string) => {
    setLoading(true);
    try {
      const auditData = await auditDb.getAudit(auditId);
      
      if (!auditData) {
        toast({
          title: "Audit not found",
          description: "The requested audit could not be found.",
          variant: "destructive",
        });
        setLocation('/dashboard');
        return;
      }

      // Verify audit belongs to current user
      if (user && auditData.userId !== user.uid) {
        toast({
          title: "Access denied",
          description: "You don't have permission to view this audit.",
          variant: "destructive",
        });
        setLocation('/dashboard');
        return;
      }

      setAudit(auditData);
    } catch (error) {
      console.error('Error loading audit:', error);
      toast({
        title: "Error loading audit",
        description: "Failed to load audit details. Please try again.",
        variant: "destructive",
      });
      setLocation('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const effectivePlan = useEffectivePlan();
  const plan = effectivePlan;
  const flags = getFeatureFlags(plan);

  const { handleDownloadPDF, handleShare, isGenerating: isPDFGenerating } = usePDFExport({
    auditData: audit?.auditData || null,
    websiteUrl: audit?.websiteUrl || '',
    generatedAt: toDate(audit?.generatedAt).toISOString(),
    pdfMode: flags.pdfExport
  });

  const handleDownloadCSV = () => {
    if (!audit) return;

    try {
      const csvExporter = new CSVExporter({
        auditData: audit.auditData,
        websiteUrl: audit.websiteUrl,
        generatedAt: toDate(audit.generatedAt).toISOString()
      });
      
      const csvContent = csvExporter.generateFullCSV();
      const domain = (() => { try { return new URL(audit.websiteUrl.startsWith('http') ? audit.websiteUrl : `https://${audit.websiteUrl}`).hostname.replace('www.', ''); } catch { return audit.websiteUrl; } })();
      const filename = `ai-citation-audit-${domain}-${toDate(audit.generatedAt).toISOString().split('T')[0]}.csv`;
      
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

  const handleReaudit = async () => {
    if (!params?.auditId) return;
    setReauditing(true);
    setScoreComparison(null);
    setChecklistMeta(null);

    try {
      const response = await apiRequest("POST", `/api/audit/${params.auditId}/reaudit`, {
        includeCitationSnapshot: false,
      });
      const result = await response.json();

      if (result.success) {
        setScoreComparison({
          previousScores: result.previousScores,
          currentScores: result.currentScores,
        });
        if (result.checklistMeta) {
          setChecklistMeta(result.checklistMeta);
        }
        await loadAuditDetails(params.auditId);
        toast({
          title: "Re-Audit Complete",
          description: `Score updated: ${result.previousScores.overallScore} → ${result.currentScores.overallScore}`,
        });
      } else {
        toast({
          title: "Re-Audit Failed",
          description: result.error || "Could not complete the re-audit.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      let errorMessage = "Something went wrong. Please try again.";
      try {
        if (error instanceof Response) {
          const data = await error.json();
          errorMessage = data?.error || errorMessage;
        } else if (error?.message) {
          errorMessage = error.message;
        }
      } catch {}
      toast({
        title: "Re-Audit Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setReauditing(false);
    }
  };

  const handleCitationRefresh = async () => {
    if (!params?.auditId) return;
    setCitationRefreshing(true);
    setCitationChanges(null);

    try {
      const response = await apiRequest("POST", `/api/audit/${params.auditId}/citation-refresh`);
      const result = await response.json();

      if (result.success) {
        if (result.changes) {
          setCitationChanges(result.changes);
        }
        await loadAuditDetails(params.auditId);
        toast({
          title: "Citation Snapshot Updated",
          description: `Current mention rate: ${result.citationSnapshot?.mentionRate ?? 'N/A'}%`,
        });
      } else {
        toast({
          title: "Citation Refresh Failed",
          description: result.error || "Could not refresh citation snapshot.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      let errorMessage = "Something went wrong. Please try again.";
      try {
        if (error instanceof Response) {
          const data = await error.json();
          errorMessage = data?.error || errorMessage;
        } else if (error?.message) {
          errorMessage = error.message;
        }
      } catch {}
      toast({
        title: "Citation Refresh Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setCitationRefreshing(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading audit details...</p>
        </div>
      </div>
    );
  }

  if (!audit) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setLocation('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="text-center">
              <h1 className="text-lg font-bold">{(() => { try { return new URL(audit.websiteUrl.startsWith('http') ? audit.websiteUrl : `https://${audit.websiteUrl}`).hostname.replace('www.', ''); } catch { return audit.websiteUrl; } })()}</h1>
              <p className="text-xs text-muted-foreground">
                {toDate(audit.generatedAt).toLocaleDateString()} at {toDate(audit.generatedAt).toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center">
              <AdminGatingBadge feature="reauditButton" label="Re-audit" />
              {flags.reauditButton ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReaudit}
                  disabled={reauditing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${reauditing ? 'animate-spin' : ''}`} />
                  {reauditing ? 'Re-Auditing...' : 'Re-Audit'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Upgrade to Starter or above to unlock re-audits"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Re-Audit
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {scoreComparison && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Score Changes from Re-Audit</h3>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Overall', prev: scoreComparison.previousScores.overallScore, curr: scoreComparison.currentScores.overallScore },
                  { label: 'ChatGPT', prev: scoreComparison.previousScores.platformScores.chatgpt, curr: scoreComparison.currentScores.platformScores.chatgpt },
                  { label: 'Perplexity', prev: scoreComparison.previousScores.platformScores.perplexity, curr: scoreComparison.currentScores.platformScores.perplexity },
                  { label: 'Gemini', prev: scoreComparison.previousScores.platformScores.gemini, curr: scoreComparison.currentScores.platformScores.gemini },
                  { label: 'Claude', prev: scoreComparison.previousScores.platformScores.claude, curr: scoreComparison.currentScores.platformScores.claude },
                ].map(({ label, prev, curr }) => {
                  const diff = curr - prev;
                  return (
                    <div key={label} className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">{label}</div>
                      <div className="text-sm font-semibold">
                        {prev} → {curr}
                      </div>
                      <div className={`text-xs font-medium flex items-center justify-center gap-0.5 ${diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                        {diff > 0 ? '+' : ''}{diff}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {checklistMeta && (
          <Card className="mb-6 border-green-200 bg-green-50/50">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Checklist Update Summary</h3>
              <div className="grid grid-cols-3 gap-4">
                {checklistMeta.carriedOverCompletedCount > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-green-700">{checklistMeta.carriedOverCompletedCount} actions still completed</div>
                      <div className="text-xs text-muted-foreground">Your progress was preserved</div>
                    </div>
                  </div>
                )}
                {checklistMeta.newCount > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-blue-700">{checklistMeta.newCount} new actions detected</div>
                      <div className="text-xs text-muted-foreground">New gaps to address</div>
                    </div>
                  </div>
                )}
                {checklistMeta.resolvedCount > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
                      <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-amber-700">{checklistMeta.resolvedCount} actions resolved</div>
                      <div className="text-xs text-muted-foreground">No longer needed</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score Trend Chart */}
        <div className="mb-6">
          <ScoreTrendChart
            auditId={params?.auditId || ''}
            websiteUrl={audit.websiteUrl}
            isLocked={!flags.reauditButton}
            showExport={flags.scoreTrendExport}
            refreshKey={audit?.lastReauditAt || ''}
          />
        </div>

        {/* Citation Monitoring */}
        <Card className="mb-6 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Citation Monitoring</h3>
                {flags.citationMonitoringFrequency !== 'none' && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {flags.citationMonitoringFrequency} monitoring
                  </Badge>
                )}
                <AdminGatingBadge feature="citationMonitoringFrequency" label="Monitoring" />
                <AdminGatingBadge feature="citationRefreshButton" label="Refresh" />
                <AdminGatingBadge feature="citationAlerts" label="Alerts" />
              </div>
              <div>
                {flags.citationRefreshButton ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCitationRefresh}
                    disabled={citationRefreshing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${citationRefreshing ? 'animate-spin' : ''}`} />
                    {citationRefreshing ? 'Refreshing...' : 'Refresh Citation Snapshot'}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    title="Upgrade to track citations"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Upgrade to track citations
                  </Button>
                )}
              </div>
            </div>

            {(audit as any).auditData?.citationSnapshot ? (
              <div className="space-y-3">
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mention Rate: </span>
                    <span className="font-semibold">{(audit as any).auditData.citationSnapshot.mentionRate}%</span>
                  </div>
                  {(audit as any).lastCitationRefreshAt && (
                    <div>
                      <span className="text-muted-foreground">Last Refresh: </span>
                      <span className="font-medium">
                        {new Date((audit as any).lastCitationRefreshAt).toLocaleDateString()} at {new Date((audit as any).lastCitationRefreshAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>

                {citationChanges && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-3">
                      <h4 className="text-xs font-semibold mb-2">Citation Changes Detected</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {citationChanges.previousMentionRate !== undefined && citationChanges.currentMentionRate !== undefined && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Mention Rate</div>
                            <div className="font-semibold">
                              {citationChanges.previousMentionRate}% → {citationChanges.currentMentionRate}%
                            </div>
                            {(() => {
                              const diff = citationChanges.currentMentionRate - citationChanges.previousMentionRate;
                              return (
                                <div className={`text-xs font-medium flex items-center gap-0.5 ${diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                  {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {citationChanges.newCompetitors?.length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">New Competitors</div>
                            <div className="flex flex-wrap gap-1">
                              {citationChanges.newCompetitors.map((c: string) => (
                                <Badge key={c} variant="outline" className="text-xs text-green-500 border-green-500/30">
                                  <Users className="h-3 w-3 mr-1" />
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {citationChanges.lostCompetitors?.length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Lost Competitors</div>
                            <div className="flex flex-wrap gap-1">
                              {citationChanges.lostCompetitors.map((c: string) => (
                                <Badge key={c} variant="outline" className="text-xs text-red-500 border-red-500/30">
                                  <Users className="h-3 w-3 mr-1" />
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {(citationChanges.visibilityGained || citationChanges.visibilityLost) && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Visibility</div>
                            <div className={`text-xs font-medium flex items-center gap-1 ${citationChanges.visibilityGained ? 'text-green-500' : 'text-red-500'}`}>
                              {citationChanges.visibilityGained ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              Visibility {citationChanges.visibilityGained ? 'gained' : 'lost'}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No citation data available for this audit</p>
            )}
            {params?.auditId && <CitationHistoryTimeline auditId={params.auditId} />}
          </CardContent>
        </Card>

        {/* Admin-only: public share link */}
        {isAdminUser && (
          <Card className="mb-6" data-testid="card-admin-share-link">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Share2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">Public share link (admin only)</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Generate a read-only link to this report for prospects — no login required. The same link can be embedded via iframe on an external site.
              </p>
              {shareUrl ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      className="flex-1 min-w-[220px] text-sm px-3 py-2 rounded-md border bg-muted"
                      data-testid="input-share-url"
                    />
                    <Button size="sm" variant="outline" onClick={handleCopyShareUrl} data-testid="button-copy-share-url">
                      Copy link
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopyEmbedSnippet} data-testid="button-copy-embed-snippet">
                      Copy embed code
                    </Button>
                    <Button size="sm" variant="destructive" disabled={shareBusy} onClick={handleRevokeShareLink} data-testid="button-revoke-share-link">
                      Revoke link
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" disabled={shareBusy} onClick={handleEnableShareLink} data-testid="button-enable-share-link">
                  {shareBusy ? 'Enabling...' : 'Enable public link'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Audit Results */}
        <AuditResults auditData={audit.auditData} websiteUrl={audit.websiteUrl} auditId={params?.auditId} lastCitationRefreshAt={audit?.lastCitationRefreshAt ?? null} />

        {/* Export Options */}
        <div className="flex items-center justify-center mb-1">
          <AdminGatingBadge feature="pdfExport" label="PDF" />
          <AdminGatingBadge feature="scoreTrendExport" label="Trend Export" />
        </div>
        <div className="flex flex-wrap justify-center gap-4 pt-8">
          <Button onClick={handleDownloadPDF} disabled={isPDFGenerating} data-testid="button-download-pdf">
            <FileText className="h-4 w-4 mr-2" />
            {isPDFGenerating ? 'Generating...' : 'Save as PDF'}
          </Button>
          <Button variant="secondary" onClick={handleDownloadCSV} data-testid="button-download-csv">
            <Table className="h-4 w-4 mr-2" />
            Export CSV Data
          </Button>
          <Button variant="outline" onClick={handleShare} disabled={isPDFGenerating} data-testid="button-share">
            <Share2 className="h-4 w-4 mr-2" />
            {isPDFGenerating ? 'Preparing...' : 'Share PDF Report'}
          </Button>
        </div>
      </main>
    </div>
  );
}

