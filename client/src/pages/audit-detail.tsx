import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Download, FileArchive, FileText, Loader2, RotateCcw, Search, Table, Trash2, TrendingDown, TrendingUp,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import AuditResults from "@/components/audit-results";
import CitationSnapshot from "@/components/citation-snapshot";
import NewAudit from "@/components/new-audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePDFExport } from "@/hooks/use-pdf-export";
import { CSVExporter } from "@/lib/csv-exporter";
import { api, apiFetch, ApiError, queryClient } from "@/lib/queryClient";
import type { AuditDetail } from "@shared/api";
import type { AuditData } from "@shared/schema";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AuditDetailPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { me } = useAuth();
  const [rerun, setRerun] = useState(false);
  const [citationRunning, setCitationRunning] = useState(false);
  const [zipping, setZipping] = useState(false);

  const queryKey = ["/api/audits", auditId];
  const { data: audit, isLoading, error } = useQuery<AuditDetail>({
    queryKey,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 5000 : false),
  });

  const auditData = audit?.auditData ?? null;
  const branding = me?.entitlement?.whiteLabel ? me.branding : null;
  const { handleDownloadPDF, isGenerating } = usePDFExport({
    auditData,
    websiteUrl: audit?.websiteUrl ?? "",
    generatedAt: audit?.completedAt ?? audit?.createdAt,
    branding,
  });

  const fail = (err: unknown) =>
    toast({ title: "Something went wrong", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });

  const downloadCsv = () => {
    if (!audit || !auditData) return;
    const exporter = new CSVExporter({ auditData, websiteUrl: audit.websiteUrl, generatedAt: audit.completedAt ?? audit.createdAt });
    exporter.downloadCSV(`ai-readiness-${audit.domain}-${audit.createdAt.slice(0, 10)}.csv`, exporter.generateFullCSV());
  };

  const downloadAeoPack = async () => {
    if (!audit) return;
    setZipping(true);
    try {
      const res = await apiFetch("GET", `/api/audits/${audit.auditId}/aeo-pack`);
      downloadBlob(await res.blob(), `${audit.domain}-aeo-pack.zip`);
    } catch (err) {
      fail(err);
    } finally {
      setZipping(false);
    }
  };

  const runCitationCheck = async () => {
    if (!audit) return;
    setCitationRunning(true);
    try {
      const { citationSnapshot } = await api<{ citationSnapshot: AuditData["citationSnapshot"] }>(
        "POST", `/api/audits/${audit.auditId}/citation-snapshot`,
      );
      queryClient.setQueryData<AuditDetail>(queryKey, (prev) =>
        prev?.auditData ? { ...prev, auditData: { ...prev.auditData, citationSnapshot } } : prev,
      );
      toast({ title: "Citation check complete" });
    } catch (err) {
      fail(err);
    } finally {
      setCitationRunning(false);
    }
  };

  const deleteThis = async () => {
    if (!audit) return;
    try {
      await api("DELETE", `/api/audits/${audit.auditId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/audits"] });
      navigate("/dashboard");
    } catch (err) {
      fail(err);
    }
  };

  if (isLoading) {
    return <AppShell><p className="text-center text-muted-foreground">Loading…</p></AppShell>;
  }
  if (error || !audit) {
    return (
      <AppShell>
        <div className="text-center space-y-4">
          <p>This audit was not found. It may have been deleted.</p>
          <Link href="/dashboard"><Button variant="outline">Back to audits</Button></Link>
        </div>
      </AppShell>
    );
  }

  const delta = audit.overallScore != null && audit.previousScore != null ? audit.overallScore - audit.previousScore : null;
  const snapshot = auditData?.citationSnapshot ?? null;
  const citationSlot = (
    <section className="space-y-4">
      {snapshot ? (
        <CitationSnapshot citationSnapshot={snapshot} lastCheckedAt={snapshot.generatedAt ?? snapshot.snapshotDate} />
      ) : (
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">AI Citation Snapshot</h2>
          <p className="text-muted-foreground">Ask AI search {me?.limits.citationPrompts ?? 8} real buyer questions and see whether it mentions you.</p>
        </div>
      )}
      <div className="flex justify-center">
        <Button onClick={runCitationCheck} disabled={citationRunning} variant={snapshot ? "outline" : "default"} data-testid="button-citation-check">
          {citationRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking AI answers (≈1 min)…</> : <><Search className="h-4 w-4 mr-2" />{snapshot ? "Run citation check again" : "Run citation check"}</>}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Uses web-search calls on your OpenRouter key. Only the latest result is kept.</p>
    </section>
  );

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" />All audits</Button>
        </Link>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold break-all">{audit.domain}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(audit.completedAt ?? audit.createdAt).toLocaleString()}
              {delta !== null && (
                <span className={`ml-3 inline-flex items-center gap-1 ${delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {delta >= 0 ? "+" : ""}{delta} vs previous audit ({audit.previousScore})
                </span>
              )}
            </p>
          </div>

          {audit.status === "completed" && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadPDF} disabled={isGenerating} data-testid="button-pdf">
                <FileText className="h-4 w-4 mr-2" />{isGenerating ? "Generating…" : branding ? "Branded PDF" : "PDF"}
              </Button>
              <Button variant="outline" onClick={downloadCsv} data-testid="button-csv"><Table className="h-4 w-4 mr-2" />CSV</Button>
              <Button variant="outline" onClick={downloadAeoPack} disabled={zipping} data-testid="button-aeo-pack">
                <FileArchive className="h-4 w-4 mr-2" />{zipping ? "Preparing…" : "AEO Pack"}
              </Button>
              <Button variant="outline" onClick={() => setRerun((v) => !v)}><RotateCcw className="h-4 w-4 mr-2" />Re-audit</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Delete audit"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this audit?</AlertDialogTitle>
                    <AlertDialogDescription>Download the PDF, CSV or AEO Pack first if you need them. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteThis}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {rerun && (
          <NewAudit maxCompetitors={me?.limits.maxCompetitors} initialUrl={audit.websiteUrl} initialContext={audit.context} />
        )}

        {audit.status === "running" && (
          <Card><CardContent className="p-8 text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p>This audit is still running. This page updates automatically.</p>
          </CardContent></Card>
        )}

        {audit.status === "failed" && (
          <Card><CardContent className="p-8 text-center space-y-4">
            <p className="text-destructive">{audit.error || "This audit failed."}</p>
            <Button onClick={() => setRerun(true)}><RotateCcw className="h-4 w-4 mr-2" />Try again</Button>
          </CardContent></Card>
        )}

        {audit.status === "completed" && auditData && (
          <AuditResults auditData={auditData} websiteUrl={audit.websiteUrl} citationSlot={citationSlot} />
        )}

        {audit.status === "completed" && (
          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Download className="h-3 w-3" /> Exports are generated on your device. Only your latest {me?.limits.savedAudits ?? 25} audits are kept.
          </p>
        )}
      </div>
    </AppShell>
  );
}
