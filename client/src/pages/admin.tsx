import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, apiFetch, ApiError } from "@/lib/queryClient";

interface AdminLicense {
  id: string;
  status: string;
  whiteLabel: boolean;
  channel: string;
  codeHint?: string;
  purchaserEmail?: string;
  orderReference?: string;
  activatedBy?: string;
  activatedAt?: string;
  createdAt: string;
  note?: string;
}

interface LookupResult {
  user: null | {
    uid: string; email: string; createdAt?: string; hasKey: boolean; savedAudits: number; failedAudits: number;
    entitlement: { whiteLabel: boolean; licenseId: string } | null;
  };
  licenses: AdminLicense[];
}

interface StatusResult {
  counts: { users: number; licenses: number; activeLicenses: number };
  recentFailures: { auditId: string; domain: string; error?: string; createdAt: string; userId: string }[];
  config: Record<string, boolean>;
}

export default function AdminPage() {
  const { me } = useAuth();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [gen, setGen] = useState({ count: 10, whiteLabel: false, channel: "marketplace", note: "" });

  const status = useQuery<StatusResult>({ queryKey: ["/api/admin/status"], enabled: !!me?.isAdmin });

  const fail = (err: unknown) =>
    toast({ title: "Failed", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });

  const lookup = async () => {
    try {
      setResult(await api<LookupResult>("GET", `/api/admin/lookup?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      fail(err);
    }
  };

  const updateLicense = async (id: string, path: "status" | "white-label", body: object) => {
    try {
      await api("POST", `/api/admin/licenses/${encodeURIComponent(id)}/${path}`, body);
      await lookup();
    } catch (err) {
      fail(err);
    }
  };

  const generate = async () => {
    try {
      const res = await apiFetch("POST", "/api/admin/licenses/generate", { ...gen, note: gen.note || undefined });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `license-codes-${gen.channel}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${gen.count} codes generated`, description: "Store the CSV safely: codes cannot be shown again." });
    } catch (err) {
      fail(err);
    }
  };

  const deleteUser = async (uid: string) => {
    if (!window.confirm("Delete this user, their audits and key? Their license will be released.")) return;
    try {
      await api("DELETE", `/api/admin/users/${uid}`);
      await lookup();
    } catch (err) {
      fail(err);
    }
  };

  if (!me?.isAdmin) return <AppShell><p className="text-center">Admin access required.</p></AppShell>;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Admin</h1>

        {status.data && (
          <Card><CardContent className="p-6 space-y-3">
            <div className="flex flex-wrap gap-6 text-sm">
              <span>Users: <b>{status.data.counts.users}</b></span>
              <span>Licenses: <b>{status.data.counts.licenses}</b></span>
              <span>Active: <b>{status.data.counts.activeLicenses}</b></span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(status.data.config).map(([k, ok]) => (
                <Badge key={k} variant={ok ? "secondary" : "destructive"}>{k}: {ok ? "ok" : "missing"}</Badge>
              ))}
            </div>
          </CardContent></Card>
        )}

        <Card><CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Find user or license</h2>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
            <Input placeholder="email, user id, license code or order id" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" disabled={q.trim().length < 3}>Search</Button>
          </form>

          {result && (
            <div className="space-y-4 text-sm">
              {result.user ? (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex justify-between gap-2">
                    <b className="break-all">{result.user.email}</b>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteUser(result.user!.uid)}>Delete user</Button>
                  </div>
                  <div className="text-muted-foreground break-all">uid {result.user.uid}</div>
                  <div>Entitlement: {result.user.entitlement ? `lifetime${result.user.entitlement.whiteLabel ? " agency" : ""}` : "none"} · key: {result.user.hasKey ? "yes" : "no"} · audits: {result.user.savedAudits} ({result.user.failedAudits} failed)</div>
                </div>
              ) : <p className="text-muted-foreground">No user account found.</p>}

              {result.licenses.length === 0 && <p className="text-muted-foreground">No licenses found.</p>}
              {result.licenses.map((l) => (
                <div key={l.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={l.status === "active" ? "default" : l.status === "available" ? "secondary" : "destructive"}>{l.status}</Badge>
                    <span>{l.channel}</span>
                    {l.codeHint && <span className="text-muted-foreground">code …{l.codeHint}</span>}
                    {l.orderReference && <span className="text-muted-foreground">order {l.orderReference}</span>}
                    {l.purchaserEmail && <span className="text-muted-foreground">{l.purchaserEmail}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                      <Switch checked={l.whiteLabel} onCheckedChange={(v) => updateLicense(l.id, "white-label", { whiteLabel: v })} />
                      White-label
                    </label>
                    {l.status === "active" || l.status === "available" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateLicense(l.id, "status", { status: "revoked" })}>Revoke</Button>
                        <Button size="sm" variant="outline" onClick={() => updateLicense(l.id, "status", { status: "refunded" })}>Mark refunded</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => updateLicense(l.id, "status", { status: "active" })}>Reactivate</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Generate license codes</h2>
          <p className="text-sm text-muted-foreground">For marketplaces, partners or replacements. Codes are shown once, in the downloaded CSV.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>How many</Label>
              <Input type="number" min={1} max={1000} value={gen.count} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Channel</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={gen.channel} onChange={(e) => setGen({ ...gen, channel: e.target.value })}>
                <option value="marketplace">marketplace</option><option value="partner">partner</option><option value="direct">direct</option>
              </select></div>
            <div className="space-y-1.5"><Label>Note</Label>
              <Input placeholder="e.g. PitchGround batch 1" value={gen.note} onChange={(e) => setGen({ ...gen, note: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={gen.whiteLabel} onCheckedChange={(v) => setGen({ ...gen, whiteLabel: v })} /> Agency (white-label)
          </label>
          <Button onClick={generate} disabled={gen.count < 1 || gen.count > 1000}>Generate & download CSV</Button>
        </CardContent></Card>

        {status.data && status.data.recentFailures.length > 0 && (
          <Card><CardContent className="p-6 space-y-2">
            <h2 className="font-semibold">Recent failed audits</h2>
            {status.data.recentFailures.map((f) => (
              <div key={f.auditId} className="text-sm border-b last:border-0 py-2">
                <b>{f.domain}</b> <span className="text-muted-foreground">{new Date(f.createdAt).toLocaleString()} · {f.userId}</span>
                <div className="text-muted-foreground">{f.error}</div>
              </div>
            ))}
          </CardContent></Card>
        )}
      </div>
    </AppShell>
  );
}
