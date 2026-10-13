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
  "AI Readiness Score across ChatGPT, Perplexity, Gemini and Claude",
  "Fix-It Playbook with step-by-step actions",
  "Content topic ideas and industry benchmark",
  "Manual AI Citation Snapshot",
  "PDF + CSV exports and the AEO Pack (llms.txt, schema, robots.txt)",
  "Unlimited domains (fair use) — runs on your own OpenRouter key",
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [modal, setModal] = useState<"login" | "signup" | null>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard");
  }, [loading, isAuthenticated, navigate]);

  if (loading || isAuthenticated) return <FullPageSpinner />;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto text-center space-y-8 py-8">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">
            Find out why AI isn't recommending your business — and get the playbook to fix it
          </h1>
          <p className="text-muted-foreground text-lg">
            Sign in to run audits with your Citation Rocket lifetime license.
          </p>
        </div>

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
          Don't have a license yet? <a className="text-primary underline" href="https://www.citationrocket.com" target="_blank" rel="noreferrer">Get lifetime access</a>
        </p>
      </div>

      <LoginModal isOpen={modal === "login"} onClose={() => setModal(null)} onSwitchToSignup={() => setModal("signup")} />
      <SignupModal isOpen={modal === "signup"} onClose={() => setModal(null)} onSwitchToLogin={() => setModal("login")} />
    </AppShell>
  );
}
