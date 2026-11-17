import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError, queryClient } from "@/lib/queryClient";

type Stage = "test" | "paid_no_account" | "refund_window" | "kept" | "kept_used" | "refunded" | "chargeback";

interface Sale {
  licenseId: string; email: string; orderReference: string; agency: boolean;
  amountPaid: number | null; status: string; createdAt: string; signedUpAt: string | null;
  claimed: boolean; stage: Stage; refundWindowEnds: string;
  audits: number; lastAuditAt: string | null; downloads: number; hasKey: boolean; aiSpendUsd: number;
  review: { state: "none" | "asked" | "reviewed"; rating: number | null };
}
interface Signup {
  uid: string; email: string; name: string; createdAt: string;
  licence: "lifetime" | "agency" | null; hasKey: boolean; audits: number; lastAuditAt: string | null; aiSpendUsd: number;
}
interface PeopleResult {
  sales: Sale[]; signups: Signup[];
  totals: { paidSales: number; revenueCents: number; inRefundWindow: number; refunded: number; signups: number };
}

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const spend = (v: number) => (v > 0 ? `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}` : "$0");
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

function StageBadge({ s }: { s: Sale }) {
  const map: Record<Stage, { label: string; tone: "default" | "secondary" | "destructive" | "outline"; hint: string }> = {
    test: { label: "Test ($0)", tone: "outline", hint: "100% discount code, not a real sale" },
    paid_no_account: { label: "Paid, no account yet", tone: "destructive", hint: "Has not signed up with the email they paid with" },
    refund_window: { label: `Refund window: ${daysLeft(s.refundWindowEnds)}d left`, tone: "default", hint: `Can still refund until ${when(s.refundWindowEnds)} (under 3 audits, nothing downloaded)` },
    kept: { label: "Kept: 14 days passed", tone: "secondary", hint: "Refund window closed, sale is final" },
    kept_used: { label: "Kept: used the product", tone: "secondary", hint: "Ran 3+ audits or downloaded a file, sale is final" },
    refunded: { label: "Refunded", tone: "destructive", hint: "Money returned, access ended" },
    chargeback: { label: "Chargeback", tone: "destructive", hint: "Lost a dispute, licence revoked" },
  };
  const m = map[s.stage];
  return <Badge variant={m.tone} title={m.hint} className="whitespace-nowrap">{m.label}</Badge>;
}

/** Admin: every sale (with its stage) and every signup, newest first. */
export default function AdminPeople() {
  const { toast } = useToast();
  const people = useQuery<PeopleResult>({ queryKey: ["/api/admin/people"] });
  const [tab, setTab] = useState<"sales" | "signups">("sales");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const d = people.data;
  if (!d) return null;
  const rows = tab === "sales" ? d.sales : d.signups;
  const visible = showAll ? rows : rows.slice(0, 25);

  const fail = (err: unknown) =>
    toast({ title: "Failed", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });

  const askReview = async (s: Sale) => {
    setBusy(s.licenseId);
    try {
      const name = s.email.split("@")[0];
      const { link } = await api<{ link: string }>("POST", `/api/admin/sales/${encodeURIComponent(s.licenseId)}/review-request`, { name });
      await navigator.clipboard.writeText(link).catch(() => {});
      toast({ title: "Review link copied", description: link });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
    } catch (err) { fail(err); } finally { setBusy(null); }
  };

  const upgrade = async (s: Sale) => {
    if (!window.confirm(`Upgrade ${s.email} to Lifetime Agency for free?`)) return;
    setBusy(s.licenseId);
    try {
      await api("POST", `/api/admin/licenses/${encodeURIComponent(s.licenseId)}/white-label`, { whiteLabel: true });
      toast({ title: "Upgraded to Agency", description: s.email });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
    } catch (err) { fail(err); } finally { setBusy(null); }
  };

  return (
    <Card data-testid="admin-people"><CardContent className="p-6 space-y-4">
      <div className="flex flex-wrap gap-6 text-sm">
        <span>Paid sales: <b>{d.totals.paidSales}</b></span>
        <span>Revenue: <b>{usd(d.totals.revenueCents)}</b></span>
        <span>In refund window: <b>{d.totals.inRefundWindow}</b></span>
        <span>Refunded: <b>{d.totals.refunded}</b></span>
        <span>Signups: <b>{d.totals.signups}</b></span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "sales" ? "default" : "outline"} onClick={() => setTab("sales")}>Sales ({d.sales.length})</Button>
        <Button size="sm" variant={tab === "signups" ? "default" : "outline"} onClick={() => setTab("signups")}>Signups ({d.signups.length})</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {tab === "sales" ? (
            <>
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Bought</th><th className="pr-3 font-medium">Buyer</th><th className="pr-3 font-medium">Plan</th>
                <th className="pr-3 font-medium">Paid</th><th className="pr-3 font-medium">Stage</th><th className="pr-3 font-medium">Usage</th>
                <th className="pr-3 font-medium">AI cost</th><th className="pr-3 font-medium">Review</th><th className="font-medium" />
              </tr></thead>
              <tbody>
                {(visible as Sale[]).map((s) => (
                  <tr key={s.licenseId} className="border-t align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{when(s.createdAt)}</td>
                    <td className="pr-3 break-all">{s.email}{s.signedUpAt && <div className="text-xs text-muted-foreground">signed up {when(s.signedUpAt)}</div>}</td>
                    <td className="pr-3">{s.agency ? "Agency" : "Lifetime"}</td>
                    <td className="pr-3">{s.amountPaid == null ? "?" : usd(s.amountPaid)}</td>
                    <td className="pr-3"><StageBadge s={s} /></td>
                    <td className="pr-3 whitespace-nowrap text-xs">
                      {s.claimed ? (
                        <>
                          {s.audits} audits{s.downloads ? ` · ${s.downloads} downloads` : ""}
                          <div className="text-muted-foreground">{s.hasKey ? "key added" : "no key"}{s.lastAuditAt ? ` · last ${when(s.lastAuditAt)}` : ""}</div>
                        </>
                      ) : "none"}
                    </td>
                    <td className="pr-3 text-xs">{spend(s.aiSpendUsd)}</td>
                    <td className="pr-3 text-xs whitespace-nowrap">
                      {s.review.state === "reviewed" ? `Reviewed${s.review.rating ? ` ${s.review.rating}★` : ""}` : s.review.state === "asked" ? "Asked" : ""}
                    </td>
                    <td className="whitespace-nowrap space-x-1">
                      {s.claimed && !["refunded", "chargeback", "test"].includes(s.stage) && s.review.state === "none" && (
                        <Button size="sm" variant="outline" disabled={busy === s.licenseId} onClick={() => askReview(s)}>Ask for review</Button>
                      )}
                      {s.claimed && !s.agency && !["refunded", "chargeback"].includes(s.stage) && (
                        <Button size="sm" variant={s.review.state === "reviewed" ? "default" : "ghost"} disabled={busy === s.licenseId} onClick={() => upgrade(s)}>Upgrade to Agency</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Signed up</th><th className="pr-3 font-medium">Email</th><th className="pr-3 font-medium">Name</th>
                <th className="pr-3 font-medium">Licence</th><th className="pr-3 font-medium">Key</th><th className="pr-3 font-medium">Audits</th>
                <th className="pr-3 font-medium">Last audit</th><th className="font-medium">AI cost</th>
              </tr></thead>
              <tbody>
                {(visible as Signup[]).map((u) => (
                  <tr key={u.uid} className="border-t">
                    <td className="py-2 pr-3 whitespace-nowrap">{when(u.createdAt)}</td>
                    <td className="pr-3 break-all">{u.email}</td>
                    <td className="pr-3">{u.name}</td>
                    <td className="pr-3">{u.licence ? (u.licence === "agency" ? "Agency" : "Lifetime") : "none"}</td>
                    <td className="pr-3">{u.hasKey ? "yes" : "no"}</td>
                    <td className="pr-3">{u.audits}</td>
                    <td className="pr-3">{when(u.lastAuditAt)}</td>
                    <td>{spend(u.aiSpendUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
      {rows.length > 25 && !showAll && <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>Show all {rows.length}</Button>}
      <p className="text-xs text-muted-foreground">AI cost is what audits and checks cost on the customer's own OpenRouter key, counted from 17 Nov 2026.</p>
    </CardContent></Card>
  );
}
