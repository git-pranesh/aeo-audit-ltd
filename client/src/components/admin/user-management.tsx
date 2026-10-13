import { useState, useEffect } from "react";
import { 
  Search, 
  MoreVertical, 
  Edit, 
  Trash2, 
  RefreshCw,
  Shield,
  Crown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { adminDb } from "@/lib/admin-firestore";
import type { UserDocument } from "@/lib/firestore-utils";

export default function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<string>('all');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const allUsers = await adminDb.getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: "Error loading users",
        description: "Failed to fetch user list. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (uid: string, newPlan: string) => {
    try {
      await adminDb.updateUserSubscription(
        uid, 
        newPlan as any, 
        'active'
      );
      
      toast({
        title: "Subscription updated",
        description: "User subscription plan has been changed successfully.",
      });
      
      loadUsers(); // Reload users
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast({
        title: "Update failed",
        description: "Failed to update user subscription. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResetUsage = async (uid: string) => {
    try {
      await adminDb.resetUserMonthlyUsage(uid);
      
      toast({
        title: "Usage reset",
        description: "User's monthly usage has been reset to 0.",
      });
      
      loadUsers();
    } catch (error) {
      console.error('Error resetting usage:', error);
      toast({
        title: "Reset failed",
        description: "Failed to reset user usage. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    if (!confirm(`Are you sure you want to delete user ${email}? This action cannot be undone.`)) {
      return;
    }

    try {
      await adminDb.deleteUser(uid);
      
      toast({
        title: "User deleted",
        description: "User has been permanently deleted.",
      });
      
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete user. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPlan = filterPlan === 'all' || user.subscriptionPlan === filterPlan;
    
    return matchesSearch && matchesPlan;
  });

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <div className="flex flex-col md:flex-row gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Filter by plan" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={loadUsers} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading users...</p>
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
                  <TableHead>Usage</TableHead>
                  <TableHead>Total Audits</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.uid}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.displayName}
                          {user.isAdmin && (
                            <span title="Admin">
                              <Shield className="h-4 w-4 text-red-400" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge className={`capitalize ${getPlanColor(user.subscriptionPlan)}`}>
                          {user.subscriptionPlan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                          {user.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.auditsUsedThisMonth} this month
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.totalAuditsRun}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.createdAt?.toDate().toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem onClick={() => handleChangePlan(user.uid, 'starter')}>
                              <Crown className="mr-2 h-4 w-4" />
                              Set to Starter
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangePlan(user.uid, 'pro')}>
                              <Crown className="mr-2 h-4 w-4" />
                              Set to Pro
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangePlan(user.uid, 'enterprise')}>
                              <Crown className="mr-2 h-4 w-4" />
                              Set to Enterprise
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangePlan(user.uid, 'lifetime')}>
                              <Crown className="mr-2 h-4 w-4" />
                              Set to Lifetime
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem onClick={() => handleResetUsage(user.uid)}>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Reset Monthly Usage
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            {!user.isAdmin && (
                              <DropdownMenuItem 
                                onClick={() => handleDeleteUser(user.uid, user.email)}
                                className="text-red-400"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete User
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        
        {!loading && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        )}
      </CardContent>
    </Card>
  );
}

