import { useState } from "react";
import { Button } from "@/components/ui/button";
import { consentState, saveConsent } from "@/lib/meta-pixel";
import { GA_MEASUREMENT_ID, META_PIXEL_ID } from "@shared/meta";

/** Shown only when advertising and analytics cookies need consent (EEA, UK, Switzerland or unknown region). */
export default function ConsentBanner() {
  const [open, setOpen] = useState(() => (!!META_PIXEL_ID || !!GA_MEASUREMENT_ID) && consentState() === "ask");
  if (!open) return null;
  const choose = (granted: boolean) => { saveConsent(granted); setOpen(false); };
  return (
    <div className="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-xl rounded-xl border bg-card p-4 shadow-lg text-sm" role="dialog" aria-label="Cookie consent">
      <p className="text-muted-foreground">
        We use the Meta Pixel and Google Analytics to measure our ads and understand how the app is used, and a chat widget to answer your questions. They load, and may set cookies, only if you accept. See our{" "}
        <a className="underline" href="https://www.citationrocket.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
      </p>
      <div className="mt-3 flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => choose(false)}>Decline</Button>
        <Button size="sm" onClick={() => choose(true)}>Accept</Button>
      </div>
    </div>
  );
}
