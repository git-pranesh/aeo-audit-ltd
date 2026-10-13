import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Globe, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LoadingState from "@/components/loading-state";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError, queryClient } from "@/lib/queryClient";
import type { AuditDetail, ConfirmedContext, ContextSuggestion } from "@shared/api";

type Step = "url" | "analyzing" | "context" | "running";

const EMPTY: ConfirmedContext = {
  companyName: "", industry: "", businessType: "", targetAudience: "", valueProposition: "", keywords: [], competitors: [],
};

export default function NewAudit({ maxCompetitors = 3, initialUrl = "", initialContext }: {
  maxCompetitors?: number;
  initialUrl?: string;
  initialContext?: ConfirmedContext;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>(initialContext ? "context" : "url");
  const [websiteUrl, setWebsiteUrl] = useState(initialUrl);
  const [context, setContext] = useState<ConfirmedContext>(initialContext ?? EMPTY);
  const [keywordsText, setKeywordsText] = useState((initialContext?.keywords ?? []).join(", "));
  const [evidence, setEvidence] = useState<string | null>(null);

  const showError = (err: unknown) => {
    const e = err instanceof ApiError ? err : null;
    const needsSettings = e?.code === "KEY_MISSING" || e?.code === "KEY_INVALID" || e?.code === "LICENSE_REQUIRED";
    toast({
      title: "Something went wrong",
      description: e?.message || "Please try again.",
      variant: "destructive",
      ...(needsSettings ? { action: <ToastAction altText="Open settings" onClick={() => navigate("/settings")}>Settings</ToastAction> } : {}),
    });
  };

  const analyze = async () => {
    if (!websiteUrl.trim()) return;
    setStep("analyzing");
    try {
      const { websiteUrl: normalized, suggestion } = await api<{ websiteUrl: string; suggestion: ContextSuggestion }>(
        "POST", "/api/audits/analyze", { websiteUrl: websiteUrl.trim() },
      );
      setWebsiteUrl(normalized);
      setContext({
        companyName: suggestion.companyName,
        industry: suggestion.industry,
        businessType: suggestion.businessType,
        targetAudience: suggestion.targetAudience,
        valueProposition: suggestion.valueProposition,
        keywords: suggestion.suggestedKeywords,
        competitors: [],
      });
      setKeywordsText(suggestion.suggestedKeywords.join(", "));
      setEvidence(suggestion.signalQuality === "minimal"
        ? "We couldn't read enough of the homepage to fill this in — please complete the details below."
        : suggestion.evidenceQuote);
      setStep("context");
    } catch (err) {
      setStep("url");
      showError(err);
    }
  };

  const run = async () => {
    const payload = {
      websiteUrl,
      idempotencyKey: crypto.randomUUID(),
      context: {
        ...context,
        keywords: keywordsText.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 8),
        competitors: context.competitors.map((c) => c.trim()).filter(Boolean),
      },
    };
    setStep("running");
    // The request runs until the audit finishes; show it as "Running" in the list meanwhile.
    const listRefresh = setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/audits"] }), 2000);
    try {
      const audit = await api<AuditDetail>("POST", "/api/audits", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/audits"] });
      navigate(`/audit/${audit.auditId}`);
    } catch (err) {
      setStep("context");
      queryClient.invalidateQueries({ queryKey: ["/api/audits"] });
      showError(err);
    } finally {
      clearTimeout(listRefresh);
    }
  };

  const set = (field: keyof ConfirmedContext) => (e: { target: { value: string } }) =>
    setContext((c) => ({ ...c, [field]: e.target.value }));

  if (step === "running") return <LoadingState />;

  if (step === "url" || step === "analyzing") {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">New audit</h2>
          <form
            className="flex flex-col sm:flex-row gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              analyze();
            }}
          >
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={step === "analyzing"}
                data-testid="input-website-url"
              />
            </div>
            <Button type="submit" disabled={step === "analyzing" || !websiteUrl.trim()} data-testid="button-analyze">
              {step === "analyzing" ? "Reading your site…" : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            We read your homepage and suggest your business details. You confirm them before the audit runs.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Confirm your business details</h2>
          <p className="text-sm text-muted-foreground break-all">{websiteUrl}</p>
          {evidence && <p className="text-xs text-muted-foreground mt-2 italic">“{evidence}”</p>}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company name"><Input value={context.companyName} onChange={set("companyName")} /></Field>
          <Field label="Industry"><Input value={context.industry} onChange={set("industry")} placeholder="e.g. B2B payroll software" /></Field>
          <Field label="Business type"><Input value={context.businessType} onChange={set("businessType")} placeholder="e.g. SaaS, agency, e-commerce" /></Field>
          <Field label="Target audience"><Input value={context.targetAudience} onChange={set("targetAudience")} placeholder="e.g. HR teams at SMBs" /></Field>
        </div>
        <Field label="Value proposition">
          <Textarea rows={2} value={context.valueProposition} onChange={set("valueProposition")} />
        </Field>
        <Field label="Priority keywords (comma separated)">
          <Input value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} placeholder="payroll software, HR compliance" />
        </Field>

        <div className="space-y-2">
          <Label>Competitors (optional, up to {maxCompetitors})</Label>
          {context.competitors.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={c}
                placeholder="competitor.com"
                onChange={(e) => setContext((ctx) => ({ ...ctx, competitors: ctx.competitors.map((x, j) => (j === i ? e.target.value : x)) }))}
              />
              <Button variant="ghost" size="icon" aria-label="Remove competitor"
                onClick={() => setContext((ctx) => ({ ...ctx, competitors: ctx.competitors.filter((_, j) => j !== i) }))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {context.competitors.length < maxCompetitors && (
            <Button variant="outline" size="sm" onClick={() => setContext((ctx) => ({ ...ctx, competitors: [...ctx.competitors, ""] }))}>
              <Plus className="h-4 w-4 mr-1" /> Add competitor
            </Button>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
          <Button variant="ghost" onClick={() => setStep("url")}>Back</Button>
          <Button onClick={run} disabled={!context.industry.trim()} data-testid="button-run-audit">
            Run audit <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Takes about 1–2 minutes. Uses your OpenRouter key for one topic-generation call.
        </p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
