import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Zap, Lock, TrendingUp, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import UpgradePromptCard from "./upgrade-prompt-card";

interface ChecklistItem {
  actionId: string;
  title: string;
  priority: string;
  targetPlatform: string;
  estimatedImpact: string;
  difficulty: string;
  completed: boolean;
  completedAt: string | null;
}

interface QuickWinsChecklistProps {
  auditId: string;
  playbook?: any;
}

export default function QuickWinsChecklist({ auditId, playbook }: QuickWinsChecklistProps) {
  const { user } = useAuth();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [totalActions, setTotalActions] = useState(0);
  const [gated, setGated] = useState(false);
  const [gatedLimit, setGatedLimit] = useState(3);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (auditId && user) {
      loadChecklist();
    }
  }, [auditId, user]);

  const loadChecklist = async () => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`/api/audit/${auditId}/checklist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setChecklist(data.checklist);
        setTotalActions(data.totalActions);
        setGated(data.gated);
        setGatedLimit(data.gatedLimit);
      }
    } catch (err) {
      console.error("Failed to load checklist:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = async (actionId: string, currentState: boolean) => {
    if (!user) return;
    setToggling(actionId);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/audit/${auditId}/checklist/${actionId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ completed: !currentState }),
      });
      const data = await response.json();
      if (data.success) {
        setChecklist((prev) =>
          prev.map((item) =>
            item.actionId === actionId
              ? { ...item, completed: !currentState, completedAt: !currentState ? new Date().toISOString() : null }
              : item
          )
        );
      }
    } catch (err) {
      console.error("Failed to toggle checklist item:", err);
    } finally {
      setToggling(null);
    }
  };

  const completedCount = checklist.filter((item) => item.completed).length;
  const progressPercent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-500/20 text-red-700 border-red-500/30";
      case "high": return "bg-orange-500/20 text-orange-700 border-orange-500/30";
      case "medium": return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";
      case "low": return "bg-green-500/20 text-green-700 border-green-500/30";
      default: return "bg-muted/30 text-muted-foreground border-border";
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case "chatgpt": return "bg-emerald-500/20 text-emerald-700";
      case "perplexity": return "bg-blue-500/20 text-blue-700";
      case "gemini": return "bg-blue-500/20 text-blue-700";
      case "claude": return "bg-amber-500/20 text-amber-700";
      default: return "bg-muted/20 text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border border-border shadow-lg">
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
            <span className="text-muted-foreground">Loading your action plan...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (checklist.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border border-border shadow-lg fade-in-up">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <Zap className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Quick-Wins Checklist</h2>
              <p className="text-muted-foreground text-sm">Track your progress — check off actions as you complete them</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-emerald-700">{completedCount}</span>
            <span className="text-muted-foreground">/{checklist.length}</span>
            <p className="text-xs text-muted-foreground mt-1">completed</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Progress</span>
            <span className="text-sm font-medium text-emerald-700">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {checklist.map((item) => (
          <div
            key={item.actionId}
            className={`flex items-start gap-4 p-4 rounded-lg border transition-all cursor-pointer ${
              item.completed
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-muted/10 border-border hover:border-primary/30 hover:bg-muted/20"
            }`}
            onClick={() => toggleItem(item.actionId, item.completed)}
          >
            <div className="mt-0.5 flex-shrink-0">
              {toggling === item.actionId ? (
                <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
              ) : item.completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.title}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline" className={`text-xs ${getPriorityColor(item.priority)}`}>
                  {item.priority}
                </Badge>
                <Badge variant="outline" className={`text-xs ${getPlatformColor(item.targetPlatform)}`}>
                  {item.targetPlatform}
                </Badge>
                {item.difficulty && (
                  <Badge variant="outline" className="text-xs">
                    {item.difficulty}
                  </Badge>
                )}
              </div>
              {item.estimatedImpact && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {item.estimatedImpact}
                </p>
              )}
            </div>
          </div>
        ))}

        {gated && totalActions > gatedLimit && (
          <UpgradePromptCard
            targetPlan="starter"
            headline={`Get all ${totalActions} actionable improvements`}
            benefits={[
              "Full action plan with step-by-step guidance",
              "Track completion progress over time"
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
