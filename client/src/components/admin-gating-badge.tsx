import { useAuth } from '@/contexts/AuthContext';
import { getFeatureFlags, type FeatureFlags } from '@/lib/feature-flags';

type FeatureKey = keyof FeatureFlags;

const PLAN_TIERS = ['free', 'starter', 'pro', 'enterprise'] as const;

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700 border-gray-300',
  starter: 'bg-blue-50 text-blue-700 border-blue-300',
  pro: 'bg-purple-50 text-purple-700 border-purple-300',
  enterprise: 'bg-orange-50 text-orange-700 border-orange-300',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Ent',
};

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'number') {
    if (value === Infinity || value >= 999) return '∞';
    return String(value);
  }
  if (typeof value === 'string') {
    const labels: Record<string, string> = {
      basic: 'Basic',
      full: 'Full',
      full_priority: 'Priority',
      full_whitelabel: 'WL',
      watermarked: 'WM',
      clean: 'Clean',
      whitelabel: 'WL',
      none: '—',
      monthly: 'Mo',
      weekly: 'Wk',
      daily: 'Day',
    };
    return labels[value] || value;
  }
  return String(value);
}

interface AdminGatingBadgeProps {
  feature: FeatureKey;
  label?: string;
}

export function AdminGatingBadge({ feature, label }: AdminGatingBadgeProps) {
  const { userDoc } = useAuth();

  if (!userDoc?.isAdmin) return null;

  return (
    <span className="inline-flex items-center gap-0.5 ml-2 text-[10px] leading-none font-mono select-none opacity-80 hover:opacity-100 transition-opacity">
      <span className="text-[9px] text-muted-foreground mr-0.5">{label || feature}:</span>
      {PLAN_TIERS.map((plan) => {
        const flags = getFeatureFlags(plan);
        const value = flags[feature];
        return (
          <span
            key={plan}
            className={`inline-flex items-center px-1 py-0.5 rounded border ${PLAN_COLORS[plan]}`}
            title={`${PLAN_LABELS[plan]}: ${String(value)}`}
          >
            <span className="font-semibold mr-0.5">{PLAN_LABELS[plan]}</span>
            {formatValue(value)}
          </span>
        );
      })}
    </span>
  );
}
