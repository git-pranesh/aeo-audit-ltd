import { useState } from "react";
import {
  Zap, Clock, Target, Copy, Check, Code, FileText,
  Rocket, ChevronDown, Lock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { MethodologyBanner } from "./methodology-tooltip";

interface PlaybookAction {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  targetPlatform: string;
  estimatedImpact: string;
  timeToImplement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  currentState: string;
  targetState: string;
  stepByStep: string[];
  codeSnippet?: {
    language: string;
    code: string;
    description: string;
  };
  contentTemplate?: {
    title: string;
    outline: string[];
    tips: string[];
  };
}

interface PlaybookResult {
  actions: PlaybookAction[];
  quickWins: PlaybookAction[];
  estimatedScoreImprovement: {
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
    overall: number;
  };
}

interface FixItPlaybookProps {
  playbook: PlaybookResult;
}

const priorityConfig: Record<string, { bg: string; text: string; border: string; label: string; dot: string }> = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-700', border: 'border-red-500/30', label: 'Critical', dot: 'bg-red-500' },
  high: { bg: 'bg-orange-500/15', text: 'text-orange-700', border: 'border-orange-500/30', label: 'High', dot: 'bg-orange-500' },
  medium: { bg: 'bg-blue-500/15', text: 'text-blue-700', border: 'border-blue-500/30', label: 'Medium', dot: 'bg-blue-500' },
  low: { bg: 'bg-gray-500/15', text: 'text-gray-600', border: 'border-gray-500/30', label: 'Low', dot: 'bg-gray-500' },
};

const difficultyConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  easy: { variant: 'default', label: 'Easy' },
  medium: { variant: 'secondary', label: 'Medium' },
  hard: { variant: 'destructive', label: 'Hard' },
};

const platformConfig: Record<string, { label: string; color: string }> = {
  chatgpt: { label: 'ChatGPT', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  perplexity: { label: 'Perplexity', color: 'bg-cyan-500/15 text-cyan-700 border-cyan-500/30' },
  gemini: { label: 'Gemini', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  claude: { label: 'Claude', color: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  all: { label: 'All Platforms', color: 'bg-gray-500/15 text-gray-700 border-gray-500/30' },
};

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({ title: "Copied to clipboard", description: "Code snippet copied successfully." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please select and copy manually.", variant: "destructive" });
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}


function ActionCard({ action }: { action: PlaybookAction }) {
  const priority = priorityConfig[action.priority] || priorityConfig.medium;
  const difficulty = difficultyConfig[action.difficulty] || difficultyConfig.medium;
  const platform = platformConfig[action.targetPlatform] || platformConfig.all;

  return (
    <AccordionItem value={action.id} className={`border ${priority.border} rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden`}>
      <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180">
        <div className="flex-1 text-left space-y-2 pr-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] font-semibold ${priority.bg} ${priority.text} border-0`}>
              {priority.label}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${platform.color} border`}>
              {platform.label}
            </Badge>
            <Badge variant={difficulty.variant} className="text-[10px]">
              {difficulty.label}
            </Badge>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {action.timeToImplement}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-foreground leading-snug">{action.title}</h4>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">You have: <span className="text-foreground/70">{action.currentState}</span></span>
            <span className="text-primary font-bold">&rarr;</span>
            <span className="text-muted-foreground">You need: <span className="text-primary">{action.targetState}</span></span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5 space-y-5 border-t border-border pt-4">
        <div>
          <h5 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Step-by-Step Instructions
          </h5>
          <ol className="space-y-2.5">
            {action.stepByStep.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {action.codeSnippet && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Code className="h-4 w-4 text-emerald-700" />
                Code Snippet
                <span className="text-xs text-muted-foreground font-normal">({action.codeSnippet.language})</span>
              </h5>
              <CopyButton code={action.codeSnippet.code} />
            </div>
            <p className="text-xs text-muted-foreground mb-2">{action.codeSnippet.description}</p>
            <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-xs text-foreground leading-relaxed">
              <code>{action.codeSnippet.code}</code>
            </pre>
          </div>
        )}

        {action.contentTemplate && (
          <div>
            <h5 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-700" />
              Content Template
            </h5>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Title</span>
                <p className="text-sm text-foreground mt-0.5 font-medium">{action.contentTemplate.title}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Outline</span>
                <ol className="mt-1 space-y-1">
                  {action.contentTemplate.outline.map((section, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary/60 font-semibold">{i + 1}.</span>
                      {section}
                    </li>
                  ))}
                </ol>
              </div>
              {action.contentTemplate.tips.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Writing Tips</span>
                  <ul className="mt-1 space-y-1">
                    {action.contentTemplate.tips.map((tip, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-yellow-600">&#9679;</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function FixItPlaybook({ playbook }: FixItPlaybookProps) {
  const [showAll, setShowAll] = useState(false);
  const hasQuickWins = playbook.quickWins.length > 0;
  const maxVisible = showAll ? playbook.actions.length : 4;
  const displayActions = playbook.actions.slice(0, maxVisible);

  if (playbook.actions.length === 0) return null;

  return (
    <div className="space-y-6 fade-in-up">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Rocket className="h-7 w-7 text-primary" />
          <h2 className="text-3xl font-bold">Your AI Readiness Playbook</h2>
        </div>
        <p className="text-sm text-muted-foreground">Actions ranked by priority, with steps, time estimates and code</p>
      </div>

      {hasQuickWins && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <Zap className="h-4 w-4 text-emerald-700" />
              </div>
              <span className="text-emerald-700">Quick Wins</span>
              <span className="text-xs text-muted-foreground font-normal ml-1">Easy changes with the biggest impact</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Accordion type="multiple" className="space-y-3">
              {playbook.quickWins.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {hasQuickWins && (
          <h3 className="text-lg font-semibold flex items-center gap-2">
            All Actions
            <Badge variant="secondary" className="text-xs">{playbook.actions.length}</Badge>
          </h3>
        )}
        <Accordion type="multiple" className="space-y-3">
          {displayActions.map((action, index) => (
            <div key={action.id} className="relative">
              <ActionCard action={action} />
            </div>
          ))}
        </Accordion>
        {playbook.actions.length > 4 && (
          <div className="text-center pt-2">
            <Button variant="secondary" onClick={() => setShowAll(!showAll)} className="gap-2">
              {showAll ? 'Show Less' : `Show All ${playbook.actions.length} Actions`}
              <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        )}
      </div>

      <MethodologyBanner className="px-1" />

    </div>
  );
}
