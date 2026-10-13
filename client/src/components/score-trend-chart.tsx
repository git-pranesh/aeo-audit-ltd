import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scoreHistoryDb, type ScoreHistoryEntry } from "@/lib/firestore-utils";
import UpgradePromptCard from "./upgrade-prompt-card";

interface ScoreTrendChartProps {
  auditId: string;
  websiteUrl: string;
  isLocked?: boolean;
  showExport?: boolean;
  refreshKey?: string | number;
}

const PLATFORM_COLORS = {
  overall: "#1A1A1A",
  chatgpt: "#10b981",
  perplexity: "#3b82f6",
  gemini: "#f59e0b",
  claude: "#ef4444",
};

export default function ScoreTrendChart({ auditId, websiteUrl, isLocked, showExport, refreshKey }: ScoreTrendChartProps) {
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auditId || isLocked) {
      setLoading(false);
      return;
    }
    loadHistory();
  }, [auditId, refreshKey]);

  const loadHistory = async () => {
    try {
      const entries = await scoreHistoryDb.getScoreHistory(auditId);
      setHistory(entries);
    } catch (err) {
      console.error("Failed to load score history:", err);
    } finally {
      setLoading(false);
    }
  };

  if (isLocked) {
    return (
      <UpgradePromptCard
        targetPlan="starter"
        headline="Track your score improvements over time"
        benefits={[
          "See how your AI readiness improves month-over-month",
          "Platform-specific trend lines (ChatGPT, Perplexity, Gemini, Claude)"
        ]}
      />
    );
  }

  if (loading) {
    return (
      <Card className="bg-card border border-border shadow-lg">
        <CardContent className="p-6 text-center">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-muted-foreground">Loading score trends...</p>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return null;
  }

  if (history.length === 1) {
    const entry = history[0];
    const recordedDate = new Date(entry.runAt);
    const nextAuditDate = new Date(recordedDate);
    nextAuditDate.setDate(nextAuditDate.getDate() + 30);
    return (
      <Card className="bg-card border border-border shadow-md">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-semibold">Score Trends</h3>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <div className="text-3xl font-bold text-foreground">{entry.overallScore}</div>
              <div className="text-xs text-muted-foreground mt-1">Baseline score</div>
            </div>
            <div className="flex-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>Recorded {recordedDate.toLocaleDateString()}</span>
              </div>
              <p>Re-audit in ~30 days to track your progress.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hostname = (() => {
    try { return new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname.replace('www.', ''); }
    catch { return websiteUrl; }
  })();

  const chartData = history.map((entry) => ({
    date: new Date(entry.runAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Overall: entry.overallScore,
    ChatGPT: entry.platformScores.chatgpt,
    Perplexity: entry.platformScores.perplexity,
    Gemini: entry.platformScores.gemini,
    Claude: entry.platformScores.claude,
  }));

  const latestDiff = history.length >= 2
    ? history[history.length - 1].overallScore - history[history.length - 2].overallScore
    : 0;

  const handleExportCsv = () => {
    const headers = ["Date", "Overall", "ChatGPT", "Perplexity", "Gemini", "Claude"];
    const rows = history.map((entry) => {
      const d = new Date(entry.runAt);
      const dateStr = d.toISOString().split("T")[0];
      return [
        dateStr,
        entry.overallScore,
        entry.platformScores.chatgpt,
        entry.platformScores.perplexity,
        entry.platformScores.gemini,
        entry.platformScores.claude,
      ].join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `score-trend-${hostname}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-card border border-border shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Score Trend — {hostname}
          </span>
          <div className="flex items-center gap-3">
            {showExport && history.length > 1 && (
              <Button variant="ghost" size="sm" onClick={handleExportCsv}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
            {latestDiff !== 0 && (
              <span className={`text-sm font-medium ${latestDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {latestDiff > 0 ? '+' : ''}{latestDiff} since last audit
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="Overall" stroke={PLATFORM_COLORS.overall} strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="ChatGPT" stroke={PLATFORM_COLORS.chatgpt} strokeWidth={1.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Perplexity" stroke={PLATFORM_COLORS.perplexity} strokeWidth={1.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Gemini" stroke={PLATFORM_COLORS.gemini} strokeWidth={1.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Claude" stroke={PLATFORM_COLORS.claude} strokeWidth={1.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
