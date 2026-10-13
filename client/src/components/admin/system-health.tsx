import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, CheckCircle, AlertCircle, Clock, User, FileText } from "lucide-react";

interface MonitoredError {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  userId?: string;
  auditId?: string;
  timestamp: string;
}

interface SystemHealthData {
  summary: Record<string, number>;
  recentErrors: MonitoredError[];
  totalErrors: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  citation: "bg-amber-100 text-amber-800 border-amber-200",
  subscription: "bg-blue-100 text-blue-800 border-blue-200",
  webhook: "bg-purple-100 text-purple-800 border-purple-200",
  auth: "bg-red-100 text-red-800 border-red-200",
  scoring: "bg-green-100 text-green-800 border-green-200",
  scheduler: "bg-orange-100 text-orange-800 border-orange-200",
  email: "bg-pink-100 text-pink-800 border-pink-200",
  general: "bg-gray-100 text-gray-800 border-gray-200",
};

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SystemHealth() {
  const { user } = useAuth();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fetchHealth = useCallback(async (): Promise<SystemHealthData> => {
    const token = await user?.getIdToken();
    const res = await fetch("/api/admin/system-health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch system health");
    return res.json();
  }, [user]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<SystemHealthData>({
    queryKey: ["admin-system-health"],
    queryFn: fetchHealth,
    refetchInterval: 60_000,
  });

  const totalErrors = data?.totalErrors ?? 0;
  const summary = data?.summary ?? {};
  const recentErrors = data?.recentErrors ?? [];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">System Health</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            In-memory error log — last 200 events. Resets on server restart.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status banner */}
      {!isLoading && (
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${
          totalErrors === 0
            ? "bg-green-50 border-green-200"
            : totalErrors < 5
              ? "bg-amber-50 border-amber-200"
              : "bg-red-50 border-red-200"
        }`}>
          {totalErrors === 0 ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <span className="text-sm font-medium text-green-800">All systems healthy — no errors recorded since last restart.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <span className="text-sm font-medium text-red-800">
                {totalErrors} error{totalErrors !== 1 ? "s" : ""} recorded since last restart.
              </span>
            </>
          )}
        </div>
      )}

      {/* Category summary */}
      {Object.keys(summary).length > 0 && (
        <Card className="bg-card border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Error Counts by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary).map(([cat, count]) => (
                <span
                  key={cat}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.general}`}
                >
                  <AlertCircle className="h-3 w-3" />
                  {cat} — {count}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error log */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Recent Errors
            {recentErrors.length > 0 && (
              <Badge variant="secondary" className="text-xs">{recentErrors.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-red-600">Failed to load error log.</div>
          ) : recentErrors.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No errors recorded since last restart.
            </div>
          ) : (
            <div className="space-y-2">
              {recentErrors.map((err, i) => (
                <div
                  key={i}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <button
                    className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border flex-shrink-0 mt-0.5 ${CATEGORY_COLORS[err.category] ?? CATEGORY_COLORS.general}`}>
                        {err.category}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{err.message}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(err.timestamp)}
                          </span>
                          {err.userId && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {err.userId.slice(0, 8)}…
                            </span>
                          )}
                          {err.auditId && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <FileText className="h-3 w-3" />
                              {err.auditId.slice(0, 8)}…
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {expandedIndex === i ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {expandedIndex === i && (
                    <div className="border-t border-border p-3 bg-muted/30 space-y-2">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Full message</span>
                        <p className="text-sm text-foreground mt-1">{err.message}</p>
                      </div>
                      {err.userId && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User ID</span>
                          <p className="text-sm font-mono text-foreground mt-1">{err.userId}</p>
                        </div>
                      )}
                      {err.auditId && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audit ID</span>
                          <p className="text-sm font-mono text-foreground mt-1">{err.auditId}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Timestamp</span>
                        <p className="text-sm text-foreground mt-1">
                          {new Date(err.timestamp).toLocaleString()}
                        </p>
                      </div>
                      {err.data && Object.keys(err.data).length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Extra data</span>
                          <pre className="text-xs font-mono bg-background border border-border rounded p-2 mt-1 overflow-auto whitespace-pre-wrap max-h-40">
                            {JSON.stringify(err.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
