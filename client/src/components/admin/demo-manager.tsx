import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { seedDemoData, clearDemoData, getDemoDataCount } from '@/lib/demo-seeder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, Trash2, Play, CheckCircle, AlertCircle, Info } from 'lucide-react';

export default function DemoManager() {
  const { user } = useAuth();
  const [demoCount, setDemoCount] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [lastAction, setLastAction] = useState<{ type: 'seed' | 'clear'; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadCount();
  }, [user]);

  const loadCount = async () => {
    if (!user) return;
    const count = await getDemoDataCount(user.uid);
    setDemoCount(count);
  };

  const handleSeed = async () => {
    if (!user) return;
    setSeeding(true);
    setError(null);
    setLastAction(null);
    try {
      const result = await seedDemoData(user.uid);
      setLastAction({ type: 'seed', count: result.seeded });
      await loadCount();
    } catch (err: any) {
      setError(err.message || 'Seeding failed. Try again.');
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    if (!user) return;
    setClearing(true);
    setError(null);
    setLastAction(null);
    try {
      const result = await clearDemoData(user.uid);
      setLastAction({ type: 'clear', count: result.deleted });
      await loadCount();
    } catch (err: any) {
      setError(err.message || 'Clear failed. Try again.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Demo Data Seeder</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Inject realistic client audits to preview how the app looks at agency scale — for testing and marketing screenshots.
          </p>
        </div>
        {demoCount !== null && (
          <Badge variant={demoCount > 0 ? 'default' : 'outline'} className="text-sm">
            {demoCount} demo audit{demoCount !== 1 ? 's' : ''} active
          </Badge>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              What Gets Seeded
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>15 client audits</strong> across 5 industries (SaaS, E-commerce, Healthcare, B2B, Marketing)</p>
            <p>• <strong>Varied scores</strong> — A through F grades, realistic platform score distributions</p>
            <p>• <strong>6 months of score history</strong> per audit — powers the Score Trend Chart</p>
            <p>• <strong>Mixed checklist progress</strong> — completed, carried-over, and new items</p>
            <p>• <strong>Citation snapshots</strong> with mention rates (2%–38%)</p>
            <p>• <strong>Competitor watchlist</strong> data and content topics</p>
            <p>• <strong>Re-audit merge metadata</strong> — carried over, new, resolved counts</p>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-amber-600" />
              How to Use
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Click <strong>Seed Demo Data</strong> — 15 audits appear in your dashboard instantly</p>
            <p>2. Use the <strong>"View as Plan"</strong> bar at the bottom of any page to switch between Free/Starter/Pro/Enterprise views</p>
            <p>3. Take screenshots of the dashboard (15 domain badges, audit rows, progress bars) and individual audit pages (trend chart, checklist, citations)</p>
            <p>4. Click <strong>Clear Demo Data</strong> when done — removes all 15 audits cleanly</p>
            <p className="text-xs mt-3 text-amber-700">All demo audits are tagged internally and won't mix with real audit analytics.</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSeed}
          disabled={seeding || clearing}
          className="gap-2"
        >
          <Play className="h-4 w-4" />
          {seeding ? 'Seeding...' : 'Seed Demo Data'}
        </Button>
        <Button
          variant="outline"
          onClick={handleClear}
          disabled={clearing || seeding || demoCount === 0}
          className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          {clearing ? 'Clearing...' : 'Clear Demo Data'}
        </Button>
      </div>

      {lastAction && (
        <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-green-50 border border-green-200 text-green-800">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {lastAction.type === 'seed'
            ? `Successfully seeded ${lastAction.count} demo audits. Go to your dashboard to see them.`
            : `Cleared ${lastAction.count} demo audit${lastAction.count !== 1 ? 's' : ''} and their score history.`}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {(seeding || clearing) && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          {seeding ? 'Creating 15 audit documents with score history...' : 'Deleting demo audits and score history...'}
        </div>
      )}
    </div>
  );
}
