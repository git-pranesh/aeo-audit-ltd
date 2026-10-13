import { useState, useEffect } from "react";
import { TrendingUp, Users, DollarSign, BarChart3, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { adminDb } from "@/lib/admin-firestore";
import type { UserDocument } from "@/lib/firestore-utils";

export default function AnalyticsDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const statsData = await adminDb.getStats();
      const allUsers = await adminDb.getAllUsers();
      
      setStats(statsData);
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate growth metrics
  const getGrowthMetrics = () => {
    if (!users.length) return { thisMonth: 0, lastMonth: 0, growth: 0 };

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const thisMonthUsers = users.filter(u => {
      const createdDate = u.createdAt?.toDate();
      return createdDate && createdDate >= thisMonthStart;
    }).length;

    const lastMonthUsers = users.filter(u => {
      const createdDate = u.createdAt?.toDate();
      return createdDate && createdDate >= lastMonthStart && createdDate <= lastMonthEnd;
    }).length;

    const growth = lastMonthUsers > 0 
      ? ((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100 
      : 0;

    return { thisMonth: thisMonthUsers, lastMonth: lastMonthUsers, growth };
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const growth = getGrowthMetrics();

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <TrendingUp className={`h-4 w-4 ${growth.growth >= 0 ? 'text-green-400' : 'text-red-400'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalUsers || 0}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
              <p className={`text-xs mt-1 ${growth.growth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {growth.growth >= 0 ? '+' : ''}{growth.growth.toFixed(1)}% from last month
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-400" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${stats?.monthlyRevenue?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Monthly Revenue</p>
              <p className="text-xs text-muted-foreground mt-1">
                From {stats?.activeSubscriptions || 0} active subscriptions
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-gray-500/20 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-gray-500" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalAudits || 0}</p>
              <p className="text-xs text-muted-foreground">Total Audits Run</p>
              <p className="text-xs text-muted-foreground mt-1">
                Across all users
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <Calendar className="h-5 w-5 text-orange-400" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{growth.thisMonth}</p>
              <p className="text-xs text-muted-foreground">New Users This Month</p>
              <p className="text-xs text-muted-foreground mt-1">
                {growth.lastMonth} last month
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card border border-border shadow-lg">
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
            <CardDescription>Users by subscription tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.planBreakdown && Object.entries(stats.planBreakdown).map(([plan, count]: [string, any]) => {
                const percentage = stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0;
                
                const planColors: Record<string, string> = {
                  free: 'bg-gray-500',
                  starter: 'bg-blue-500',
                  pro: 'bg-purple-500',
                  enterprise: 'bg-orange-500',
                  lifetime: 'bg-green-500'
                };

                return (
                  <div key={plan}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm capitalize text-foreground">{plan}</span>
                      <span className="text-sm font-semibold text-foreground">{count} users ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`${planColors[plan]} h-2 rounded-full transition-all`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
            <CardDescription>Monthly recurring revenue by plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.planBreakdown && (
                <>
                  <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Starter ($49/mo)</p>
                      <p className="text-xs text-muted-foreground">{stats.planBreakdown.starter} users</p>
                    </div>
                    <p className="text-lg font-bold text-blue-400">
                      ${(stats.planBreakdown.starter * 49).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Pro ($149/mo)</p>
                      <p className="text-xs text-muted-foreground">{stats.planBreakdown.pro} users</p>
                    </div>
                    <p className="text-lg font-bold text-purple-400">
                      ${(stats.planBreakdown.pro * 149).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-orange-500/10 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Enterprise ($299/mo)</p>
                      <p className="text-xs text-muted-foreground">{stats.planBreakdown.enterprise} users</p>
                    </div>
                    <p className="text-lg font-bold text-orange-400">
                      ${(stats.planBreakdown.enterprise * 299).toLocaleString()}
                    </p>
                  </div>

                  <div className="border-t pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Total MRR</p>
                      <p className="text-xl font-bold text-green-400">
                        ${stats.monthlyRevenue?.toLocaleString() || 0}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-card border border-border shadow-lg">
        <CardHeader>
          <CardTitle>User Activity Summary</CardTitle>
          <CardDescription>Key metrics and engagement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <p className="text-3xl font-bold text-primary mb-1">
                {users.reduce((sum, u) => sum + u.totalAuditsRun, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Total Audits All-Time</p>
            </div>

            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <p className="text-3xl font-bold text-primary mb-1">
                {users.reduce((sum, u) => sum + u.auditsUsedThisMonth, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Audits This Month</p>
            </div>

            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <p className="text-3xl font-bold text-primary mb-1">
                {users.length > 0 
                  ? (users.reduce((sum, u) => sum + u.totalAuditsRun, 0) / users.length).toFixed(1)
                  : 0
                }
              </p>
              <p className="text-sm text-muted-foreground">Avg Audits per User</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lifetime Value Estimates */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card border border-border shadow-lg">
          <CardHeader>
            <CardTitle>Customer Lifetime Value</CardTitle>
            <CardDescription>Estimated value by plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm text-muted-foreground">Starter (12-month avg)</span>
              <span className="font-semibold text-foreground">$588</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm text-muted-foreground">Pro (12-month avg)</span>
              <span className="font-semibold text-foreground">$1,788</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm text-muted-foreground">Enterprise (12-month avg)</span>
              <span className="font-semibold text-foreground">$4,788</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardHeader>
            <CardTitle>Conversion Metrics</CardTitle>
            <CardDescription>Free to paid conversion rates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Free Users</span>
                <span className="text-sm font-semibold">{stats?.planBreakdown?.free || 0}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Paid Users</span>
                <span className="text-sm font-semibold">
                  {(stats?.totalUsers || 0) - (stats?.planBreakdown?.free || 0)}
                </span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">Conversion Rate</span>
                  <span className="text-lg font-bold text-green-400">
                    {stats?.totalUsers > 0 
                      ? (((stats.totalUsers - stats.planBreakdown.free) / stats.totalUsers) * 100).toFixed(1)
                      : 0
                    }%
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Users */}
      <Card className="bg-card border border-border shadow-lg">
        <CardHeader>
          <CardTitle>Most Active Users</CardTitle>
          <CardDescription>Users with highest audit count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users
              .sort((a, b) => b.totalAuditsRun - a.totalAuditsRun)
              .slice(0, 5)
              .map((user, index) => (
                <div 
                  key={user.uid}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{user.totalAuditsRun}</p>
                    <p className="text-xs text-muted-foreground">audits</p>
                  </div>
                </div>
              ))}
            {users.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No users yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

