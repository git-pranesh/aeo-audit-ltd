import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import AuditResults from "@/components/audit-results";
import type { AuditData } from "@shared/schema";

interface PublicAuditPayload {
  websiteUrl: string;
  auditData: AuditData;
  generatedAt: string;
}

/**
 * Public, unauthenticated read-only report view.
 * Fetches from the sanitized /api/public/audit/:token endpoint (never the
 * client Firestore SDK), so no login and no ownership check is required.
 * This route is also the one page in the app allowed to be embedded via
 * iframe on an external site — see the embeddableHelmet policy in
 * server/routes.ts scoped to /share/:token and /api/public/audit/:token.
 */
export default function AuditShare() {
  const [, params] = useRoute("/share/:token");
  const [data, setData] = useState<PublicAuditPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.token) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/public/audit/${params.token}`);
        if (!res.ok) {
          setError(res.status === 404 ? "This report link is invalid or has been revoked." : "Failed to load report.");
          return;
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Error loading public audit:", err);
        setError("Failed to load report.");
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground text-center">{error || "Report not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground uppercase tracking-wide">AI Citation Report</p>
          <h1 className="text-2xl font-bold">{data.websiteUrl}</h1>
        </div>
        <AuditResults auditData={data.auditData} websiteUrl={data.websiteUrl} publicView />
      </main>
    </div>
  );
}
