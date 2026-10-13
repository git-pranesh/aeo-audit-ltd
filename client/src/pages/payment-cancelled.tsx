import { useLocation } from "wouter";
import { XCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PaymentCancelled() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card border border-border shadow-2xl">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="h-12 w-12 text-yellow-400" />
          </div>
          
          <h1 className="text-3xl font-bold mb-4">Payment Cancelled</h1>
          
          <p className="text-muted-foreground mb-6">
            Your payment was cancelled. No charges were made to your account. You can try again anytime.
          </p>

          <div className="space-y-3">
            <Button 
              className="w-full" 
              onClick={() => setLocation('/pricing')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Return to Pricing
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setLocation('/')}
            >
              Go to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

