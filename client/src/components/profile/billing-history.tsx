import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Receipt, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Invoice {
  id: string;
  date: Date;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  plan: string;
  billingPeriod: string;
  invoiceUrl?: string;
}

export default function BillingHistory() {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      // Real invoice history isn't wired up yet (no DODO API / Firestore invoice
      // records to read from). Intentionally leave `invoices` empty rather than
      // fabricating data — the empty state below tells the user it's coming soon.
    } catch (error: any) {
      console.error('Error loading invoices:', error);
      toast({
        title: '❌ Failed to load invoices',
        description: error.message || 'Could not fetch billing history. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadInvoice = async (invoice: Invoice) => {
    try {
      toast({
        title: '🔄 Preparing invoice...',
        description: 'Generating your invoice PDF...',
      });

      // TODO: Implement actual invoice download from DODO API
      // const response = await fetch(`/api/invoices/${invoice.id}/download`);
      // const blob = await response.blob();
      // const url = window.URL.createObjectURL(blob);
      // const a = document.createElement('a');
      // a.href = url;
      // a.download = `invoice-${invoice.id}.pdf`;
      // a.click();

      // For now, show coming soon message
      setTimeout(() => {
        toast({
          title: '📄 Invoice download',
          description: 'Invoice download will be available soon. You can request invoices via support@aicitationaudit.com',
        });
      }, 500);
    } catch (error: any) {
      toast({
        title: '❌ Download failed',
        description: error.message || 'Failed to download invoice. Please contact support.',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      paid: { variant: 'default' as const, text: 'Paid' },
      pending: { variant: 'secondary' as const, text: 'Pending' },
      failed: { variant: 'destructive' as const, text: 'Failed' }
    };
    const config = variants[status as keyof typeof variants] || variants.paid;
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading billing history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Method
          </CardTitle>
          <CardDescription>Manage your payment information</CardDescription>
        </CardHeader>
        <CardContent>
          {userDoc?.subscriptionPlan === 'free' ? (
            <Alert>
              <AlertDescription>
                No payment method on file. Upgrade to a paid plan to add payment information.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-8 bg-muted rounded flex items-center justify-center">
                  💳
                </div>
                <div>
                  <p className="font-medium">Card ending in ••••</p>
                  <p className="text-sm text-muted-foreground">Managed by DODO Payments</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                Update
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoice History
          </CardTitle>
          <CardDescription>View and download your past invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <Alert>
              <AlertDescription>
                Invoice history coming soon.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">
                        {invoice.date.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="font-medium capitalize">
                        {invoice.plan}
                      </TableCell>
                      <TableCell className="capitalize">
                        {invoice.billingPeriod}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        ${invoice.amount}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(invoice.status)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadInvoice(invoice)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

