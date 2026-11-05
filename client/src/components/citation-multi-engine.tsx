import { useState } from "react";
import { CheckCircle, ChevronDown, Clock, Eye, Trophy, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { AuditData } from "@shared/schema";

type Snapshot = NonNullable<AuditData["citationSnapshot"]>;
type Answer = Snapshot["promptResults"][number];

function barColor(rate: number) {
  return rate === 0 ? "bg-red-500" : rate <= 25 ? "bg-yellow-500" : "bg-green-500";
}

function AnswerToggle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <Eye className="h-3 w-3" />{open ? "Hide" : "Show"} full answer
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="mt-2 p-3 rounded-md bg-muted/50 border text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">{text}</p>}
    </div>
  );
}

/** Same questions, several engines: who named you, engine by engine. */
export default function CitationMultiEngine({ snapshot, lastCheckedAt, companyName }: { snapshot: Snapshot; lastCheckedAt?: string | null; companyName: string }) {
  const engines = snapshot.engines ?? [];
  const label = (id?: string) => engines.find((e) => e.id === id)?.label ?? id ?? "";
  const questions = Array.from(new Set(snapshot.promptResults.map((r) => r.prompt)));
  const answersFor = (q: string) => snapshot.promptResults.filter((r) => r.prompt === q);
  const namedBy = engines.filter((e) => !e.failed && e.mentionedCount > 0).length;
  const asked = engines.filter((e) => !e.failed).length;
  // The number that matters: answers where the question did not already contain the business name.
  const brand = companyName.trim().toLowerCase();
  const answered = snapshot.promptResults.filter((r) => !r.error);
  const open = answered.filter((r) => !brand || !r.prompt.toLowerCase().includes(brand));
  const openNamed = open.filter((r) => r.mentioned).length;
  const byName = answered.length - open.length;
  const byNameNamed = answered.filter((r) => r.mentioned).length - openNamed;

  return (
    <div className="space-y-6" data-testid="citation-multi">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">AI Citation Check</h2>
        <p className="text-muted-foreground">
          {namedBy} of {asked} AI engines named you somewhere in this check.
        </p>
        {lastCheckedAt && (
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-2">
            <Clock className="h-3 w-3" />
            Checked {new Date(lastCheckedAt).toLocaleString()}{snapshot.estimatedCost > 0 ? `. This check cost $${snapshot.estimatedCost.toFixed(2)} on your OpenRouter key.` : "."}
          </p>
        )}
      </div>

      {snapshot.stoppedEarly && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm" data-testid="citation-stopped-early" role="alert">
          <b>This check stopped early.</b> {snapshot.stoppedEarly} The answers below were already paid for, so we kept them.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <Card className={openNamed === 0 ? "border-red-300 bg-red-50/60" : openNamed / Math.max(open.length, 1) <= 0.25 ? "border-yellow-300 bg-yellow-50/60" : "border-green-300 bg-green-50/60"} data-testid="citation-open-stat">
          <CardContent className="p-5">
            <p className="text-sm font-medium">When customers ask without naming you</p>
            <p className="mt-1 text-4xl font-bold">{openNamed} of {open.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">answers recommended or mentioned you. This is where AI decides who to suggest.</p>
          </CardContent>
        </Card>
        <Card data-testid="citation-byname-stat">
          <CardContent className="p-5">
            <p className="text-sm font-medium">When customers ask about you by name</p>
            <p className="mt-1 text-4xl font-bold">{byNameNamed} of {byName}</p>
            <p className="mt-1 text-sm text-muted-foreground">answers talked about you. Read them to check what AI says is correct.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {engines.map((e) => (
          <Card key={e.id} data-testid={`engine-result-${e.id}`}>
            <CardContent className="p-4">
              <p className="text-sm font-medium truncate">{e.label}</p>
              {e.failed ? (
                <p className="mt-2 text-sm text-muted-foreground">Did not answer this time. Try again.</p>
              ) : (
                <>
                  <p className="mt-1 text-3xl font-bold">{e.mentionRate}%</p>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${barColor(e.mentionRate)}`} style={{ width: `${Math.max(e.mentionRate, 2)}%` }} /></div>
                  <p className="mt-2 text-xs text-muted-foreground">Named you in {e.mentionedCount} of {e.answered}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold">Question by question</h3>
          <p className="text-sm text-muted-foreground">Open a question to read what each engine said</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Accordion type="multiple" className="w-full">
            {questions.map((q, i) => {
              const answers = answersFor(q);
              return (
                <AccordionItem key={q} value={`q-${i}`}>
                  <AccordionTrigger className="hover:no-underline py-3 gap-3">
                    <div className="text-left flex-1 min-w-0 space-y-2">
                      <p className="text-sm whitespace-normal break-words">"{q}"</p>
                      <div className="flex flex-wrap gap-1.5">
                        {answers.map((a) => <EngineChip key={a.engine} name={label(a.engine)} answer={a} />)}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      {answers.filter((a) => !a.error).map((a) => (
                        <div key={a.engine} className="rounded-md border p-3">
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            {a.mentioned ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-400" />}
                            {label(a.engine)}
                          </p>
                          {a.mentioned && a.mentionContext && <p className="mt-2 text-sm italic text-foreground/80 break-words">"{a.mentionContext.slice(0, 250)}{a.mentionContext.length > 250 ? "…" : ""}"</p>}
                          {a.competitorsMentioned.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">{a.mentioned ? "Also named:" : "Named instead:"}</span>
                              {a.competitorsMentioned.map((c) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                            </div>
                          )}
                          {a.fullResponse && <AnswerToggle text={a.fullResponse} />}
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {snapshot.topCompetitorsCited.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Trophy className="h-5 w-5 text-yellow-500" />Who AI named most</h3>
            <p className="text-sm text-muted-foreground">Businesses offering the same kind of thing, across all engines</p>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {snapshot.topCompetitorsCited.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                <span className="text-sm font-medium"><span className="text-muted-foreground mr-2">{i + 1}.</span>{c.name}</span>
                <Badge variant="outline" className="text-xs">{c.timesFound} of {snapshot.totalPromptsChecked} answers</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EngineChip({ name, answer }: { name: string; answer: Answer }) {
  if (answer.error) return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{name}: no answer</span>;
  return answer.mentioned
    ? <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-50 px-2 py-0.5 text-xs text-green-700"><CheckCircle className="h-3 w-3" />{name}</span>
    : <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs text-red-600"><XCircle className="h-3 w-3" />{name}</span>;
}
