import { useEffect } from "react";
import { useParams } from "wouter";
import Home from "@/pages/home";
import { trackMeta } from "@/lib/meta-pixel";
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
      sessionStorage.setItem(key, "1");
    } catch { /* private mode: fire anyway */ }
    const p = plan as MetaPlan;
    trackMeta("Purchase", { value: PLAN_VALUE_USD[p], currency: "USD", content_name: p === "agency" ? "Lifetime Agency" : "Lifetime", content_type: "product" }, paymentId);
  }, [plan]);
  return <Home />;
}
