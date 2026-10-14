import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2 } from "lucide-react";
import AppShell, { FullPageSpinner } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import LoginModal from "@/components/auth/login-modal";
import SignupModal from "@/components/auth/signup-modal";
import { useAuth } from "@/contexts/AuthContext";

const INCLUDED = [
  "AI Readiness Score with estimated readiness for ChatGPT, Perplexity, Gemini and Claude",
  "AI-crawler access check and a Fix-It Playbook tailored to your industry",
  "20 content topic ideas written for your business, every audit",
  "AI Citation Check: 8 real customer questions asked to a live AI search engine",
  "PDF + CSV exports and a 10-file AEO Pack (llms.txt, schema markup, robots.txt rules)",
  "Unlimited domains (fair use), runs on your own OpenRouter key; choose any model",
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [modal, setModal] = useState<"login" | "signup" | null>(null);
  // Dodo returns buyers here with ?payment_id=…&status=succeeded&email=…
  const params = new URLSearchParams(window.location.search);
  const paid = params.get("status") === "succeeded" && !!params.get("payment_id");
  const paidEmail = params.get("email");

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard");
  }, [loading, isAuthenticated, navigate]);

  if (loading || isAuthenticated) return <FullPageSpinner />;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto text-center space-y-8 py-8">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">
            Find out why AI isn't recommending your business, and get the playbook to fix it
          </h1>
          <p className="text-muted-foreground text-lg">
            Sign in to run audits with your Citation Rocket lifetime license.
          </p>
        </div>

        {paid && (
          <Card className="text-left border-green-600/30 bg-green-50 dark:bg-green-950/20" data-testid="purchase-success">
            <CardContent className="p-5 space-y-1.5">
              <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" />Payment received. Thank you!</p>
              <p className="text-sm text-muted-foreground">
                Create your account (or sign in) with {paidEmail ? <b className="text-foreground">{paidEmail}</b> : "the email you used at checkout"}.
                Your license activates automatically once that email is verified. Signing in with Google verifies it instantly.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={() => setModal("signup")} data-testid="button-signup">Create account</Button>
          <Button size="lg" variant="outline" onClick={() => setModal("login")} data-testid="button-login">Sign in</Button>
        </div>

        <Card className="text-left">
          <CardContent className="p-6 space-y-3">
            <h2 className="font-semibold">Your lifetime license includes</h2>
            {INCLUDED.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Don't have a license yet? <a className="text-primary underline" href="https://citationrocket.com/pricing" target="_blank" rel="noreferrer">Get lifetime access</a>
        </p>
      </div>

      <LoginModal isOpen={modal === "login"} onClose={() => setModal(null)} onSwitchToSignup={() => setModal("signup")} />
      <SignupModal isOpen={modal === "signup"} onClose={() => setModal(null)} onSwitchToLogin={() => setModal("login")} />
    </AppShell>
  );
}
