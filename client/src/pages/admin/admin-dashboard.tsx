import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { 
  Users, 
  CreditCard, 
  BarChart3, 
  Tag, 
  FileText, 
  Settings,
  TrendingUp,
  DollarSign,
  Home,
  Activity,
  Mail,
  Package,
  FlaskConical,
  ShieldAlert
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { adminDb } from "@/lib/admin-firestore";
import UserManagement from "@/components/admin/user-management";
import PromptManagement from "@/components/admin/prompt-management";
import CouponManagement from "@/components/admin/coupon-management";
import AnalyticsDashboard from "@/components/admin/analytics-dashboard";
import SubscriptionManagement from "@/components/admin/subscription-management";
import SettingsManagement from "@/components/admin/settings-management";
import HomeContentManager from "@/components/admin/home-content-manager";
import { ApiUsageDashboard } from "@/components/admin/api-usage-dashboard";
import { EmailTemplatesManager } from "@/components/admin/email-templates-manager";
import PlanManagement from "@/components/admin/plan-management";
import DemoManager from "@/components/admin/demo-manager";
import SystemHealth from "@/components/admin/system-health";

export default function AdminDashboard() {
  const { user, userDoc, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubscriptions: 0,
    totalAudits: 0,
    monthlyRevenue: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Load stats
  useEffect(() => {
    if (userDoc?.isAdmin) {
      loadStats();
    }
  }, [userDoc]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const statsData = await adminDb.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Redirect if not admin
  useEffect(() => {
    if (!loading && (!isAuthenticated || !userDoc?.isAdmin)) {
      setLocation('/');
    }
  }, [loading, isAuthenticated, userDoc, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!userDoc?.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                Admin Panel
              </Badge>
              <h1 className="text-xl font-bold">Citation Rocket - Admin</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setLocation('/')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to App
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Welcome, Admin</h2>
          <p className="text-muted-foreground">Manage users, subscriptions, and system settings</p>
        </div>

        {/* Quick Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-card border border-border shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Users</p>
                  <p className="text-3xl font-bold text-foreground">
                    {loadingStats ? '--' : stats.totalUsers}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Active Subscriptions</p>
                  <p className="text-3xl font-bold text-foreground">
                    {loadingStats ? '--' : stats.activeSubscriptions}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Audits</p>
                  <p className="text-3xl font-bold text-foreground">
                    {loadingStats ? '--' : stats.totalAudits}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gray-500/20 rounded-lg flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-gray-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Monthly Revenue</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${loadingStats ? '--' : stats.monthlyRevenue.toLocaleString()}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="overview">
              <TrendingUp className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="subscriptions">
              <CreditCard className="h-4 w-4 mr-2" />
              Subscriptions
            </TabsTrigger>
            <TabsTrigger value="coupons">
              <Tag className="h-4 w-4 mr-2" />
              Coupons
            </TabsTrigger>
            <TabsTrigger value="prompts">
              <FileText className="h-4 w-4 mr-2" />
              Prompts
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="plans">
              <Package className="h-4 w-4 mr-2" />
              Plans
            </TabsTrigger>
            <TabsTrigger value="home-content">
              <Home className="h-4 w-4 mr-2" />
              Home Page
            </TabsTrigger>
            <TabsTrigger value="api-usage">
              <Activity className="h-4 w-4 mr-2" />
              API Usage
            </TabsTrigger>
            <TabsTrigger value="emails">
              <Mail className="h-4 w-4 mr-2" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="demo">
              <FlaskConical className="h-4 w-4 mr-2" />
              Demo
            </TabsTrigger>
            <TabsTrigger value="system-health">
              <ShieldAlert className="h-4 w-4 mr-2" />
              Health
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <AnalyticsDashboard />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          {/* Subscriptions Tab */}
          <TabsContent value="subscriptions">
            <SubscriptionManagement />
          </TabsContent>

          {/* Coupons Tab */}
          <TabsContent value="coupons">
            <CouponManagement />
          </TabsContent>

          {/* Prompts Tab */}
          <TabsContent value="prompts">
            <PromptManagement />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <SettingsManagement />
          </TabsContent>

          {/* Plan Management Tab */}
          <TabsContent value="plans">
            <PlanManagement />
          </TabsContent>

          {/* Home Content Tab */}
          <TabsContent value="home-content">
            <HomeContentManager />
          </TabsContent>

          {/* API Usage Tab */}
          <TabsContent value="api-usage">
            <ApiUsageDashboard />
          </TabsContent>

          {/* Email Templates Tab */}
          <TabsContent value="emails">
            <EmailTemplatesManager />
          </TabsContent>

          {/* Demo Data Tab */}
          <TabsContent value="demo">
            <Card className="bg-card border border-border shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-purple-500" />
                  Demo Mode
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DemoManager />
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Health Tab */}
          <TabsContent value="system-health">
            <Card className="bg-card border border-border shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SystemHealth />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

