import { useState, useEffect } from "react";
import { Save, RotateCcw, Eye, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

const DEFAULT_PROMPT = `Browse {WEBSITE_URL} and analyze competitors. Return this EXACT JSON structure:

{
  "companyIntelligence": {
    "industry": "detected industry",
    "businessType": "business model type",
    "targetAudience": "primary audience",
    "valueProposition": "key value proposition",
    "marketPosition": "market positioning"
  },
  "competitorAnalysis": {
    "mainCompetitors": ["competitor1.com", "competitor2.com", "competitor3.com"],
    "competitorStrengths": ["competitor strength 1", "competitor strength 2"],
    "competitorWeaknesses": ["competitor weakness 1", "competitor weakness 2"],
    "marketOpportunities": ["opportunity 1", "opportunity 2"]
  },
  "auditResults": {
    "overallScore": [number between 0-100],
    "letterGrade": "[A+, A, A-, B+, B, B-, C+, C, C-, D+, D, F]",
    "platformScores": {
      "chatgpt": [number between 0-100],
      "perplexity": [number between 0-100],
      "gemini": [number between 0-100],
      "claude": [number between 0-100]
    },
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
    "technicalFindings": {
      "domainAuthority": "[High/Medium/Low]",
      "contentStructure": "[Excellent/Good/Fair/Poor]",
      "schemaMarkup": "[Implemented/Partial/Missing]",
      "entityRecognition": "[Strong/Moderate/Weak]"
    }
  },
  "contentTopics": {
    "authoritative": [
      {
        "topic": "industry question",
        "confidence": [85-95],
        "justification": "reasoning",
        "platforms": ["chatgpt", "perplexity"],
        "searchVolume": "estimate",
        "competitionLevel": "Low/Medium/High",
        "competitorGap": "advantage"
      }
    ],
    "thoughtLeadership": [similar structure],
    "competitiveAdvantage": [similar structure],
    "emergingOpportunity": [similar structure]
  },
  "citationIntelligence": {
    "currentCitationPresence": {
      "totalCitations": [number],
      "platformBreakdown": {"chatgpt": 1, "perplexity": 2, "gemini": 1, "claude": 1},
      "topCitedContent": ["content"]
    },
    "competitorCitationAnalysis": {
      "competitorCitations": {"competitor1.com": 25},
      "citationGaps": ["gap"]
    },
    "citationOpportunities": ["opportunity"]
  },
  "marketContext": {
    "industryTrends": ["trend 1", "trend 2", "trend 3"]
  },
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}

Replace placeholders with real data from {WEBSITE_URL}. Include all sections.

Website: {WEBSITE_URL}`;

interface PromptDocument {
  prompt: string;
  lastUpdated: Timestamp;
  updatedBy: string;
  version: number;
}

export default function PromptManagement() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [originalPrompt, setOriginalPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [promptInfo, setPromptInfo] = useState<PromptDocument | null>(null);

  useEffect(() => {
    loadPrompt();
  }, []);

  useEffect(() => {
    setHasChanges(prompt !== originalPrompt);
  }, [prompt, originalPrompt]);

  const loadPrompt = async () => {
    setLoading(true);
    try {
      const promptRef = doc(db, 'system', 'masterPrompt');
      const promptDoc = await getDoc(promptRef);
      
      if (promptDoc.exists()) {
        const data = promptDoc.data() as PromptDocument;
        setPrompt(data.prompt);
        setOriginalPrompt(data.prompt);
        setPromptInfo(data);
      } else {
        // No custom prompt saved, use default
        setPrompt(DEFAULT_PROMPT);
        setOriginalPrompt(DEFAULT_PROMPT);
      }
    } catch (error) {
      console.error('Error loading prompt:', error);
      toast({
        title: "Error loading prompt",
        description: "Failed to load saved prompt. Using default.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const promptRef = doc(db, 'system', 'masterPrompt');
      const promptData: PromptDocument = {
        prompt: prompt,
        lastUpdated: Timestamp.now(),
        updatedBy: 'admin', // You could pass the admin user email here
        version: (promptInfo?.version || 0) + 1
      };
      
      await setDoc(promptRef, promptData);
      
      setOriginalPrompt(prompt);
      setPromptInfo(promptData);
      
      toast({
        title: "Prompt saved",
        description: "The AI master prompt has been updated successfully.",
      });
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast({
        title: "Save failed",
        description: "Failed to save prompt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset to the original prompt? Unsaved changes will be lost.')) {
      setPrompt(originalPrompt);
    }
  };

  const handleRestoreDefault = () => {
    if (confirm('Are you sure you want to restore the default prompt? This will replace your current prompt.')) {
      setPrompt(DEFAULT_PROMPT);
    }
  };

  const characterCount = prompt.length;
  const lineCount = prompt.split('\n').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI Master Prompt Management</CardTitle>
            <CardDescription className="mt-2">
              Edit the prompt used for generating AI readiness audits. Changes take effect immediately for new audits.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {promptInfo && (
              <Badge variant="secondary">
                Version {promptInfo.version}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning Alert */}
        <Alert className="bg-yellow-500/10 border-yellow-500/30">
          <AlertCircle className="h-4 w-4 text-yellow-400" />
          <AlertDescription className="text-yellow-400">
            <strong>Warning:</strong> Modifying the master prompt affects all new audits. Test thoroughly before saving changes.
          </AlertDescription>
        </Alert>

        {/* Prompt Info */}
        {promptInfo && (
          <div className="flex items-center justify-between text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
            <div>
              Last updated: {promptInfo.lastUpdated.toDate().toLocaleString()}
            </div>
            <div>
              {characterCount.toLocaleString()} characters · {lineCount} lines
            </div>
          </div>
        )}

        {/* Prompt Editor */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading prompt...</p>
          </div>
        ) : (
          <>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[500px] font-mono text-sm border-border focus:border-primary"
              style={{
                backgroundColor: 'rgb(39, 39, 42)',
                color: 'rgb(250, 250, 250)'
              }}
              placeholder="Enter AI master prompt..."
            />

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  onClick={handleRestoreDefault}
                  variant="outline"
                  size="sm"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore Default
                </Button>
                <Button
                  onClick={handleReset}
                  variant="outline"
                  size="sm"
                  disabled={!hasChanges}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Discard Changes
                </Button>
              </div>

              <Button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Prompt'}
              </Button>
            </div>

            {hasChanges && (
              <Alert className="bg-blue-500/10 border-blue-500/30">
                <AlertCircle className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-400">
                  You have unsaved changes. Click "Save Prompt" to apply them.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* Prompt Variables Guide */}
        <Card className="bg-muted/30 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Available Variables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <code className="px-2 py-1 bg-muted rounded text-xs">{'{WEBSITE_URL}'}</code>
              <span className="text-muted-foreground">Will be replaced with the actual website URL being analyzed</span>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              <strong>Note:</strong> The prompt must instruct the AI to return valid JSON matching the expected structure.
              Ensure all required fields are included in the response format.
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

