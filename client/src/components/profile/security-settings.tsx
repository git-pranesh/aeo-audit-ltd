import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { userDb } from '@/lib/firestore-utils';
import { Lock, AlertTriangle, Trash2, Shield } from 'lucide-react';
import { useLocation } from 'wouter';

export default function SecuritySettings() {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Password strength indicator
  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, text: '', color: '' };
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    const levels = [
      { strength: 0, text: '', color: '' },
      { strength: 1, text: 'Very Weak', color: 'text-red-500' },
      { strength: 2, text: 'Weak', color: 'text-orange-500' },
      { strength: 3, text: 'Fair', color: 'text-yellow-500' },
      { strength: 4, text: 'Good', color: 'text-green-500' },
      { strength: 5, text: 'Strong', color: 'text-green-600' }
    ];

    return levels[strength];
  };

  const passwordStrength = getPasswordStrength(newPassword);
  
  // Delete account state
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const isEmailAuth = userDoc?.authProvider === 'email';

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: '❌ Not authenticated',
        description: 'Please log in to change your password.',
        variant: 'destructive'
      });
      return;
    }

    // Validation checks
    if (!currentPassword.trim()) {
      toast({
        title: '❌ Current password required',
        description: 'Please enter your current password.',
        variant: 'destructive'
      });
      return;
    }

    if (!newPassword.trim()) {
      toast({
        title: '❌ New password required',
        description: 'Please enter a new password.',
        variant: 'destructive'
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: '❌ Password too short',
        description: 'Password must be at least 6 characters long.',
        variant: 'destructive'
      });
      return;
    }

    if (newPassword.length > 128) {
      toast({
        title: '❌ Password too long',
        description: 'Password must be less than 128 characters.',
        variant: 'destructive'
      });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({
        title: '❌ Passwords do not match',
        description: 'New password and confirmation password must be the same.',
        variant: 'destructive'
      });
      return;
    }

    if (newPassword === currentPassword) {
      toast({
        title: '⚠️ Same password',
        description: 'New password must be different from current password.',
        variant: 'destructive'
      });
      return;
    }

    setChangingPassword(true);
    try {
      // Show progress
      toast({
        title: '🔄 Verifying...',
        description: 'Checking your current password...',
      });

      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      toast({
        title: '✅ Password changed successfully!',
        description: 'Your password has been updated. Please use your new password for future logins.',
      });

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password change error:', error);
      
      // Detailed error messages
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast({
          title: '❌ Incorrect current password',
          description: 'The current password you entered is wrong. Please try again.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/weak-password') {
        toast({
          title: '❌ Weak password',
          description: 'Please choose a stronger password with a mix of letters, numbers, and symbols.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/requires-recent-login') {
        toast({
          title: '❌ Session expired',
          description: 'For security, please log out and log back in before changing your password.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/too-many-requests') {
        toast({
          title: '❌ Too many attempts',
          description: 'Too many failed attempts. Please try again later.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/network-request-failed') {
        toast({
          title: '❌ Network error',
          description: 'Please check your internet connection and try again.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: '❌ Password change failed',
          description: error.message || 'An unexpected error occurred. Please try again.',
          variant: 'destructive'
        });
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) {
      toast({
        title: '❌ Not authenticated',
        description: 'Please log in to delete your account.',
        variant: 'destructive'
      });
      return;
    }

    // Validate password for email users
    if (isEmailAuth && !deleteConfirmPassword.trim()) {
      toast({
        title: '❌ Password required',
        description: 'Please enter your password to confirm account deletion.',
        variant: 'destructive'
      });
      return;
    }

    setDeletingAccount(true);
    try {
      toast({
        title: '🔄 Deleting account...',
        description: 'Please wait while we process your request...',
      });

      // Re-authenticate for email users
      if (isEmailAuth) {
        try {
          const credential = EmailAuthProvider.credential(user.email!, deleteConfirmPassword);
          await reauthenticateWithCredential(user, credential);
        } catch (authError: any) {
          if (authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
            toast({
              title: '❌ Incorrect password',
              description: 'The password you entered is wrong. Please try again.',
              variant: 'destructive'
            });
            setDeletingAccount(false);
            return;
          }
          throw authError;
        }
      }

      // Delete user data from Firestore
      await userDb.deleteUser(user.uid);

      // Delete Firebase Auth user
      await deleteUser(user);

      toast({
        title: '✅ Account deleted successfully',
        description: 'Your account and all associated data have been permanently deleted. Redirecting...',
      });

      // Redirect to home
      setTimeout(() => setLocation('/'), 2000);
    } catch (error: any) {
      console.error('Account deletion error:', error);
      
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast({
          title: '❌ Incorrect password',
          description: 'The password you entered is wrong. Please try again.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/requires-recent-login') {
        toast({
          title: '❌ Re-authentication required',
          description: 'For security reasons, please log out and log back in before deleting your account.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/user-not-found') {
        toast({
          title: '❌ User not found',
          description: 'Account not found. It may have already been deleted.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/network-request-failed') {
        toast({
          title: '❌ Network error',
          description: 'Please check your internet connection and try again.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: '❌ Deletion failed',
          description: error.message || 'Failed to delete account. Please try again or contact support.',
          variant: 'destructive'
        });
      }
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmPassword('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Change Password */}
      {isEmailAuth ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
                {newPassword && (
                  <p className={`text-xs mt-1 font-medium ${passwordStrength.color}`}>
                    Password strength: {passwordStrength.text}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Must be at least 6 characters. Use a mix of letters, numbers, and symbols for better security.
                </p>
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={confirmPassword && newPassword && confirmPassword !== newPassword ? 'border-red-500' : ''}
                />
                {confirmPassword && newPassword && (
                  <p className={`text-xs mt-1 font-medium ${
                    confirmPassword === newPassword ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {confirmPassword === newPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? 'Changing Password...' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Google Authentication
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                You're signed in with Google. Password management is handled through your Google account.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>Manage your connected authentication providers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                  {userDoc?.authProvider === 'google' ? '🔵' : '📧'}
                </div>
                <div>
                  <p className="font-medium">
                    {userDoc?.authProvider === 'google' ? 'Google' : 'Email/Password'}
                  </p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <div className="text-sm text-green-600 font-medium">Connected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Permanently delete your account and all data</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> This action cannot be undone. All your audit history, settings, and account data will be permanently deleted.
            </AlertDescription>
          </Alert>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account and remove all your data from our servers.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              {isEmailAuth && (
                <div className="py-4">
                  <Label htmlFor="deleteConfirmPassword">Enter your password to confirm</Label>
                  <Input
                    id="deleteConfirmPassword"
                    type="password"
                    placeholder="Password"
                    value={deleteConfirmPassword}
                    onChange={(e) => setDeleteConfirmPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
              
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmPassword('')}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || (isEmailAuth && !deleteConfirmPassword)}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {deletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

