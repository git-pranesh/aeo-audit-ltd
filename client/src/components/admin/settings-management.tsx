import { useState, useEffect } from "react";
import { Save, Settings, Zap, Crown, Building2, Sparkles, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

interface PlanConfig {
  auditsPerMonth: number;
  topicsPerCategory: number;
  price: number;
  features: string[];
}

interface PlanSettings {
  free: PlanConfig;
  starter: PlanConfig;
  pro: PlanConfig;
  enterprise: PlanConfig;
  lifetime: PlanConfig;
  lastUpdated?: Timestamp;
}

const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  free: {
    auditsPerMonth: 1,
    topicsPerCategory: 3,
    price: 0,
    features: [
      '1 audit per month',
      '3 topics per category',
      'Basic audit results',
      'PDF export',
      'Platform scores (ChatGPT, Perplexity, Gemini, Claude)'
    ]
  },
  starter: {
    auditsPerMonth: 10,
    topicsPerCategory: 12,
    price: 49,
    features: [
      '10 audits per month',
      '12 topics per category',
      'Enhanced audit results',
      'PDF & CSV export',
      'All platform scores',
      'Competitor analysis',
      'Citation intelligence',
      'Email support'
    ]
  },
  pro: {
    auditsPerMonth: -1, // unlimited
    topicsPerCategory: 25,
    price: 149,
    features: [
      'Unlimited audits',
      '25 topics per category',
      'Full audit results',
      'PDF & CSV export',
      'All platform scores',
      'Competitor analysis',
      'Citation intelligence',
      'Market context & trends',
      'Priority support',
      'API access'
    ]
  },
  enterprise: {
    auditsPerMonth: -1,
    topicsPerCategory: 100,
    price: 299,
    features: [
      'Unlimited audits',
      '100 topics per category',
      'Full audit results',
      'PDF & CSV export',
      'All platform scores',
      'Complete intelligence suite',
      'White-label reports',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee'
    ]
  },
  lifetime: {
    auditsPerMonth: -1,
    topicsPerCategory: 100,
    price: 0,
    features: [
      'Unlimited audits',
      '100 topics per category',
      'Full audit results',
      'PDF & CSV export',
      'All platform scores',
      'Complete intelligence suite',
      'White-label reports',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee'
    ]
  }
};

export default function SettingsManagement() {
  const { toast } = useToast();
  const [planSettings, setPlanSettings] = useState<PlanSettings>(DEFAULT_PLAN_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<PlanSettings>(DEFAULT_PLAN_SETTINGS);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setHasChanges(JSON.stringify(planSettings) !== JSON.stringify(originalSettings));
  }, [planSettings, originalSettings]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settingsRef = doc(db, 'system', 'planSettings');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as PlanSettings;
        setPlanSettings(data);
        setOriginalSettings(data);
      } else {
        setPlanSettings(DEFAULT_PLAN_SETTINGS);
        setOriginalSettings(DEFAULT_PLAN_SETTINGS);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Error loading settings",
        description: "Failed to load plan settings. Using defaults.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Step 1: Save to Firestore
      const settingsRef = doc(db, 'system', 'planSettings');
      const settingsData = {
        ...planSettings,
        lastUpdated: Timestamp.now()
      };
      
      await setDoc(settingsRef, settingsData);
      
      setOriginalSettings(planSettings);
      
      toast({
        title: "✅ Saved to database",
        description: "Syncing prices to DODO payment system...",
      });

      // Step 2: Sync pricing to DODO products
      const syncPromises = [];
      
      for (const [planName, config] of Object.entries(planSettings)) {
        if (planName === 'free' || planName === 'lifetime' || planName === 'lastUpdated') continue;
        
        const monthlyPrice = config.price;
        const annualPrice = config.price * 10; // 2 months free
        
        syncPromises.push(
          apiRequest('POST', '/api/admin/sync-pricing', {
            plan: planName,
            monthlyPrice,
            annualPrice
          })
        );
      }

      const syncResults = await Promise.all(syncPromises);
      const allSynced = syncResults.every(r => r.ok);

      if (allSynced) {
        toast({
          title: "✅ All pricing synced!",
          description: "Plan settings and DODO product prices have been updated successfully.",
        });
      } else {
        toast({
          title: "⚠️ Partial sync",
          description: "Settings saved but some DODO products failed to update. Check console for details.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Save failed",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all changes? This will restore the last saved configuration.')) {
      setPlanSettings(originalSettings);
    }
  };

  const handleRestoreDefaults = () => {
    if (confirm('Restore default plan settings? This will reset all plans to their original configuration.')) {
      setPlanSettings(DEFAULT_PLAN_SETTINGS);
    }
  };

  const updatePlanSetting = (
    plan: keyof PlanSettings,
    field: keyof PlanConfig,
    value: any
  ) => {
    if (plan === 'lastUpdated') return;
    
    setPlanSettings({
      ...planSettings,
      [plan]: {
        ...planSettings[plan],
        [field]: value
      }
    });
  };

  const planIcons: Record<string, any> = {
    free: Sparkles,
    starter: Zap,
    pro: Crown,
    enterprise: Building2,
    lifetime: Gift
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Plan Configuration</CardTitle>
            <CardDescription className="mt-2">
              Configure limits and pricing for each subscription tier
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRestoreDefaults} variant="outline" size="sm">
              Restore Defaults
            </Button>
            {hasChanges && (
              <Button onClick={handleReset} variant="outline" size="sm">
                Discard Changes
              </Button>
            )}
            <Button onClick={handleSave} disabled={!hasChanges || saving} size="sm">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(planSettings).map(([planKey, config]) => {
          if (planKey === 'lastUpdated') return null;
          
          const Icon = planIcons[planKey];
          
          return (
            <Card key={planKey} className="bg-muted/30 border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 capitalize">
                  <Icon className="h-5 w-5" />
                  {planKey} Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor={`${planKey}-audits`}>Audits per Month</Label>
                    <Input
                      id={`${planKey}-audits`}
                      type="number"
                      value={config.auditsPerMonth}
                      onChange={(e) => updatePlanSetting(
                        planKey as keyof PlanSettings,
                        'auditsPerMonth',
                        Number(e.target.value)
                      )}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use -1 for unlimited
                    </p>
                  </div>

                  <div>
                    <Label htmlFor={`${planKey}-topics`}>Topics per Category</Label>
                    <Input
                      id={`${planKey}-topics`}
                      type="number"
                      value={config.topicsPerCategory}
                      onChange={(e) => updatePlanSetting(
                        planKey as keyof PlanSettings,
                        'topicsPerCategory',
                        Number(e.target.value)
                      )}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`${planKey}-price`}>Monthly Price ($)</Label>
                    <Input
                      id={`${planKey}-price`}
                      type="number"
                      value={config.price}
                      onChange={(e) => updatePlanSetting(
                        planKey as keyof PlanSettings,
                        'price',
                        Number(e.target.value)
                      )}
                      className="mt-1"
                      disabled={planKey === 'free' || planKey === 'lifetime'}
                    />
                    {(planKey === 'free' || planKey === 'lifetime') && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {planKey === 'free' ? 'Always $0' : 'One-time payment'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Features Section */}
                <div className="mt-4">
                  <Label htmlFor={`${planKey}-features`}>Pricing Features (one per line)</Label>
                  <Textarea
                    id={`${planKey}-features`}
                    value={(config.features || []).join('\n')}
                    onChange={(e) => {
                      const featuresArray = e.target.value.split('\n').filter(f => f.trim());
                      updatePlanSetting(
                        planKey as keyof PlanSettings,
                        'features',
                        featuresArray
                      );
                    }}
                    rows={8}
                    className="mt-1"
                    placeholder="Unlimited audits&#10;25 topics per category&#10;Full audit results&#10;PDF & CSV export&#10;Priority support"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Type features exactly as you want them to appear on the pricing page. One feature per line.
                  </p>
                </div>

                <div className="mt-4">
                  <div className="text-sm text-muted-foreground">
                    Current limits: {config.auditsPerMonth === -1 ? 'Unlimited' : config.auditsPerMonth} audits, 
                    {' '}{config.topicsPerCategory} topics per category
                    {config.price > 0 && `, $${config.price}/month`}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {hasChanges && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400">
              ⚠️ You have unsaved changes. Click "Save Settings" to apply them to all new sign-ups and plan changes.
            </p>
          </div>
        )}

        {planSettings.lastUpdated && (
          <div className="text-sm text-muted-foreground text-center pt-4 border-t">
            Last updated: {planSettings.lastUpdated.toDate().toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

