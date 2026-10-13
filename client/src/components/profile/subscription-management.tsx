import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { Crown, Zap, Building2, Sparkles, Calendar, DollarSign, TrendingUp, AlertCircle, X } from 'lucide-react';
import PlanChangeModal from './plan-change-modal';

export default function SubscriptionManagement() {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPlanChangeModal, setShowPlanChangeModal] = useState(false);
  const [selectedNewPlan, setSelectedNewPlan] = useState<string | null>(null);
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, any>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);

  // Load dynamic pricing from backend
  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      const response = await fetch('/api/pricing/plans');
      const data = await response.json();
      if (data.success && data.plans) {
        setDynamicPrices(data.plans);
      }
    } catch (error) {
      console.error('Failed to load pricing:', error);
    } finally {
      setLoadingPrices(false);
    }
  };

  // Get price from dynamic pricing or fallback to defaults
  const getPrice = (planName: string) => {
    const dynamicPlan = dynamicPrices[planName];
    if (dynamicPlan) {
      return {
        monthlyPrice: `$${dynamicPlan.monthlyPrice}/month`,
        annualPrice: `$${dynamicPlan.annualPrice}/year`
      };
    }
    // Fallback defaults
    const defaults: Record<string, any> = {
      starter: { monthlyPrice: '$49/month', annualPrice: '$490/year' },
      pro: { monthlyPrice: '$149/month', annualPrice: '$1,490/year' },
      enterprise: { monthlyPrice: '$299/month', annualPrice: '$2,990/year' }
    };
    return defaults[planName] || { monthlyPrice: '$0', annualPrice: '$0' };
  };

  // Helper: Generate dynamic audit text based on actual value
  const getAuditText = (audits: number) => {
    if (audits === -1) return "Unlimited audits";
    return `${audits} audit${audits === 1 ? '' : 's'}/month`;
  };
  
  // Helper: Generate dynamic topics text based on actual value
  const getTopicsText = (topics: number) => {
    return `${topics} topics per category`;
  };

  const planDetails: Record<string, any> = {
    free: {
      name: 'Free',
      icon: Sparkles,
      color: 'text-gray-400',
      price: '$0',
      audits: getAuditText(dynamicPrices.free?.audits ?? 1),
      topics: getTopicsText(dynamicPrices.free?.topics ?? 3)
    },
    starter: {
      name: 'Starter',
      icon: Zap,
      color: 'text-blue-400',
      monthlyPrice: getPrice('starter').monthlyPrice,
      annualPrice: getPrice('starter').annualPrice,
      audits: getAuditText(dynamicPrices.starter?.audits ?? 10),
      topics: getTopicsText(dynamicPrices.starter?.topics ?? 12)
    },
    pro: {
      name: 'Pro',
      icon: Crown,
      color: 'text-purple-400',
      monthlyPrice: getPrice('pro').monthlyPrice,
      annualPrice: getPrice('pro').annualPrice,
      audits: getAuditText(dynamicPrices.pro?.audits ?? -1),
      topics: getTopicsText(dynamicPrices.pro?.topics ?? 25)
    },
    enterprise: {
      name: 'Enterprise',
      icon: Building2,
      color: 'text-orange-400',
      monthlyPrice: getPrice('enterprise').monthlyPrice,
      annualPrice: getPrice('enterprise').annualPrice,
      audits: getAuditText(dynamicPrices.enterprise?.audits ?? -1),
      topics: getTopicsText(dynamicPrices.enterprise?.topics ?? 100)
    },
    lifetime: {
      name: 'Lifetime',
      icon: Crown,
      color: 'text-yellow-400',
      price: 'Lifetime Access',
      audits: 'Unlimited audits',
      topics: '100 topics per category'
    }
  };

  const currentPlan = planDetails[userDoc?.subscriptionPlan || 'free'];
  const PlanIcon = currentPlan?.icon || Sparkles;
  const billingPeriod = userDoc?.billingPeriod || 'monthly';
  const isPaidPlan = userDoc?.subscriptionPlan && userDoc.subscriptionPlan !== 'free';

  const getCurrentPrice = () => {
    if (userDoc?.subscriptionPlan === 'free' || userDoc?.subscriptionPlan === 'lifetime') {
      return currentPlan.price;
    }
    return billingPeriod === 'annual' ? currentPlan.annualPrice : currentPlan.monthlyPrice;
  };

  const handleChangePlan = (planName: string) => {
    if (planName === userDoc?.subscriptionPlan) return;
    setSelectedNewPlan(planName);
    setShowPlanChangeModal(true);
  };

  const handleCancelPendingDowngrade = async () => {
    if (!user) return;

    try {
      toast({
        title: '🔄 Cancelling scheduled downgrade...',
        description: 'Please wait...',
      });

      const response = await apiRequest('POST', '/api/subscription/cancel-downgrade', { userId: user.uid });

      const result = await response.json();

      if (result.success) {
        toast({
          title: '✅ Downgrade cancelled',
          description: result.message,
        });
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast({
          title: '❌ Failed',
          description: result.message || 'Failed to cancel downgrade',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: '❌ Error',
        description: error.message || 'Failed to cancel downgrade',
        variant: 'destructive'
      });
    }
  };

  // Self-service cancellation isn't wired up to DODO yet. Rather than show a
  // success message that doesn't actually cancel anything, send the user to
  // support to handle it manually.
  const SUPPORT_CANCEL_MAILTO = `mailto:support@citationrocket.com?subject=${encodeURIComponent('Cancel my subscription')}&body=${encodeURIComponent(
    `Hi,\n\nPlease cancel my subscription.\n\nAccount email: ${user?.email || ''}\nCurrent plan: ${userDoc?.subscriptionPlan || ''}\n`
  )}`;

  if (loadingPrices) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading pricing...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Downgrade Banner */}
      {userDoc?.pendingDowngrade && (
        <Alert className="border-orange-500/50 bg-orange-500/10">
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-orange-500">⚠️ Downgrade Scheduled</p>
                <p className="text-sm mt-1">
                  Your plan will change to <strong>{userDoc.pendingDowngrade.targetPlan}</strong> on{' '}
                  <strong>
                    {userDoc.pendingDowngrade.effectiveDate?.toDate?.().toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </strong>
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelPendingDowngrade}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel Downgrade
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlanIcon className={`h-5 w-5 ${currentPlan.color}`} />
            Current Plan
          </CardTitle>
          <CardDescription>Manage your subscription and billing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Plan Badge and Details */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <PlanIcon className={`h-8 w-8 ${currentPlan.color}`} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{currentPlan.name}</h3>
                  <p className="text-muted-foreground">{getCurrentPrice()}</p>
                  {billingPeriod === 'annual' && isPaidPlan && (
                    <Badge className="mt-1 bg-green-500/20 text-green-400">
                      2 Months Free!
                    </Badge>
                  )}
                </div>
              </div>
              
              {userDoc?.subscriptionStatus === 'active' && isPaidPlan && (
                <Badge variant="default">Active</Badge>
              )}
              {userDoc?.subscriptionStatus === 'cancelled' && (
                <Badge variant="destructive">Cancelled</Badge>
              )}
              {userDoc?.subscriptionPlan === 'free' && (
                <Badge variant="secondary">Free Plan</Badge>
              )}
            </div>

            {/* Plan Features */}
            <div className="grid gap-3 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Audits</span>
                <span className="font-medium">{currentPlan.audits}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Topics</span>
                <span className="font-medium">{currentPlan.topics}</span>
              </div>
              {billingPeriod && isPaidPlan && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Billing</span>
                  <span className="font-medium capitalize">{billingPeriod}</span>
                </div>
              )}
            </div>

            {/* Subscription Dates */}
            {isPaidPlan && userDoc?.subscriptionStartDate && (
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Subscription Started</p>
                  <p className="text-sm text-muted-foreground">
                    {userDoc.subscriptionStartDate.toDate().toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              {userDoc?.subscriptionPlan === 'free' && (
                <Button onClick={() => setLocation('/pricing')} className="w-full">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </Button>
              )}
              
              {isPaidPlan && userDoc?.subscriptionPlan !== 'enterprise' && (
                <Button variant="outline" onClick={() => setLocation('/pricing')}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </Button>
              )}
              
              {isPaidPlan && userDoc?.subscriptionStatus === 'active' && (
                <Button variant="destructive" asChild>
                  <a href={SUPPORT_CANCEL_MAILTO}>
                    Contact support to cancel
                  </a>
                </Button>
              )}
            </div>

            {userDoc?.subscriptionStatus === 'cancelled' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Your subscription is cancelled and will end soon. You'll be moved to the Free plan.
                  <Button variant="link" className="p-0 h-auto ml-1" onClick={() => setLocation('/pricing')}>
                    Reactivate subscription
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Compare Plans</CardTitle>
          <CardDescription>See what you get with each plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {['starter', 'pro', 'enterprise'].map((plan) => {
              const planInfo = planDetails[plan];
              const PlanIconItem = planInfo.icon;
              const isCurrent = userDoc?.subscriptionPlan === plan;
              
              return (
                <div
                  key={plan}
                  className={`p-4 border rounded-lg ${isCurrent ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <PlanIconItem className={`h-5 w-5 ${planInfo.color}`} />
                    <h3 className="font-semibold">{planInfo.name}</h3>
                    {isCurrent && <Badge>Current</Badge>}
                  </div>
                  <p className="text-2xl font-bold mb-2">{planInfo.monthlyPrice}</p>
                  <p className="text-sm text-muted-foreground mb-3">or {planInfo.annualPrice}</p>
                  <ul className="space-y-2 text-sm">
                    <li>✓ {planInfo.audits}</li>
                    <li>✓ {planInfo.topics}</li>
                    <li>✓ Full features</li>
                  </ul>
                  {!isCurrent && (
                    <Button 
                      className="w-full mt-4" 
                      variant={plan === 'pro' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleChangePlan(plan)}
                    >
                      {plan === 'pro' && '⭐ '} Change to {planInfo.name}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Plan Change Modal */}
      {selectedNewPlan && userDoc && (
        <PlanChangeModal
          isOpen={showPlanChangeModal}
          onClose={() => {
            setShowPlanChangeModal(false);
            setSelectedNewPlan(null);
          }}
          currentPlan={userDoc.subscriptionPlan}
          newPlan={selectedNewPlan}
          billingPeriod={userDoc.billingPeriod || 'monthly'}
          onConfirm={() => {
            // Refresh handled in modal
          }}
          userId={user?.uid || ''}
          userEmail={user?.email || ''}
          userName={user?.displayName || user?.email || ''}
          currentSubscriptionId={userDoc.dodoSubscriptionId || undefined}
        />
      )}
    </div>
  );
}

