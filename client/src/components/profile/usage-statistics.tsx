import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, Activity, Calendar } from 'lucide-react';

export default function UsageStatistics() {
  const { userDoc } = useAuth();
  const [planLimits, setPlanLimits] = useState<Record<string, any>>({});

  useEffect(() => {
    // Load plan limits from Firestore
    const limits = {
      free: { auditsPerMonth: 1, topicsPerCategory: 3 },
      starter: { auditsPerMonth: 10, topicsPerCategory: 12 },
      pro: { auditsPerMonth: -1, topicsPerCategory: 25 },
      enterprise: { auditsPerMonth: -1, topicsPerCategory: 100 },
      lifetime: { auditsPerMonth: -1, topicsPerCategory: 100 }
    };
    setPlanLimits(limits);
  }, []);

  const currentPlan = userDoc?.subscriptionPlan || 'free';
  const limit = planLimits[currentPlan];
  const isUnlimited = limit?.auditsPerMonth === -1;
  const auditsUsed = userDoc?.auditsUsedThisMonth || 0;
  const totalAudits = userDoc?.totalAuditsRun || 0;
  const usagePercentage = !isUnlimited && limit?.auditsPerMonth 
    ? Math.min((auditsUsed / limit.auditsPerMonth) * 100, 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Current Month Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Current Month Usage
          </CardTitle>
          <CardDescription>
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Audits Run</span>
                <span className="text-sm font-medium">
                  {auditsUsed} {!isUnlimited && `/ ${limit?.auditsPerMonth}`}
                  {isUnlimited && <Badge variant="secondary" className="ml-2">Unlimited</Badge>}
                </span>
              </div>
              {!isUnlimited && (
                <>
                  <Progress value={usagePercentage} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {limit?.auditsPerMonth - auditsUsed} audits remaining
                  </p>
                </>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3 pt-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{auditsUsed}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">All Time</p>
                <p className="text-2xl font-bold">{totalAudits}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Plan Limit</p>
                <p className="text-2xl font-bold">
                  {isUnlimited ? '∞' : limit?.auditsPerMonth || 0}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage Details
          </CardTitle>
          <CardDescription>Detailed breakdown of your account activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Topics per Audit</p>
                <p className="text-sm text-muted-foreground">
                  {limit?.topicsPerCategory || 3} topics per category
                </p>
              </div>
              <Badge variant="secondary">
                {(limit?.topicsPerCategory || 3) * 4} total
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Features Enabled</p>
                <p className="text-sm text-muted-foreground">
                  {currentPlan === 'free' ? 'Basic features' : 'All features'}
                </p>
              </div>
              <Badge variant={currentPlan === 'free' ? 'secondary' : 'default'}>
                {currentPlan === 'free' ? 'Limited' : 'Full Access'}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">API Access</p>
                <p className="text-sm text-muted-foreground">
                  {currentPlan === 'pro' || currentPlan === 'enterprise' ? 'Enabled' : 'Not available'}
                </p>
              </div>
              <Badge variant={currentPlan === 'pro' || currentPlan === 'enterprise' ? 'default' : 'secondary'}>
                {currentPlan === 'pro' || currentPlan === 'enterprise' ? 'Active' : 'Upgrade Required'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Info */}
      {!isUnlimited && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Usage Reset
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your monthly audit limit will reset on{' '}
              <span className="font-medium text-foreground">
                {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

