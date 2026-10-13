import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, where, doc, getDoc } from 'firebase/firestore';
import { TrendingUp, TrendingDown, DollarSign, Activity, AlertCircle, Download, Eye, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ApiStatusMonitor } from './api-status-monitor';

interface AuditRecord {
  auditId: string;
  timestamp: any;
  userId: string;
  userEmail?: string;
  websiteUrl: string;
  planName: string;
  status: 'in_progress' | 'completed' | 'failed';
  duration?: number;
  topicsGenerated?: number;
  openRouterUsage?: {
    totalCalls: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    breakdown: {
      companyIntel?: { tokens: number; cost: number };
      competitor?: { tokens: number; cost: number };
      topicGeneration?: { tokens: number; cost: number };
    };
  };
  errorMessage?: string;
}

interface ApiCall {
  callId: string;
  auditId: string;
  timestamp: any;
  type: string;
  model: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  userId: string;
  websiteUrl: string;
  responseTime: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

interface OverallStats {
  totalAudits: number;
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  successfulAudits: number;
  failedAudits: number;
  avgCostPerAudit: number;
  byPlan: Record<string, { audits: number; cost: number }>;
}

export function ApiUsageDashboard() {
  const { toast } = useToast();
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAudit, setSelectedAudit] = useState<AuditRecord | null>(null);
  const [auditCalls, setAuditCalls] = useState<ApiCall[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load audits
      const auditsQuery = query(
        collection(db, 'audits'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const auditsSnapshot = await getDocs(auditsQuery);
      const auditsData = auditsSnapshot.docs.map(doc => ({
        ...doc.data(),
        auditId: doc.id
      })) as AuditRecord[];
      
      setAudits(auditsData);

      // Load overall lifetime stats
      const statsDoc = await getDoc(doc(db, 'openrouter_stats', 'overall', 'lifetime', 'all_time'));
      if (statsDoc.exists()) {
        const statsData = statsDoc.data() as OverallStats;
        // Calculate average cost per audit
        statsData.avgCostPerAudit = statsData.totalAudits > 0 
          ? statsData.totalCost / statsData.totalAudits 
          : 0;
        setStats(statsData);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading API usage data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load API usage data',
        variant: 'destructive'
      });
      setLoading(false);
    }
  };

  const loadAuditDetails = async (audit: AuditRecord) => {
    try {
      setSelectedAudit(audit);
      
      // Load all API calls for this audit
      const callsQuery = query(
        collection(db, 'openrouter_calls'),
        where('auditId', '==', audit.auditId),
        orderBy('timestamp', 'asc')
      );
      const callsSnapshot = await getDocs(callsQuery);
      const callsData = callsSnapshot.docs.map(doc => ({
        ...doc.data(),
        callId: doc.id
      })) as ApiCall[];
      
      setAuditCalls(callsData);
      setDialogOpen(true);
    } catch (error) {
      console.error('Error loading audit details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit details',
        variant: 'destructive'
      });
    }
  };

  const exportToCSV = () => {
    const csvRows = [
      ['Audit ID', 'Date', 'Website', 'Plan', 'Status', 'Topics', 'Total Calls', 'Total Tokens', 'Total Cost', 'Duration (s)'].join(','),
      ...audits.map(audit => [
        audit.auditId,
        new Date(audit.timestamp?.toDate()).toLocaleString(),
        audit.websiteUrl,
        audit.planName,
        audit.status,
        audit.topicsGenerated || 0,
        audit.openRouterUsage?.totalCalls || 0,
        audit.openRouterUsage?.totalTokens || 0,
        audit.openRouterUsage?.totalCost?.toFixed(4) || '0',
        audit.duration ? (audit.duration / 1000).toFixed(2) : '0'
      ].join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-usage-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast({
      title: 'Success',
      description: 'CSV exported successfully'
    });
  };

  const filteredAudits = audits.filter(audit => {
    const matchesSearch = 
      audit.websiteUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
      audit.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      audit.auditId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || audit.status === statusFilter;
    const matchesPlan = planFilter === 'all' || audit.planName === planFilter;
    
    return matchesSearch && matchesStatus && matchesPlan;
  });

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      completed: 'default',
      in_progress: 'secondary',
      failed: 'destructive'
    };
    return (
      <Badge variant={variants[status as keyof typeof variants] as any}>
        {status === 'completed' && '✅'}
        {status === 'in_progress' && '⏳'}
        {status === 'failed' && '❌'}
        {' '}{status}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string) => {
    const colors = {
      free: 'bg-gray-100 text-gray-800',
      pro: 'bg-blue-100 text-blue-800',
      enterprise: 'bg-orange-100 text-orange-800'
    };
    return (
      <Badge className={colors[plan as keyof typeof colors] || 'bg-gray-100'}>
        {plan.toUpperCase()}
      </Badge>
    );
  };

  const successRate = stats ? 
    (stats.totalAudits > 0 ? (stats.successfulAudits / stats.totalAudits * 100).toFixed(1) : '0') 
    : '0';

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Status Monitor - Credit Monitoring */}
      <ApiStatusMonitor />

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Audits</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats?.totalAudits || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.successfulAudits || 0} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCost(stats?.totalCost || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(stats?.totalTokens || 0)} tokens used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Audit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCost(stats?.avgCostPerAudit || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ~{((stats?.avgCostPerAudit || 0) * 100).toFixed(0)} audits per $10
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            {parseFloat(successRate) >= 95 ? 
              <TrendingUp className="h-4 w-4 text-green-600" /> : 
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            }
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.failedAudits || 0} failed audits
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost by Plan */}
      {stats?.byPlan && Object.keys(stats.byPlan).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost by Plan</CardTitle>
            <CardDescription>API usage breakdown by user plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(stats.byPlan).map(([plan, data]) => (
                <div key={plan} className="flex flex-col space-y-1 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    {getPlanBadge(plan)}
                    <span className="text-sm font-medium">{formatCost(data.cost)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {data.audits} audits • ${(data.cost / data.audits).toFixed(4)}/audit
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audit History</CardTitle>
              <CardDescription>Recent audit runs with detailed API usage</CardDescription>
            </div>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by website, email, or audit ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Topics</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAudits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No audits found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAudits.map((audit) => (
                    <TableRow key={audit.auditId}>
                      <TableCell className="font-mono text-xs">
                        {audit.timestamp?.toDate 
                          ? new Date(audit.timestamp.toDate()).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={audit.websiteUrl}>
                        <div className="font-medium truncate">{audit.websiteUrl}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {audit.userEmail || audit.userId}
                        </div>
                      </TableCell>
                      <TableCell>{getPlanBadge(audit.planName)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {audit.topicsGenerated || 0}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(audit.openRouterUsage?.totalTokens || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCost(audit.openRouterUsage?.totalCost || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(audit.status)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadAuditDetails(audit)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Info */}
          <div className="text-sm text-muted-foreground mt-4 text-center">
            Showing {filteredAudits.length} of {audits.length} audits
          </div>
        </CardContent>
      </Card>

      {/* Audit Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Details</DialogTitle>
            <DialogDescription>
              Detailed API usage breakdown for {selectedAudit?.websiteUrl}
            </DialogDescription>
          </DialogHeader>

          {selectedAudit && (
            <div className="space-y-6">
              {/* Audit Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Website</div>
                  <div className="text-sm break-all">{selectedAudit.websiteUrl}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">User</div>
                  <div className="text-sm">{selectedAudit.userEmail || selectedAudit.userId}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Date</div>
                  <div className="text-sm">
                    {selectedAudit.timestamp?.toDate 
                      ? new Date(selectedAudit.timestamp.toDate()).toLocaleString()
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Duration</div>
                  <div className="text-sm">
                    {selectedAudit.duration 
                      ? `${(selectedAudit.duration / 1000).toFixed(2)}s`
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Plan</div>
                  <div className="text-sm">{getPlanBadge(selectedAudit.planName)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <div className="text-sm">{getStatusBadge(selectedAudit.status)}</div>
                </div>
              </div>

              {/* Cost Summary */}
              {selectedAudit.openRouterUsage && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">OpenRouter API Usage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Total Calls</div>
                        <div className="text-2xl font-bold">
                          {selectedAudit.openRouterUsage.totalCalls}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Total Tokens</div>
                        <div className="text-2xl font-bold">
                          {formatNumber(selectedAudit.openRouterUsage.totalTokens)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(selectedAudit.openRouterUsage.inputTokens)} in • {formatNumber(selectedAudit.openRouterUsage.outputTokens)} out
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Total Cost</div>
                        <div className="text-2xl font-bold">
                          {formatCost(selectedAudit.openRouterUsage.totalCost)}
                        </div>
                      </div>
                    </div>

                    {/* Breakdown */}
                    {selectedAudit.openRouterUsage.breakdown && (
                      <div className="mt-6 space-y-2">
                        <div className="text-sm font-medium">Breakdown by Type</div>
                        {selectedAudit.openRouterUsage.breakdown.companyIntel && (
                          <div className="flex justify-between items-center p-2 bg-muted rounded">
                            <span className="text-sm">🏢 Company Intelligence</span>
                            <span className="text-sm font-mono">
                              {formatNumber(selectedAudit.openRouterUsage.breakdown.companyIntel.tokens)} tokens • {formatCost(selectedAudit.openRouterUsage.breakdown.companyIntel.cost)}
                            </span>
                          </div>
                        )}
                        {selectedAudit.openRouterUsage.breakdown.competitor && (
                          <div className="flex justify-between items-center p-2 bg-muted rounded">
                            <span className="text-sm">🏆 Competitor Analysis</span>
                            <span className="text-sm font-mono">
                              {formatNumber(selectedAudit.openRouterUsage.breakdown.competitor.tokens)} tokens • {formatCost(selectedAudit.openRouterUsage.breakdown.competitor.cost)}
                            </span>
                          </div>
                        )}
                        {selectedAudit.openRouterUsage.breakdown.topicGeneration && (
                          <div className="flex justify-between items-center p-2 bg-muted rounded">
                            <span className="text-sm">📝 Topic Generation</span>
                            <span className="text-sm font-mono">
                              {formatNumber(selectedAudit.openRouterUsage.breakdown.topicGeneration.tokens)} tokens • {formatCost(selectedAudit.openRouterUsage.breakdown.topicGeneration.cost)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Individual API Calls */}
              <div>
                <div className="text-sm font-medium mb-3">Individual API Calls ({auditCalls.length})</div>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Time</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditCalls.map((call) => (
                        <TableRow key={call.callId}>
                          <TableCell className="font-medium">
                            {call.type === 'company_intel' && '🏢 Company Intel'}
                            {call.type === 'competitor' && '🏆 Competitor'}
                            {call.type === 'topic_authoritative' && '📌 Authoritative'}
                            {call.type === 'topic_thought_leadership' && '💡 Thought Leadership'}
                            {call.type === 'topic_competitive' && '🎯 Competitive'}
                            {call.type === 'topic_emerging' && '🚀 Emerging'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(call.tokens.total)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {formatCost(call.cost)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {(call.responseTime / 1000).toFixed(2)}s
                          </TableCell>
                          <TableCell className="text-center">
                            {call.status === 'success' ? '✅' : '❌'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

