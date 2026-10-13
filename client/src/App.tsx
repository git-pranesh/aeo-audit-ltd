import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ViewAsPlanProvider } from "@/contexts/ViewAsPlanContext";
import ViewAsPlanToggle from "@/components/view-as-plan-toggle";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Pricing from "@/pages/pricing";
import AuditDetail from "@/pages/audit-detail";
import AuditShare from "@/pages/audit-share";
import AdminDashboard from "@/pages/admin/admin-dashboard";
import PaymentSuccess from "@/pages/payment-success";
import PaymentCancelled from "@/pages/payment-cancelled";
import HelpSupport from "@/pages/help";
import ComingSoon from "@/pages/coming-soon";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";
import BatchTest from "@/pages/batch-test";
import ExtensionAuth from "@/pages/ExtensionAuth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/profile" component={Profile} />
      <Route path="/audit/:auditId" component={AuditDetail} />
      <Route path="/share/:token" component={AuditShare} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/batch-test" component={BatchTest} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-cancelled" component={PaymentCancelled} />
      <Route path="/help" component={HelpSupport} />
      <Route path="/coming-soon" component={ComingSoon} />
      <Route path="/extension-auth" component={ExtensionAuth} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ViewAsPlanProvider>
          <TooltipProvider>
            <div className="min-h-screen">
              <Toaster />
              <Router />
              <ViewAsPlanToggle />
            </div>
          </TooltipProvider>
        </ViewAsPlanProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
