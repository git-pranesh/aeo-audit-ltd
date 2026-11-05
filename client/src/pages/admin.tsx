import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, apiFetch, ApiError, queryClient } from "@/lib/queryClient";
import type { AdminInvite } from "@shared/api";

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

        <InvitesCard />

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

interface InvitesResult { invites: AdminInvite[]; configured: boolean; defaultCapUsd: number; maxCapUsd: number }

const money = (n: number | null | undefined) => (n == null ? "–" : `$${n.toFixed(2)}`);

/** One link per guest: partner licence + capped OpenRouter key, nothing for them to set up. */
function InvitesCard() {
  const { toast } = useToast();
  const data = useQuery<InvitesResult>({ queryKey: ["/api/admin/invites"], staleTime: 15_000 });
  const [form, setForm] = useState({ name: "", note: "", capUsd: "", whiteLabel: false });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; link: string } | null>(null);

  const fail = (err: unknown) =>
    toast({ title: "Failed", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Link copied" });
    } catch {
      window.prompt("Copy this link", text);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const capUsd = form.capUsd.trim() === "" ? data.data?.defaultCapUsd ?? 5 : Number(form.capUsd);
      const res = await api<{ id: string; link: string }>("POST", "/api/admin/invites", {
        name: form.name.trim(), note: form.note.trim() || undefined, capUsd, whiteLabel: form.whiteLabel,
      });
      setCreated({ name: form.name.trim(), link: res.link });
      setForm({ name: "", note: "", capUsd: "", whiteLabel: false });
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (inv: AdminInvite) => {
    try {
      const { link } = await api<{ link: string | null }>("GET", `/api/admin/invites/${encodeURIComponent(inv.id)}/link`);
      if (!link) {
        toast({ title: "Link no longer available", description: "The invite has been used or revoked." });
        return;
      }
      await copy(link);
    } catch (err) {
      fail(err);
    }
  };

  const revoke = async (inv: AdminInvite) => {
    if (!window.confirm(`Revoke ${inv.name}'s invite? Their licence is removed and the OpenRouter key is disabled.`)) return;
    try {
      const res = await api<{ keyDisabled: boolean }>("POST", `/api/admin/invites/${encodeURIComponent(inv.id)}/revoke`);
      if (!res.keyDisabled) {
        toast({ title: "Licence revoked", description: "The OpenRouter key could not be disabled. Disable it at openrouter.ai.", variant: "destructive" });
      }
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  const changeCap = async (inv: AdminInvite) => {
    const raw = window.prompt(`New dollar cap for ${inv.name} (max $${data.data?.maxCapUsd ?? 100})`, String(inv.capUsd));
    if (raw == null) return;
    const capUsd = Number(raw);
    if (!Number.isFinite(capUsd) || capUsd < 0) {
      toast({ title: "Enter a number", variant: "destructive" });
      return;
    }
    try {
      await api("POST", `/api/admin/invites/${encodeURIComponent(inv.id)}/cap`, { capUsd });
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  const invites = data.data?.invites ?? [];
  const configured = data.data?.configured ?? true;

  return (
    <Card data-testid="admin-invites"><CardContent className="p-6 space-y-4">
      <div>
        <h2 className="font-semibold">Invites</h2>
        <p className="text-sm text-muted-foreground">
          One link per person: a lifetime licence plus audit credit on your OpenRouter account, capped per invite. They sign in and audit; nothing to set up.
        </p>
      </div>
      {!configured && (
        <p className="text-sm text-destructive">OPENROUTER_MANAGEMENT_KEY is not set on the server, so invites cannot be created yet.</p>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label htmlFor="inv-name">Name</Label>
          <Input id="inv-name" placeholder="e.g. Stella" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="inv-cap">Credit cap (USD)</Label>
          <Input id="inv-cap" type="number" min={0} max={data.data?.maxCapUsd ?? 100} step="0.5" placeholder={String(data.data?.defaultCapUsd ?? 5)} value={form.capUsd} onChange={(e) => setForm({ ...form, capUsd: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="inv-note">Note</Label>
          <Input id="inv-note" placeholder="e.g. LinkedIn creator, IndieAppCircle" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.whiteLabel} onCheckedChange={(v) => setForm({ ...form, whiteLabel: v })} /> Agency (white-label)
        </label>
        <Button onClick={create} disabled={busy || !configured || form.name.trim().length === 0} data-testid="button-create-invite">
          {busy ? "Creating…" : "Create invite link"}
        </Button>
      </div>

      {created && (
        <div className="rounded-md border border-green-600/30 bg-green-50 dark:bg-green-950/20 p-3 text-sm space-y-2" data-testid="invite-created">
          <p className="font-medium">Invite for {created.name} is ready</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all text-xs">{created.link}</code>
            <Button size="sm" variant="outline" onClick={() => copy(created.link)}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
          </div>
          <p className="text-muted-foreground">Send it however you like. You can copy it again from the list until it is used.</p>
        </div>
      )}

      {data.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!data.isLoading && invites.length === 0 && <p className="text-sm text-muted-foreground">No invites yet.</p>}
      <div className="space-y-2 text-sm">
        {invites.map((inv) => (
          <div key={inv.id} className="rounded-md border p-3 space-y-2" data-testid={`invite-${inv.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={inv.status === "active" ? "default" : inv.status === "available" ? "secondary" : "destructive"}>
                {inv.status === "available" ? "not used yet" : inv.status === "active" ? "activated" : inv.status}
              </Badge>
              <b>{inv.name}</b>
              {inv.whiteLabel && <span className="text-muted-foreground">agency</span>}
              {inv.note && <span className="text-muted-foreground">· {inv.note}</span>}
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span>Created {new Date(inv.createdAt).toLocaleDateString()}</span>
              {inv.activatedEmail && (
                <span>by <b className="text-foreground break-all">{inv.activatedEmail}</b>{inv.activatedAt ? ` on ${new Date(inv.activatedAt).toLocaleDateString()}` : ""}</span>
              )}
              {inv.status === "active" && <span>Audits: <b className="text-foreground">{inv.audits}</b></span>}
              <span>
                Spent: <b className="text-foreground">{inv.key ? money(inv.key.usage) : "?"}</b> of {money(inv.key?.limit ?? inv.capUsd)}
                {inv.key?.disabled ? " (key disabled)" : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {inv.linkAvailable && <Button size="sm" variant="outline" onClick={() => copyLink(inv)}><Link2 className="h-3.5 w-3.5 mr-1" />Copy link</Button>}
              {(inv.status === "active" || inv.status === "available") && (
                <>
                  <Button size="sm" variant="outline" onClick={() => changeCap(inv)}>Change cap</Button>
                  <Button size="sm" variant="outline" onClick={() => revoke(inv)}>Revoke</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}
