import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/queryClient";
import type { CatalogEntry, MeResponse } from "@shared/api";

const POPULAR = /^(anthropic|openai|google|deepseek|meta-llama|mistralai|qwen|x-ai|perplexity)\//;
const usd = (n: number) => (n === 0 ? "free" : n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`);

function ModelList({ task, value, onChange, models, defaultId }: {
  task: "structured" | "webSearch";
  value: string | null;
  onChange: (id: string | null) => void;
  models: CatalogEntry[];
  defaultId: string;
}) {
  const [q, setQ] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const current = value ?? defaultId;
  const cost = (m: CatalogEntry) => (task === "webSearch" ? m.estSnapshotUsd : m.estAuditUsd);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    // Current choice, then our recommendation, then well-known providers, then everything else — cheapest first.
    const rank = (m: CatalogEntry) => (m.id === current ? 0 : m.id === defaultId ? 1 : POPULAR.test(m.id) ? 2 : 3);
    return models
      .filter((m) => (task === "webSearch" ? m.webSearch : (m.supportsJson || m.free) && m.contextLength >= 32_000))
      .filter((m) => !freeOnly || m.free)
      .filter((m) => !term || m.id.toLowerCase().includes(term) || m.name.toLowerCase().includes(term))
      .sort((a, b) => rank(a) - rank(b) || cost(a) - cost(b))
      .slice(0, 60);
  }, [models, q, freeOnly, task, current, defaultId]);
  const selected = models.find((m) => m.id === current.replace(/:online$/, ""));

  return (
    <div className="space-y-2">
      <div className="text-sm">
        Selected: <span className="font-medium">{selected?.name ?? current}</span>
        {current === defaultId && <Badge variant="secondary" className="ml-2">Recommended</Badge>}
        {selected && <span className="text-muted-foreground"> · ≈ {usd(cost(selected))} per {task === "webSearch" ? "check" : "audit"}</span>}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Search models (e.g. claude, gpt, gemini, llama)" value={q} onChange={(e) => setQ(e.target.value)} />
        {task === "structured" && (
          <Button variant={freeOnly ? "default" : "outline"} onClick={() => setFreeOnly((v) => !v)}>Free</Button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
        {list.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id === defaultId ? null : m.id)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 hover:bg-muted/50 ${current === m.id ? "bg-primary/5" : ""}`}
          >
            <span className="min-w-0">
              <span className="font-medium block truncate">{m.name}</span>
              <span className="text-xs text-muted-foreground block truncate">{m.id}</span>
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              {m.id === defaultId && <Badge variant="secondary">Recommended</Badge>}
              <span className="text-xs text-muted-foreground w-24 text-right">
                ≈ {usd(cost(m))} / {task === "webSearch" ? "check" : "audit"}
              </span>
              {current === m.id && <Check className="h-4 w-4 text-primary" />}
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="p-3 text-sm text-muted-foreground">No matching models.</p>}
      </div>
    </div>
  );
}

/** Lets the customer run audits on any OpenRouter model — free to premium. */
export function ModelSettings() {
  const { me, setMe } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<{ models: CatalogEntry[] }>({ queryKey: ["/api/me/models/catalog"], staleTime: 60 * 60 * 1000 });
  const [structured, setStructured] = useState<string | null | undefined>(undefined);
  const [webSearch, setWebSearch] = useState<string | null | undefined>(undefined);
  const [customSearch, setCustomSearch] = useState("");
  const [saving, setSaving] = useState(false);
  if (!me) return null;

  const s = structured === undefined ? me.aiModels.structured : structured;
  const w = webSearch === undefined ? me.aiModels.webSearch : webSearch;
  const chosen = data?.models.find((m) => m.id === (s ?? me.aiModels.defaults.structured));
  const dirty = s !== me.aiModels.structured || w !== me.aiModels.webSearch;

  const save = async () => {
    setSaving(true);
    try {
      setMe(await api<MeResponse>("PUT", "/api/me/models", { structured: s, webSearch: w }));
      setStructured(undefined);
      setWebSearch(undefined);
      toast({ title: "Models saved", description: "New audits will use your choice." });
    } catch (err) {
      toast({ title: "Could not save", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading OpenRouter models…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Couldn't load the OpenRouter model list. Try again later.</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Analysis model — business details & topic ideas (2 calls per audit)</Label>
        <ModelList task="structured" value={s} onChange={setStructured} models={data.models} defaultId={me.aiModels.defaults.structured} />
        {chosen?.free && (
          <p className="text-xs text-amber-700 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            Free models are rate-limited, can be slow or unavailable, may produce weaker topics, and providers may log prompts. Audits fall back to an error if the model can't answer.
          </p>
        )}
        {chosen && !chosen.supportsJson && !chosen.free && (
          <p className="text-xs text-amber-700">This model doesn't guarantee JSON output, so occasional retries may happen.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Citation-check model — needs live web search (8 calls per check)</Label>
        <ModelList task="webSearch" value={w} onChange={setWebSearch} models={data.models} defaultId={me.aiModels.defaults.webSearch} />
        <div className="flex gap-2">
          <Input placeholder='Or any model with web search, e.g. "openai/gpt-5-mini:online"' value={customSearch} onChange={(e) => setCustomSearch(e.target.value)} />
          <Button variant="outline" disabled={!customSearch.trim()} onClick={() => setWebSearch(customSearch.trim())}>Use</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Current: <code>{w ?? me.aiModels.defaults.webSearch}</code>. Adding ":online" uses OpenRouter's web search (extra per-request fee on your OpenRouter bill).
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save models"}</Button>
        <Button variant="ghost" onClick={() => { setStructured(null); setWebSearch(null); }}>Reset to recommended</Button>
      </div>
      <p className="text-xs text-muted-foreground">Costs are estimates from OpenRouter's live prices and are billed to your OpenRouter account.</p>
    </div>
  );
}
