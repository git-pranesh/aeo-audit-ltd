import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import AppShell from "@/components/app-shell";
import NewAudit from "@/components/new-audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import type { AuditSummary } from "@shared/api";

function SetupStep({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {done ? <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground mt-0.5" />}
      <div className="flex-1">
        <p className={done ? "text-muted-foreground line-through" : "font-medium"}>{title}</p>
        {!done && children}
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
        {!ready && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">Get set up (2 minutes)</h2>
              <SetupStep done={licensed} title="Activate your lifetime license">
                <p className="text-sm text-muted-foreground">Bought directly? Sign in with your purchase email and it activates automatically. Have a code? Enter it in Settings.</p>
                <Link href="/settings"><Button size="sm" className="mt-2">Activate license</Button></Link>
              </SetupStep>
              <SetupStep done={hasKey} title="Add your OpenRouter key">
                <p className="text-sm text-muted-foreground">Audits run on your own OpenRouter key (typically a few cents per audit).</p>
                <Link href="/settings"><Button size="sm" className="mt-2" variant={licensed ? "default" : "outline"}>Add key</Button></Link>
              </SetupStep>
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
