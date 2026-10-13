import { useLocation } from "wouter";
import { ArrowLeft, Rocket, Bell, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ComingSoon() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  // Get feature name from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const feature = urlParams.get('feature') || 'This Feature';

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNotifyMe = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/waitlist/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, feature })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "You're on the list!",
          description: `We'll notify you when ${feature} launches. Check your inbox for confirmation.`,
        });
        setEmail("");
      } else {
        toast({
          title: "Couldn't add to waitlist",
          description: data.error || "Please try again later.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <Card className="border-2 border-primary/20 shadow-2xl">
          <CardContent className="p-12 text-center">
            {/* Icon */}
            <div className="w-24 h-24 bg-gradient-to-br from-primary to-gray-600 rounded-full mx-auto mb-8 flex items-center justify-center">
              <Rocket className="h-12 w-12 text-primary-foreground" />
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-gray-600 bg-clip-text text-transparent">
              {feature} Coming Soon!
            </h1>

            {/* Description */}
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
              We're working hard to bring you this amazing feature. Get notified when it launches and be among the first to try it!
            </p>

            {/* Notify Me Form */}
            <form onSubmit={handleNotifyMe} className="max-w-md mx-auto mb-8">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={isSubmitting}>
                  <Bell className="h-4 w-4 mr-2" />
                  {isSubmitting ? "Adding..." : "Notify Me"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                We'll send you one email when {feature} is ready. No spam, promise!
              </p>
            </form>

            {/* Features Preview */}
            <div className="bg-muted/30 rounded-lg p-6 mb-8">
              <h3 className="font-semibold mb-4 flex items-center justify-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                What to Expect
              </h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground text-left">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span>Powerful features designed for your success</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span>Seamless integration with existing tools</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span>Expert support and documentation</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span>Regular updates and improvements</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                onClick={() => setLocation('/')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation('/help')}
              >
                Visit Help Center
              </Button>
            </div>

            {/* Estimated Launch */}
            <div className="mt-8 pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Estimated Launch:</strong> Coming in the next few weeks
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Follow us for updates and early access announcements
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

