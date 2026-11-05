import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/auth-service";
import { api, ApiError, queryClient } from "@/lib/queryClient";
import type { KeyUsage, MeResponse } from "@shared/api";

export const BUY_URL = "https://citationrocket.com/pricing";

function useFail() {
  const { toast } = useToast();
  return (err: unknown) =>
    toast({ title: "Could not save", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });
}

/** License status + activation. Used on the dashboard (onboarding) and in Settings. */
export function LicenseSetup() {
  const { me, setMe, refreshMe, user } = useAuth();
  const { toast } = useToast();
  const fail = useFail();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  if (me.entitlement) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        Lifetime{me.entitlement.whiteLabel ? " Agency" : ""} license active
      </div>
    );
  }

  const activate = async () => {
    setBusy(true);
    try {
      setMe(await api<MeResponse>("POST", "/api/licenses/activate", { code }));
      setCode("");
      toast({ title: "License activated" });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {me.emailVerified
          ? <>Bought with <b>{me.email}</b>? It activates automatically. <button className="text-primary underline" onClick={() => refreshMe()}>Check again</button>.</>
          : <>Bought with this email? Verify it and your license activates automatically.</>}
      </p>
      {!me.emailVerified && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={async () => {
            await authService.sendVerificationEmail();
            toast({ title: "Verification email sent", description: `Check ${user?.email}.` });
          }}>Send verification email</Button>
          <Button size="sm" variant="ghost" onClick={async () => {
            await user?.reload();
            await user?.getIdToken(true);
            await refreshMe();
          }}>I've verified</Button>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="license-code">Have a license code?</Label>
        <div className="flex gap-2">
          <Input id="license-code" placeholder="CR-XXXX-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button onClick={activate} disabled={busy || code.trim().length < 4}>{busy ? "Activating…" : "Activate"}</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        No license yet? <a className="text-primary underline" href={BUY_URL} target="_blank" rel="noreferrer">Get lifetime access</a> and use this same email at checkout.
      </p>
    </div>
  );
}

/** BYOK key entry. Works before or after the license is activated. */
export function KeySetup() {
  const { me, refreshMe } = useAuth();
  const { toast } = useToast();
  const fail = useFail();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const sponsored = !!me?.openRouterKey?.sponsored;
  // Live balance from OpenRouter. Shown for every saved key; essential for a sponsored one.
  const usage = useQuery<KeyUsage>({
    queryKey: ["/api/me/openrouter-key/usage"],
    enabled: !!me?.openRouterKey,
    staleTime: 60_000,
  });
  if (!me) return null;

  const save = async () => {
    setBusy(true);
    try {
      const res = await api<{ warning: string | null; limitRemaining: number | null }>("PUT", "/api/me/openrouter-key", { key });
      setKey("");
      await refreshMe();
      await queryClient.invalidateQueries({ queryKey: ["/api/me/openrouter-key/usage"] });
      toast({
        title: "Key saved",
        description: res.warning ?? (res.limitRemaining != null ? `Remaining limit on this key: $${res.limitRemaining.toFixed(2)}` : "Encrypted and ready."),
      });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api("DELETE", "/api/me/openrouter-key");
      await refreshMe();
    } catch (err) {
      fail(err);
    }
  };

  const u = usage.data;
  const balance = u && u.limit != null
    ? `$${(u.limit - (u.limitRemaining ?? 0)).toFixed(2)} of $${u.limit.toFixed(2)} used`
    : u && u.usage != null ? `$${u.usage.toFixed(2)} used, no limit set` : null;

  return (
    <div className="space-y-3">
      {sponsored ? (
        <p className="text-sm text-muted-foreground">
          Citation Rocket is covering your audit credit. When it runs out your licence stays; add your own OpenRouter key below to keep auditing.{" "}
          <a className="text-primary inline-flex items-center gap-1 underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
            Create a key <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Audits run on your own OpenRouter account (under $0.001 per audit with the default model). One key covers every model.
          Create a dedicated key with a low spending limit, e.g. $5.{" "}
          <a className="text-primary inline-flex items-center gap-1 underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
            Create a key <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      )}
      {me.openRouterKey && (
        <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm" data-testid="key-status">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            {sponsored ? <>Trial key from Citation Rocket</> : <>Key ending in <code>…{me.openRouterKey.last4}</code></>}
            {balance && <span className="text-muted-foreground">· {balance}</span>}
          </span>
          <Button variant="ghost" size="sm" onClick={remove}>Remove</Button>
        </div>
      )}
      <div className="flex gap-2">
        <Input type="password" autoComplete="off" placeholder="sk-or-v1-…" value={key} onChange={(e) => setKey(e.target.value)} />
        <Button onClick={save} disabled={busy || key.trim().length < 20}>{busy ? "Checking…" : me.openRouterKey ? "Replace" : "Save key"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Stored encrypted. It's never shown again or sent back to your browser.</p>
    </div>
  );
}
