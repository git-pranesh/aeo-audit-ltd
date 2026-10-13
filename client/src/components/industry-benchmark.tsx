import { BarChart3, Trophy, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface IndustryBenchmarkData {
  industryName: string;
  sampleSize: string;
  averageScores: {
    overall: number;
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
  topPerformerScores: {
    overall: number;
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
  commonStrengths: string[];
  commonWeaknesses: string[];
  contentBenchmarks: {
    avgTutorials: number;
    avgCaseStudies: number;
    avgFAQPages: number;
    avgSchemaTypes: number;
    avgDataPoints: number;
  };
}

interface IndustryBenchmarkProps {
  benchmark: IndustryBenchmarkData;
  userScores: {
    overall: number;
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
}

type CompareStatus = 'above' | 'at' | 'below';

function getCompareStatus(userScore: number, avgScore: number): CompareStatus {
  const diff = userScore - avgScore;
  if (diff > 3) return 'above';
  if (diff < -3) return 'below';
  return 'at';
}

function getStatusConfig(status: CompareStatus) {
  switch (status) {
    case 'above':
      return { color: 'text-emerald-700', bg: 'bg-emerald-500', icon: TrendingUp, label: 'Above Average' };
    case 'below':
      return { color: 'text-red-600', bg: 'bg-red-500', icon: TrendingDown, label: 'Below Average' };
    case 'at':
      return { color: 'text-yellow-600', bg: 'bg-yellow-500', icon: Minus, label: 'At Average' };
  }
}

function ComparisonBar({
  label,
  userScore,
  avgScore,
  topScore,
}: {
  label: string;
  userScore: number;
  avgScore: number;
  topScore: number;
}) {
  const maxVal = Math.max(userScore, avgScore, topScore, 1);
  const scale = 100 / maxVal;
  const status = getCompareStatus(userScore, avgScore);
  const config = getStatusConfig(status);
  const StatusIcon = config.icon;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`h-3.5 w-3.5 ${config.color}`} />
          <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-20 shrink-0">You ({userScore})</span>
          <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                status === 'above' ? 'bg-emerald-500' : status === 'below' ? 'bg-red-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${Math.max(userScore * scale, 2)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-20 shrink-0">Average ({avgScore})</span>
          <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-muted-foreground transition-all duration-700"
              style={{ width: `${Math.max(avgScore * scale, 2)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-20 shrink-0">Top 10% ({topScore})</span>
          <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/70 transition-all duration-700"
              style={{ width: `${Math.max(topScore * scale, 2)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IndustryBenchmark({ benchmark, userScores }: IndustryBenchmarkProps) {
  const overallStatus = getCompareStatus(userScores.overall, benchmark.averageScores.overall);
  const overallConfig = getStatusConfig(overallStatus);
  const OverallIcon = overallConfig.icon;

  const platforms: Array<{ key: 'chatgpt' | 'perplexity' | 'gemini' | 'claude'; label: string }> = [
    { key: 'chatgpt', label: 'ChatGPT' },
    { key: 'perplexity', label: 'Perplexity' },
    { key: 'gemini', label: 'Gemini' },
    { key: 'claude', label: 'Claude' },
  ];

  const aboveCount = platforms.filter(
    (p) => getCompareStatus(userScores[p.key], benchmark.averageScores[p.key]) === 'above'
  ).length;

  return (
    <Card className="bg-card border border-border shadow-lg fade-in-up">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold">How You Compare to {benchmark.industryName}</div>
              <div className="text-xs text-muted-foreground font-normal">{benchmark.sampleSize}</div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-xs ${
              overallStatus === 'above'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                : overallStatus === 'below'
                ? 'border-red-500/30 bg-red-500/10 text-red-600'
                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600'
            }`}
          >
            <OverallIcon className="h-3 w-3 mr-1" />
            {overallStatus === 'above'
              ? `Above average by ${userScores.overall - benchmark.averageScores.overall} pts`
              : overallStatus === 'below'
              ? `Below average by ${benchmark.averageScores.overall - userScores.overall} pts`
              : 'At industry average'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-foreground">{userScores.overall}</div>
            <div className="text-xs text-muted-foreground">Your Score</div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-muted-foreground">{benchmark.averageScores.overall}</div>
            <div className="text-xs text-muted-foreground">Industry Avg</div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3 relative">
            <Trophy className="h-3.5 w-3.5 text-yellow-600 absolute top-2 right-2" />
            <div className="text-2xl font-bold text-primary">{benchmark.topPerformerScores.overall}</div>
            <div className="text-xs text-muted-foreground">Top 10%</div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Platform-by-Platform Comparison</h4>
          {platforms.map((platform) => (
            <ComparisonBar
              key={platform.key}
              label={platform.label}
              userScore={userScores[platform.key]}
              avgScore={benchmark.averageScores[platform.key]}
              topScore={benchmark.topPerformerScores[platform.key]}
            />
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-muted/10 rounded-lg p-4 border border-border/50">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              What Top Performers Do Well
            </h5>
            <ul className="space-y-1.5">
              {benchmark.commonStrengths.map((strength, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-emerald-700 mt-0.5 shrink-0">&#10003;</span>
                  {strength}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-muted/10 rounded-lg p-4 border border-border/50">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Where Most Sites Fall Short
            </h5>
            <ul className="space-y-1.5">
              {benchmark.commonWeaknesses.map((weakness, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-red-600 mt-0.5 shrink-0">&#10007;</span>
                  {weakness}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 pt-2 border-t border-border/50">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <span className="font-medium text-muted-foreground/90">How we measure:</span> {benchmark.sampleSize}. Industry averages and top 10% scores are reference benchmarks derived from content signal analysis patterns across this sector. They are not sourced from a live dataset. Your scores are calculated using deterministic formulas based on your site's actual content signals.
            {aboveCount >= 3
              ? ' Your site outperforms the industry average on most platforms. Great work!'
              : aboveCount === 0
              ? ' There is significant room for improvement compared to industry peers.'
              : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
