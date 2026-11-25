import { useEffect } from "react";
import AppShell, { FullPageSpinner } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/lib/auth-service";
import { useParams } from "wouter";
import Home from "@/pages/home";
import { trackGa, trackMeta, trackOai } from "@/lib/meta-pixel";
import { PLAN_VALUE_USD, type MetaPlan } from "@shared/meta";

/**
 * Dodo returns buyers to /welcome/<plan>?payment_id=…&status=succeeded&email=….
 * Fires the browser Purchase once per payment (same event id as the server
 * Purchase from the webhook), then shows the normal sign-in page.
 */
export default function Welcome() {
  const { plan } = useParams<{ plan: string }>();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("payment_id");
    if (params.get("status") !== "succeeded" || !paymentId || !(plan in PLAN_VALUE_USD)) return;
    const key = `cr_purchase_${paymentId}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch { /* private mode: fire anyway */ }
    const p = plan as MetaPlan;
    let cancelled = false;
    // Real amount paid (sale prices, discount codes). The webhook may land a moment after the redirect, so ask a few times.
    (async () => {
      let value: number = PLAN_VALUE_USD[p];
      for (let i = 0; i < 5 && !cancelled; i++) {
        try {
          const r = await fetch(`/api/public/purchase/${encodeURIComponent(paymentId)}`);
          const d = r.ok ? await r.json() : null;
          if (d?.known) { value = d.value; break; }
        } catch { /* ignore */ }
        await new Promise((ok) => setTimeout(ok, 1500));
      }
      if (cancelled || value <= 0) return; // $0 test orders are not purchases
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch { /* private mode: fire anyway */ }
      const name = p === "agency" ? "Lifetime Agency" : "Lifetime";
      trackGa("purchase", { transaction_id: paymentId, currency: "USD", value, items: [{ item_id: p, item_name: name, price: value, quantity: 1 }] });
      trackMeta("Purchase", { value, currency: "USD", content_name: name, content_type: "product" }, paymentId);
      trackOai("order_created", { type: "contents", amount: Math.round(value * 100), currency: "USD", contents: [{ id: p, name, content_type: "product", quantity: 1 }] }, { event_id: paymentId });
    })();
    return () => { cancelled = true; };
  }, [plan]);

  // Signed in as someone other than the buyer: say so instead of silently opening that account.
  const { user, loading } = useAuth();
  const paidEmail = new URLSearchParams(window.location.search).get("email")?.toLowerCase() || "";
  if (loading) return <FullPageSpinner />;
  if (user && paidEmail && (user.email || "").toLowerCase() !== paidEmail) {
    return (
      <AppShell>
        <Card className="max-w-xl mx-auto" data-testid="purchase-account-mismatch">
          <CardContent className="p-6 space-y-3">
            <h1 className="text-xl font-semibold">Payment received. One more step</h1>
            <p className="text-sm text-muted-foreground">
              This payment was made with <b className="text-foreground">{paidEmail}</b>, but you are signed in as <b className="text-foreground">{user.email}</b>.
              Licenses attach to the email used at checkout, so sign out and sign in (or create an account) with {paidEmail}.
            </p>
            <Button onClick={() => authService.signOut().then(() => window.location.reload())}>Sign out and continue</Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }
  return <Home />;
}
