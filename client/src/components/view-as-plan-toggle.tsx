import { useAuth } from '@/contexts/AuthContext';
import { useViewAsPlan } from '@/contexts/ViewAsPlanContext';
import { Eye, X } from 'lucide-react';

const PLANS = [
  { key: 'free', label: 'Free', color: 'bg-gray-200 text-gray-800 hover:bg-gray-300' },
  { key: 'starter', label: 'Starter', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
  { key: 'pro', label: 'Pro', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200' },
  { key: 'enterprise', label: 'Enterprise', color: 'bg-orange-100 text-orange-800 hover:bg-orange-200' },
] as const;

const ACTIVE_COLORS: Record<string, string> = {
  free: 'bg-gray-700 text-white',
  starter: 'bg-blue-600 text-white',
  pro: 'bg-purple-600 text-white',
  enterprise: 'bg-orange-500 text-white',
};

export default function ViewAsPlanToggle() {
  const { userDoc } = useAuth();
  const { viewAsPlan, setViewAsPlan } = useViewAsPlan();

  if (!userDoc?.isAdmin) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-white border border-border shadow-lg rounded-full px-3 py-2">
      <Eye className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">View as:</span>
      <div className="flex items-center gap-1">
        {PLANS.map(plan => (
          <button
            key={plan.key}
            onClick={() => setViewAsPlan(viewAsPlan === plan.key ? null : plan.key)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
              viewAsPlan === plan.key
                ? ACTIVE_COLORS[plan.key]
                : plan.color
            }`}
          >
            {plan.label}
          </button>
        ))}
      </div>
      {viewAsPlan && (
        <button
          onClick={() => setViewAsPlan(null)}
          className="ml-1 p-0.5 rounded-full hover:bg-muted transition-colors"
          title="Reset to real plan"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {viewAsPlan && (
        <span className="text-[10px] text-amber-600 font-medium whitespace-nowrap ml-1">
          preview only
        </span>
      )}
    </div>
  );
}
