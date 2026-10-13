import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { updateProfile } from 'firebase/auth';
import { userDb } from '@/lib/firestore-utils';
import { Upload, User, Mail, Camera, X } from 'lucide-react';

export default function ProfileSettings() {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [localPhoto, setLocalPhoto] = useState<string | null>(null); // Base64 local photo
  const [photoError, setPhotoError] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Get the original photo (Google or stored)
  const originalPhoto = userDoc?.customPhotoURL || user?.photoURL || '';
  const isGooglePhoto = user?.photoURL?.includes('googleusercontent.com');

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      // Prioritize custom uploaded photo over Google photo
      setPhotoURL(userDoc?.customPhotoURL || user.photoURL || '');
    }
    if (userDoc) {
      setBio(userDoc.bio || '');
      if (userDoc.customPhotoURL) {
        setLocalPhoto(userDoc.customPhotoURL);
      }
    }
  }, [user, userDoc]);

  // Detect changes
  useEffect(() => {
    const currentPhoto = localPhoto || photoURL;
    const changed = 
      displayName !== (user?.displayName || '') ||
      currentPhoto !== originalPhoto ||
      bio !== (userDoc?.bio || '');
    setHasChanges(changed);
  }, [displayName, photoURL, localPhoto, bio, user, userDoc, originalPhoto]);

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: '❌ Invalid file type',
        description: 'Please select an image file (JPG, PNG, GIF)',
        variant: 'destructive'
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: '❌ File too large',
        description: 'Please select an image smaller than 2MB',
        variant: 'destructive'
      });
      return;
    }

    setUploadingPhoto(true);
    try {
      // Convert to base64
      const base64 = await fileToBase64(file);
      
      // Resize image if needed (max 400x400)
      const resizedBase64 = await resizeImage(base64, 400, 400);
      
      setLocalPhoto(resizedBase64);
      setPhotoError(false);
      toast({
        title: '✅ Photo selected',
        description: 'Click "Save Changes" to update your profile picture',
      });
    } catch (error) {
      console.error('Error processing image:', error);
      toast({
        title: '❌ Error processing image',
        description: 'Please try another image',
        variant: 'destructive'
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Resize image to max dimensions
  const resizeImage = (base64: string, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        
        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Return resized image as base64 (JPEG for smaller size)
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = base64;
    });
  };

  // Remove custom photo and revert to Google photo
  const handleRemovePhoto = () => {
    setLocalPhoto(null);
    setPhotoURL(user?.photoURL || '');
    toast({
      title: '📷 Photo removed',
      description: isGooglePhoto ? 'Your Google profile picture will be used' : 'Profile picture cleared',
    });
  };

  const handleSave = async () => {
    if (!user) {
      toast({
        title: '❌ Not authenticated',
        description: 'Please log in to update your profile.',
        variant: 'destructive'
      });
      return;
    }

    // Validation
    if (!displayName.trim()) {
      toast({
        title: '❌ Name required',
        description: 'Display name cannot be empty.',
        variant: 'destructive'
      });
      return;
    }

    if (displayName.length > 100) {
      toast({
        title: '❌ Name too long',
        description: 'Display name must be less than 100 characters.',
        variant: 'destructive'
      });
      return;
    }

    if (bio.length > 500) {
      toast({
        title: '❌ Bio too long',
        description: 'Bio must be less than 500 characters.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      toast({
        title: '🔄 Updating profile...',
        description: 'Saving your changes...',
      });

      // Determine which photo to use
      const finalPhotoURL = localPhoto || user.photoURL || '';

      // Update Firebase Auth profile (only display name, photo stays as Google's)
      await updateProfile(user, {
        displayName: displayName.trim(),
        // Don't update photoURL in Firebase Auth - keep Google's photo there
      });

      // Update Firestore user document with custom photo
      await userDb.updateUser(user.uid, {
        displayName: displayName.trim(),
        // Store custom photo separately in Firestore
        customPhotoURL: localPhoto || null, // null removes custom photo
        bio: bio.trim()
      });

      toast({
        title: '✅ Profile updated successfully!',
        description: 'Your profile information has been saved.',
      });

      // Refresh page to show updated info
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      
      if (error.code === 'auth/requires-recent-login') {
        toast({
          title: '❌ Re-authentication required',
          description: 'Please log out and log back in before updating your profile.',
          variant: 'destructive'
        });
      } else if (error.code === 'auth/network-request-failed') {
        toast({
          title: '❌ Network error',
          description: 'Please check your internet connection and try again.',
          variant: 'destructive'
        });
      } else if (error.message?.includes('permission')) {
        toast({
          title: '❌ Permission denied',
          description: 'You do not have permission to update this profile.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: '❌ Update failed',
          description: error.message || 'Failed to update profile. Please try again.',
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const getUserInitials = () => {
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }
    return user?.email?.[0].toUpperCase() || 'U';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal information and profile picture</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Photo */}
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage 
                  src={localPhoto || photoURL || user?.photoURL || undefined} 
                  onError={() => setPhotoError(true)}
                  onLoad={() => setPhotoError(false)}
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              {/* Upload button overlay */}
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-lg"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex-1">
              <Label>Profile Photo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingPhoto ? 'Processing...' : 'Upload Photo'}
                </Button>
                {(localPhoto || (userDoc?.customPhotoURL && localPhoto !== null)) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemovePhoto}
                    className="text-red-500 hover:text-red-600"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {isGooglePhoto && !localPhoto ? (
                  <>Using your Google profile picture. Upload a custom photo to change it.</>
                ) : localPhoto ? (
                  <span className="text-green-600">✓ Custom photo selected</span>
                ) : (
                  <>Upload a JPG, PNG, or GIF (max 2MB)</>
                )}
              </p>
              {photoError && (
                <p className="text-xs text-red-500 mt-1">
                  ✗ Unable to load image
                </p>
              )}
            </div>
          </div>

          {/* Display Name */}
          <div>
            <Label htmlFor="displayName">Display Name</Label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="displayName"
                className={`pl-10 ${displayName.length > 100 ? 'border-red-500' : ''}`}
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
              />
            </div>
            <p className={`text-xs mt-1 ${displayName.length > 90 ? 'text-orange-500' : 'text-muted-foreground'}`}>
              {displayName.length}/100 characters
            </p>
          </div>

          {/* Email (Read-only) */}
          <div>
            <Label htmlFor="email">Email Address</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                className="pl-10"
                value={user?.email || ''}
                disabled
                readOnly
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Email cannot be changed. Contact support if you need to update your email.
            </p>
          </div>

          {/* Bio */}
          <div>
            <Label htmlFor="bio">Bio (Optional)</Label>
            <div className="relative mt-1">
              <Textarea
                id="bio"
                placeholder="Tell us a bit about yourself and your business..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={500}
                className={bio.length > 500 ? 'border-red-500' : ''}
              />
            </div>
            <p className={`text-xs mt-1 ${
              bio.length > 450 ? 'text-orange-500 font-medium' : 'text-muted-foreground'
            }`}>
              {bio.length}/500 characters
              {bio.length > 450 && ` (${500 - bio.length} remaining)`}
            </p>
          </div>

          {/* Account Info */}
          <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
            <div>
              <Label className="text-muted-foreground">Member Since</Label>
              <p className="text-sm font-medium mt-1">
                {userDoc?.createdAt?.toDate().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Last Login</Label>
              <p className="text-sm font-medium mt-1">
                {userDoc?.lastLoginAt?.toDate().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Account Type</Label>
              <p className="text-sm font-medium mt-1">
                {userDoc?.authProvider === 'google' ? 'Google Sign-In' : 'Email/Password'}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">User ID</Label>
              <p className="text-sm font-mono font-medium mt-1 truncate">
                {user?.uid}
              </p>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4">
            {hasChanges && (
              <div className="flex items-center gap-2 mr-auto">
                <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse"></div>
                <span className="text-sm text-muted-foreground">Unsaved changes</span>
              </div>
            )}
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={loading || !hasChanges || displayName.length === 0 || displayName.length > 100}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

