import { Building, Users, Target, Trophy, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CompanyIntelligence } from "@shared/schema";

interface CompanyIntelligenceProps {
  companyIntelligence: CompanyIntelligence;
  websiteUrl: string;
}

export default function CompanyIntelligenceComponent({ companyIntelligence, websiteUrl }: CompanyIntelligenceProps) {
  const domain = (() => { try { return new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname.replace('www.', ''); } catch { return websiteUrl; } })();

  return (
    <section className="mb-8">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold mb-2">Company Intelligence</h2>
        <p className="text-muted-foreground">Business context confirmed for {domain}</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Industry & Business Type */}
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mr-3">
                <Building className="h-4 w-4 text-blue-700" />
              </div>
              <h3 className="text-lg font-semibold">Business Profile</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Industry</div>
                <div className="text-sm font-medium text-foreground">{companyIntelligence.industry}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Business Type</div>
                <div className="text-sm font-medium text-foreground">{companyIntelligence.businessType}</div>
              </div>
              {companyIntelligence.businessModel && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Business Model</div>
                  <div className="text-sm font-medium text-foreground">{companyIntelligence.businessModel}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Target Audience */}
        <Card className="bg-card border border-border shadow-lg fade-in-up">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center mr-3">
                <Users className="h-4 w-4 text-green-700" />
              </div>
              <h3 className="text-lg font-semibold">Target Audience</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Primary Audience</div>
                <div className="text-sm font-medium text-foreground">{companyIntelligence.targetAudience}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Value Proposition</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{companyIntelligence.valueProposition}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Market Position */}
        <Card className="bg-card border border-border shadow-lg fade-in-up md:col-span-2 lg:col-span-1">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gray-500/20 rounded-lg flex items-center justify-center mr-3">
                <Trophy className="h-4 w-4 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold">Market Position</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Positioning</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{companyIntelligence.marketPosition}</div>
              </div>
              {companyIntelligence.geographicFocus && companyIntelligence.geographicFocus.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Geographic Focus</div>
                  <div className="flex flex-wrap gap-1">
                    {companyIntelligence.geographicFocus.map((region, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-gray-500/20 text-gray-600 text-xs rounded flex items-center gap-1"
                      >
                        <MapPin className="h-3 w-3" />
                        {region}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {companyIntelligence.serviceOfferings && companyIntelligence.serviceOfferings.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Service Offerings</div>
                  <div className="flex flex-wrap gap-1">
                    {companyIntelligence.serviceOfferings.map((service, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-muted/30 text-muted-foreground text-xs rounded"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
