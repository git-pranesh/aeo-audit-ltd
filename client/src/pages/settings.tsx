import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, ExternalLink, KeyRound, Palette, ShieldCheck, Trash2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/auth-service";
import { api, ApiError } from "@/lib/queryClient";
import type { Branding, MeResponse } from "@shared/api";

function Section({ icon: Icon, title, children }: { icon: typeof KeyRound; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { me, setMe, refreshMe, user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const fail = (err: unknown) =>
    toast({ title: "Could not save", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });

  // ─── License ───
  const [code, setCode] = useState("");
  const [activating, setActivating] = useState(false);
  const activate = async () => {
    setActivating(true);
    try {
      setMe(await api<MeResponse>("POST", "/api/licenses/activate", { code }));
      setCode("");
      toast({ title: "License activated", description: "Lifetime access is now active on this account." });
    } catch (err) {
      fail(err);
    } finally {
      setActivating(false);
    }
  };

  // ─── OpenRouter key ───
  const [key, setKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const saveKey = async () => {
    setSavingKey(true);
    try {
      const res = await api<{ warning: string | null; limitRemaining: number | null }>("PUT", "/api/me/openrouter-key", { key });
      setKey("");
      await refreshMe();
      toast({
        title: "Key saved",
        description: res.warning ?? (res.limitRemaining != null ? `Remaining limit on this key: $${res.limitRemaining.toFixed(2)}` : "Your key is encrypted and ready."),
      });
    } catch (err) {
      fail(err);
    } finally {
      setSavingKey(false);
    }
  };
  const removeKey = async () => {
    try {
      await api("DELETE", "/api/me/openrouter-key");
      await refreshMe();
    } catch (err) {
      fail(err);
    }
  };

  // ─── Branding (Agency) ───
  const [branding, setBranding] = useState<Branding>({ agencyName: "", accentColor: "#4F46E5", reportTitle: "AI Readiness Report", footerText: "" });
  useEffect(() => {
    if (me?.branding) setBranding(me.branding);
  }, [me?.branding]);
  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 200_000) {
      toast({ title: "Logo must be a PNG or JPEG under 200 KB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBranding((b) => ({ ...b, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  const saveBranding = async () => {
    try {
      await api("PUT", "/api/me/branding", branding);
      await refreshMe();
      toast({ title: "Branding saved", description: "Your PDFs now use your agency branding." });
    } catch (err) {
      fail(err);
    }
  };

  // ─── Account ───
  const deleteAccount = async () => {
    try {
      await api("DELETE", "/api/me");
      await authService.signOut().catch(() => {});
      navigate("/");
    } catch (err) {
      fail(err);
    }
  };

  if (!me) return <AppShell><p className="text-center text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        <Section icon={ShieldCheck} title="License">
          {me.entitlement ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span>Lifetime{me.entitlement.whiteLabel ? " Agency" : ""} — active</span>
              <Badge variant="secondary" className="ml-auto">since {new Date(me.entitlement.activatedAt).toLocaleDateString()}</Badge>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Bought on citationrocket.com? Your license activates automatically when you sign in with your purchase email
                {me.emailVerified ? "." : " — verify your email first."}
              </p>
              {!me.emailVerified && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={async () => {
                    await authService.sendVerificationEmail();
                    toast({ title: "Verification email sent", description: `Check ${user?.email}, then come back and refresh.` });
                  }}>Send verification email</Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    await user?.reload();
                    await user?.getIdToken(true);
                    await refreshMe();
                  }}>I've verified — refresh</Button>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="code">Or enter a license code</Label>
                <div className="flex gap-2">
                  <Input id="code" placeholder="CR-XXXX-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
                  <Button onClick={activate} disabled={activating || code.trim().length < 4}>{activating ? "Activating…" : "Activate"}</Button>
                </div>
              </div>
            </>
          )}
        </Section>

        <Section icon={KeyRound} title="OpenRouter key">
          <p className="text-sm text-muted-foreground">
            Audits run on your own OpenRouter key — one key covers every model we use. Create a dedicated key with a low
            spending limit (e.g. $5). Typical cost is a few cents per audit.{" "}
            <a className="text-primary inline-flex items-center gap-1 underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
              Create a key <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          {me.openRouterKey && (
            <div className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>Saved key ending in <code>…{me.openRouterKey.last4}</code></span>
              <Button variant="ghost" size="sm" onClick={removeKey}>Remove</Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input type="password" autoComplete="off" placeholder="sk-or-v1-…" value={key} onChange={(e) => setKey(e.target.value)} />
            <Button onClick={saveKey} disabled={savingKey || key.trim().length < 20}>{savingKey ? "Checking…" : me.openRouterKey ? "Replace" : "Save"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Stored encrypted (AES-256-GCM). It is never shown again or sent to your browser.</p>
        </Section>

        {me.entitlement?.whiteLabel && (
          <Section icon={Palette} title="Agency branding">
            <p className="text-sm text-muted-foreground">Applied to your PDF reports. Citation Rocket branding is removed.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Agency name</Label>
                <Input value={branding.agencyName} onChange={(e) => setBranding({ ...branding, agencyName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Report title</Label>
                <Input value={branding.reportTitle} onChange={(e) => setBranding({ ...branding, reportTitle: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Accent colour</Label>
                <div className="flex gap-2">
                  <input type="color" aria-label="Accent colour" className="h-10 w-12 rounded border" value={branding.accentColor}
                    onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })} />
                  <Input value={branding.accentColor} onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })} />
                </div></div>
              <div className="space-y-1.5"><Label>Logo (PNG/JPEG, max 200 KB)</Label>
                <Input type="file" accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} /></div>
            </div>
            {branding.logoDataUrl && (
              <div className="flex items-center gap-3">
                <img src={branding.logoDataUrl} alt="Logo preview" className="h-10 object-contain border rounded p-1" />
                <Button variant="ghost" size="sm" onClick={() => setBranding({ ...branding, logoDataUrl: undefined })}>Remove logo</Button>
              </div>
            )}
            <div className="space-y-1.5"><Label>Footer / contact line</Label>
              <Input placeholder="youragency.com · hello@youragency.com" value={branding.footerText}
                onChange={(e) => setBranding({ ...branding, footerText: e.target.value })} /></div>
            <Button onClick={saveBranding} disabled={!branding.agencyName.trim()}>Save branding</Button>
          </Section>
        )}

        <Section icon={Trash2} title="Delete account">
          <p className="text-sm text-muted-foreground">
            Permanently deletes your audits and saved key. Your license is released so you can activate it again on a new account.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive">Delete my account</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>All audits and your saved OpenRouter key will be deleted. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>
      </div>
    </AppShell>
  );
}
