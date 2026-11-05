import { useState } from "react";
import { Check, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOM_ENGINE, ENGINES, estimateCheckUsd, MAX_OWN_QUESTIONS } from "@shared/engines";

const usd = (n: number) => (n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);

export function parseQuestions(text: string): string[] {
  return Array.from(new Set(text.split("\n").map((q) => q.trim()).filter((q) => q.length >= 5)));
}

/** Choose the engines and the questions. The cost is on screen before anything is spent. */
export default function CitationEnginePicker({ defaultQuestions, customModel, running, hasResult, lastQuestions, onRun, onWriteQuestions }: {
  defaultQuestions: number;
  customModel: string | null;
  running: boolean;
  hasResult: boolean;
  lastQuestions: string[];
  onRun: (engines: string[], questions?: string[]) => void;
  onWriteQuestions: (avoid: string[]) => Promise<string[]>;
}) {
  const [selected, setSelected] = useState<string[]>(() => ENGINES.map((e) => e.id));
  const [own, setOwn] = useState(false);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);

  const ownQuestions = parseQuestions(text);
  const tooMany = ownQuestions.length > MAX_OWN_QUESTIONS;
  const questionCount = own ? ownQuestions.length : defaultQuestions;
  const options = [
    ...ENGINES.map((e) => ({ id: e.id as string, label: e.label, est: e.estPerQuestionUsd * Math.max(questionCount, 1) })),
    ...(customModel ? [{ id: CUSTOM_ENGINE, label: `Your model: ${customModel}`, est: null as number | null }] : []),
  ];
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const total = estimateCheckUsd(selected, Math.max(questionCount, 1));
  const canRun = selected.length > 0 && (!own || (ownQuestions.length > 0 && !tooMany));

  const writeNew = async () => {
    setWriting(true);
    try {
      const fresh = await onWriteQuestions(Array.from(new Set([...lastQuestions, ...ownQuestions])));
      setText(fresh.join("\n"));
      setOwn(true);
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto rounded-xl border bg-card p-5 space-y-5" data-testid="engine-picker">
      <div className="space-y-2">
        <p className="font-semibold">Which AI engines should we ask?</p>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button key={o.id} type="button" aria-pressed={on} onClick={() => toggle(o.id)} disabled={running} data-testid={`engine-${o.id}`}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors ${on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>
                {on && <Check className="h-3.5 w-3.5 text-primary" />}
                <span className="font-medium">{o.label}</span>
                {o.est !== null && <span className="text-xs text-muted-foreground">≈ {usd(o.est)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-semibold">What should we ask?</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={own ? "outline" : "default"} onClick={() => setOwn(false)} disabled={running} data-testid="questions-ai">AI writes {defaultQuestions} new questions</Button>
          <Button type="button" size="sm" variant={own ? "default" : "outline"} onClick={() => setOwn(true)} disabled={running} data-testid="questions-own">Ask my own questions</Button>
        </div>
        {own && (
          <div className="space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} disabled={running} data-testid="questions-text"
              placeholder={"One question per line, up to " + MAX_OWN_QUESTIONS + ". For example:\nWhat is the best running shoe for flat feet?\nWho makes the most comfortable wool sneakers?"} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={writeNew} disabled={running || writing} data-testid="questions-write">
                {writing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}Write me new questions
              </Button>
              {lastQuestions.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setText(lastQuestions.join("\n"))} disabled={running} data-testid="questions-last">Use the last questions again</Button>
              )}
              <span className={`text-xs ml-auto ${tooMany ? "text-destructive font-medium" : "text-muted-foreground"}`} data-testid="questions-count">{ownQuestions.length} of {MAX_OWN_QUESTIONS} questions</span>
            </div>
            <p className="text-xs text-muted-foreground">Asking the same questions again is the fair way to see whether your fixes moved the result.</p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm">
          Cost on your OpenRouter key: <b data-testid="engine-total">≈ {selected.length && questionCount ? usd(total) : "$0"}</b>
          <span className="text-muted-foreground"> for {selected.length * questionCount} answers</span>
        </p>
        <Button onClick={() => onRun(selected, own ? ownQuestions : undefined)} disabled={running || !canRun} data-testid="button-citation-check">
          {running
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Asking the AI engines (1 to 3 min)…</>
            : <><Search className="h-4 w-4 mr-2" />{hasResult ? "Run again" : "Run citation check"}</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Asked through each company's API with web search on. Their consumer apps can answer differently. Past results are summarised in your history.</p>
    </div>
  );
}
