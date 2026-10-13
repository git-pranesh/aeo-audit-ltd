import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

interface ViewAsPlanContextType {
  viewAsPlan: PlanTier | null;
  setViewAsPlan: (plan: PlanTier | null) => void;
}

const ViewAsPlanContext = createContext<ViewAsPlanContextType>({
  viewAsPlan: null,
  setViewAsPlan: () => {},
});

export function ViewAsPlanProvider({ children }: { children: ReactNode }) {
  const [viewAsPlan, setViewAsPlan] = useState<PlanTier | null>(null);

  return (
    <ViewAsPlanContext.Provider value={{ viewAsPlan, setViewAsPlan }}>
      {children}
    </ViewAsPlanContext.Provider>
  );
}

export function useViewAsPlan() {
  return useContext(ViewAsPlanContext);
}

export function useEffectivePlan(): string {
  const { userDoc } = useAuth();
  const { viewAsPlan } = useViewAsPlan();
  return viewAsPlan || userDoc?.subscriptionPlan || 'free';
}
