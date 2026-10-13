import { useState } from "react";
import { Search, CheckCircle, XCircle, Trophy, TrendingUp, ChevronDown, Eye, Lock, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import UpgradePromptCard from "./upgrade-prompt-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { AuditData } from "@shared/schema";

type CitationSnapshotData = NonNullable<AuditData["citationSnapshot"]>;

interface CitationSnapshotProps {
  citationSnapshot: AuditData["citationSnapshot"];
  competitorLimit?: number;
  lastCheckedAt?: string | null;
  monitoringFrequency?: string;
}

function getMentionColor(rate: number): string {
  if (rate === 0) return "text-red-500";
  if (rate <= 25) return "text-yellow-500";
  return "text-green-500";
}

function getMentionBg(rate: number): string {
  if (rate === 0) return "bg-red-500/10 border-red-500/20";
  if (rate <= 25) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-green-500/10 border-green-500/20";
}

function getMentionBadgeVariant(rate: number): string {
  if (rate === 0) return "bg-red-500/20 text-red-700 border-red-500/30";
  if (rate <= 25) return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";
  return "bg-green-500/20 text-green-700 border-green-500/30";
}

function getActionCallout(rate: number): { text: string; icon: React.ReactNode } {
  if (rate === 0) {
    return {
      text: "AI platforms don't know about you yet. Your AI Readiness playbook below shows exactly what to fix.",
      icon: <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />,
    };
  }
  if (rate <= 25) {
    return {
      text: "You're starting to appear, but competitors are dominating. Follow the playbook to close the gap.",
      icon: <TrendingUp className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />,
    };
  }
  return {
    text: "You're being mentioned! Focus on the playbook to increase your frequency and ranking.",
    icon: <CheckCircle className="h-5 w-5 text-green-700 shrink-0 mt-0.5" />,
  };
}

function FullResponseToggle({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Eye className="h-3 w-3" />
        <span>{expanded ? "Hide" : "Show"} full AI response</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border/50 max-h-48 overflow-y-auto">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {text}
          </p>
        </div>
      )}
    </div>
  );
}

export default function CitationSnapshot({ citationSnapshot, competitorLimit, lastCheckedAt, monitoringFrequency }: CitationSnapshotProps) {
  if (!citationSnapshot) {
    return (
      <Card className="border-border/50 bg-muted/30">
        <CardContent className="py-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm">Citation snapshot unavailable for this audit</p>
        </CardContent>
      </Card>
    );
  }

  const { mentionRate, mentionedCount, totalPromptsChecked, promptResults, topCompetitorsCited } = citationSnapshot;
  const actionCallout = getActionCallout(mentionRate);
  const effectiveLimit = (competitorLimit === undefined || competitorLimit >= 999) ? topCompetitorsCited.length : competitorLimit;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">AI Citation Snapshot</h2>
        <p className="text-muted-foreground">We asked AI platforms real questions about your industry. Here's whether they mentioned you.</p>
        {lastCheckedAt && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last checked: {new Date(lastCheckedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(lastCheckedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {monitoringFrequency && monitoringFrequency !== 'none' && (() => {
              const days = monitoringFrequency === 'daily' ? 1 : monitoringFrequency === 'weekly' ? 7 : 30;
              const nextCheck = new Date(new Date(lastCheckedAt).getTime() + days * 24 * 60 * 60 * 1000);
              const daysUntil = Math.max(0, Math.ceil((nextCheck.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              return (
                <span>
                  · Next check: {daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}
                </span>
              );
            })()}
            {(!monitoringFrequency || monitoringFrequency === 'none') && (
              <span>· <a href="/pricing" className="text-primary hover:underline">Upgrade for automatic monitoring</a></span>
            )}
          </div>
        )}
      </div>

      <Card className={`border ${getMentionBg(mentionRate)}`}>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="text-center">
              <div className={`text-5xl font-bold ${getMentionColor(mentionRate)}`}>
                {mentionRate}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Mentioned in <span className="font-semibold text-foreground">{mentionedCount}</span> out of <span className="font-semibold text-foreground">{totalPromptsChecked}</span> prompts
              </p>
            </div>
            <Badge className={`text-sm px-3 py-1 ${getMentionBadgeVariant(mentionRate)}`}>
              {mentionRate === 0 ? "Not Found" : mentionRate <= 25 ? "Low Visibility" : "Visible"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className={`flex gap-3 items-start p-4 rounded-lg border ${getMentionBg(mentionRate)}`}>
            {actionCallout.icon}
            <p className="text-sm">{actionCallout.text}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Prompt-by-Prompt Results
          </h3>
          <p className="text-sm text-muted-foreground">Click each prompt to see details</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Accordion type="multiple" className="w-full">
            {promptResults.map((result, index) => (
              <AccordionItem key={index} value={`prompt-${index}`} className="border-border/50">
                <AccordionTrigger className="hover:no-underline py-3 gap-3">
                  <div className="flex items-start gap-3 text-left flex-1 min-w-0">
                    {result.mentioned ? (
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm break-words whitespace-normal">"{result.prompt}"</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pl-8">
                    {result.mentioned && result.mentionContext && (
                      <div className="p-3 rounded-md bg-green-50 border border-green-500/20">
                        <p className="text-xs font-medium text-green-700 mb-1">You were mentioned:</p>
                        <p className="text-sm italic text-foreground/80 break-words">
                          "{result.mentionContext.length > 250
                            ? result.mentionContext.slice(0, 250) + '…'
                            : result.mentionContext}"
                        </p>
                      </div>
                    )}

                    {result.competitorsMentioned.length > 0 && (
                      <div className={`p-3 rounded-md border ${result.mentioned ? 'bg-muted/30 border-border/50' : 'bg-red-500/5 border-red-500/10'}`}>
                        <p className={`text-xs font-medium mb-2 ${result.mentioned ? 'text-muted-foreground' : 'text-red-400'}`}>
                          {result.mentioned ? 'Also mentioned:' : 'Competitors mentioned instead:'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.competitorsMentioned.map((comp, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-background/50">
                              {comp}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.fullResponse && (
                      <FullResponseToggle text={result.fullResponse} />
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {competitorLimit === 0 ? (
        topCompetitorsCited.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Top Competitors Mentioned by AI
              </h3>
              <p className="text-sm text-muted-foreground">These businesses appeared most often across all prompts</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right">1.</span>
                    <span className="text-sm font-medium">{topCompetitorsCited[0].name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {topCompetitorsCited[0].timesFound}/{totalPromptsChecked} prompts
                  </Badge>
                </div>
                {topCompetitorsCited.length > 1 && (
                  <div className="space-y-2 opacity-40 pointer-events-none select-none blur-[2px]">
                    {topCompetitorsCited.slice(1, 3).map((competitor, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-muted-foreground w-6 text-right">{index + 2}.</span>
                          <span className="text-sm font-medium">{competitor.name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {competitor.timesFound}/{totalPromptsChecked} prompts
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <UpgradePromptCard
                    targetPlan="starter"
                    headline={`See all ${topCompetitorsCited.length} competitors AI platforms cite`}
                    benefits={[
                      "Track which brands AI recommends over yours",
                      "Monitor competitor mention frequency"
                    ]}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <UpgradePromptCard
            targetPlan="starter"
            headline="See competitors AI platforms cite in your industry"
            benefits={[
              "Track which brands AI recommends over yours",
              "Monitor competitor mention frequency",
              "Identify content gaps to fill"
            ]}
          />
        )
      ) : topCompetitorsCited.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top Competitors Mentioned by AI
            </h3>
            <p className="text-sm text-muted-foreground">These businesses appeared most often across all prompts</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {topCompetitorsCited.slice(0, effectiveLimit).map((competitor, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right">
                      {index + 1}.
                    </span>
                    <span className="text-sm font-medium">{competitor.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {competitor.timesFound}/{totalPromptsChecked} prompts
                  </Badge>
                </div>
              ))}
              {competitorLimit !== undefined && competitorLimit < 999 && topCompetitorsCited.length > competitorLimit && (
                <div className="mt-3">
                  <UpgradePromptCard
                    targetPlan="pro"
                    headline={`See all ${topCompetitorsCited.length} competitors detected`}
                    compact
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
