import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Crown, Zap, Building2, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';

interface PlanChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: string;
  newPlan: string;
  billingPeriod: 'monthly' | 'annual';
  onConfirm: () => void;
  userId: string;
  userEmail: string;
  userName: string;
  currentSubscriptionId?: string;
}

export default function PlanChangeModal({
  isOpen,
  onClose,
  currentPlan,
  newPlan,
  billingPeriod,
  onConfirm,
  userId,
  userEmail,
  userName,
  currentSubscriptionId
}: PlanChangeModalProps) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, any>>({});

  // Load dynamic pricing when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPricing();
    }
  }, [isOpen]);

  const loadPricing = async () => {
    try {
      const response = await fetch('/api/pricing/plans');
      const data = await response.json();
      if (data.success && data.plans) {
        setDynamicPrices(data.plans);
      }
    } catch (error) {
      console.error('Failed to load pricing:', error);
    }
  };

  // Get price from dynamic data or fallback to defaults
  const getPlanPrice = (planName: string, period: 'monthly' | 'annual') => {
    const plan = dynamicPrices[planName];
    if (plan) {
      return period === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
    }
    // Fallback defaults
    const defaults: Record<string, any> = {
      starter: { monthly: 49, annual: 490 },
      pro: { monthly: 149, annual: 1490 },
      enterprise: { monthly: 299, annual: 2990 }
    };
    return defaults[planName]?.[period] || 0;
  };

  // Helper: Generate dynamic audit text based on actual value
  const getAuditText = (audits: number) => {
    if (audits === -1) return "Unlimited audits";
    return `${audits} audit${audits === 1 ? '' : 's'}/month`;
  };
  
  // Helper: Generate dynamic topics text based on actual value
  const getTopicsText = (topics: number) => {
    return `${topics} topics/category`;
  };

  const planDetails: Record<string, any> = {
    starter: {
      name: 'Starter',
      icon: Zap,
      monthlyPrice: getPlanPrice('starter', 'monthly'),
      annualPrice: getPlanPrice('starter', 'annual'),
      audits: getAuditText(dynamicPrices.starter?.audits ?? 10),
      topics: getTopicsText(dynamicPrices.starter?.topics ?? 12)
    },
    pro: {
      name: 'Pro',
      icon: Crown,
      monthlyPrice: getPlanPrice('pro', 'monthly'),
      annualPrice: getPlanPrice('pro', 'annual'),
      audits: getAuditText(dynamicPrices.pro?.audits ?? -1),
      topics: getTopicsText(dynamicPrices.pro?.topics ?? 25)
    },
    enterprise: {
      name: 'Enterprise',
      icon: Building2,
      monthlyPrice: getPlanPrice('enterprise', 'monthly'),
      annualPrice: getPlanPrice('enterprise', 'annual'),
      audits: getAuditText(dynamicPrices.enterprise?.audits ?? -1),
      topics: getTopicsText(dynamicPrices.enterprise?.topics ?? 100)
    }
  };

  const current = planDetails[currentPlan];
  const target = planDetails[newPlan];
  
  if (!current || !target) return null;

  const CurrentIcon = current.icon;
  const TargetIcon = target.icon;

  const currentPrice = billingPeriod === 'annual' ? current.annualPrice : current.monthlyPrice;
  const targetPrice = billingPeriod === 'annual' ? target.annualPrice : target.monthlyPrice;
  const priceDifference = targetPrice - currentPrice;
  const isUpgrade = priceDifference > 0;

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const endpoint = isUpgrade ? '/api/subscription/upgrade' : '/api/subscription/downgrade';
      
      const response = await apiRequest('POST', endpoint, {
        userId,
        userEmail,
        userName,
        currentPlan,
        newPlan,
        billingPeriod,
        currentSubscriptionId
      });

      const result = await response.json();

      if (result.success) {
        if (isUpgrade && result.checkoutUrl) {
          // Redirect to payment for upgrade
          toast({
            title: '🔄 Redirecting to payment...',
            description: 'Complete payment to activate your new plan.',
          });
          window.location.href = result.checkoutUrl;
        } else {
          // Downgrade scheduled
          toast({
            title: `✅ ${isUpgrade ? 'Upgrade' : 'Downgrade'} ${isUpgrade ? 'initiated' : 'scheduled'}!`,
            description: result.message,
          });
          onConfirm();
          onClose();
          
          // Reload page to show changes
          setTimeout(() => window.location.reload(), 1500);
        }
      } else {
        toast({
          title: '❌ Failed',
          description: result.message || result.error || 'Operation failed',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: '❌ Error',
        description: error.message || 'Failed to process plan change',
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUpgrade ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-orange-500" />
            )}
            {isUpgrade ? 'Upgrade' : 'Downgrade'} to {target.name} Plan?
          </DialogTitle>
          <DialogDescription>
            Review the changes to your subscription
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Plan Comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Current Plan */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <CurrentIcon className="h-5 w-5" />
                <span className="font-medium">Current: {current.name}</span>
              </div>
              <p className="text-2xl font-bold mb-1">
                ${billingPeriod === 'annual' ? Math.round(currentPrice / 12) : currentPrice}/mo
              </p>
              {billingPeriod === 'annual' && (
                <p className="text-xs text-muted-foreground">${currentPrice}/year</p>
              )}
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <p>• {current.audits}</p>
                <p>• {current.topics}</p>
              </div>
            </div>

            {/* New Plan */}
            <div className="p-4 border-2 border-primary rounded-lg bg-primary/5">
              <div className="flex items-center gap-2 mb-3">
                <TargetIcon className="h-5 w-5 text-primary" />
                <span className="font-medium">New: {target.name}</span>
                <Badge>Selected</Badge>
              </div>
              <p className="text-2xl font-bold mb-1">
                ${billingPeriod === 'annual' ? Math.round(targetPrice / 12) : targetPrice}/mo
              </p>
              {billingPeriod === 'annual' && (
                <p className="text-xs text-muted-foreground">${targetPrice}/year</p>
              )}
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <p>• {target.audits}</p>
                <p>• {target.topics}</p>
              </div>
            </div>
          </div>

          {/* Price Details */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Price Difference:</span>
              <span className={`font-bold ${isUpgrade ? 'text-orange-500' : 'text-green-500'}`}>
                {isUpgrade ? '+' : '-'}${Math.abs(priceDifference)}
                {billingPeriod === 'annual' ? '/year' : '/month'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Immediate Charge:</span>
              <span className="font-bold">
                {isUpgrade ? `~$${Math.round(Math.abs(priceDifference) * 0.5)}` : '$0'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Effective Date:</span>
              <span className="font-medium">
                {isUpgrade ? 'Immediately' : 'End of billing period'}
              </span>
            </div>
          </div>

          {/* Warnings/Info */}
          {isUpgrade ? (
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                <strong>Instant Activation:</strong> Your plan will be upgraded immediately after payment. 
                You'll be charged a prorated amount for the remaining days in this billing period.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Scheduled Change:</strong> Your plan will downgrade at the end of your current billing period. 
                You'll keep all current features until then. No refunds will be issued for the remaining time.
              </AlertDescription>
            </Alert>
          )}

          {/* Feature Changes */}
          {!isUpgrade && (
            <div className="p-4 border border-orange-500/30 bg-orange-500/5 rounded-lg">
              <p className="font-medium text-sm mb-2">⚠️ Features You'll Lose:</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                {currentPlan === 'enterprise' && newPlan === 'pro' && (
                  <>
                    <li>• {planDetails.enterprise?.topics} → {planDetails.pro?.topics}</li>
                    <li>• White-label reports</li>
                    <li>• Dedicated account manager</li>
                  </>
                )}
                {currentPlan === 'pro' && newPlan === 'starter' && (
                  <>
                    <li>• {planDetails.pro?.audits} → {planDetails.starter?.audits}</li>
                    <li>• {planDetails.pro?.topics} → {planDetails.starter?.topics}</li>
                    <li>• Priority support → Email support</li>
                    <li>• API access</li>
                  </>
                )}
                {currentPlan === 'enterprise' && newPlan === 'starter' && (
                  <>
                    <li>• {planDetails.enterprise?.audits} → {planDetails.starter?.audits}</li>
                    <li>• {planDetails.enterprise?.topics} → {planDetails.starter?.topics}</li>
                    <li>• All enterprise features</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processing}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={processing}
            variant={isUpgrade ? 'default' : 'destructive'}
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Processing...
              </>
            ) : (
              <>
                {isUpgrade ? (
                  <>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Confirm Upgrade
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Downgrade
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

