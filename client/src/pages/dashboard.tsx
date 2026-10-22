import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { KeySetup, LicenseSetup } from "@/components/account-setup";
import AppShell from "@/components/app-shell";
import NewAudit from "@/components/new-audit";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import type { AuditSummary } from "@shared/api";

function SetupStep({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {done
        ? <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
        : <span className="h-6 w-6 rounded-full border-2 border-primary text-primary text-sm font-semibold flex items-center justify-center flex-shrink-0">{n}</span>}
      <div className="flex-1 space-y-2 min-w-0">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const licensed = !!me?.entitlement;
  const hasKey = !!me?.openRouterKey;
  const ready = licensed && hasKey;

  const { data, isLoading } = useQuery<{ audits: AuditSummary[] }>({
    queryKey: ["/api/audits"],
    refetchInterval: (q) => (q.state.data?.audits.some((a) => a.status === "running") ? 5000 : false),
  });
  const audits = data?.audits ?? [];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-8">
        {me?.unusedPurchases?.map((p) => (
          <Card key={p.licenseId} className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20" data-testid="unused-purchase">
            <CardContent className="p-5 space-y-1.5 text-sm">
              <p className="font-semibold">You bought another {p.whiteLabel ? "Lifetime Agency" : "Lifetime"} license{p.createdAt ? ` on ${new Date(p.createdAt).toLocaleDateString()}` : ""}</p>
              <p className="text-muted-foreground">
                This account already has an active {me.entitlement?.whiteLabel ? "Lifetime Agency" : "Lifetime"} license, and one account can hold one license, so the extra purchase is not in use.
                Email <a className="underline" href={`mailto:support@citationrocket.com?subject=${encodeURIComponent("Extra license " + p.licenseId)}`}>support@citationrocket.com</a> with the reference <code>{p.licenseId}</code> and we will sort it out.
              </p>
            </CardContent>
          </Card>
        ))}
        {!ready && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Welcome! Two quick steps, in any order</h2>
                <p className="text-sm text-muted-foreground">Then you can run your first audit right here.</p>
              </div>
              <SetupStep n={1} done={licensed} title="Lifetime license"><LicenseSetup /></SetupStep>
              <SetupStep n={2} done={hasKey} title="Your OpenRouter key"><KeySetup /></SetupStep>
            </CardContent>
          </Card>
        )}

        {ready && <NewAudit maxCompetitors={me?.limits.maxCompetitors} />}

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Your audits</h2>
            {me && <span className="text-xs text-muted-foreground">Latest {me.limits.savedAudits} are kept</span>}
          </div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && audits.length === 0 && (
            <p className="text-sm text-muted-foreground">No audits yet. {ready ? "Run your first one above." : ""}</p>
          )}
          <div className="space-y-2">
            {audits.map((a) => <AuditRow key={a.auditId} audit={a} />)}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function AuditRow({ audit }: { audit: AuditSummary }) {
  const delta = audit.overallScore != null && audit.previousScore != null ? audit.overallScore - audit.previousScore : null;
  const body = (
    <Card className={audit.status === "completed" ? "hover:border-primary/50 transition-colors cursor-pointer" : ""}>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium truncate">{audit.domain}</p>
          <p className="text-xs text-muted-foreground">{new Date(audit.createdAt).toLocaleString()}</p>
          {audit.status === "failed" && audit.error && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{audit.error}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {audit.status === "running" && <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Running</Badge>}
          {audit.status === "failed" && <Badge variant="destructive">Failed</Badge>}
          {audit.status === "completed" && (
            <>
              {delta !== null && delta !== 0 && (
                <span className={`text-xs flex items-center gap-0.5 ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
                  {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {delta > 0 ? "+" : ""}{delta}
                </span>
              )}
              <div className="text-right">
                <div className="text-2xl font-bold text-primary leading-none">{audit.overallScore}</div>
                <div className="text-xs text-muted-foreground">{audit.letterGrade}</div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
  return audit.status === "completed" ? <Link href={`/audit/${audit.auditId}`}>{body}</Link> : body;
}
