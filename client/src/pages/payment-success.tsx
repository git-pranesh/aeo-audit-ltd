import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const { userDoc } = useAuth();
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    // Extract payment details from URL query parameters
    const params = new URLSearchParams(window.location.search);
    const payment_id = params.get('payment_id');
    const payment_status = params.get('status');
    
    setPaymentId(payment_id);
    setStatus(payment_status);

    console.log('💳 Payment completed:', { payment_id, status: payment_status });

    // Reload auth context to get updated subscription after 3 seconds
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 3000);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card border border-border shadow-2xl">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-12 w-12 text-green-400" />
          </div>
          
          <h1 className="text-3xl font-bold mb-4">Payment Successful!</h1>
          
          <p className="text-muted-foreground mb-6">
            Your subscription has been activated. You now have access to all premium features.
          </p>

          {userDoc && (
            <div className="bg-muted/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-muted-foreground mb-1">Your Plan</p>
              <p className="text-2xl font-bold capitalize text-primary">
                {userDoc.subscriptionPlan}
              </p>
              {paymentId && (
                <p className="text-xs text-muted-foreground mt-2">
                  Payment ID: {paymentId}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <Button 
              className="w-full" 
              onClick={() => setLocation('/dashboard')}
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setLocation('/')}
            >
              Run Your First Audit
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            Redirecting in 3 seconds...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

