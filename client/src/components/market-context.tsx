import { TrendingUp, Calendar, DollarSign, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MarketContext } from "@shared/schema";

interface MarketContextProps {
  marketContext: MarketContext;
}

export default function MarketContextComponent({ marketContext }: MarketContextProps) {
  return (
    <section className="mb-8">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold mb-2">Market Context</h2>
        <p className="text-muted-foreground">Industry trends and market intelligence</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Industry Trends */}
        <Card className="bg-card border border-border shadow-lg fade-in-up lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mr-3">
                <TrendingUp className="h-4 w-4 text-blue-700" />
              </div>
              <h3 className="text-lg font-semibold">Industry Trends</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {marketContext.industryTrends.map((trend, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-blue-500/10 rounded-lg">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-foreground leading-relaxed">{trend}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Market Size (if available) */}
        {marketContext.marketSize && (
          <Card className="bg-card border border-border shadow-lg fade-in-up">
            <CardContent className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center mr-3">
                  <DollarSign className="h-4 w-4 text-green-700" />
                </div>
                <h3 className="text-lg font-semibold">Market Size</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Global Market</div>
                  <div className="text-sm font-medium text-foreground">{marketContext.marketSize.globalMarket}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Growth Rate</div>
                  <div className="text-sm font-medium text-green-700">{marketContext.marketSize.marketGrowth}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Target Segment</div>
                  <div className="text-sm font-medium text-foreground">{marketContext.marketSize.targetMarketSize}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Seasonal Factors (if available) */}
      {marketContext.seasonalFactors && (
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gray-500/20 rounded-lg flex items-center justify-center mr-3">
                <Calendar className="h-4 w-4 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold">Seasonal Intelligence</h3>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gray-500/10 rounded-lg">
                <div className="flex items-center justify-center mb-2">
                  <Calendar className="h-5 w-5 text-gray-500" />
                </div>
                <div className="text-xs text-muted-foreground mb-1">Peak Season</div>
                <div className="text-sm font-medium text-foreground">{marketContext.seasonalFactors.peakSeason}</div>
              </div>
              
              <div className="text-center p-4 bg-gray-500/10 rounded-lg">
                <div className="flex items-center justify-center mb-2">
                  <Clock className="h-5 w-5 text-gray-500" />
                </div>
                <div className="text-xs text-muted-foreground mb-1">Content Timing</div>
                <div className="text-sm font-medium text-foreground">{marketContext.seasonalFactors.contentTiming}</div>
              </div>
              
              <div className="text-center p-4 bg-gray-500/10 rounded-lg">
                <div className="flex items-center justify-center mb-2">
                  <TrendingUp className="h-5 w-5 text-gray-500" />
                </div>
                <div className="text-xs text-muted-foreground mb-1">Search Trends</div>
                <div className="text-sm font-medium text-foreground">{marketContext.seasonalFactors.searchTrends}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
