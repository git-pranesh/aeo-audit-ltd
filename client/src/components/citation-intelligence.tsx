import { Quote, TrendingUp, Target, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface VisibilityPotential {
  overallPotential: string;
  platformAlignment: {
    chatgpt: string;
    perplexity: string;
    gemini: string;
    claude: string;
  };
}

interface CompetitorGaps {
  opportunityAreas: string[];
}

interface Disclaimers {
  note: string;
  searchVolumeNote: string;
}

interface CitationIntelligenceProps {
  visibilityPotential?: VisibilityPotential;
  competitorGaps?: CompetitorGaps;
  disclaimers?: Disclaimers;
  citationIntelligence?: any;
}

export default function CitationIntelligenceComponent({ 
  visibilityPotential, 
  competitorGaps, 
  disclaimers,
  citationIntelligence 
}: CitationIntelligenceProps) {
  
  if (visibilityPotential) {
    const potentialColor = visibilityPotential.overallPotential === 'High' 
      ? 'text-green-700' 
      : visibilityPotential.overallPotential === 'Medium' 
        ? 'text-yellow-600' 
        : 'text-red-600';

    const getAlignmentColor = (alignment: string) => {
      if (alignment === 'Strong') return 'bg-green-500/20 text-green-700';
      if (alignment === 'Moderate') return 'bg-yellow-500/20 text-yellow-600';
      return 'bg-red-500/20 text-red-600';
    };

    return (
      <section className="mb-8">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold mb-2">AI Visibility Potential</h2>
          <p className="text-muted-foreground">Your content alignment with AI platforms</p>
        </div>

        <Alert className="mb-6 bg-blue-500/10 border-blue-500/30">
          <Info className="h-4 w-4 text-blue-700" />
          <AlertDescription className="text-sm text-blue-700">
            {disclaimers?.note || "Scores indicate content alignment potential, not actual citation counts which cannot be measured."}
          </AlertDescription>
        </Alert>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card className="bg-card border border-border shadow-lg fade-in-up">
            <CardContent className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mr-3">
                  <Quote className="h-4 w-4 text-blue-700" />
                </div>
                <h3 className="text-lg font-semibold">Overall Potential</h3>
              </div>
              <div className="text-center">
                <div className={`text-4xl font-bold ${potentialColor} mb-2`}>
                  {visibilityPotential.overallPotential}
                </div>
                <div className="text-sm text-muted-foreground mb-4">Content Alignment Level</div>
                
                <div className="space-y-2">
                  {Object.entries(visibilityPotential.platformAlignment).map(([platform, alignment]) => (
                    <div key={platform} className="flex justify-between items-center text-xs">
                      <span className="capitalize">{platform}</span>
                      <span className={`px-2 py-1 rounded ${getAlignmentColor(alignment)}`}>
                        {alignment}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border shadow-lg fade-in-up">
            <CardContent className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gray-500/20 rounded-lg flex items-center justify-center mr-3">
                  <Target className="h-4 w-4 text-gray-500" />
                </div>
                <h3 className="text-lg font-semibold">Opportunities</h3>
              </div>
              <div className="space-y-3">
                {competitorGaps?.opportunityAreas?.slice(0, 5).map((opportunity, idx) => (
                  <div key={idx} className="flex items-start">
                    <div className="w-2 h-2 rounded-full bg-gray-500 mt-1.5 mr-2 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground line-clamp-2">{opportunity}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

      </section>
    );
  }

  if (!citationIntelligence) {
    return null;
  }

  const { currentCitationPresence, citationOpportunities } = citationIntelligence;

  return (
    <section className="mb-8">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold mb-2">AI Visibility Analysis</h2>
        <p className="text-muted-foreground">Content alignment potential with AI platforms</p>
      </div>

      <Alert className="mb-6 bg-yellow-500/10 border-yellow-500/30">
        <Info className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="text-sm text-yellow-700">
          Note: These scores indicate content alignment potential. Actual citation counts cannot be measured without querying millions of AI conversations.
        </AlertDescription>
      </Alert>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center mr-3">
                <TrendingUp className="h-4 w-4 text-green-700" />
              </div>
              <h3 className="text-lg font-semibold">Top Content Areas</h3>
            </div>
            <div className="space-y-3">
              {currentCitationPresence?.topCitedContent?.slice(0, 5).map((content: string, idx: number) => (
                <div key={idx} className="flex items-start">
                  <div className="w-2 h-2 rounded-full bg-green-600 mt-1.5 mr-2 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground line-clamp-2">{content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gray-500/20 rounded-lg flex items-center justify-center mr-3">
                <Target className="h-4 w-4 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold">Opportunities</h3>
            </div>
            <div className="space-y-3">
              {citationOpportunities?.slice(0, 5).map((opportunity: string, idx: number) => (
                <div key={idx} className="flex items-start">
                  <div className="w-2 h-2 rounded-full bg-gray-500 mt-1.5 mr-2 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground line-clamp-2">{opportunity}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
