import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Sale {
  licenseId: string; email: string; orderReference: string; agency: boolean;
  amountPaid: number | null; status: string; createdAt: string; claimed: boolean; audits: number;
}
interface Signup {
  uid: string; email: string; name: string; createdAt: string;
  licence: "lifetime" | "agency" | null; hasKey: boolean; audits: number;
}
interface PeopleResult {
  sales: Sale[]; signups: Signup[];
  totals: { paidSales: number; revenueCents: number; signups: number };
}

const when = (iso: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Admin: every sale and every signup, newest first. */
export default function AdminPeople() {
  const people = useQuery<PeopleResult>({ queryKey: ["/api/admin/people"] });
  const [tab, setTab] = useState<"sales" | "signups">("sales");
  const [showAll, setShowAll] = useState(false);
  const d = people.data;
  if (!d) return null;
  const rows = tab === "sales" ? d.sales : d.signups;
  const visible = showAll ? rows : rows.slice(0, 25);

  return (
    <Card data-testid="admin-people"><CardContent className="p-6 space-y-4">
      <div className="flex flex-wrap gap-6 text-sm">
        <span>Paid sales: <b>{d.totals.paidSales}</b></span>
        <span>Revenue: <b>{usd(d.totals.revenueCents)}</b></span>
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
                <th className="py-2 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Buyer</th><th className="pr-3 font-medium">Plan</th>
                <th className="pr-3 font-medium">Paid</th><th className="pr-3 font-medium">Account</th><th className="pr-3 font-medium">Audits</th><th className="font-medium">Status</th>
              </tr></thead>
              <tbody>
                {(visible as Sale[]).map((s) => (
                  <tr key={s.licenseId} className="border-t">
                    <td className="py-2 pr-3 whitespace-nowrap">{when(s.createdAt)}</td>
                    <td className="pr-3 break-all">{s.email}</td>
                    <td className="pr-3">{s.agency ? "Agency" : "Lifetime"}</td>
                    <td className="pr-3">{s.amountPaid == null ? "?" : s.amountPaid === 0 ? <Badge variant="outline">test $0</Badge> : usd(s.amountPaid)}</td>
                    <td className="pr-3">{s.claimed ? "signed up" : <Badge variant="destructive">not yet</Badge>}</td>
                    <td className="pr-3">{s.audits}</td>
                    <td>{s.status === "refunded" || s.status === "revoked" ? <Badge variant="destructive">{s.status}</Badge> : "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Email</th><th className="pr-3 font-medium">Name</th>
                <th className="pr-3 font-medium">Licence</th><th className="pr-3 font-medium">Key</th><th className="font-medium">Audits</th>
              </tr></thead>
              <tbody>
                {(visible as Signup[]).map((u) => (
                  <tr key={u.uid} className="border-t">
                    <td className="py-2 pr-3 whitespace-nowrap">{when(u.createdAt)}</td>
                    <td className="pr-3 break-all">{u.email}</td>
                    <td className="pr-3">{u.name}</td>
                    <td className="pr-3">{u.licence ? (u.licence === "agency" ? "Agency" : "Lifetime") : "none"}</td>
                    <td className="pr-3">{u.hasKey ? "yes" : "no"}</td>
                    <td>{u.audits}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
      {rows.length > 25 && !showAll && <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>Show all {rows.length}</Button>}
    </CardContent></Card>
  );
}
