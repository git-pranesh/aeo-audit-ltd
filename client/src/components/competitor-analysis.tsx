import { TrendingUp, TrendingDown, Target, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CompetitorAnalysis } from "@shared/schema";

interface CompetitorAnalysisProps {
  competitorAnalysis: CompetitorAnalysis;
}

export default function CompetitorAnalysisComponent({ competitorAnalysis }: CompetitorAnalysisProps) {
  return (
    <section className="mb-8">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold mb-2">Competitive Landscape</h2>
        <p className="text-muted-foreground">Auto-discovered competitors and market analysis</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Main Competitors */}
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center mr-3">
                <Target className="h-4 w-4 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold">Main Competitors</h3>
            </div>
            <div className="space-y-3">
              {competitorAnalysis.mainCompetitors.map((competitor, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-red-500/20 rounded flex items-center justify-center text-xs font-semibold text-red-400">
                      {index + 1}
                    </div>
                    <span className="text-sm font-medium text-foreground">{competitor}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => window.open(`https://${competitor}`, '_blank')}
                    className="h-6 w-6 p-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Market Opportunities */}
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center mr-3">
                <TrendingUp className="h-4 w-4 text-green-700" />
              </div>
              <h3 className="text-lg font-semibold">Market Opportunities</h3>
            </div>
            <div className="space-y-3">
              {competitorAnalysis.marketOpportunities.map((opportunity, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{opportunity}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strengths vs Weaknesses */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Competitor Strengths */}
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center mr-3">
                <TrendingUp className="h-4 w-4 text-orange-700" />
              </div>
              <h3 className="text-lg font-semibold">Competitor Strengths</h3>
            </div>
            <div className="space-y-3">
              {competitorAnalysis.competitorStrengths.map((strength, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-orange-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{strength}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Competitor Weaknesses */}
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mr-3">
                <TrendingDown className="h-4 w-4 text-blue-700" />
              </div>
              <h3 className="text-lg font-semibold">Competitor Weaknesses</h3>
            </div>
            <div className="space-y-3">
              {competitorAnalysis.competitorWeaknesses.map((weakness, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{weakness}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Competitive Advantages (if available) */}
      {competitorAnalysis.competitiveAdvantages && competitorAnalysis.competitiveAdvantages.length > 0 && (
        <Card className="bg-card border border-border shadow-lg fade-in-up mt-6">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gray-500/20 rounded-lg flex items-center justify-center mr-3">
                <Target className="h-4 w-4 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold">Your Competitive Advantages</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {competitorAnalysis.competitiveAdvantages.map((advantage, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-gray-500/10 rounded-lg">
                  <div className="w-2 h-2 bg-gray-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-foreground leading-relaxed">{advantage}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
