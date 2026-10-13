import { Lightbulb, Clock, Zap, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EnhancedRecommendation } from "@shared/schema";

interface EnhancedRecommendationsProps {
  recommendations: EnhancedRecommendation[];
}

export default function EnhancedRecommendationsComponent({ recommendations }: EnhancedRecommendationsProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-500/20 text-red-700 border-red-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30';
      case 'low': return 'bg-green-500/20 text-green-700 border-green-500/30';
      default: return 'bg-muted/30 text-muted-foreground border-border';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return <AlertCircle className="h-3 w-3" />;
      case 'medium': return <Clock className="h-3 w-3" />;
      case 'low': return <Zap className="h-3 w-3" />;
      default: return <Lightbulb className="h-3 w-3" />;
    }
  };

  const getEffortColor = (effort?: string) => {
    switch (effort?.toLowerCase()) {
      case 'high': return 'text-red-700';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-700';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Card className="bg-card border border-border shadow-lg fade-in-up">
      <CardContent className="p-8">
        <div className="flex items-center mb-6">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center mr-4">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Enhanced Recommendations</h2>
            <p className="text-muted-foreground">Prioritized actions with implementation guidance</p>
          </div>
        </div>
        
        <div className="space-y-6">
          {recommendations.map((recommendation, index) => (
            <div
              key={index}
              className="border border-border rounded-lg p-6 bg-muted/10"
              data-testid={`enhanced-recommendation-${index}`}
            >
              {/* Header with Priority and Category */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-xs px-2 py-1 ${getPriorityColor(recommendation.priority)}`}>
                        {getPriorityIcon(recommendation.priority)}
                        <span className="ml-1">{recommendation.priority} Priority</span>
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {recommendation.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Recommendation */}
              <div className="mb-4">
                <p className="text-sm text-foreground leading-relaxed font-medium">
                  {recommendation.recommendation}
                </p>
              </div>

              {/* Implementation Details */}
              {recommendation.implementation && (
                <div className="bg-muted/30 rounded-lg p-4 mb-4">
                  <div className="text-xs font-medium text-foreground mb-3">Implementation Details</div>
                  
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">Timeframe</div>
                      <div className="text-sm font-medium text-foreground">{recommendation.implementation.timeframe}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">Effort Required</div>
                      <div className={`text-sm font-medium ${getEffortColor(recommendation.implementation.effort)}`}>
                        {recommendation.implementation.effort}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">Expected Impact</div>
                      <div className="text-sm font-medium text-green-700">{recommendation.implementation.expectedImpact}</div>
                    </div>
                  </div>

                  {/* Specific Actions */}
                  {recommendation.implementation.specificActions.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-foreground mb-2">Action Items:</div>
                      <div className="space-y-1">
                        {recommendation.implementation.specificActions.map((action, actionIdx) => (
                          <div key={actionIdx} className="flex items-start space-x-2 text-xs">
                            <div className="w-1 h-1 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                            <span className="text-muted-foreground leading-relaxed">{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Competitive Advantage */}
              {recommendation.competitiveAdvantage && (
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-green-700 mb-1">Competitive Advantage</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {recommendation.competitiveAdvantage}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
