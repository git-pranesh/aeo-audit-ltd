import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Lock, CreditCard, Receipt, BarChart3, Bell, Key } from 'lucide-react';
import ProfileSettings from '@/components/profile/profile-settings';
import SecuritySettings from '@/components/profile/security-settings';
import SubscriptionManagement from '@/components/profile/subscription-management';
import BillingHistory from '@/components/profile/billing-history';
import UsageStatistics from '@/components/profile/usage-statistics';
import NotificationPreferences from '@/components/profile/notification-preferences';
import ApiConfiguration from '@/components/profile/api-configuration';

export default function Profile() {
  const { user, userDoc, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('profile');

  const isAppSumoUser = userDoc?.subscriptionPlan === 'lifetime';
  const tabCount = isAppSumoUser ? 7 : 6;

  // Check for tab query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && (tab === 'api-config' && isAppSumoUser)) {
      setActiveTab(tab);
    } else if (tab) {
      setActiveTab(tab);
    }
  }, [isAppSumoUser]);

  useEffect(() => {
    if (!loading && !user) {
      setLocation('/');
    }
  }, [loading, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setLocation('/dashboard')}>
              ← Back to Dashboard
            </Button>
            <h1 className="text-xl font-bold">Account Settings</h1>
            <div className="w-40"></div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${isAppSumoUser ? 'grid-cols-7' : 'grid-cols-6'} bg-muted`}>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Subscription</span>
            </TabsTrigger>
            {isAppSumoUser && (
              <TabsTrigger value="api-config" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                <span className="hidden sm:inline">API Key</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Billing</span>
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Usage</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileSettings />
          </TabsContent>

          <TabsContent value="security">
            <SecuritySettings />
          </TabsContent>

          <TabsContent value="subscription">
            <SubscriptionManagement />
          </TabsContent>

          {isAppSumoUser && (
            <TabsContent value="api-config">
              <ApiConfiguration />
            </TabsContent>
          )}

          <TabsContent value="billing">
            <BillingHistory />
          </TabsContent>

          <TabsContent value="usage">
            <UsageStatistics />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationPreferences />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

