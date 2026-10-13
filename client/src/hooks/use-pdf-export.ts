import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { AuditPDFGenerator } from "@/lib/audit-pdf-generator";
import type { AuditData } from "@shared/schema";

interface UsePDFExportProps {
  auditData: AuditData | null;
  websiteUrl: string;
  generatedAt?: string;
  pdfMode?: 'watermarked' | 'clean' | 'whitelabel';
}

export function usePDFExport({ auditData, websiteUrl, generatedAt, pdfMode }: UsePDFExportProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const getGenerator = () => {
    if (!auditData || !websiteUrl) return null;
    return new AuditPDFGenerator({
      auditData,
      websiteUrl,
      generatedAt: generatedAt || new Date().toISOString(),
      pdfMode
    });
  };

  const handleDownloadPDF = async () => {
    const generator = getGenerator();
    if (!generator) return;

    setIsGenerating(true);
    const loadingToast = toast({
      title: "📄 Generating PDF...",
      description: "Please wait, this may take a few seconds.",
    });

    try {
      await generator.downloadPDF();
      
      toast({
        title: "✅ PDF Downloaded",
        description: "Your audit report has been saved to your downloads folder.",
      });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({
        title: "PDF Generation Failed",
        description: "Unable to generate PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    const generator = getGenerator();
    if (!generator) return;

    setIsGenerating(true);
    const loadingToast = toast({
      title: "📄 Generating PDF...",
      description: "Please wait, preparing your report for sharing.",
    });

    try {
      await generator.sharePDF();
      
      toast({
        title: "✅ PDF Shared",
        description: "Your audit report has been shared successfully.",
      });
    } catch (error: any) {
      // User cancelled share - this is normal, not an error
      if (error.name === 'AbortError') {
        console.log('📄 Share cancelled by user');
        return;
      }
      
      console.error('Share failed:', error);
      
      // Fallback download happened
      if (error.message === 'FALLBACK_DOWNLOAD') {
        toast({
          title: "📄 PDF Downloaded",
          description: "Direct sharing not supported. PDF downloaded - you can share it manually.",
        });
        return;
      }
      
      // Fallback opened in tab
      if (error.message === 'OPENED_IN_TAB') {
        toast({
          title: "📄 PDF Opened",
          description: "PDF opened in a new tab. You can share the link or use browser options.",
        });
        return;
      }
      
      toast({
        title: "Share Failed",
        description: "Unable to share PDF. Please try downloading instead.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    handleDownloadPDF,
    handleShare,
    isGenerating
  };
}

