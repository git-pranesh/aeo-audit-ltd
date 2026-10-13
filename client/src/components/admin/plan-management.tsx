import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  Package, 
  DollarSign, 
  Calendar, 
  Zap,
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface CustomPlan {
  name: string;
  slug: string;
  price: number;
  billingType: 'one_time' | 'monthly' | 'annual';
  auditsPerMonth: number;
  topicsPerCategory: number;
  features: string[];
  description: string;
  tagline: string;
  displayOrder: number;
  isActive: boolean;
  dodoProductId: string;
  createdAt: any;
  updatedAt: any;
}

interface NewPlanForm {
  name: string;
  slug: string;
  price: string;
  billingType: 'one_time' | 'monthly' | 'annual';
  auditsPerMonth: string;
  topicsPerCategory: string;
  features: string;
  description: string;
  tagline: string;
  displayOrder: string;
}

const DEFAULT_NEW_PLAN: NewPlanForm = {
  name: '',
  slug: '',
  price: '',
  billingType: 'one_time',
  auditsPerMonth: '-1',
  topicsPerCategory: '25',
  features: '',
  description: '',
  tagline: 'Pay once, use forever!',
  displayOrder: '10'
};

export default function PlanManagement() {
  const { toast } = useToast();
  const [customPlans, setCustomPlans] = useState<Record<string, CustomPlan>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlan, setNewPlan] = useState<NewPlanForm>(DEFAULT_NEW_PLAN);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NewPlanForm>(DEFAULT_NEW_PLAN);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadCustomPlans();
  }, []);

  const loadCustomPlans = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/plans');
      const data = await response.json();
      
      if (data.success) {
        setCustomPlans(data.plans || {});
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error loading custom plans:', error);
      toast({
        title: "Error loading plans",
        description: error.message || "Failed to load custom plans",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleNameChange = (name: string) => {
    setNewPlan(prev => ({
      ...prev,
      name,
      slug: generateSlug(name)
    }));
  };

  const handleCreatePlan = async () => {
    // Validate
    if (!newPlan.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!newPlan.price || parseFloat(newPlan.price) <= 0) {
      toast({ title: "Valid price required", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const features = newPlan.features
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0);

      const response = await apiRequest('POST', '/api/admin/plans', {
        name: newPlan.name.trim(),
        slug: newPlan.slug,
        price: parseFloat(newPlan.price),
        billingType: newPlan.billingType,
        auditsPerMonth: parseInt(newPlan.auditsPerMonth) || -1,
        topicsPerCategory: parseInt(newPlan.topicsPerCategory) || 25,
        features,
        description: newPlan.description.trim(),
        tagline: newPlan.tagline.trim(),
        displayOrder: parseInt(newPlan.displayOrder) || 10
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "✅ Plan created!",
          description: `"${newPlan.name}" has been created and synced to DODO.`,
        });
        setShowCreateForm(false);
        setNewPlan(DEFAULT_NEW_PLAN);
        loadCustomPlans();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error creating plan:', error);
      toast({
        title: "Failed to create plan",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleEditPlan = (slug: string) => {
    const plan = customPlans[slug];
    setEditForm({
      name: plan.name,
      slug: plan.slug,
      price: String(plan.price),
      billingType: plan.billingType,
      auditsPerMonth: String(plan.auditsPerMonth),
      topicsPerCategory: String(plan.topicsPerCategory),
      features: plan.features.join('\n'),
      description: plan.description,
      tagline: plan.tagline || '',
      displayOrder: String(plan.displayOrder)
    });
    setEditingPlan(slug);
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;

    try {
      const features = editForm.features
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0);

      const response = await apiRequest('PATCH', `/api/admin/plans/${editingPlan}`, {
        name: editForm.name.trim(),
        price: parseFloat(editForm.price),
        billingType: editForm.billingType,
        auditsPerMonth: parseInt(editForm.auditsPerMonth) || -1,
        topicsPerCategory: parseInt(editForm.topicsPerCategory) || 25,
        features,
        description: editForm.description.trim(),
        tagline: editForm.tagline.trim(),
        displayOrder: parseInt(editForm.displayOrder) || 10
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "✅ Plan updated!",
          description: `"${editForm.name}" has been updated.`,
        });
        setEditingPlan(null);
        loadCustomPlans();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Failed to update plan",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (slug: string) => {
    const plan = customPlans[slug];
    
    try {
      const response = await apiRequest('PATCH', `/api/admin/plans/${slug}`, {
        isActive: !plan.isActive
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: plan.isActive ? "Plan deactivated" : "Plan activated",
          description: `"${plan.name}" is now ${plan.isActive ? 'hidden' : 'visible'} on pricing page.`,
        });
        loadCustomPlans();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Failed to update plan",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeletePlan = async (slug: string, permanent: boolean = false) => {
    try {
      const response = await apiRequest('DELETE', `/api/admin/plans/${slug}?permanent=${permanent}`);

      const data = await response.json();

      if (data.success) {
        toast({
          title: permanent ? "Plan deleted" : "Plan deactivated",
          description: data.message,
        });
        setDeleteConfirm(null);
        loadCustomPlans();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Failed to delete plan",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'One-Time';
      case 'monthly': return 'Monthly';
      case 'annual': return 'Annual';
      default: return type;
    }
  };

  const getBillingTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'one_time': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'monthly': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'annual': return 'bg-gray-500/20 text-gray-500 border-gray-500/30';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Plan Management
          </h2>
          <p className="text-muted-foreground">
            Create and manage custom pricing plans with DODO integration
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create New Plan
        </Button>
      </div>

      {/* Info Alert */}
      <Alert>
        <Zap className="h-4 w-4" />
        <AlertDescription>
          Custom plans are automatically synced to DODO Payments. You can create one-time, monthly, or annual plans.
        </AlertDescription>
      </Alert>

      {/* Existing Custom Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Plans ({Object.keys(customPlans).length})</CardTitle>
          <CardDescription>
            Plans you've created. These appear on the pricing page alongside default plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(customPlans).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No custom plans created yet.</p>
              <p className="text-sm">Click "Create New Plan" to add your first custom plan.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(customPlans)
                .sort((a, b) => a[1].displayOrder - b[1].displayOrder)
                .map(([slug, plan]) => (
                  <div 
                    key={slug}
                    className={`p-4 border rounded-lg ${plan.isActive ? 'border-border' : 'border-red-500/30 bg-red-500/5'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{plan.name}</h3>
                          <Badge className={getBillingTypeBadgeColor(plan.billingType)}>
                            {getBillingTypeLabel(plan.billingType)}
                          </Badge>
                          {plan.isActive ? (
                            <Badge className="bg-green-500/20 text-green-400">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-400">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                          <div>
                            <span className="text-muted-foreground">Price:</span>
                            <span className="ml-2 font-medium">
                              ${plan.price}
                              {plan.billingType !== 'one_time' && (
                                <span className="text-muted-foreground">
                                  /{plan.billingType === 'monthly' ? 'mo' : 'yr'}
                                </span>
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Audits:</span>
                            <span className="ml-2 font-medium">
                              {plan.auditsPerMonth === -1 ? 'Unlimited' : plan.auditsPerMonth}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Topics/Cat:</span>
                            <span className="ml-2 font-medium">{plan.topicsPerCategory}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">DODO ID:</span>
                            <span className="ml-2 font-mono text-xs">{plan.dodoProductId?.slice(0, 15)}...</span>
                          </div>
                        </div>

                        {plan.features.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {plan.features.slice(0, 4).map((feature, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {feature}
                              </Badge>
                            ))}
                            {plan.features.length > 4 && (
                              <Badge variant="secondary" className="text-xs">
                                +{plan.features.length - 4} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPlan(slug)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(slug)}
                        >
                          {plan.isActive ? (
                            <XCircle className="h-4 w-4 text-red-400" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirm(slug)}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Plan Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Plan
            </DialogTitle>
            <DialogDescription>
              Create a custom pricing plan. This will create a product in DODO Payments automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Plan Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Lite, Starter Plus, Agency"
                  value={newPlan.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (auto-generated)</Label>
                <Input
                  id="slug"
                  placeholder="lite"
                  value={newPlan.slug}
                  onChange={(e) => setNewPlan(prev => ({ ...prev, slug: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price (USD) *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="price"
                    type="number"
                    placeholder="199"
                    value={newPlan.price}
                    onChange={(e) => setNewPlan(prev => ({ ...prev, price: e.target.value }))}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingType">Billing Type *</Label>
                <Select
                  value={newPlan.billingType}
                  onValueChange={(value: 'one_time' | 'monthly' | 'annual') => 
                    setNewPlan(prev => ({ ...prev, billingType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-green-400" />
                        One-Time Payment
                      </div>
                    </SelectItem>
                    <SelectItem value="monthly">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-400" />
                        Monthly Recurring
                      </div>
                    </SelectItem>
                    <SelectItem value="annual">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        Annual Recurring
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="auditsPerMonth">Audits per Month</Label>
                <Input
                  id="auditsPerMonth"
                  type="number"
                  placeholder="-1 for unlimited"
                  value={newPlan.auditsPerMonth}
                  onChange={(e) => setNewPlan(prev => ({ ...prev, auditsPerMonth: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Use -1 for unlimited</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="topicsPerCategory">Topics per Category</Label>
                <Input
                  id="topicsPerCategory"
                  type="number"
                  placeholder="25"
                  value={newPlan.topicsPerCategory}
                  onChange={(e) => setNewPlan(prev => ({ ...prev, topicsPerCategory: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Short description for the plan"
                value={newPlan.description}
                onChange={(e) => setNewPlan(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline (shown below price)</Label>
              <Input
                id="tagline"
                placeholder="e.g., Pay once, use forever!"
                value={newPlan.tagline}
                onChange={(e) => setNewPlan(prev => ({ ...prev, tagline: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                This text appears below the price on the pricing page (e.g., "Pay once, use forever!")
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="features">Features (one per line)</Label>
              <Textarea
                id="features"
                placeholder="50 audits total&#10;10 topics per category&#10;PDF export&#10;Email support"
                value={newPlan.features}
                onChange={(e) => setNewPlan(prev => ({ ...prev, features: e.target.value }))}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                These will be shown as bullet points on the pricing page
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayOrder">Display Order</Label>
              <Input
                id="displayOrder"
                type="number"
                placeholder="10"
                value={newPlan.displayOrder}
                onChange={(e) => setNewPlan(prev => ({ ...prev, displayOrder: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first (default plans are 1-4)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePlan} disabled={creating}>
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create Plan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={() => setEditingPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Plan: {editForm.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Audits per Month</Label>
                <Input
                  type="number"
                  value={editForm.auditsPerMonth}
                  onChange={(e) => setEditForm(prev => ({ ...prev, auditsPerMonth: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Topics per Category</Label>
                <Input
                  type="number"
                  value={editForm.topicsPerCategory}
                  onChange={(e) => setEditForm(prev => ({ ...prev, topicsPerCategory: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Features (one per line)</Label>
              <Textarea
                value={editForm.features}
                onChange={(e) => setEditForm(prev => ({ ...prev, features: e.target.value }))}
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label>Tagline (shown below price)</Label>
              <Input
                placeholder="e.g., Pay once, use forever!"
                value={editForm.tagline}
                onChange={(e) => setEditForm(prev => ({ ...prev, tagline: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={editForm.displayOrder}
                onChange={(e) => setEditForm(prev => ({ ...prev, displayOrder: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlan(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm && customPlans[deleteConfirm]?.name}"?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertDescription>
                <strong>Warning:</strong> Permanent deletion cannot be undone. 
                The DODO product will remain but will no longer be linked to this plan.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button 
              variant="outline"
              onClick={() => deleteConfirm && handleDeletePlan(deleteConfirm, false)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Deactivate Only
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deleteConfirm && handleDeletePlan(deleteConfirm, true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

