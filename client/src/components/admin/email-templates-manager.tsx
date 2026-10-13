import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Mail, Save, RefreshCw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface EmailTemplate {
  subject: string;
  previewText: string;
  buttonText: string;
  buttonUrl: string;
  footerText: string;
}

interface EmailTemplates {
  signupWelcome: EmailTemplate;
  subscriptionWelcome: EmailTemplate;
  cancellation: EmailTemplate;
  paymentSuccess: EmailTemplate;
}

const DEFAULT_TEMPLATES: EmailTemplates = {
  signupWelcome: {
    subject: '🎉 Welcome to Citation Rocket - Let\'s Get Started!',
    previewText: 'Your account has been created successfully. Run your first audit now!',
    buttonText: '🚀 Run Your First Audit',
    buttonUrl: '/',
    footerText: 'Questions? Email us at support@aicitationaudit.com'
  },
  subscriptionWelcome: {
    subject: '🎉 Welcome to Citation Rocket - {{PLAN}} Plan Activated!',
    previewText: 'Thank you for subscribing! Your plan is now active.',
    buttonText: 'Get Started Now',
    buttonUrl: '/',
    footerText: 'You\'re receiving this email because you subscribed to our service.'
  },
  cancellation: {
    subject: 'Subscription Cancelled - We\'ll Miss You 😢',
    previewText: 'Your subscription has been cancelled. You\'ll have access until the end of your billing period.',
    buttonText: 'View Pricing Plans',
    buttonUrl: '/pricing',
    footerText: 'Have questions? Contact us at support@aicitationaudit.com'
  },
  paymentSuccess: {
    subject: '✅ Payment Confirmed - {{PLAN}} Plan Active',
    previewText: 'Your payment has been processed successfully!',
    buttonText: 'Start Using Your Plan',
    buttonUrl: '/',
    footerText: 'This is your payment confirmation email.'
  }
};

export function EmailTemplatesManager() {
  const [templates, setTemplates] = useState<EmailTemplates>(DEFAULT_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, 'system', 'emailTemplates');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setTemplates(docSnap.data() as EmailTemplates);
      } else {
        setTemplates(DEFAULT_TEMPLATES);
      }
    } catch (error) {
      console.error('Error loading email templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email templates',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const docRef = doc(db, 'system', 'emailTemplates');
      await setDoc(docRef, templates);

      toast({
        title: 'Success',
        description: 'Email templates saved successfully!',
        variant: 'default'
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving email templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to save email templates',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = () => {
    setTemplates(DEFAULT_TEMPLATES);
    setHasChanges(true);
    toast({
      title: 'Defaults Restored',
      description: 'Click "Save Templates" to apply changes'
    });
  };

  const updateTemplate = (
    templateKey: keyof EmailTemplates,
    field: keyof EmailTemplate,
    value: string
  ) => {
    setTemplates(prev => ({
      ...prev,
      [templateKey]: {
        ...prev[templateKey],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading email templates...</p>
        </CardContent>
      </Card>
    );
  }

  const emailTypes: Array<{ key: keyof EmailTemplates; title: string; description: string }> = [
    {
      key: 'signupWelcome',
      title: 'Signup Welcome Email',
      description: 'Sent when a user creates a new account'
    },
    {
      key: 'subscriptionWelcome',
      title: 'Subscription Welcome Email',
      description: 'Sent when a user subscribes to a paid plan'
    },
    {
      key: 'cancellation',
      title: 'Cancellation Email',
      description: 'Sent when a user cancels their subscription'
    },
    {
      key: 'paymentSuccess',
      title: 'Payment Success Email',
      description: 'Sent immediately after successful payment'
    }
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Email Templates</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Customize email content sent to users
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRestore}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Restore Defaults
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {emailTypes.map(({ key, title, description }) => (
          <div key={key} className="p-4 border rounded-lg space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <div className="grid gap-4">
              <div>
                <Label htmlFor={`${key}-subject`}>Email Subject</Label>
                <Input
                  id={`${key}-subject`}
                  value={templates[key].subject}
                  onChange={(e) => updateTemplate(key, 'subject', e.target.value)}
                  placeholder="Enter email subject"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {`{{PLAN}}`} to insert plan name dynamically
                </p>
              </div>

              <div>
                <Label htmlFor={`${key}-preview`}>Preview Text</Label>
                <Textarea
                  id={`${key}-preview`}
                  value={templates[key].previewText}
                  onChange={(e) => updateTemplate(key, 'previewText', e.target.value)}
                  placeholder="Main message content"
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${key}-button-text`}>Button Text</Label>
                  <Input
                    id={`${key}-button-text`}
                    value={templates[key].buttonText}
                    onChange={(e) => updateTemplate(key, 'buttonText', e.target.value)}
                    placeholder="CTA button text"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor={`${key}-button-url`}>Button URL</Label>
                  <Input
                    id={`${key}-button-url`}
                    value={templates[key].buttonUrl}
                    onChange={(e) => updateTemplate(key, 'buttonUrl', e.target.value)}
                    placeholder="/path or full URL"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`${key}-footer`}>Footer Text</Label>
                <Input
                  id={`${key}-footer`}
                  value={templates[key].footerText}
                  onChange={(e) => updateTemplate(key, 'footerText', e.target.value)}
                  placeholder="Footer message"
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        ))}

        {hasChanges && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400">
              ⚠️ You have unsaved changes. Click "Save Templates" to apply them.
            </p>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving || !hasChanges} className="w-full" size="lg">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Templates'}
        </Button>

        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Email templates control basic content. The full HTML layout 
            and design are managed in the backend. These settings control subject lines, 
            preview text, button labels, and footer messages.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

