import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/queryClient";
import type { AuditHistory } from "@shared/api";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function Trend({ points }: { points: { score: number }[] }) {
  const w = 320, h = 70, pad = 6;
  const xs = (i: number) => pad + (points.length === 1 ? 0 : (i / (points.length - 1)) * (w - pad * 2));
  const ys = (s: number) => h - pad - (s / 100) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.score).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm h-[70px]" role="img" aria-label={`Score over time: ${points.map((p) => p.score).join(", ")}`}>
      <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={xs(i)} cy={ys(p.score)} r="3" fill="hsl(var(--primary))" />)}
    </svg>
  );
}

/** Every saved audit and citation check for this website, so progress is visible over time. */
export default function AuditHistoryCard({ auditId, refreshKey }: { auditId: string; refreshKey: string }) {
  const { data } = useQuery<AuditHistory>({
    queryKey: ["audit-history", auditId, refreshKey],
    queryFn: () => api<AuditHistory>("GET", `/api/audits/${auditId}/history`),
    enabled: !!auditId,
  });
  if (!data || (data.scores.length < 2 && data.checks.length < 1)) return null;
  const first = data.scores[0];
  const last = data.scores[data.scores.length - 1];
  const change = last.score - first.score;

  return (
    <Card data-testid="audit-history">
      <CardContent className="p-6 grid md:grid-cols-2 gap-8">
        {data.scores.length >= 2 && (
          <div>
            <h3 className="font-semibold">Your score over time</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {data.scores.length} audits since {shortDate(first.date)}: {first.score} to {last.score}{change !== 0 ? ` (${change > 0 ? "+" : ""}${change})` : ", no change"}
            </p>
            <Trend points={data.scores} />
          </div>
        )}
        {data.checks.length >= 1 && (
          <div>
            <h3 className="font-semibold">Past citation checks</h3>
            <p className="text-sm text-muted-foreground mb-3">Named when customers did not ask for you by name</p>
            <div className="space-y-1.5 text-sm">
              {data.checks.slice(0, 6).map((c) => (
                <div key={c.date} className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
                  <span className="text-muted-foreground">{shortDate(c.date)}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.engines.join(", ")}</span>
                  <b className="whitespace-nowrap">{c.openNamed} of {c.openTotal}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
