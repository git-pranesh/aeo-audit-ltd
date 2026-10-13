import { Crown, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface UpgradePromptCardProps {
  targetPlan: 'starter' | 'pro' | 'enterprise';
  headline: string;
  benefits?: string[];
  ctaText?: string;
  compact?: boolean;
}

const planConfig = {
  starter: {
    label: "Starter",
    price: "$49/mo",
    color: "border-blue-400",
    gradientFrom: "from-blue-50",
    gradientTo: "to-blue-100/50",
    iconColor: "text-blue-500",
    buttonColor: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  pro: {
    label: "Pro",
    price: "$149/mo",
    color: "border-purple-400",
    gradientFrom: "from-purple-50",
    gradientTo: "to-purple-100/50",
    iconColor: "text-purple-600",
    buttonColor: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  enterprise: {
    label: "Enterprise",
    price: "$299/mo",
    color: "border-orange-400",
    gradientFrom: "from-orange-50",
    gradientTo: "to-orange-100/50",
    iconColor: "text-orange-500",
    buttonColor: "bg-orange-600 hover:bg-orange-700 text-white",
  },
};

export default function UpgradePromptCard({
  targetPlan,
  headline,
  benefits,
  ctaText,
  compact = false,
}: UpgradePromptCardProps) {
  const [, navigate] = useLocation();
  const config = planConfig[targetPlan];
  const defaultCta = `Unlock with ${config.label} — ${config.price}`;

  if (compact) {
    return (
      <div className={`flex items-center justify-between p-3 rounded-lg bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} border ${config.color}`}>
        <div className="flex items-center gap-2">
          <Crown className={`h-4 w-4 ${config.iconColor}`} />
          <span className="text-sm font-medium text-foreground">{headline}</span>
        </div>
        <Button
          size="sm"
          className={`${config.buttonColor} text-xs px-3 py-1 h-7`}
          onClick={() => navigate("/pricing")}
        >
          Upgrade
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <Card className={`border-2 ${config.color} bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} shadow-md`}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0`}>
            <Crown className={`h-5 w-5 ${config.iconColor}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground mb-1">{headline}</h3>
            {benefits && benefits.length > 0 && (
              <ul className="space-y-1 mb-4">
                {benefits.map((benefit, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className={`w-1.5 h-1.5 rounded-full ${config.iconColor.replace('text-', 'bg-')}`} />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
            <Button
              className={`${config.buttonColor} mt-2`}
              onClick={() => navigate("/pricing")}
            >
              {ctaText || defaultCta}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
