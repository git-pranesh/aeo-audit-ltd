import { useState } from "react";
import { Search, Users, TrendingUp, Clock, ChevronDown, ChevronUp, Info, Target, Zap, Timer, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ContentTopic } from "@shared/schema";

interface EnhancedTopicCardProps {
  topic: ContentTopic;
  index: number;
}

export default function EnhancedTopicCard({ topic, index }: EnhancedTopicCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  const getCompetitionColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case 'low': return 'bg-green-500/20 text-green-700';
      case 'medium': return 'bg-yellow-500/20 text-yellow-600';
      case 'high': return 'bg-red-500/20 text-red-600';
      default: return 'bg-muted/30 text-muted-foreground';
    }
  };
  
  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'bg-green-500/20 text-green-700 border-green-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30';
      case 'hard': return 'bg-red-500/20 text-red-600 border-red-500/30';
      default: return 'bg-muted/30 text-muted-foreground border-muted';
    }
  };
  
  const getPriorityColor = (tier?: string) => {
    switch (tier) {
      case 'Quick Win': return 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30';
      case 'High Impact': return 'bg-blue-500/20 text-blue-700 border-blue-500/30';
      case 'Long-term': return 'bg-gray-500/20 text-gray-600 border-gray-500/30';
      default: return 'bg-muted/30 text-muted-foreground border-muted';
    }
  };
  
  const getPlatformColor = (platform?: string) => {
    switch (platform?.toLowerCase()) {
      case 'chatgpt': return 'bg-emerald-500/20 text-emerald-700';
      case 'perplexity': return 'bg-blue-500/20 text-blue-700';
      case 'gemini': return 'bg-amber-500/20 text-amber-700';
      case 'claude': return 'bg-orange-500/20 text-orange-700';
      default: return 'bg-primary/20 text-primary';
    }
  };

  return (
    <Card className="bg-card border border-border rounded-lg hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        {/* Header with Priority Tier Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 pr-2">
            <h4 className="text-sm font-medium text-foreground leading-tight">
              {topic.topic}
            </h4>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {topic.priorityTier && (
              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getPriorityColor(topic.priorityTier)}`}>
                {topic.priorityTier}
              </Badge>
            )}
            {topic.isBranded && (
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-violet-500/20 text-violet-400 border-violet-500/30">
                Branded
              </Badge>
            )}
          </div>
        </div>

        {/* Actionable Metrics Row */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          {topic.difficulty && (
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getDifficultyColor(topic.difficulty)}`}>
              {topic.difficulty}
            </Badge>
          )}
          {topic.timeEstimate && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Timer className="h-3 w-3" />
              <span>{topic.timeEstimate}</span>
            </div>
          )}
          {topic.targetPlatform && (
            <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${getPlatformColor(topic.targetPlatform)}`}>
              <Target className="h-2.5 w-2.5 mr-1" />
              {topic.targetPlatform}
            </Badge>
          )}
        </div>

        {/* Search Volume & Competition */}
        {(topic.searchVolume || topic.competitionLevel) && (
          <div className="flex items-center gap-2 mb-3 text-xs">
            {topic.searchVolume && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Search className="h-3 w-3" />
                <span>{topic.searchVolume}</span>
              </div>
            )}
            {topic.competitionLevel && (
              <Badge variant="secondary" className={`text-xs px-2 py-0.5 ${getCompetitionColor(topic.competitionLevel)}`}>
                {topic.competitionLevel} Competition
              </Badge>
            )}
          </div>
        )}

        {/* Justification */}
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {topic.justification}
        </p>

        {/* Platforms */}
        <div className="flex flex-wrap gap-1 mb-3">
          {topic.platforms.map((platform, idx) => (
            <span
              key={idx}
              className="px-2 py-1 bg-primary/20 text-primary text-xs rounded"
            >
              {platform}
            </span>
          ))}
        </div>

        {/* Citation Potential (if available) */}
        {topic.citationPotential && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 p-2 bg-muted/20 rounded">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>Opportunity: {topic.citationPotential.opportunityScore}/100</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{topic.citationPotential.timeToRank}</span>
            </div>
          </div>
        )}

        {/* Show Details Button */}
        {(topic.competitorGap || topic.currentAIResponse || topic.optimalContentStructure || topic.platformOptimization) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full text-xs h-6 mt-2"
          >
            <Info className="h-3 w-3 mr-1" />
            {showDetails ? 'Hide Details' : 'Show Details'}
            {showDetails ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
        )}

        {/* Expanded Details */}
        {showDetails && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {/* Competitor Gap */}
            {topic.competitorGap && (
              <div>
                <div className="text-xs font-medium text-foreground mb-1">Competitive Advantage</div>
                <div className="text-xs text-muted-foreground bg-green-50 p-2 rounded">
                  {topic.competitorGap}
                </div>
              </div>
            )}

            {/* Current AI Response */}
            {topic.currentAIResponse && (
              <div>
                <div className="text-xs font-medium text-foreground mb-1">Current AI Landscape</div>
                <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                  {topic.currentAIResponse}
                </div>
              </div>
            )}

            {/* Content Structure */}
            {topic.optimalContentStructure && (
              <div>
                <div className="text-xs font-medium text-foreground mb-2">Optimal Content Structure</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Format:</span>
                    <span className="text-foreground">{topic.optimalContentStructure.format}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Length:</span>
                    <span className="text-foreground">{topic.optimalContentStructure.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="text-foreground">{topic.optimalContentStructure.contentType}</span>
                  </div>
                  {topic.optimalContentStructure.sections.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Recommended Sections:</div>
                      <div className="flex flex-wrap gap-1">
                        {topic.optimalContentStructure.sections.map((section, idx) => (
                          <span key={idx} className="text-xs bg-muted/30 px-2 py-1 rounded">
                            {section}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Platform Optimization */}
            {topic.platformOptimization && (
              <div>
                <div className="text-xs font-medium text-foreground mb-2">Platform Optimization</div>
                <div className="space-y-2">
                  {Object.entries(topic.platformOptimization).map(([platform, optimization]) => (
                    <div key={platform} className="bg-muted/20 p-2 rounded">
                      <div className="text-xs font-medium text-primary mb-1 capitalize">{platform}</div>
                      <div className="text-xs text-muted-foreground">{optimization}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
