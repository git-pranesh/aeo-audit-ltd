import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  ExternalLink, 
  RefreshCw,
  Zap,
  CreditCard,
  Clock
} from 'lucide-react';

interface ApiStatusData {
  lastCheck: any;
  status: 'healthy' | 'warning' | 'critical';
  lastError?: {
    code: number;
    message: string;
    timestamp: any;
  };
  errors24h: {
    total: number;
    auth401: number;
    payment402: number;
    rateLimit429: number;
    other: number;
    lastReset?: string;
  };
  successRate24h: number;
}

export function ApiStatusMonitor() {
  const [apiStatus, setApiStatus] = useState<ApiStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time listener for API status
    const statusRef = doc(db, 'system', 'openRouterApiStatus');
    const unsubscribe = onSnapshot(statusRef, (doc) => {
      if (doc.exists()) {
        setApiStatus(doc.data() as ApiStatusData);
      } else {
        // No status doc yet - show default healthy
        setApiStatus({
          lastCheck: null,
          status: 'healthy',
          errors24h: {
            total: 0,
            auth401: 0,
            payment402: 0,
            rateLimit429: 0,
            other: 0
          },
          successRate24h: 100
        });
      }
      setLoading(false);
    }, (error) => {
      console.error('Error listening to API status:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusIcon = () => {
    switch (apiStatus?.status) {
      case 'healthy':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-8 w-8 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-8 w-8 text-red-500" />;
      default:
        return <CheckCircle className="h-8 w-8 text-green-500" />;
    }
  };

  const getStatusBadge = () => {
    switch (apiStatus?.status) {
      case 'healthy':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Healthy</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Warning</Badge>;
      case 'critical':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Critical</Badge>;
      default:
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Unknown</Badge>;
    }
  };

  const getErrorDescription = (code: number) => {
    switch (code) {
      case 401:
        return 'Authentication failed - API key may be invalid or expired';
      case 402:
        return 'Payment required - API credits may be exhausted';
      case 429:
        return 'Rate limited - Too many requests';
      default:
        return 'Unknown error';
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Card className="bg-card border border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              OpenRouter API Status
            </CardTitle>
            <CardDescription>Monitor API health and credit status</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.open('https://openrouter.ai/settings/credits', '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            OpenRouter Dashboard
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Overview */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-4">
            {getStatusIcon()}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">API Status</span>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-muted-foreground">
                Last check: {formatTimestamp(apiStatus?.lastCheck)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{apiStatus?.successRate24h || 100}%</div>
            <p className="text-xs text-muted-foreground">Success Rate (24h)</p>
          </div>
        </div>

        {/* Critical Alert */}
        {apiStatus?.status === 'critical' && apiStatus.lastError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Critical: API Issue Detected</AlertTitle>
            <AlertDescription>
              <p className="font-medium">HTTP {apiStatus.lastError.code}: {getErrorDescription(apiStatus.lastError.code)}</p>
              <p className="text-sm mt-1">{apiStatus.lastError.message}</p>
              <p className="text-xs mt-2">Occurred: {formatTimestamp(apiStatus.lastError.timestamp)}</p>
              
              {apiStatus.lastError.code === 402 && (
                <div className="mt-3 p-2 bg-red-900/20 rounded">
                  <p className="font-semibold">⚠️ Action Required:</p>
                  <p className="text-sm">Add more credits to your OpenRouter account</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => window.open('https://openrouter.ai/settings/credits', '_blank')}
                  >
                    Add Credits →
                  </Button>
                </div>
              )}
              
              {apiStatus.lastError.code === 401 && (
                <div className="mt-3 p-2 bg-red-900/20 rounded">
                  <p className="font-semibold">⚠️ Action Required:</p>
                  <p className="text-sm">Check if your API key is valid and properly configured in .env</p>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Warning Alert */}
        {apiStatus?.status === 'warning' && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-500">Warning: High Error Rate</AlertTitle>
            <AlertDescription className="text-yellow-400/80">
              {apiStatus.errors24h.rateLimit429 > 0 && (
                <p>Rate limiting detected ({apiStatus.errors24h.rateLimit429} times). Consider reducing request frequency.</p>
              )}
              {apiStatus.errors24h.total > 10 && (
                <p>High error count ({apiStatus.errors24h.total}) in the last 24 hours.</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* 24h Error Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <AlertTriangle className="h-4 w-4" />
              Total Errors
            </div>
            <div className="text-2xl font-bold">{apiStatus?.errors24h.total || 0}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </div>
          
          <div className={`p-4 rounded-lg ${(apiStatus?.errors24h.payment402 || 0) > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-muted'}`}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CreditCard className="h-4 w-4" />
              Payment (402)
            </div>
            <div className={`text-2xl font-bold ${(apiStatus?.errors24h.payment402 || 0) > 0 ? 'text-red-400' : ''}`}>
              {apiStatus?.errors24h.payment402 || 0}
            </div>
            <p className="text-xs text-muted-foreground">Credits issue</p>
          </div>
          
          <div className={`p-4 rounded-lg ${(apiStatus?.errors24h.auth401 || 0) > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-muted'}`}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <XCircle className="h-4 w-4" />
              Auth (401)
            </div>
            <div className={`text-2xl font-bold ${(apiStatus?.errors24h.auth401 || 0) > 0 ? 'text-red-400' : ''}`}>
              {apiStatus?.errors24h.auth401 || 0}
            </div>
            <p className="text-xs text-muted-foreground">Key issue</p>
          </div>
          
          <div className={`p-4 rounded-lg ${(apiStatus?.errors24h.rateLimit429 || 0) > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-muted'}`}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Rate Limit (429)
            </div>
            <div className={`text-2xl font-bold ${(apiStatus?.errors24h.rateLimit429 || 0) > 0 ? 'text-yellow-400' : ''}`}>
              {apiStatus?.errors24h.rateLimit429 || 0}
            </div>
            <p className="text-xs text-muted-foreground">Throttled</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.open('https://openrouter.ai/settings/credits', '_blank')}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Check Credits
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.open('https://openrouter.ai/docs', '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            API Docs
          </Button>
        </div>

        {/* Info Note */}
        <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded">
          <p className="font-medium mb-1">💡 About Credit Monitoring</p>
          <p>OpenRouter doesn't provide a public API to check credit balance. This monitor tracks:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li><strong>402 errors</strong> = Credits exhausted</li>
            <li><strong>401 errors</strong> = API key issue</li>
            <li><strong>429 errors</strong> = Rate limit hit</li>
          </ul>
          <p className="mt-2">When critical errors appear, check your <a href="https://openrouter.ai/settings/credits" target="_blank" className="text-primary hover:underline">OpenRouter dashboard</a> to add credits.</p>
        </div>
      </CardContent>
    </Card>
  );
}

