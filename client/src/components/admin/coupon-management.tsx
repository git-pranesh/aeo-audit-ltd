import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Copy, Tag, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, Timestamp } from "firebase/firestore";

interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  validFrom: Timestamp;
  validUntil: Timestamp;
  maxUses: number;
  timesUsed: number;
  applicablePlans: string[];
  isActive: boolean;
  createdBy: string;
}

interface AppSumoCode {
  id: string;
  code: string;
  isRedeemed: boolean;
  redeemedBy: string | null;
  redeemedAt: Timestamp | null;
  plan: 'lifetime';
  createdAt: Timestamp;
}

export default function CouponManagement() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [appSumoCodes, setAppSumoCodes] = useState<AppSumoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCoupon, setShowCreateCoupon] = useState(false);
  const [showCreateAppSumo, setShowCreateAppSumo] = useState(false);

  // Coupon form state
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 10,
    maxUses: 100,
    applicablePlans: ['starter', 'pro', 'enterprise']
  });

  // AppSumo code form state
  const [appSumoCode, setAppSumoCode] = useState('');
  const [appSumoCount, setAppSumoCount] = useState(1);

  useEffect(() => {
    loadCoupons();
    loadAppSumoCodes();
  }, []);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const couponsRef = collection(db, 'coupons');
      const snapshot = await getDocs(couponsRef);
      const couponData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Coupon));
      setCoupons(couponData);
    } catch (error) {
      console.error('Error loading coupons:', error);
      toast({
        title: "Error loading coupons",
        description: "Failed to fetch coupon list.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAppSumoCodes = async () => {
    try {
      const appSumoRef = collection(db, 'appsumo');
      const snapshot = await getDocs(appSumoRef);
      const codes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AppSumoCode));
      setAppSumoCodes(codes);
    } catch (error) {
      console.error('Error loading AppSumo codes:', error);
    }
  };

  const handleCreateCoupon = async () => {
    if (!newCoupon.code) {
      toast({
        title: "Validation error",
        description: "Coupon code is required.",
        variant: "destructive",
      });
      return;
    }

    // Check if using fixed discount type (not supported by DODO)
    if (newCoupon.discountType === 'fixed') {
      toast({
        title: "Fixed discounts not supported",
        description: "DODO Payments only supports percentage discounts. Please use percentage type instead.",
        variant: "destructive",
      });
      return;
    }

    try {
      const now = Timestamp.now();
      const oneMonthLater = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

      // Step 1: Create coupon in DODO Payments first
      toast({
        title: "Creating coupon...",
        description: "Syncing with payment provider...",
      });

      const dodoResponse = await apiRequest('POST', '/api/admin/coupons/create', {
        code: newCoupon.code.toUpperCase(),
        discountType: newCoupon.discountType,
        discountValue: newCoupon.discountValue,
        applicablePlans: newCoupon.applicablePlans,
        maxUses: newCoupon.maxUses,
        validUntil: oneMonthLater.toDate().toISOString()
      });

      const dodoResult = await dodoResponse.json();

      if (!dodoResult.success) {
        throw new Error(dodoResult.error || 'Failed to create coupon in DODO');
      }

      console.log('✅ Coupon created in DODO:', dodoResult.discountId);

      // Step 2: Save to Firestore for internal tracking
      await addDoc(collection(db, 'coupons'), {
        code: newCoupon.code.toUpperCase(),
        discountType: newCoupon.discountType,
        discountValue: newCoupon.discountValue,
        validFrom: now,
        validUntil: oneMonthLater,
        maxUses: newCoupon.maxUses,
        timesUsed: 0,
        applicablePlans: newCoupon.applicablePlans,
        isActive: true,
        createdBy: 'admin',
        dodoDiscountId: dodoResult.discountId // Store DODO ID for reference
      });

      toast({
        title: "Coupon created successfully!",
        description: `Coupon code "${newCoupon.code}" has been created successfully.`,
      });

      setShowCreateCoupon(false);
      setNewCoupon({
        code: '',
        discountType: 'percentage',
        discountValue: 10,
        maxUses: 100,
        applicablePlans: ['starter', 'pro', 'enterprise']
      });
      loadCoupons();
    } catch (error) {
      console.error('Error creating coupon:', error);
      toast({
        title: "Creation failed",
        description: "Failed to create coupon. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateAppSumoCodes = async () => {
    if (!appSumoCode) {
      toast({
        title: "Validation error",
        description: "Base code is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      const promises = [];
      for (let i = 1; i <= appSumoCount; i++) {
        const code = `${appSumoCode.toUpperCase()}-${String(i).padStart(4, '0')}`;
        promises.push(
          addDoc(collection(db, 'appsumo'), {
            code: code,
            isRedeemed: false,
            redeemedBy: null,
            redeemedAt: null,
            plan: 'lifetime',
            createdAt: Timestamp.now()
          })
        );
      }

      await Promise.all(promises);

      toast({
        title: "AppSumo codes created",
        description: `${appSumoCount} lifetime deal codes created successfully.`,
      });

      setShowCreateAppSumo(false);
      setAppSumoCode('');
      setAppSumoCount(1);
      loadAppSumoCodes();
    } catch (error) {
      console.error('Error creating AppSumo codes:', error);
      toast({
        title: "Creation failed",
        description: "Failed to create AppSumo codes. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCoupon = async (id: string, code: string) => {
    if (!confirm(`Delete coupon "${code}"?`)) return;

    try {
      await deleteDoc(doc(db, 'coupons', id));
      toast({
        title: "Coupon deleted",
        description: `Coupon "${code}" has been deleted.`,
      });
      loadCoupons();
    } catch (error) {
      console.error('Error deleting coupon:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete coupon.",
        variant: "destructive",
      });
    }
  };

  const handleToggleCoupon = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'coupons', id), {
        isActive: !currentStatus
      });
      toast({
        title: currentStatus ? "Coupon deactivated" : "Coupon activated",
        description: "Coupon status updated successfully.",
      });
      loadCoupons();
    } catch (error) {
      console.error('Error toggling coupon:', error);
      toast({
        title: "Update failed",
        description: "Failed to update coupon status.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `"${text}" copied to clipboard.`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coupon & Discount Management</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="coupons" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="coupons">
              <Tag className="h-4 w-4 mr-2" />
              Discount Coupons
            </TabsTrigger>
            <TabsTrigger value="appsumo">
              <Gift className="h-4 w-4 mr-2" />
              AppSumo LTD Codes
            </TabsTrigger>
          </TabsList>

          {/* Discount Coupons Tab */}
          <TabsContent value="coupons" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Create and manage discount codes for subscriptions
              </p>
              <Button onClick={() => setShowCreateCoupon(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Coupon
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading coupons...</p>
              </div>
            ) : coupons.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No coupons yet</h3>
                <p className="text-muted-foreground mb-4">Create your first discount coupon</p>
                <Button onClick={() => setShowCreateCoupon(true)} size="sm">
                  Create Coupon
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell className="font-mono font-semibold">
                          <div className="flex items-center gap-2">
                            {coupon.code}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(coupon.code)}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {coupon.discountType === 'percentage' 
                            ? `${coupon.discountValue}%` 
                            : `$${coupon.discountValue}`
                          }
                        </TableCell>
                        <TableCell className="text-sm">
                          {coupon.validUntil?.toDate().toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {coupon.timesUsed} / {coupon.maxUses}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={coupon.isActive ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() => handleToggleCoupon(coupon.id, coupon.isActive)}
                          >
                            {coupon.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCoupon(coupon.id, coupon.code)}
                            className="text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* AppSumo Codes Tab */}
          <TabsContent value="appsumo" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Manage AppSumo lifetime deal redemption codes
              </p>
              <Button onClick={() => setShowCreateAppSumo(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Generate Codes
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <Card className="bg-blue-500/10 border-blue-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Total Codes</p>
                  <p className="text-2xl font-bold text-blue-400">{appSumoCodes.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-green-500/10 border-green-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Redeemed</p>
                  <p className="text-2xl font-bold text-green-400">
                    {appSumoCodes.filter(c => c.isRedeemed).length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-orange-500/10 border-orange-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Available</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {appSumoCodes.filter(c => !c.isRedeemed).length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {appSumoCodes.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No AppSumo codes yet</h3>
                <p className="text-muted-foreground mb-4">Generate lifetime deal codes for AppSumo campaign</p>
                <Button onClick={() => setShowCreateAppSumo(true)} size="sm">
                  Generate Codes
                </Button>
              </div>
            ) : (
              <div className="rounded-md border max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Redeemed By</TableHead>
                      <TableHead>Redeemed Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appSumoCodes.map((code) => (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono font-semibold">
                          <div className="flex items-center gap-2">
                            {code.code}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(code.code)}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={code.isRedeemed ? "secondary" : "default"}>
                            {code.isRedeemed ? 'Redeemed' : 'Available'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {code.redeemedBy || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {code.redeemedAt?.toDate().toLocaleDateString() || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(code.code)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create Coupon Dialog */}
        <Dialog open={showCreateCoupon} onOpenChange={setShowCreateCoupon}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Discount Coupon</DialogTitle>
              <DialogDescription>
                Generate a new discount code for subscriptions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="coupon-code">Coupon Code</Label>
                <Input
                  id="coupon-code"
                  placeholder="SUMMER2024"
                  value={newCoupon.code}
                  onChange={(e) => setNewCoupon({...newCoupon, code: e.target.value})}
                  className="uppercase"
                />
              </div>
              
              <div>
                <Label htmlFor="discount-type">Discount Type</Label>
                <Select 
                  value={newCoupon.discountType} 
                  onValueChange={(value: 'percentage' | 'fixed') => 
                    setNewCoupon({...newCoupon, discountType: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed" disabled>Fixed Amount ($) - Not supported</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-yellow-500 mt-1">
                  ⚠️ Note: DODO Payments only supports percentage discounts
                </p>
              </div>

              <div>
                <Label htmlFor="discount-value">Discount Value</Label>
                <Input
                  id="discount-value"
                  type="number"
                  value={newCoupon.discountValue}
                  onChange={(e) => setNewCoupon({...newCoupon, discountValue: Number(e.target.value)})}
                />
              </div>

              <div>
                <Label htmlFor="max-uses">Maximum Uses</Label>
                <Input
                  id="max-uses"
                  type="number"
                  value={newCoupon.maxUses}
                  onChange={(e) => setNewCoupon({...newCoupon, maxUses: Number(e.target.value)})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowCreateCoupon(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCoupon}>
                Create Coupon
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create AppSumo Codes Dialog */}
        <Dialog open={showCreateAppSumo} onOpenChange={setShowCreateAppSumo}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Generate AppSumo Codes</DialogTitle>
              <DialogDescription>
                Create lifetime deal redemption codes for AppSumo campaign
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="appsumo-base">Base Code</Label>
                <Input
                  id="appsumo-base"
                  placeholder="APPSUMO2024"
                  value={appSumoCode}
                  onChange={(e) => setAppSumoCode(e.target.value)}
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Codes will be generated as: {appSumoCode.toUpperCase() || 'BASE'}-0001, {appSumoCode.toUpperCase() || 'BASE'}-0002, etc.
                </p>
              </div>
              
              <div>
                <Label htmlFor="code-count">Number of Codes</Label>
                <Input
                  id="code-count"
                  type="number"
                  min="1"
                  max="1000"
                  value={appSumoCount}
                  onChange={(e) => setAppSumoCount(Number(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowCreateAppSumo(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAppSumoCodes}>
                Generate {appSumoCount} Code{appSumoCount > 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

