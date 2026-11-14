import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, Loader2, Star } from "lucide-react";
import AppShell, { FullPageSpinner } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError } from "@/lib/queryClient";
import type { PublicReviewRequest } from "@shared/api";

/** Resizes an image file to a square-ish JPEG data URL no larger than `size` pixels a side. */
async function resizePhoto(file: File, size = 240): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read that image."));
      i.src = url;
    });
    const side = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(size, side);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const isGooglePhoto = (url?: string | null) => !!url && /^https:\/\/[^/]*googleusercontent\.com\//.test(url);

/**
 * /review/<id>: a personal review link. No sign-in needed; if the visitor is signed
 * in, their name and Google photo are filled in. Submissions arrive hidden until the
 * admin switches them on.
 */
export default function ReviewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const request = useQuery<PublicReviewRequest>({ queryKey: [`/api/public/review/${encodeURIComponent(id)}`], enabled: id.length >= 12 });

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [form, setForm] = useState({ text: "", name: "", role: "", company: "", linkedin: "" });
  const [photo, setPhoto] = useState<{ data?: string; url?: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const prefilled = useRef(false);

  // Fill in what we already know from the app sign-in, once.
  useEffect(() => {
    if (loading || prefilled.current) return;
    prefilled.current = true;
    if (user?.displayName) setForm((f) => (f.name ? f : { ...f, name: user.displayName! }));
    if (isGooglePhoto(user?.photoURL)) setPhoto((p) => p ?? { url: user!.photoURL! });
  }, [loading, user]);

  if (loading || request.isLoading) return <FullPageSpinner />;

  const d = request.data;
  if (!d?.valid) {
    return (
      <AppShell>
        <Card className="max-w-xl mx-auto mt-8"><CardContent className="p-6 space-y-2">
          <h1 className="text-xl font-semibold">This review link is not valid</h1>
          <p className="text-sm text-muted-foreground">Check the link you were sent, or reply to the message it came in.</p>
        </CardContent></Card>
      </AppShell>
    );
  }

  if (state === "done") {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto text-center space-y-4 py-12" data-testid="review-thanks">
          <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-3xl font-bold">Thank you{d.firstName ? `, ${d.firstName}` : ""}</h1>
          <p className="text-muted-foreground">Your review has been sent. It means a lot to a small, independent product.</p>
        </div>
      </AppShell>
    );
  }

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      setPhoto({ data: await resizePhoto(file) });
    } catch {
      setError("That image could not be read. Try a JPEG or PNG.");
    }
  };

  const submit = async () => {
    setError("");
    if (!rating) return setError("Choose a star rating.");
    if (form.text.trim().length < 20) return setError("Please write at least a sentence or two.");
    if (form.name.trim().length < 2) return setError("Add your name.");
    if (!consent) return setError("Please confirm we can show your review.");
    setState("sending");
    try {
      await api("POST", `/api/public/review/${encodeURIComponent(id)}`, {
        rating,
        text: form.text.trim(),
        name: form.name.trim(),
        role: form.role.trim() || undefined,
        company: form.company.trim() || undefined,
        linkedin: form.linkedin.trim() || undefined,
        photoData: photo?.data,
        photoUrl: photo?.data ? undefined : photo?.url,
        consent: true,
      });
      setState("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setState("idle");
    }
  };

  const shown = hover || rating;

  return (
    <AppShell>
      <div className="max-w-xl mx-auto py-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold leading-tight" data-testid="review-heading">
            {d.firstName ? `${d.firstName}, how` : "How"} was Citation Rocket for you?
          </h1>
          <p className="text-muted-foreground">
            {d.submitted ? "You've already sent a review. Sending again replaces it." : "A few honest lines help other founders and agencies decide. It takes about two minutes."}
          </p>
        </div>

        <Card><CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <Label>Your rating</Label>
            <div className="flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                  className="p-1"
                  data-testid={`star-${n}`}
                >
                  <Star className={`h-7 w-7 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rv-text">What did Citation Rocket show you, and what did you do about it?</Label>
            <Textarea id="rv-text" rows={5} maxLength={1500} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="For example: what surprised you in the audit, what you fixed first, what changed." />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor="rv-name">Your name</Label>
              <Input id="rv-name" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="rv-role">Job title</Label>
              <Input id="rv-role" maxLength={80} placeholder="e.g. Founder" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="rv-company">Company</Label>
              <Input id="rv-company" maxLength={80} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="rv-linkedin">LinkedIn profile (optional)</Label>
              <Input id="rv-linkedin" maxLength={200} placeholder="https://www.linkedin.com/in/…" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} /></div>
          </div>

          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            <div className="flex items-center gap-4">
              {photo ? (
                <img src={photo.data || photo.url} alt="" className="h-16 w-16 rounded-full object-cover border" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center"><ImagePlus className="h-6 w-6 text-muted-foreground" /></div>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{photo ? "Change" : "Upload"}</Button>
                {photo && <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)}>Remove</Button>}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => choosePhoto(e.target.files?.[0])} />
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="review-consent" />
            <span>Citation Rocket may show my review, name, job title, company and photo on its website.</span>
          </label>

          {error && <p className="text-sm text-destructive" data-testid="review-error">{error}</p>}

          <Button className="w-full" size="lg" onClick={submit} disabled={state === "sending"} data-testid="review-submit">
            {state === "sending" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : "Send my review"}
          </Button>
        </CardContent></Card>
      </div>
    </AppShell>
  );
}
