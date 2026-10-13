import { useState, useEffect } from "react";
import { Check, Crown, Zap, Building2, Sparkles, Tag, Gift, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { couponService } from "@/lib/coupon-service";

interface CustomPlan {
  name: string;
  slug: string;
  price: number;
  billingType: 'one_time' | 'monthly' | 'annual';
  auditsPerMonth: number;
  topicsPerCategory: number;
  features: string[];
  description: string;
  tagline?: string;
  displayOrder: number;
  isActive: boolean;
  dodoProductId: string;
}

export default function Pricing() {
  const { user, userDoc } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Billing period state
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  
  // Dynamic pricing state
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, any>>({});
  
  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
  } | null>(null);
  
  // AppSumo state
  const [appSumoCode, setAppSumoCode] = useState('');
  const [redeemingAppSumo, setRedeemingAppSumo] = useState(false);
  
  // Custom plans state
  const [customPlans, setCustomPlans] = useState<Record<string, CustomPlan>>({});

  // Load dynamic pricing from backend
  useEffect(() => {
    loadPricing();
    loadCustomPlans();
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

  const loadCustomPlans = async () => {
    try {
      const response = await fetch('/api/admin/plans');
      const data = await response.json();
      if (data.success && data.plans) {
        setCustomPlans(data.plans);
      }
    } catch (error) {
      console.error('Failed to load custom plans:', error);
    }
  };

  // Use dynamic prices if loaded, otherwise use defaults
  const getPrice = (planName: string, period: 'monthly' | 'annual') => {
    const planData = dynamicPrices[planName.toLowerCase()];
    if (planData) {
      return period === 'monthly' ? planData.monthlyPrice : planData.annualPrice;
    }
    // Fallback to hardcoded defaults
    const defaults: Record<string, any> = {
      free: { monthly: 0, annual: 0 },
      starter: { monthly: 49, annual: 490 },
      pro: { monthly: 149, annual: 1490 },
      enterprise: { monthly: 299, annual: 2990 }
    };
    return defaults[planName.toLowerCase()]?.[period] || 0;
  };

  // Get features from dynamic data or fallback to defaults
  const getFeatures = (planName: string) => {
    const planData = dynamicPrices[planName.toLowerCase()];
    if (planData && planData.features && planData.features.length > 0) {
      return planData.features;
    }
    // Fallback defaults
    const defaults: Record<string, string[]> = {
      free: [
        "1 domain",
        "1 audit per month",
        "3 topics per category",
        "AI Readiness Score (4 platforms)",
        "Basic fix-it playbook",
        "1 schema type",
        "Industry benchmarks",
        "Watermarked PDF export",
      ],
      starter: [
        "5 domains",
        "15 audits per month",
        "12 topics per category",
        "Full fix-it playbook",
        "All schema types",
        "3 competitors tracked",
        "Monthly re-audits",
        "Monthly citation monitoring",
        "Clean PDF & CSV export",
      ],
      pro: [
        "Unlimited domains",
        "Unlimited audits",
        "25 topics per category",
        "Priority fix-it playbook",
        "Unlimited competitors tracked",
        "Weekly citation monitoring",
        "Citation change alerts",
        "Score trend CSV export",
        "White-label PDF export",
      ],
      enterprise: [
        "Unlimited domains",
        "Unlimited audits",
        "100 topics per category",
        "White-label fix-it playbook",
        "Unlimited competitors tracked",
        "Daily citation monitoring",
        "Citation change alerts",
        "Score trend CSV export",
        "White-label PDF export",
      ],
    };
    return defaults[planName.toLowerCase()] || [];
  };

  const plans = [
    {
      name: "Free",
      monthlyPrice: 0,
      annualPrice: 0,
      description: "Get started with a free AI readiness audit",
      icon: Sparkles,
      color: "text-gray-400",
      bgColor: "bg-gray-500/20",
      features: getFeatures('free'),
      limitations: [],
      cta: "Current Plan",
      popular: false
    },
    {
      name: "Starter",
      monthlyPrice: getPrice('starter', 'monthly'),
      annualPrice: getPrice('starter', 'annual'),
      description: "Optimization playbooks for small businesses",
      icon: Zap,
      color: "text-blue-400",
      bgColor: "bg-blue-500/20",
      features: getFeatures('starter'),
      limitations: [],
      cta: "Upgrade to Starter",
      popular: false
    },
    {
      name: "Pro",
      monthlyPrice: getPrice('pro', 'monthly'),
      annualPrice: getPrice('pro', 'annual'),
      description: "Full fix-it plans for growing businesses",
      icon: Crown,
      color: "text-purple-500",
      bgColor: "bg-purple-500/20",
      features: getFeatures('pro'),
      limitations: [],
      cta: "Upgrade to Pro",
      popular: true
    },
    {
      name: "Enterprise",
      monthlyPrice: getPrice('enterprise', 'monthly'),
      annualPrice: getPrice('enterprise', 'annual'),
      description: "Enterprise-grade optimization playbooks",
      icon: Building2,
      color: "text-orange-400",
      bgColor: "bg-orange-500/20",
      features: getFeatures('enterprise'),
      limitations: [],
      cta: "Upgrade to Enterprise",
      popular: false
    }
  ];

  const handleApplyCoupon = async (planName: string) => {
    if (!couponCode.trim()) {
      toast({
        title: "Coupon code required",
        description: "Please enter a coupon code.",
        variant: "destructive",
      });
      return;
    }

    setValidatingCoupon(true);
    try {
      const result = await couponService.validateCoupon(couponCode, planName.toLowerCase());
      
      if (result.valid && result.discount) {
        setAppliedCoupon({
          code: couponCode.toUpperCase(),
          type: result.discount.type,
          value: result.discount.value
        });
        
        toast({
          title: "Coupon applied!",
          description: result.message,
        });
      } else {
        toast({
          title: "Invalid coupon",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Validation failed",
        description: "Failed to validate coupon. Please try again.",
        variant: "destructive",
      });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRedeemAppSumo = async () => {
    if (!user || !userDoc) {
      toast({
        title: "Authentication required",
        description: "Please sign in to redeem AppSumo code.",
        variant: "destructive",
      });
      return;
    }

    if (!appSumoCode.trim()) {
      toast({
        title: "Code required",
        description: "Please enter your AppSumo code.",
        variant: "destructive",
      });
      return;
    }

    setRedeemingAppSumo(true);
    try {
      // Validate code first
      const validation = await couponService.validateAppSumoCode(appSumoCode);
      
      if (!validation.valid) {
        toast({
          title: "Invalid code",
          description: validation.message,
          variant: "destructive",
        });
        setRedeemingAppSumo(false);
        return;
      }

      // Redeem code
      const success = await couponService.redeemAppSumoCode(appSumoCode, user.uid, user.email!);
      
      if (success) {
        toast({
          title: "🎉 Lifetime access granted!",
          description: "Your AppSumo code has been redeemed. You now have lifetime access!",
        });
        
        // Reload page to show updated plan
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast({
          title: "Redemption failed",
          description: "Failed to redeem code. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('AppSumo redemption error:', error);
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRedeemingAppSumo(false);
    }
  };

  const handleSelectPlan = async (planName: string, isCustomPlan: boolean = false, customPlanSlug?: string) => {
    if (planName === 'Free') {
      return; // Already on free
    }

    // Check if user is logged in
    if (!user || !userDoc) {
      toast({
        title: "Sign in required",
        description: "Please sign in to upgrade your plan.",
        variant: "destructive",
      });
      setLocation('/');
      return;
    }

    // Create checkout session
    try {
      toast({
        title: "Preparing checkout...",
        description: "Please wait while we prepare your payment.",
      });

      // Build request body
      const requestBody: any = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email,
        couponCode: appliedCoupon?.code
      };

      if (isCustomPlan && customPlanSlug) {
        // Custom plan - use product ID directly
        const customPlan = customPlans[customPlanSlug];
        requestBody.planName = customPlanSlug;
        requestBody.productId = customPlan.dodoProductId;
        requestBody.billingPeriod = customPlan.billingType === 'one_time' ? 'one_time' : customPlan.billingType;
        requestBody.isCustomPlan = true;
      } else {
        // Default plan
        requestBody.planName = planName.toLowerCase();
        requestBody.billingPeriod = billingPeriod;
      }

      const response = await apiRequest('POST', '/api/payment/create-link', requestBody);

      const data = await response.json();

      if (data.success && data.checkoutUrl) {
        console.log('✅ Checkout session created, redirecting...');
        
        // Redirect to DODO checkout page
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data.error || 'Failed to create checkout');
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast({
        title: "Checkout failed",
        description: error.message || "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getCurrentPrice = (plan: any) => {
    return billingPeriod === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
  };

  const getDisplayPrice = (plan: any) => {
    const currentPrice = getCurrentPrice(plan);
    // For annual, show monthly equivalent
    return billingPeriod === 'annual' ? Math.round(currentPrice / 12) : currentPrice;
  };

  const getDiscountedPrice = (originalPrice: number) => {
    if (!appliedCoupon) return originalPrice;
    return couponService.calculateDiscountedPrice(
      originalPrice,
      appliedCoupon.type,
      appliedCoupon.value
    );
  };

  const isCurrentPlan = (planName: string) => {
    return userDoc?.subscriptionPlan.toLowerCase() === planName.toLowerCase();
  };

  if (loadingPrices) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading pricing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setLocation('/')}>
              ← Back
            </Button>
            <h1 className="text-xl font-bold">Pricing</h1>
            <div className="w-20"></div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Select the perfect plan to optimize your AI readiness and get recommended by AI platforms
          </p>
          
          {/* Billing Period Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background ${
                billingPeriod === 'annual' 
                  ? 'bg-muted focus:ring-muted-foreground' 
                  : 'bg-muted focus:ring-muted-foreground'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full shadow-md transition-transform bg-gray-200 ${
                  billingPeriod === 'annual' ? 'translate-x-9' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${billingPeriod === 'annual' ? 'text-foreground' : 'text-muted-foreground'}`}>
              Annual
            </span>
            {billingPeriod === 'annual' && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                Save 20%
              </Badge>
            )}
          </div>
        </div>

        {/* AppSumo Redemption Section - TEMPORARILY HIDDEN */}
        {/* To re-enable, uncomment this section:
        {user && userDoc?.subscriptionPlan !== 'lifetime' && (
          <Card className="max-w-2xl mx-auto mb-12 bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Gift className="h-6 w-6 text-green-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Have an AppSumo Code?</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Redeem your AppSumo lifetime deal code to get unlimited access forever!
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter AppSumo code..."
                      value={appSumoCode}
                      onChange={(e) => setAppSumoCode(e.target.value.toUpperCase())}
                      className="uppercase"
                    />
                    <Button 
                      onClick={handleRedeemAppSumo}
                      disabled={redeemingAppSumo || !appSumoCode.trim()}
                    >
                      {redeemingAppSumo ? 'Redeeming...' : 'Redeem Code'}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        */}

        {/* Coupon Input Section */}
        <Card className="max-w-2xl mx-auto mb-12 bg-muted/30 border-border">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Tag className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">Have a Coupon Code?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter your discount code to get a special price on any paid plan
                </p>
                {appliedCoupon ? (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <Check className="h-4 w-4 text-green-400" />
                    <AlertDescription className="text-green-400">
                      <div className="flex items-center justify-between">
                        <span>
                          Coupon "{appliedCoupon.code}" applied - {appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}%` : `$${appliedCoupon.value}`} off!
                        </span>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setAppliedCoupon(null)}
                          className="text-green-400"
                        >
                          Remove
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter coupon code..."
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="uppercase"
                    />
                    <Button 
                      onClick={() => handleApplyCoupon('starter')}
                      variant="secondary"
                      disabled={validatingCoupon || !couponCode.trim()}
                    >
                      {validatingCoupon ? 'Validating...' : 'Apply'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = isCurrentPlan(plan.name);
            
            return (
              <Card 
                key={plan.name}
                className={`relative bg-card border-2 ${
                  plan.popular 
                    ? 'border-primary shadow-2xl shadow-primary/20 scale-105' 
                    : 'border-border shadow-lg'
                } transition-all hover:scale-105`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-8">
                  <div className={`w-12 h-12 ${plan.bgColor} rounded-lg flex items-center justify-center mx-auto mb-4`}>
                    <Icon className={`h-6 w-6 ${plan.color}`} />
                  </div>
                  <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    {appliedCoupon && plan.monthlyPrice > 0 ? (
                      <>
                        <div className="text-lg text-muted-foreground line-through">
                          ${getDisplayPrice(plan)}
                        </div>
                        <div>
                          <span className="text-4xl font-bold text-green-400">
                            ${Math.round(getDiscountedPrice(getDisplayPrice(plan)))}
                          </span>
                          <span className="text-muted-foreground">/month</span>
                        </div>
                        {billingPeriod === 'annual' && (
                          <div className="text-xs text-muted-foreground mt-1">
                            ${Math.round(getDiscountedPrice(getCurrentPrice(plan)))} billed annually
                          </div>
                        )}
                        <div className="text-xs text-green-400 mt-1">
                          {appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}%` : `$${appliedCoupon.value}`} off applied
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-foreground">
                          ${getDisplayPrice(plan)}
                        </span>
                        <span className="text-muted-foreground">/month</span>
                        {billingPeriod === 'annual' && plan.annualPrice > 0 && (
                          <>
                            <div className="text-xs text-muted-foreground mt-2">
                              ${plan.annualPrice} billed annually
                            </div>
                            <div className="text-xs text-green-400 mt-1">
                              Save ${(plan.monthlyPrice * 12) - plan.annualPrice}/year
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {plan.features.map((feature: string, index: number) => (
                      <div key={index} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>

                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "secondary"}
                    disabled={isCurrent}
                    onClick={() => handleSelectPlan(plan.name)}
                  >
                    {isCurrent ? 'Current Plan' : plan.cta}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Custom Plans Section */}
        {Object.keys(customPlans).length > 0 && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Special Offers</h2>
              <p className="text-muted-foreground">
                Limited-time deals and one-time purchase options
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {Object.entries(customPlans)
                .filter(([_, plan]) => plan.isActive)
                .sort((a, b) => a[1].displayOrder - b[1].displayOrder)
                .map(([slug, plan]) => {
                  const isCurrent = userDoc?.subscriptionPlan === slug;
                  const isOneTime = plan.billingType === 'one_time';
                  
                  return (
                    <Card 
                      key={slug}
                      className="relative bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-2 border-yellow-500/30 shadow-lg transition-all hover:scale-105"
                    >
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-yellow-500 text-black px-4 py-1">
                          <Star className="h-3 w-3 mr-1 inline" />
                          {isOneTime ? 'One-Time Deal' : 'Special Offer'}
                        </Badge>
                      </div>
                      
                      <CardHeader className="text-center pb-8 pt-6">
                        <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                          <Star className="h-6 w-6 text-yellow-400" />
                        </div>
                        <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                        <CardDescription>{plan.description || `${plan.name} Plan`}</CardDescription>
                        <div className="mt-4">
                          <span className="text-4xl font-bold text-yellow-400">
                            ${plan.price}
                          </span>
                          {isOneTime ? (
                            <span className="text-muted-foreground ml-1">one-time</span>
                          ) : (
                            <span className="text-muted-foreground">
                              /{plan.billingType === 'monthly' ? 'mo' : 'yr'}
                            </span>
                          )}
                          {plan.tagline && (
                            <div className="text-xs text-yellow-400 mt-2">
                              {plan.tagline}
                            </div>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          {/* Audits and Topics first */}
                          <div className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-muted-foreground">
                              {plan.auditsPerMonth === -1 ? 'Unlimited audits' : `${plan.auditsPerMonth} audit${plan.auditsPerMonth > 1 ? 's' : ''} included`}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-muted-foreground">
                              {plan.topicsPerCategory} topics per category
                            </span>
                          </div>
                          {/* Rest of features */}
                          {plan.features.map((feature: string, index: number) => (
                            <div key={index} className="flex items-start gap-2">
                              <Check className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-muted-foreground">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>

                      <CardFooter>
                        <Button
                          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                          disabled={isCurrent}
                          onClick={() => handleSelectPlan(plan.name, true, slug)}
                        >
                          {isCurrent ? 'Current Plan' : `Get ${plan.name}`}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
            </div>
          </>
        )}

        {/* FAQ or Additional Info */}
        <div className="text-center mt-16">
          <h2 className="text-2xl font-bold mb-4">All plans include</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div>
              <div className="text-3xl mb-2">🔒</div>
              <h3 className="font-semibold mb-2">Secure & Private</h3>
              <p className="text-sm text-muted-foreground">
                Your data is encrypted and never shared with third parties
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="font-semibold mb-2">Fast Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Get comprehensive results in under 60 seconds
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">📊</div>
              <h3 className="font-semibold mb-2">Actionable Insights</h3>
              <p className="text-sm text-muted-foreground">
                Real recommendations to improve your AI citations
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

