interface PlanBadgeProps {
  plan: string;
  size?: 'sm' | 'md';
}

const planColors: Record<string, { bg: string; text: string; dot: string }> = {
  free: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
  starter: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  pro: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  enterprise: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  lifetime: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
};

const planLabels: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
  lifetime: "Lifetime",
};

export default function PlanBadge({ plan, size = 'md' }: PlanBadgeProps) {
  const normalizedPlan = (plan || 'free').toLowerCase().trim();
  const colors = planColors[normalizedPlan] || planColors.free;
  const label = planLabels[normalizedPlan] || "Free";

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
        {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${colors.bg} ${colors.text}`}>
      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
      {label}
    </span>
  );
}
