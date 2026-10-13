import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Loader2, Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TestSite {
  url: string;
  vertical: string;
  companyAge: string;
  status: "pending" | "running" | "success" | "error";
  result?: any;
  error?: string;
}

const TEST_SITES: Omit<TestSite, "status">[] = [
  { url: "hubspot.com", vertical: "SaaS/Marketing", companyAge: "18 years (2006)" },
  { url: "zappos.com", vertical: "E-commerce", companyAge: "25 years (1999)" },
  { url: "mayoclinic.org", vertical: "Healthcare", companyAge: "160+ years (1864)" },
  { url: "fidelity.com", vertical: "Finance", companyAge: "78 years (1946)" },
  { url: "khanacademy.org", vertical: "Education", companyAge: "18 years (2008)" },
  { url: "ogilvy.com", vertical: "Marketing Agency", companyAge: "76 years (1948)" },
  { url: "legalzoom.com", vertical: "Legal", companyAge: "23 years (2001)" },
  { url: "zillow.com", vertical: "Real Estate", companyAge: "20 years (2006)" },
  { url: "cat.com", vertical: "Manufacturing", companyAge: "99 years (1925)" },
  { url: "mckinsey.com", vertical: "Consulting", companyAge: "98 years (1926)" },
  { url: "notion.so", vertical: "SaaS/Productivity", companyAge: "3 years public (2021)" },
  { url: "allbirds.com", vertical: "E-commerce/DTC", companyAge: "9 years (2016)" },
  { url: "ro.co", vertical: "Healthcare/Telehealth", companyAge: "7 years (2017)" },
  { url: "stripe.com", vertical: "Finance/Fintech", companyAge: "15 years (2010)" },
  { url: "masterclass.com", vertical: "Education/EdTech", companyAge: "10 years (2015)" },
  { url: "webflow.com", vertical: "SaaS/Design", companyAge: "11 years (2013)" },
  { url: "clio.com", vertical: "Legal Tech", companyAge: "16 years (2008)" },
  { url: "opendoor.com", vertical: "Real Estate Tech", companyAge: "11 years (2014)" },
  { url: "protolabs.com", vertical: "Manufacturing Tech", companyAge: "25 years (1999)" },
  { url: "toptal.com", vertical: "Consulting/Freelance", companyAge: "14 years (2010)" },
];

export default function BatchTest() {
  const { user, loading } = useAuth();
  const [sites, setSites] = useState<TestSite[]>(
    TEST_SITES.map(s => ({ ...s, status: "pending" as const }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const completedCount = sites.filter(s => s.status === "success" || s.status === "error").length;
  const successCount = sites.filter(s => s.status === "success").length;
  const errorCount = sites.filter(s => s.status === "error").length;

  const runAudit = async (index: number) => {
    const site = sites[index];
    
    setSites(prev => prev.map((s, i) => 
      i === index ? { ...s, status: "running" } : s
    ));

    try {
      const result = await apiRequest("POST", "/api/audit/batch", {
        websiteUrl: `https://${site.url}`,
        topicsPerCategory: 3,
      });
      
      setSites(prev => prev.map((s, i) => 
        i === index ? { ...s, status: "success", result } : s
      ));
    } catch (error: any) {
      setSites(prev => prev.map((s, i) => 
        i === index ? { ...s, status: "error", error: error.message || "Unknown error" } : s
      ));
    }
  };

  const runAllAudits = async () => {
    if (!user) {
      alert("Please log in first!");
      return;
    }
    
    setIsRunning(true);
    
    for (let i = 0; i < sites.length; i++) {
      setCurrentIndex(i);
      await runAudit(i);
      if (i < sites.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    setCurrentIndex(-1);
    setIsRunning(false);
  };

  const runSingleAudit = async (index: number) => {
    if (!user) {
      alert("Please log in first!");
      return;
    }
    setCurrentIndex(index);
    await runAudit(index);
    setCurrentIndex(-1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-foreground">Please log in to run batch tests.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <Card className="bg-card border-border mb-6">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center justify-between">
              <span>Batch Audit Test - 10 Verticals x 2 Company Ages</span>
              <Button 
                onClick={runAllAudits} 
                disabled={isRunning}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running ({completedCount}/{sites.length})
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run All 20 Audits
                  </>
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-muted-foreground mb-2">Logged in as: <span className="text-foreground">{user.email}</span></p>
              <Progress value={(completedCount / sites.length) * 100} className="h-2" />
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-green-400">Success: {successCount}</span>
                <span className="text-red-400">Errors: {errorCount}</span>
                <span className="text-muted-foreground">Pending: {sites.length - completedCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {sites.map((site, index) => (
            <Card key={site.url} className={`bg-card border-border ${currentIndex === index ? 'ring-2 ring-blue-500' : ''}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-8 text-center">
                    {site.status === "pending" && <span className="text-muted-foreground">{index + 1}</span>}
                    {site.status === "running" && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                    {site.status === "success" && <CheckCircle className="h-5 w-5 text-green-500" />}
                    {site.status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
                  </div>
                  <div>
                    <p className="text-foreground font-medium">{site.url}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs border-border text-foreground">{site.vertical}</Badge>
                      <Badge variant="outline" className="text-xs border-border text-foreground">{site.companyAge}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {site.status === "success" && site.result && (
                    <div className="text-right">
                      <p className="text-green-400 font-bold">
                        Score: {site.result.auditData?.auditResults?.overallScore || site.result.auditResults?.overallScore || "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Grade: {site.result.auditData?.auditResults?.letterGrade || site.result.auditResults?.letterGrade || "N/A"}
                      </p>
                    </div>
                  )}
                  {site.status === "error" && (
                    <p className="text-red-400 text-sm max-w-xs truncate">{site.error}</p>
                  )}
                  {site.status === "pending" && !isRunning && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => runSingleAudit(index)}
                      className="border-border text-foreground hover:bg-muted"
                    >
                      Run
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {completedCount === sites.length && (
          <Card className="bg-card border-border mt-6">
            <CardHeader>
              <CardTitle className="text-foreground">Test Results Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-foreground">{successCount}</p>
                  <p className="text-muted-foreground">Successful</p>
                </div>
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-red-400">{errorCount}</p>
                  <p className="text-muted-foreground">Errors</p>
                </div>
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-blue-400">
                    {Math.round(sites.filter(s => s.status === "success" && (s.result?.auditData?.auditResults?.overallScore || s.result?.auditResults?.overallScore))
                      .reduce((sum, s) => sum + (s.result?.auditData?.auditResults?.overallScore || s.result?.auditResults?.overallScore || 0), 0) / 
                      Math.max(1, sites.filter(s => s.status === "success" && (s.result?.auditData?.auditResults?.overallScore || s.result?.auditResults?.overallScore)).length)) || 0}
                  </p>
                  <p className="text-muted-foreground">Avg Score</p>
                </div>
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-400">20</p>
                  <p className="text-muted-foreground">Verticals Tested</p>
                </div>
              </div>
              <p className="text-muted-foreground mt-4 text-center">
                All results are now visible in your Dashboard!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
