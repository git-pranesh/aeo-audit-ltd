import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Key, ExternalLink, AlertTriangle, CheckCircle, Eye, EyeOff } from 'lucide-react';

export default function ApiConfiguration() {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const isAppSumoUser = userDoc?.subscriptionPlan === 'lifetime';

  useEffect(() => {
    if (user && isAppSumoUser) {
      loadKeyStatus();
    } else {
      setLoading(false);
    }
  }, [user, isAppSumoUser]);

  const loadKeyStatus = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await apiRequest('GET', `/api/user/openrouter-key/${user.uid}`);
      const data = await response.json();
      
      if (data.success) {
        setHasKey(data.hasKey);
        setMaskedKey(data.maskedKey);
      }
    } catch (error) {
      console.error('Error loading API key status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async () => {
    if (!user) {
      toast({
        title: '❌ Not authenticated',
        description: 'Please log in to save your API key.',
        variant: 'destructive'
      });
      return;
    }

    if (!apiKey.trim()) {
      toast({
        title: '❌ API key required',
        description: 'Please enter your OpenRouter API key.',
        variant: 'destructive'
      });
      return;
    }

    if (!apiKey.startsWith('sk-or-')) {
      toast({
        title: '❌ Invalid format',
        description: 'OpenRouter API keys should start with "sk-or-"',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      toast({
        title: '🔄 Validating API key...',
        description: 'Testing your key with OpenRouter API...',
      });

      const response = await apiRequest('POST', '/api/user/openrouter-key', {
        apiKey: apiKey.trim()
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: '✅ API key saved successfully!',
          description: 'Your OpenRouter API key has been validated and saved.',
        });
        setApiKey('');
        setHasKey(true);
        loadKeyStatus();
      } else {
        toast({
          title: '❌ Failed to save',
          description: result.error || 'Invalid API key or connection error.',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Error saving API key:', error);
      toast({
        title: '❌ Save failed',
        description: error.message || 'Failed to save API key. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isAppSumoUser) {
    return null; // Only show for AppSumo lifetime users
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading API configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AppSumo Info Banner */}
      <Alert className="border-green-500/50 bg-green-500/10">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <AlertDescription>
          <strong>🎉 AppSumo Lifetime Plan Active!</strong>
          <p className="text-sm mt-1">
            You have lifetime access with unlimited audits. To use the service, please provide your own OpenRouter API key below.
          </p>
        </AlertDescription>
      </Alert>

      {/* API Key Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            OpenRouter API Key Configuration
          </CardTitle>
          <CardDescription>
            AppSumo users must bring their own OpenRouter API key
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Key Status */}
          {hasKey ? (
            <Alert className="bg-green-500/10 border-green-500/30">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-green-500">✅ API Key Configured</p>
                    <p className="text-sm mt-1 font-mono">{maskedKey}</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>⚠️ No API Key Set</strong>
                <p className="text-sm mt-1">
                  You must add your OpenRouter API key before you can run audits.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Add/Update Key Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="openrouter-key">
                {hasKey ? 'Update' : 'Add'} Your OpenRouter API Key
              </Label>
              <div className="flex gap-2 mt-1">
                <div className="flex-1 relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="openrouter-key"
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-or-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pl-10 pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button onClick={handleSaveKey} disabled={saving || !apiKey.trim()}>
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Key'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enter your OpenRouter API key (starts with "sk-or-"). This key routes all AI calls (DeepSeek + Perplexity Sonar) through your own account.
              </p>
            </div>
          </div>

          {/* Get API Key Instructions */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <h4 className="font-medium mb-3">📚 How to Get Your OpenRouter API Key:</h4>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>1. Go to <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenRouter Settings</a></li>
              <li>2. Sign up or log in to your OpenRouter account</li>
              <li>3. Navigate to "Keys" section</li>
              <li>4. Generate a new API key</li>
              <li>5. Copy the key and paste it above</li>
            </ol>
            <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Get Your OpenRouter API Key
              </a>
            </Button>
          </div>

          {/* Pricing Info */}
          <Alert>
            <AlertDescription>
              <p className="text-sm">
                <strong>💰 OpenRouter Pricing:</strong> DeepSeek V4 Flash costs ~$0.14 per 1M input tokens. Perplexity Sonar costs ~$1.00 per 1M input tokens.
                A typical audit costs around $0.008 in API usage.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

