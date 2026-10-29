import { useEffect, type ComponentType } from "react";
import { Analytics } from "@hellyeah/x-ray/react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TRACKER_ID } from "./lib/tracker";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { FullPageSpinner } from "@/components/app-shell";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import AuditDetail from "@/pages/audit-detail";
import SettingsPage from "@/pages/settings";
import AdminPage from "@/pages/admin";
import HelpSupport from "@/pages/help";
import Welcome from "@/pages/welcome";
import ConsentBanner from "@/components/consent-banner";
import NotFound from "@/pages/not-found";

/** Redirects signed-out visitors to the sign-in page. */
function Protected({ component: Component }: { component: ComponentType<any> }) {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/");
  }, [loading, isAuthenticated, navigate]);
  if (loading || !isAuthenticated) return <FullPageSpinner />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/welcome/:plan" component={Welcome} />
      <Route path="/dashboard">{() => <Protected component={Dashboard} />}</Route>
      <Route path="/audit/:auditId">{() => <Protected component={AuditDetail} />}</Route>
      <Route path="/settings">{() => <Protected component={SettingsPage} />}</Route>
      <Route path="/admin">{() => <Protected component={AdminPage} />}</Route>
      <Route path="/help" component={HelpSupport} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Analytics websiteId={TRACKER_ID} env={import.meta.env.VITE_TRACKER_ENV} />
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <ConsentBanner />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
