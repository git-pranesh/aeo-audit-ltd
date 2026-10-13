import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Key, ExternalLink, Sparkles } from 'lucide-react';

interface AppSumoKeyRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddKey: () => void;
}

export default function AppSumoKeyRequiredModal({ isOpen, onClose, onAddKey }: AppSumoKeyRequiredModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto my-4">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
              <Key className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">OpenRouter API Key Required</DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-base pt-2">
            As an AppSumo lifetime user, you'll need to provide your own OpenRouter API key to run audits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* AppSumo Badge */}
          <Alert className="bg-green-500/10 border-green-500/30">
            <Sparkles className="h-4 w-4 text-green-500" />
            <AlertDescription>
              <p className="font-medium text-green-500">🎉 You Have Lifetime Access!</p>
              <p className="text-sm mt-1">
                Unlimited audits, 25 topics per category - Forever!
              </p>
            </AlertDescription>
          </Alert>

          {/* Why You Need Your Own Key */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Why bring your own API key?</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>You control your own API usage and costs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>Typical audit costs $0.30-0.50 in API usage</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>No recurring subscription fees - just pay for what you use</span>
              </li>
            </ul>
          </div>

          {/* How to Get Key */}
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium text-sm mb-2">📚 Quick Setup:</h4>
            <ol className="space-y-1 text-sm text-muted-foreground">
              <li>1. Click the button below to go to your profile</li>
              <li>2. Navigate to the "API Key" tab</li>
              <li>3. Get your free OpenRouter API key</li>
              <li>4. Paste it and save - You're all set!</li>
            </ol>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onAddKey}
            className="w-full sm:w-auto"
          >
            <Key className="h-4 w-4 mr-2" />
            Add API Key Now
          </Button>
        </DialogFooter>

        {/* Help Link */}
        <div className="text-center pt-2 border-t">
          <a 
            href="https://openrouter.ai/settings/keys" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            Get your OpenRouter API key
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

