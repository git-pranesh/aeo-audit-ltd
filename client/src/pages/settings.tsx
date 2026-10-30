import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BadgeDollarSign, Cpu, KeyRound, Palette, ShieldCheck, Trash2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { KeySetup, LicenseSetup } from "@/components/account-setup";
import { ModelSettings } from "@/components/model-picker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/auth-service";
import { api, ApiError } from "@/lib/queryClient";
import type { Branding } from "@shared/api";
import type { GuaranteeStatus } from "@shared/guarantee";

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

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

function GuaranteeStatusText({ status: g }: { status: GuaranteeStatus }) {
  if (g.eligible) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="guarantee-open">
        Not for you? Refund yourself here until <b className="text-foreground">{longDate(g.until)}</b>, as long as you have run fewer than {g.maxAudits} audits
        and downloaded nothing. So far: <b className="text-foreground">{g.auditsRun} of {g.maxAudits}</b> audits, no downloads.
        After that the licence is yours and the sale is final.
      </p>
    );
  }
  const why: Record<string, string> = {
    audits: `The guarantee ended because you ran ${g.maxAudits} audits.`,
    downloads: "The guarantee ended when you downloaded a PDF, CSV or AEO Pack.",
    expired: `The ${longDate(g.until)} guarantee window has closed.`,
    not_direct: "The money-back guarantee covers purchases made on citationrocket.com. Marketplace and partner licences follow the seller's policy.",
    refunded: "A refund has been requested for this licence.",
  };
  return <p className="text-sm text-muted-foreground" data-testid="guarantee-closed">{why[g.reason] ?? "Not available."} Your licence is yours for life.</p>;
}

export default function SettingsPage() {
  const { me, refreshMe } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const fail = (err: unknown) =>
    toast({ title: "Could not save", description: err instanceof ApiError ? err.message : "Please try again.", variant: "destructive" });

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

  // ─── Money-back guarantee (direct purchases) ───
  const [refunding, setRefunding] = useState(false);
  const requestRefund = async () => {
    setRefunding(true);
    try {
      await api("POST", "/api/me/refund");
      await refreshMe();
      toast({ title: "Refund sent", description: "Your payment is on its way back to your original payment method. Your licence has ended." });
    } catch (err) {
      toast({ title: "Refund not sent", description: err instanceof ApiError ? err.message : "Please try again or email support@citationrocket.com.", variant: "destructive" });
    } finally {
      setRefunding(false);
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

        <Section icon={ShieldCheck} title="License"><LicenseSetup /></Section>

        <Section icon={KeyRound} title="OpenRouter key"><KeySetup /></Section>

        <Section icon={Cpu} title="AI models"><ModelSettings /></Section>

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

        {me.guarantee && me.entitlement && (
          <Section icon={BadgeDollarSign} title="Money-back guarantee">
            <GuaranteeStatusText status={me.guarantee} />
            {me.guarantee.eligible && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" disabled={refunding} data-testid="button-refund">{refunding ? "Sending…" : "Refund my purchase"}</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Refund your purchase?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The full amount goes back to your original payment method (usually within 5 to 10 business days) and your licence ends immediately. Your audits stay on this account but you will not be able to open them without a licence.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep my licence</AlertDialogCancel>
                    <AlertDialogAction onClick={requestRefund}>Refund me</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
