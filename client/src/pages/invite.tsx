import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Gift, Loader2 } from "lucide-react";
import AppShell, { FullPageSpinner } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import LoginModal from "@/components/auth/login-modal";
import SignupModal from "@/components/auth/signup-modal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/auth-service";
import { api, ApiError } from "@/lib/queryClient";
import type { MeResponse, PublicInvite } from "@shared/api";

/**
 * /invite/<code>: an admin invite link. Before sign-in it shows who the invite is
 * for and what it includes. Once signed in it activates the licence (which also
 * drops the capped OpenRouter key into the account) and goes to the dashboard.
 */
export default function InvitePage() {
  const { code = "" } = useParams<{ code: string }>();
  const { user, me, loading, setMe } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [modal, setModal] = useState<"login" | "signup" | null>(null);
  const [state, setState] = useState<"idle" | "activating" | "error">("idle");
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const invite = useQuery<PublicInvite>({
    queryKey: [`/api/public/invite/${encodeURIComponent(code)}`],
    enabled: code.trim().length >= 4,
  });
  const open = invite.data?.valid && invite.data.status === "open";

  useEffect(() => {
    if (loading || !user || !me || !open || state !== "idle") return;
    setState("activating");
    api<MeResponse>("POST", "/api/licenses/activate", { code })
      .then((next) => {
        setMe(next);
        toast({ title: "You're in", description: "Your lifetime licence and trial credit are ready." });
        navigate("/dashboard");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? { message: err.message, code: err.code } : { message: "Please try again." });
        setState("error");
      });
  }, [loading, user, me, open, state, code, setMe, toast, navigate]);

  if (loading || invite.isLoading) return <FullPageSpinner />;

  const d = invite.data;
  const agency = !!d?.whiteLabel;

  let body: React.ReactNode;
  if (!d?.valid) {
    body = <Notice title="This invite link is not valid" text="Check the link you were sent, or ask the person who invited you for a new one." />;
  } else if (d.status === "used") {
    body = (
      <Notice title="This invite has already been used" text="Each invite works once. If that was you, sign in to open your account.">
        {user ? <Button asChild><Link href="/dashboard">Go to dashboard</Link></Button> : <Button onClick={() => setModal("login")}>Sign in</Button>}
      </Notice>
    );
  } else if (d.status !== "open") {
    body = <Notice title="This invite is no longer active" text="Ask the person who invited you if you think this is a mistake." />;
  } else if (state === "error") {
    const alreadyLicensed = error?.code === "ALREADY_LICENSED";
    body = (
      <Notice title={alreadyLicensed ? "This account already has a licence" : "Could not activate the invite"} text={error?.message || "Please try again."}>
        {alreadyLicensed
          ? <Button variant="outline" onClick={() => authService.signOut().then(() => window.location.reload())}>Sign out and use another account</Button>
          : <Button onClick={() => { setError(null); setState("idle"); }}>Try again</Button>}
      </Notice>
    );
  } else if (user) {
    body = (
      <Card className="max-w-xl mx-auto"><CardContent className="p-6 flex items-center gap-3 text-sm">
        <Loader2 className="h-5 w-5 animate-spin" /> Setting up your account…
      </CardContent></Card>
    );
  } else {
    body = (
      <div className="max-w-xl mx-auto text-center space-y-6">
        <Gift className="h-10 w-10 mx-auto text-primary" />
        <h1 className="text-3xl font-bold leading-tight" data-testid="invite-heading">{d.name}, you've been invited to Citation Rocket</h1>
        <p className="text-muted-foreground">Create an account or sign in, and everything is set up for you.</p>
        <Card className="text-left"><CardContent className="p-6 space-y-3 text-sm">
          <Included>Lifetime{agency ? " Agency" : ""} licence, already activated</Included>
          <Included>{d.capUsd ? `$${d.capUsd.toFixed(2)} of audit credit on us` : "Audit credit on us"}, no API key to set up</Included>
          <Included>Run an audit on any site, read the score and the fixes</Included>
        </CardContent></Card>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={() => setModal("signup")} data-testid="button-signup">Create account</Button>
          <Button size="lg" variant="outline" onClick={() => setModal("login")} data-testid="button-login">Sign in</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          When the credit is used up, your licence stays. Add your own OpenRouter key in Settings to keep auditing.
        </p>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="py-8">{body}</div>
      <LoginModal isOpen={modal === "login"} onClose={() => setModal(null)} onSwitchToSignup={() => setModal("signup")} />
      <SignupModal isOpen={modal === "signup"} onClose={() => setModal(null)} onSwitchToLogin={() => setModal("login")} />
    </AppShell>
  );
}

function Included({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <Card className="max-w-xl mx-auto" data-testid="invite-notice"><CardContent className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
      {children}
    </CardContent></Card>
  );
}
