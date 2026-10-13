import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { AuditData } from "@shared/schema";
import type { Branding } from "@shared/api";

/** PDFs are generated entirely in the browser, no server cost. */
export function usePDFExport({ auditData, websiteUrl, generatedAt, branding }: {
  auditData: AuditData | null;
  websiteUrl: string;
  generatedAt?: string;
  branding?: Branding | null;
}) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    if (!auditData || !websiteUrl) return;
    setIsGenerating(true);
    try {
      // jsPDF is large, load it only when someone actually exports.
      const { AuditPDFGenerator } = await import("@/lib/audit-pdf-generator");
      new AuditPDFGenerator({
        auditData,
        websiteUrl,
        generatedAt: generatedAt || new Date().toISOString(),
        branding,
      }).downloadPDF();
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast({ title: "PDF generation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return { handleDownloadPDF, isGenerating };
}
