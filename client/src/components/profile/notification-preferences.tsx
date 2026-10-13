import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { userDb } from '@/lib/firestore-utils';
import { Bell, Mail, Megaphone, CheckCircle } from 'lucide-react';

export default function NotificationPreferences() {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [preferences, setPreferences] = useState({
    marketing: true,
    productUpdates: true,
    auditCompleted: true
  });

  useEffect(() => {
    if (userDoc?.emailPreferences) {
      setPreferences(userDoc.emailPreferences);
    }
  }, [userDoc]);

  const handleSave = async () => {
    if (!user) {
      toast({
        title: '❌ Not authenticated',
        description: 'Please log in to save your preferences.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      toast({
        title: '🔄 Saving preferences...',
        description: 'Updating your notification settings...',
      });

      await userDb.updateUser(user.uid, {
        emailPreferences: preferences
      });

      toast({
        title: '✅ Preferences saved!',
        description: 'Your notification preferences have been updated successfully.',
      });
    } catch (error: any) {
      console.error('Error saving preferences:', error);
      
      if (error.message?.includes('permission')) {
        toast({
          title: '❌ Permission denied',
          description: 'You do not have permission to update preferences.',
          variant: 'destructive'
        });
      } else if (error.message?.includes('network')) {
        toast({
          title: '❌ Network error',
          description: 'Please check your internet connection and try again.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: '❌ Save failed',
          description: error.message || 'Failed to update preferences. Please try again.',
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const notificationOptions = [
    {
      id: 'marketing',
      icon: Megaphone,
      title: 'Marketing Emails',
      description: 'Receive promotional offers, tips, and product updates',
      value: preferences.marketing,
      onChange: (checked: boolean) => setPreferences({ ...preferences, marketing: checked })
    },
    {
      id: 'productUpdates',
      icon: Bell,
      title: 'Product Updates',
      description: 'Get notified about new features and improvements',
      value: preferences.productUpdates,
      onChange: (checked: boolean) => setPreferences({ ...preferences, productUpdates: checked })
    },
    {
      id: 'auditCompleted',
      icon: CheckCircle,
      title: 'Audit Completion',
      description: 'Receive notifications when your audits are complete',
      value: preferences.auditCompleted,
      onChange: (checked: boolean) => setPreferences({ ...preferences, auditCompleted: checked })
    }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Manage what emails you receive from us
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {notificationOptions.map((option) => {
            const Icon = option.icon;
            return (
              <div key={option.id} className="flex items-start justify-between space-x-4 pb-4 border-b last:border-0">
                <div className="flex gap-4 flex-1">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={option.id} className="text-base font-medium cursor-pointer">
                      {option.title}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={option.id}
                  checked={option.value}
                  onCheckedChange={option.onChange}
                />
              </div>
            );
          })}

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Address */}
      <Card>
        <CardHeader>
          <CardTitle>Email Address</CardTitle>
          <CardDescription>Where we'll send your notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{user?.email}</span>
            </div>
            <Badge variant="secondary">Verified</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

