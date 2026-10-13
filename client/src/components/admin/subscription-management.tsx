import { useState, useEffect } from "react";
import { CreditCard, Calendar, DollarSign, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { adminDb } from "@/lib/admin-firestore";
import type { UserDocument } from "@/lib/firestore-utils";

export default function SubscriptionManagement() {
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const allUsers = await adminDb.getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'free': return 'bg-gray-500/20 text-gray-400';
      case 'starter': return 'bg-blue-500/20 text-blue-400';
      case 'pro': return 'bg-purple-500/20 text-purple-400';
      case 'enterprise': return 'bg-orange-500/20 text-orange-400';
      case 'lifetime': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400';
      case 'cancelled': return 'bg-yellow-500/20 text-yellow-400';
      case 'expired': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  // Calculate subscription metrics
  const metrics = {
    total: users.length,
    active: users.filter(u => u.subscriptionStatus === 'active').length,
    cancelled: users.filter(u => u.subscriptionStatus === 'cancelled').length,
    expired: users.filter(u => u.subscriptionStatus === 'expired').length,
    paid: users.filter(u => u.subscriptionPlan !== 'free' && u.subscriptionStatus === 'active').length,
    mrr: users
      .filter(u => u.subscriptionStatus === 'active')
      .reduce((sum, u) => {
        const prices: Record<string, number> = { starter: 49, pro: 149, enterprise: 299, lifetime: 0, free: 0 };
        return sum + (prices[u.subscriptionPlan] || 0);
      }, 0)
  };

  return (
    <div className="space-y-6">
      {/* Subscription Metrics */}
      <div className="grid md:grid-cols-4 gap-6">
        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-green-400" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics.active}</p>
              <p className="text-xs text-muted-foreground">Active Subscriptions</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics.paid}</p>
              <p className="text-xs text-muted-foreground">Paid Subscriptions</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-gray-500/20 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-gray-500" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${metrics.mrr.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Monthly Recurring Revenue</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics.cancelled}</p>
              <p className="text-xs text-muted-foreground">Cancelled Subscriptions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Subscriptions</CardTitle>
          <CardDescription>Manage all user subscriptions and billing</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading subscriptions...</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No subscriptions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => {
                      const planValue: Record<string, number> = {
                        starter: 49,
                        pro: 149,
                        enterprise: 299,
                        lifetime: 0,
                        free: 0
                      };

                      return (
                        <TableRow key={user.uid}>
                          <TableCell className="font-medium">{user.displayName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                          <TableCell>
                            <Badge className={`capitalize ${getPlanColor(user.subscriptionPlan)}`}>
                              {user.subscriptionPlan}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(user.subscriptionStatus)}>
                              {user.subscriptionStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {user.subscriptionStartDate?.toDate().toLocaleDateString() || '-'}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="text-foreground font-medium">
                              {user.auditsUsedThisMonth} this month
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {user.totalAuditsRun} total
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-semibold">
                            ${planValue[user.subscriptionPlan] || 0}/mo
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card border border-border shadow-lg">
          <CardHeader>
            <CardTitle>Subscription Status Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-green-500/10 rounded-lg">
              <span className="text-sm text-foreground">Active</span>
              <span className="text-lg font-bold text-green-400">{metrics.active}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-yellow-500/10 rounded-lg">
              <span className="text-sm text-foreground">Cancelled</span>
              <span className="text-lg font-bold text-yellow-400">{metrics.cancelled}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-red-500/10 rounded-lg">
              <span className="text-sm text-foreground">Expired</span>
              <span className="text-lg font-bold text-red-400">{metrics.expired}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-lg">
          <CardHeader>
            <CardTitle>Revenue Projections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm text-muted-foreground">Monthly (MRR)</span>
              <span className="text-lg font-bold text-foreground">${metrics.mrr.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm text-muted-foreground">Quarterly (MRR × 3)</span>
              <span className="text-lg font-bold text-foreground">${(metrics.mrr * 3).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
              <span className="text-sm text-foreground font-medium">Annual (ARR)</span>
              <span className="text-xl font-bold text-primary">${(metrics.mrr * 12).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

