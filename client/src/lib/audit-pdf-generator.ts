/**
 * Professional PDF Generator for Citation Rocket AI Readiness Reports
 * Beautiful, print-safe layout with branded styling
 */
import { jsPDF } from 'jspdf';
import type { AuditData, ContentTopic } from "@shared/schema";
import type { Branding } from "@shared/api";

interface AuditPDFOptions {
  auditData: AuditData;
  websiteUrl: string;
  generatedAt: string;
  /** Agency license only: replaces Citation Rocket branding throughout the PDF. */
  branding?: Branding | null;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function tint(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => Math.round(c + (255 - c) * amount)) as [number, number, number];
}

const COLORS = {
  primary: [79, 70, 229] as [number, number, number],       // Indigo-600
  primaryLight: [99, 102, 241] as [number, number, number],  // Indigo-500
  primaryBg: [238, 242, 255] as [number, number, number],    // Indigo-50
  green: [16, 185, 129] as [number, number, number],
  greenBg: [236, 253, 245] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  redBg: [254, 242, 242] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  amberBg: [255, 251, 235] as [number, number, number],
  blue: [59, 130, 246] as [number, number, number],
  blueBg: [239, 246, 255] as [number, number, number],
  purple: [139, 92, 246] as [number, number, number],
  purpleBg: [245, 243, 255] as [number, number, number],
  dark: [17, 24, 39] as [number, number, number],
  text: [55, 65, 81] as [number, number, number],
  textLight: [107, 114, 128] as [number, number, number],
  textMuted: [156, 163, 175] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  borderLight: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  codeBg: [249, 250, 251] as [number, number, number],
};

function getScoreColor(score: number): [number, number, number] {
  if (score >= 80) return COLORS.green;
  if (score >= 60) return COLORS.blue;
  if (score >= 40) return COLORS.amber;
  return COLORS.red;
}

function getScoreBgColor(score: number): [number, number, number] {
  if (score >= 80) return COLORS.greenBg;
  if (score >= 60) return COLORS.blueBg;
  if (score >= 40) return COLORS.amberBg;
  return COLORS.redBg;
}

export class AuditPDFGenerator {
  private pdf: jsPDF;
  private auditData: AuditData;
  private domain: string;
  private generatedAt: string;
  private y: number = 0;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 18;
  private contentWidth: number;
  private pageCount: number = 0;
  private totalPages: number = 0;
  private pdfMode: 'clean' | 'whitelabel';
  private branding: Branding | null;
  private reportTitle: string;

  constructor(options: AuditPDFOptions) {
    this.pdf = new jsPDF('portrait', 'mm', 'a4');
    this.auditData = options.auditData;
    this.domain = new URL(options.websiteUrl).hostname.replace('www.', '');
    this.generatedAt = options.generatedAt;
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - (this.margin * 2);
    this.y = this.margin;
    this.branding = options.branding ?? null;
    this.pdfMode = this.branding ? 'whitelabel' : 'clean';
    this.reportTitle = this.branding?.reportTitle || 'AI Readiness Report';
  }

  private checkPageBreak(requiredSpace: number = 15): void {
    if (this.y + requiredSpace > this.pageHeight - 25) {
      this.addPageFooter();
      this.pdf.addPage();
      this.pageCount++;
      this.y = 20;
      this.addPageHeader();
    }
  }

  private addPageHeader(): void {
    this.pdf.setFontSize(7);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(...COLORS.textMuted);
    this.pdf.text(`${this.reportTitle} — ${this.domain}`, this.margin, 12);
    this.pdf.setDrawColor(...COLORS.borderLight);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(this.margin, 15, this.pageWidth - this.margin, 15);
    this.y = 22;
  }

  private addPageFooter(): void {
    const footerY = this.pageHeight - 10;
    this.pdf.setDrawColor(...COLORS.borderLight);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(this.margin, footerY - 3, this.pageWidth - this.margin, footerY - 3);
    this.pdf.setFontSize(7);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(...COLORS.textMuted);
    const footerLeft = this.branding ? this.branding.footerText || this.branding.agencyName : 'citationrocket.com';
    if (footerLeft) this.pdf.text(footerLeft.slice(0, 90), this.margin, footerY);
    this.pdf.text(`Page ${this.pageCount}`, this.pageWidth - this.margin, footerY, { align: 'right' });
  }

  private addSectionTitle(title: string, icon?: string): void {
    this.checkPageBreak(20);
    this.y += 6;

    this.pdf.setFillColor(...COLORS.primary);
    this.pdf.roundedRect(this.margin, this.y - 5, 3, 14, 1.5, 1.5, 'F');

    this.pdf.setFontSize(13);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.dark);
    this.pdf.text(title, this.margin + 7, this.y + 4);
    this.y += 14;
  }

  private addSubsectionTitle(title: string, color?: [number, number, number]): void {
    this.checkPageBreak(12);
    this.y += 4;
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...(color || COLORS.dark));
    this.pdf.text(title, this.margin, this.y);
    this.y += 6;
  }

  private addText(text: string, fontSize: number = 9, isBold: boolean = false, color?: [number, number, number]): void {
    this.pdf.setFontSize(fontSize);
    this.pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
    this.pdf.setTextColor(...(color || COLORS.text));
    const lines = this.pdf.splitTextToSize(text, this.contentWidth);
    for (const line of lines) {
      this.checkPageBreak(fontSize * 0.4 + 2);
      this.pdf.text(line, this.margin, this.y);
      this.y += fontSize * 0.4;
    }
    this.y += 2;
  }

  private addWrappedText(text: string, x: number, maxWidth: number, fontSize: number = 8, color?: [number, number, number]): void {
    this.pdf.setFontSize(fontSize);
    this.pdf.setTextColor(...(color || COLORS.text));
    const lines = this.pdf.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      this.checkPageBreak(fontSize * 0.4 + 1);
      this.pdf.text(line, x, this.y);
      this.y += fontSize * 0.38;
    }
  }

  private addKeyValue(key: string, value: string | number, indent: number = 0): void {
    this.checkPageBreak(7);
    const x = this.margin + indent;
    this.pdf.setFontSize(9);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.textLight);
    this.pdf.text(`${key}:`, x, this.y);

    const keyWidth = this.pdf.getTextWidth(`${key}:`) + 3;
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(...COLORS.dark);
    const valueStr = String(value);
    const availableWidth = this.contentWidth - indent - keyWidth;
    const lines = this.pdf.splitTextToSize(valueStr, availableWidth);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) this.checkPageBreak(5);
      this.pdf.text(lines[i], x + keyWidth, this.y);
      if (i < lines.length - 1) this.y += 4;
    }
    this.y += 5;
  }

  private addBulletPoint(text: string, color: [number, number, number] = COLORS.primary, indent: number = 0): void {
    this.checkPageBreak(10);
    const x = this.margin + indent;
    this.pdf.setFillColor(...color);
    this.pdf.circle(x + 2, this.y - 1.2, 1, 'F');
    this.pdf.setFontSize(8.5);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(...COLORS.text);
    const lines = this.pdf.splitTextToSize(text, this.contentWidth - indent - 8);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) this.checkPageBreak(4);
      this.pdf.text(lines[i], x + 6, this.y);
      this.y += 4;
    }
    this.y += 1;
  }

  private drawScoreBar(x: number, y: number, width: number, score: number, maxScore: number = 100): void {
    const barHeight = 5;
    const fillWidth = (score / maxScore) * width;
    const color = getScoreColor(score);
    const bgColor = getScoreBgColor(score);

    this.pdf.setFillColor(...bgColor);
    this.pdf.roundedRect(x, y, width, barHeight, 2, 2, 'F');
    this.pdf.setFillColor(...color);
    this.pdf.roundedRect(x, y, Math.max(fillWidth, 4), barHeight, 2, 2, 'F');
  }

  private drawInfoCard(x: number, y: number, w: number, h: number, bgColor: [number, number, number], borderColor: [number, number, number]): void {
    this.pdf.setFillColor(...bgColor);
    this.pdf.setDrawColor(...borderColor);
    this.pdf.setLineWidth(0.3);
    this.pdf.roundedRect(x, y, w, h, 3, 3, 'FD');
  }

  private addSeparator(): void {
    this.y += 3;
    this.pdf.setDrawColor(...COLORS.borderLight);
    this.pdf.setLineWidth(0.2);
    this.pdf.line(this.margin + 5, this.y, this.pageWidth - this.margin - 5, this.y);
    this.y += 5;
  }

  // ===================== COVER PAGE =====================

  private addCoverPage(): void {
    this.pageCount = 1;

    this.pdf.setFillColor(...COLORS.primary);
    this.pdf.rect(0, 0, this.pageWidth, 85, 'F');

    this.pdf.setFillColor(255, 255, 255, 0);
    this.pdf.setDrawColor(255, 255, 255);
    this.pdf.setLineWidth(0.3);

    this.pdf.setTextColor(255, 255, 255);
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text((this.branding?.agencyName || 'Citation Rocket').toUpperCase().slice(0, 60), this.margin, 25);
    if (this.branding?.logoDataUrl) {
      try {
        const props = this.pdf.getImageProperties(this.branding.logoDataUrl);
        const h = 16;
        const w = Math.min(50, (props.width / props.height) * h);
        this.pdf.addImage(this.branding.logoDataUrl, props.fileType, this.pageWidth - this.margin - w, 14, w, h);
      } catch {
        // An unreadable logo must never break the export.
      }
    }

    this.pdf.setFontSize(24);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(this.reportTitle.slice(0, 40), this.margin, 45);

    this.pdf.setFontSize(16);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.text(this.domain, this.margin, 58);

    const dateStr = new Date(this.generatedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(200, 200, 255);
    this.pdf.text(`Generated: ${dateStr}`, this.margin, 72);

    this.y = 100;

    const { auditResults } = this.auditData;
    const scoreColor = getScoreColor(auditResults.overallScore);
    const scoreBg = getScoreBgColor(auditResults.overallScore);

    const cardW = 75;
    const cardH = 45;
    const cardX = this.margin;
    const gradeX = this.margin + cardW + 10;

    this.drawInfoCard(cardX, this.y, cardW, cardH, scoreBg, scoreColor);
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.textLight);
    this.pdf.text('OVERALL SCORE', cardX + 10, this.y + 12);
    this.pdf.setFontSize(28);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...scoreColor);
    const scoreStr = `${auditResults.overallScore}`;
    this.pdf.text(scoreStr, cardX + 10, this.y + 30);
    const scoreWidth = this.pdf.getTextWidth(scoreStr);
    this.pdf.setFontSize(14);
    this.pdf.setTextColor(...COLORS.textLight);
    this.pdf.text('/100', cardX + 10 + scoreWidth + 3, this.y + 30);

    this.drawInfoCard(gradeX, this.y, cardW, cardH, COLORS.purpleBg, COLORS.purple);
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.textLight);
    this.pdf.text('GRADE', gradeX + 10, this.y + 12);
    this.pdf.setFontSize(28);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.purple);
    this.pdf.text(auditResults.letterGrade, gradeX + 10, this.y + 30);

    this.y += cardH + 15;

    const platforms = [
      { name: 'ChatGPT', score: auditResults.platformScores.chatgpt },
      { name: 'Perplexity', score: auditResults.platformScores.perplexity },
      { name: 'Gemini', score: auditResults.platformScores.gemini },
      { name: 'Claude', score: auditResults.platformScores.claude },
    ];

    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.dark);
    this.pdf.text('Platform Scores', this.margin, this.y);
    this.y += 8;

    for (const p of platforms) {
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(...COLORS.text);
      this.pdf.text(p.name, this.margin, this.y);

      const barX = this.margin + 30;
      const barWidth = this.contentWidth - 50;
      this.drawScoreBar(barX, this.y - 4, barWidth, p.score);

      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...getScoreColor(p.score));
      this.pdf.text(`${p.score}`, barX + barWidth + 3, this.y);
      this.y += 10;
    }

    this.y += 5;

    if (this.auditData.companyIntelligence) {
      const ci = this.auditData.companyIntelligence;
      this.pdf.setDrawColor(...COLORS.border);
      this.pdf.setLineWidth(0.3);
      this.pdf.line(this.margin, this.y, this.pageWidth - this.margin, this.y);
      this.y += 8;

      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.addKeyValue('Industry', ci.industry);
      this.addKeyValue('Business Type', ci.businessType);
      if (ci.valueProposition) {
        this.addKeyValue('Value Proposition', ci.valueProposition);
      }
    }
  }

  // ===================== SCORE BREAKDOWN =====================

  private addScoreBreakdown(): void {
    if (!this.auditData.scoreExplanation) return;
    const se = this.auditData.scoreExplanation;

    this.addSectionTitle('Score Breakdown');

    this.addSubsectionTitle('Content Signals Detected');

    const signals = [
      { label: 'Tutorials*', value: se.contentSignals.tutorials, benchmark: 15 },
      { label: 'Case Studies*', value: se.contentSignals.caseStudies, benchmark: 5 },
      { label: 'FAQ Sections*', value: se.contentSignals.faqs, benchmark: 5 },
      { label: 'Data Points', value: se.contentSignals.dataPoints, benchmark: 20 },
      { label: 'Frameworks*', value: se.contentSignals.frameworks, benchmark: 5 },
      { label: 'How-To Guides', value: se.contentSignals.howToGuides, benchmark: 10 },
      { label: 'Schema Types**', value: se.contentSignals.schemaMarkup, benchmark: 5 },
      { label: 'External Links**', value: se.contentSignals.externalLinks, benchmark: 50 },
    ];

    this.checkPageBreak(signals.length * 8 + 10);
    const col1 = this.margin;
    const col2 = this.margin + 32;
    const barWidth = this.contentWidth - 55;

    for (const sig of signals) {
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(...COLORS.text);
      this.pdf.text(sig.label, col1, this.y);

      const ratio = Math.min(sig.value / sig.benchmark, 1);
      const fillColor = ratio >= 1 ? COLORS.green : ratio >= 0.5 ? COLORS.amber : COLORS.red;
      const bgColor = ratio >= 1 ? COLORS.greenBg : ratio >= 0.5 ? COLORS.amberBg : COLORS.redBg;

      this.pdf.setFillColor(...bgColor);
      this.pdf.roundedRect(col2, this.y - 3.5, barWidth, 5, 2, 2, 'F');
      this.pdf.setFillColor(...fillColor);
      this.pdf.roundedRect(col2, this.y - 3.5, Math.max(ratio * barWidth, 3), 5, 2, 2, 'F');

      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...fillColor);
      this.pdf.text(`${sig.value}`, col2 + barWidth + 3, this.y);
      this.y += 7;
    }

    if (se.contentSignals.longFormContent !== undefined) {
      this.y += 1;
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(...COLORS.text);
      this.pdf.text('Long-Form Score', col1, this.y);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...COLORS.primary);
      this.pdf.text(`${se.contentSignals.longFormContent}/100`, col2, this.y);
      this.y += 7;
    }

    this.y += 4;
    this.checkPageBreak(16);
    this.pdf.setFontSize(6.5);
    this.pdf.setFont('helvetica', 'italic');
    this.pdf.setTextColor(...COLORS.textLight);
    const methodNote = '* Detected from sitemap URL patterns and page content analysis.  ** Estimated from a representative sample of pages, then scaled proportionally.';
    const methodLines = this.pdf.splitTextToSize(methodNote, this.contentWidth);
    this.pdf.text(methodLines, col1, this.y);
    this.y += methodLines.length * 3.5;
    const methodNote2 = 'Unmarked metrics are directly measured from page content. All scores use deterministic formulas — no AI opinions.';
    const methodLines2 = this.pdf.splitTextToSize(methodNote2, this.contentWidth);
    this.pdf.text(methodLines2, col1, this.y);
    this.y += methodLines2.length * 3.5 + 2;

    this.y += 3;
    this.addSubsectionTitle('Platform Score Drivers');
    const drivers = [
      { platform: 'ChatGPT', text: se.platformDrivers.chatgpt, color: COLORS.green },
      { platform: 'Perplexity', text: se.platformDrivers.perplexity, color: COLORS.blue },
      { platform: 'Gemini', text: se.platformDrivers.gemini, color: COLORS.amber },
      { platform: 'Claude', text: se.platformDrivers.claude, color: COLORS.purple },
    ];

    for (const d of drivers) {
      this.checkPageBreak(10);
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...d.color);
      this.pdf.text(`${d.platform}:`, this.margin + 2, this.y);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(...COLORS.text);
      const driverText = d.text.replace(`${d.platform}: `, '');
      const lines = this.pdf.splitTextToSize(driverText, this.contentWidth - 25);
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) this.checkPageBreak(4);
        this.pdf.text(lines[i], this.margin + 22, this.y);
        this.y += 3.5;
      }
      this.y += 2;
    }

    this.y += 3;
    this.addKeyValue('Strongest Area', se.strongestArea ?? 'N/A');
    this.addKeyValue('Weakest Area', se.weakestArea ?? 'N/A');
  }

  // ===================== INDUSTRY BENCHMARK =====================

  private addIndustryBenchmark(): void {
    if (!this.auditData.industryBenchmark) return;
    const ib = this.auditData.industryBenchmark;
    const userScores = {
      overall: this.auditData.auditResults.overallScore,
      chatgpt: this.auditData.auditResults.platformScores.chatgpt,
      perplexity: this.auditData.auditResults.platformScores.perplexity,
      gemini: this.auditData.auditResults.platformScores.gemini,
      claude: this.auditData.auditResults.platformScores.claude,
    };

    this.addSectionTitle(`Industry Benchmark: ${ib.industryName}`);
    this.addText(ib.sampleSize, 8, false, COLORS.textLight);
    this.y += 2;

    this.checkPageBreak(50);

    const col1 = this.margin;
    const col2 = this.margin + 30;
    const col3 = this.margin + 65;
    const col4 = this.margin + 100;
    const tableEnd = this.margin + 130;

    this.pdf.setFillColor(...COLORS.primaryBg);
    this.pdf.roundedRect(col1 - 2, this.y - 4, tableEnd - col1 + 4, 8, 2, 2, 'F');
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.primary);
    this.pdf.text('Platform', col1, this.y);
    this.pdf.text('Your Score', col2, this.y);
    this.pdf.text('Industry Avg', col3, this.y);
    this.pdf.text('Top Performers', col4, this.y);
    this.y += 7;

    const platforms: Array<{ label: string; key: 'overall' | 'chatgpt' | 'perplexity' | 'gemini' | 'claude' }> = [
      { label: 'Overall', key: 'overall' },
      { label: 'ChatGPT', key: 'chatgpt' },
      { label: 'Perplexity', key: 'perplexity' },
      { label: 'Gemini', key: 'gemini' },
      { label: 'Claude', key: 'claude' },
    ];

    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const userScore = userScores[p.key];
      const avgScore = ib.averageScores[p.key];
      const topScore = ib.topPerformerScores[p.key];

      if (i % 2 === 0) {
        this.pdf.setFillColor(...COLORS.borderLight);
        this.pdf.rect(col1 - 2, this.y - 4, tableEnd - col1 + 4, 7, 'F');
      }

      this.pdf.setFontSize(8.5);
      this.pdf.setFont('helvetica', p.key === 'overall' ? 'bold' : 'normal');
      this.pdf.setTextColor(...COLORS.dark);
      this.pdf.text(p.label, col1, this.y);

      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...(userScore >= avgScore ? COLORS.green : COLORS.red));
      this.pdf.text(String(userScore), col2, this.y);

      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(...COLORS.text);
      this.pdf.text(String(avgScore), col3, this.y);
      this.pdf.text(String(topScore), col4, this.y);
      this.y += 7;
    }

    this.y += 4;

    if (ib.contentBenchmarks) {
      this.addSubsectionTitle('Content Benchmarks');
      const benchmarks = [
        { label: 'Avg Tutorials', value: ib.contentBenchmarks.avgTutorials },
        { label: 'Avg Case Studies', value: ib.contentBenchmarks.avgCaseStudies },
        { label: 'Avg FAQ Pages', value: ib.contentBenchmarks.avgFAQPages },
        { label: 'Avg Schema Types', value: ib.contentBenchmarks.avgSchemaTypes },
        { label: 'Avg Data Points', value: ib.contentBenchmarks.avgDataPoints },
      ];
      for (const b of benchmarks) {
        this.addKeyValue(b.label, String(b.value), 2);
      }
    }

    this.y += 2;

    if (ib.commonStrengths && ib.commonStrengths.length > 0) {
      this.addSubsectionTitle('Common Industry Strengths', COLORS.green);
      for (const s of ib.commonStrengths) {
        this.addBulletPoint(s, COLORS.green, 2);
      }
    }

    if (ib.commonWeaknesses && ib.commonWeaknesses.length > 0) {
      this.addSubsectionTitle('Common Industry Weaknesses', COLORS.amber);
      for (const w of ib.commonWeaknesses) {
        this.addBulletPoint(w, COLORS.amber, 2);
      }
    }

    this.y += 3;
    this.checkPageBreak(10);
    this.pdf.setFontSize(6.5);
    this.pdf.setFont('helvetica', 'italic');
    this.pdf.setTextColor(...COLORS.textLight);
    const benchNote = 'Industry averages and top performer scores are reference benchmarks derived from content signal analysis patterns — not sourced from a live dataset.';
    const benchLines = this.pdf.splitTextToSize(benchNote, this.contentWidth);
    this.pdf.text(benchLines, this.margin, this.y);
    this.y += benchLines.length * 3.5 + 2;
  }

  // ===================== KEY FINDINGS =====================

  private addFindings(): void {
    const { auditResults } = this.auditData;
    this.addSectionTitle('Key Findings');

    if (auditResults.strengths && auditResults.strengths.length > 0) {
      this.addSubsectionTitle('Strengths', COLORS.green);
      for (const s of auditResults.strengths) {
        this.addBulletPoint(s, COLORS.green, 2);
      }
      this.y += 2;
    }

    if (auditResults.weaknesses && auditResults.weaknesses.length > 0) {
      this.addSubsectionTitle('Areas for Improvement', COLORS.amber);
      for (const w of auditResults.weaknesses) {
        this.addBulletPoint(w, COLORS.amber, 2);
      }
      this.y += 2;
    }

    this.addSubsectionTitle('Technical Analysis');
    this.addKeyValue('Domain Authority', auditResults.technicalFindings.domainAuthority, 2);
    this.addKeyValue('Content Structure', auditResults.technicalFindings.contentStructure, 2);
    this.addKeyValue('Schema Markup', auditResults.technicalFindings.schemaMarkup, 2);
    this.addKeyValue('Entity Recognition', auditResults.technicalFindings.entityRecognition, 2);
  }

  // ===================== COMPANY INTELLIGENCE =====================

  private addCompanyIntelligence(): void {
    if (!this.auditData.companyIntelligence) return;
    const ci = this.auditData.companyIntelligence;

    this.addSectionTitle('Company Intelligence');

    this.checkPageBreak(35);
    this.drawInfoCard(this.margin, this.y, this.contentWidth, 32, COLORS.primaryBg, COLORS.primary);
    this.y += 8;
    this.addKeyValue('Industry', ci.industry, 4);
    this.addKeyValue('Business Type', ci.businessType, 4);
    this.addKeyValue('Target Audience', ci.targetAudience, 4);
    this.y += 2;

    if (ci.marketPosition) {
      this.addKeyValue('Market Position', ci.marketPosition);
    }
    if (ci.valueProposition) {
      this.y += 1;
      this.addSubsectionTitle('Value Proposition');
      this.addText(ci.valueProposition, 9);
    }
  }

  // ===================== COMPETITOR ANALYSIS =====================

  private addCompetitorAnalysis(): void {
    if (!this.auditData.competitorAnalysis) return;
    const ca = this.auditData.competitorAnalysis;

    this.addSectionTitle('Competitor Analysis');

    if (ca.mainCompetitors.length > 0) {
      this.addKeyValue('Main Competitors', ca.mainCompetitors.join(', '));
      this.y += 2;
    }

    if (ca.competitorStrengths.length > 0) {
      this.addSubsectionTitle('Competitor Strengths');
      for (const s of ca.competitorStrengths) {
        this.addBulletPoint(s, COLORS.red, 2);
      }
      this.y += 2;
    }

    if (ca.competitorWeaknesses.length > 0) {
      this.addSubsectionTitle('Competitor Weaknesses (Your Opportunities)', COLORS.green);
      for (const w of ca.competitorWeaknesses) {
        this.addBulletPoint(w, COLORS.green, 2);
      }
      this.y += 2;
    }

    if (ca.marketOpportunities.length > 0) {
      this.addSubsectionTitle('Market Opportunities', COLORS.blue);
      for (const o of ca.marketOpportunities) {
        this.addBulletPoint(o, COLORS.blue, 2);
      }
    }
  }

  // ===================== CITATION SNAPSHOT =====================

  private addCitationSnapshot(): void {
    if (!this.auditData.citationSnapshot) return;
    const cs = this.auditData.citationSnapshot;

    this.addSectionTitle('AI Citation Check');

    this.checkPageBreak(25);
    const statsCardW = (this.contentWidth - 8) / 3;
    const statsY = this.y;

    const stats = [
      { label: 'Prompts Checked', value: String(cs.totalPromptsChecked), color: COLORS.primary },
      { label: 'Times Mentioned', value: `${cs.mentionedCount} of ${cs.totalPromptsChecked}`, color: COLORS.green },
      { label: 'Mention Rate', value: `${cs.mentionRate}%`, color: cs.mentionRate >= 50 ? COLORS.green : cs.mentionRate >= 25 ? COLORS.amber : COLORS.red },
    ];

    for (let i = 0; i < stats.length; i++) {
      const sx = this.margin + i * (statsCardW + 4);
      const bgColor = getScoreBgColor(cs.mentionRate >= 50 ? 80 : cs.mentionRate >= 25 ? 50 : 20);
      this.drawInfoCard(sx, statsY, statsCardW, 18, i === 2 ? bgColor : COLORS.borderLight, COLORS.border);
      this.pdf.setFontSize(7);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(...COLORS.textLight);
      this.pdf.text(stats[i].label, sx + 4, statsY + 7);
      this.pdf.setFontSize(12);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...stats[i].color);
      this.pdf.text(stats[i].value, sx + 4, statsY + 14);
    }
    this.y = statsY + 24;

    this.addSubsectionTitle('Prompt-by-Prompt Results');

    for (const result of cs.promptResults) {
      this.checkPageBreak(18);

      const mentioned = result.mentioned;
      const iconColor = mentioned ? COLORS.green : COLORS.red;
      const icon = mentioned ? '\u2713' : '\u2717';

      this.pdf.setFillColor(...(mentioned ? COLORS.greenBg : COLORS.redBg));
      this.pdf.roundedRect(this.margin, this.y - 4, this.contentWidth, 6, 1.5, 1.5, 'F');

      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...iconColor);
      this.pdf.text(icon, this.margin + 2, this.y);

      this.pdf.setTextColor(...COLORS.dark);
      this.pdf.setFont('helvetica', 'bold');
      const promptText = `"${result.prompt}"`;
      const promptLines = this.pdf.splitTextToSize(promptText, this.contentWidth - 12);
      this.pdf.text(promptLines[0], this.margin + 8, this.y);
      this.y += 5;

      if (promptLines.length > 1) {
        this.pdf.setFont('helvetica', 'normal');
        for (let i = 1; i < promptLines.length; i++) {
          this.checkPageBreak(4);
          this.pdf.text(promptLines[i], this.margin + 8, this.y);
          this.y += 3.5;
        }
      }

      if (mentioned && result.mentionContext) {
        this.pdf.setFontSize(7.5);
        this.pdf.setFont('helvetica', 'italic');
        this.pdf.setTextColor(...COLORS.textLight);
        const contextLines = this.pdf.splitTextToSize(result.mentionContext, this.contentWidth - 14);
        for (const line of contextLines.slice(0, 3)) {
          this.checkPageBreak(4);
          this.pdf.text(line, this.margin + 8, this.y);
          this.y += 3.5;
        }
      }

      if (result.competitorsMentioned && result.competitorsMentioned.length > 0) {
        this.pdf.setFontSize(7);
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setTextColor(...COLORS.textMuted);
        const alsoText = `Also mentioned: ${result.competitorsMentioned.join(', ')}`;
        const alsoLines = this.pdf.splitTextToSize(alsoText, this.contentWidth - 14);
        for (const line of alsoLines) {
          this.checkPageBreak(3.5);
          this.pdf.text(line, this.margin + 8, this.y);
          this.y += 3.2;
        }
      }

      this.y += 3;
    }

    if (cs.topCompetitorsCited && cs.topCompetitorsCited.length > 0) {
      this.y += 2;
      this.addSubsectionTitle('Most-Cited Competitors');

      const realCompetitors = cs.topCompetitorsCited.filter((c: any) => {
        const name = c.name?.toLowerCase() || '';
        return !name.includes('ease of use') && !name.includes('steep learning') &&
               !name.includes('ai shortcomings') && !name.includes('limitations') &&
               !name.includes('free plan') && !name.includes('value') &&
               !name.includes('collaboration strengths') && !name.includes('starting price');
      });

      for (const comp of realCompetitors.slice(0, 15)) {
        this.checkPageBreak(6);
        this.pdf.setFontSize(8);
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setTextColor(...COLORS.text);
        this.pdf.text(comp.name, this.margin + 4, this.y);

        const barWidth = 40;
        const maxMentions = Math.max(...realCompetitors.map((c: any) => c.timesFound || 1));
        const ratio = (comp.timesFound || 0) / maxMentions;
        this.pdf.setFillColor(...COLORS.borderLight);
        this.pdf.roundedRect(this.margin + 50, this.y - 3, barWidth, 4, 1.5, 1.5, 'F');
        this.pdf.setFillColor(...COLORS.red);
        this.pdf.roundedRect(this.margin + 50, this.y - 3, Math.max(ratio * barWidth, 2), 4, 1.5, 1.5, 'F');

        this.pdf.setFontSize(7);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.setTextColor(...COLORS.red);
        this.pdf.text(`${comp.timesFound} mentions`, this.margin + 50 + barWidth + 3, this.y);
        this.y += 6;
      }
    }
  }

  // ===================== FIX-IT PLAYBOOK =====================

  private addPlaybook(): void {
    if (!this.auditData.playbook || this.auditData.playbook.actions.length === 0) return;
    const pb = this.auditData.playbook;

    this.addSectionTitle('Fix-It Playbook');

    if (pb.estimatedScoreImprovement) {
      this.checkPageBreak(25);
      this.drawInfoCard(this.margin, this.y, this.contentWidth, 22, COLORS.greenBg, COLORS.green);
      this.y += 6;
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...COLORS.green);
      this.pdf.text('Estimated Score Improvement (if all actions completed)', this.margin + 4, this.y);
      this.y += 6;

      const improvements = [
        { label: 'Overall', value: pb.estimatedScoreImprovement.overall },
        { label: 'ChatGPT', value: pb.estimatedScoreImprovement.chatgpt },
        { label: 'Perplexity', value: pb.estimatedScoreImprovement.perplexity },
        { label: 'Gemini', value: pb.estimatedScoreImprovement.gemini },
        { label: 'Claude', value: pb.estimatedScoreImprovement.claude },
      ];
      const impTexts = improvements.map(i => `${i.label}: +${i.value}`);
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(...COLORS.text);
      this.pdf.text(impTexts.join('   |   '), this.margin + 4, this.y);
      this.y += 12;
    }

    if (pb.quickWins && pb.quickWins.length > 0) {
      this.checkPageBreak(12);
      this.pdf.setFillColor(...COLORS.green);
      this.pdf.roundedRect(this.margin, this.y, this.contentWidth, 8, 2, 2, 'F');
      this.pdf.setTextColor(255, 255, 255);
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(`${pb.quickWins.length} Quick Win${pb.quickWins.length > 1 ? 's' : ''} Available`, this.margin + 4, this.y + 5.5);
      this.y += 13;
    }

    for (let i = 0; i < pb.actions.length; i++) {
      const action = pb.actions[i];
      this.checkPageBreak(35);

      const priorityColors: Record<string, [number, number, number]> = {
        critical: COLORS.red,
        high: COLORS.amber,
        medium: COLORS.blue,
        low: COLORS.textLight,
      };
      const pColor = priorityColors[action.priority] || COLORS.textLight;

      this.pdf.setFillColor(...COLORS.borderLight);
      this.pdf.roundedRect(this.margin, this.y - 3, this.contentWidth, 7, 2, 2, 'F');
      this.pdf.setFontSize(10);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...COLORS.dark);
      const titleText = `${i + 1}. ${action.title}`;
      const titleLines = this.pdf.splitTextToSize(titleText, this.contentWidth - 8);
      this.pdf.text(titleLines[0], this.margin + 3, this.y + 1);
      this.y += 8;

      if (titleLines.length > 1) {
        for (let t = 1; t < titleLines.length; t++) {
          this.pdf.text(titleLines[t], this.margin + 3, this.y);
          this.y += 4.5;
        }
      }

      this.pdf.setFontSize(7.5);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(...pColor);
      this.pdf.text(action.priority.toUpperCase(), this.margin + 2, this.y);
      this.pdf.setTextColor(...COLORS.textLight);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(`  |  ${action.targetPlatform}  |  ${action.difficulty}  |  ${action.timeToImplement}`, this.margin + 2 + this.pdf.getTextWidth(action.priority.toUpperCase()), this.y);
      this.y += 5;

      this.pdf.setFontSize(7.5);
      this.pdf.setTextColor(...COLORS.textLight);
      this.pdf.setFont('helvetica', 'normal');
      this.addWrappedText(`Current: ${action.currentState}`, this.margin + 3, this.contentWidth - 6, 7.5, COLORS.textLight);
      this.addWrappedText(`Target: ${action.targetState}`, this.margin + 3, this.contentWidth - 6, 7.5, COLORS.textLight);
      this.y += 1;

      this.pdf.setFont('helvetica', 'italic');
      this.pdf.setTextColor(...COLORS.green);
      this.pdf.setFontSize(7.5);
      this.addWrappedText(action.estimatedImpact, this.margin + 3, this.contentWidth - 6, 7.5, COLORS.green);
      this.y += 2;

      for (let s = 0; s < action.stepByStep.length; s++) {
        this.checkPageBreak(6);
        this.pdf.setFontSize(7.5);
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setTextColor(...COLORS.text);
        const stepText = `${s + 1}. ${action.stepByStep[s]}`;
        const stepLines = this.pdf.splitTextToSize(stepText, this.contentWidth - 12);
        for (const line of stepLines) {
          this.checkPageBreak(4);
          this.pdf.text(line, this.margin + 5, this.y);
          this.y += 3.5;
        }
      }

      if (action.codeSnippet) {
        this.checkPageBreak(20);
        this.y += 3;

        this.pdf.setFontSize(7.5);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.setTextColor(...COLORS.primary);
        this.pdf.text('Code Snippet:', this.margin + 3, this.y);
        this.y += 4;

        const codeLines = action.codeSnippet.code.split('\n');
        const visibleLines = codeLines.slice(0, 25);
        const codeBlockHeight = visibleLines.length * 3.2 + 4;

        this.checkPageBreak(Math.min(codeBlockHeight, 80));
        this.pdf.setFillColor(...COLORS.codeBg);
        this.pdf.setDrawColor(...COLORS.border);
        this.pdf.setLineWidth(0.2);

        const codeStartY = this.y;
        let codeEndY = this.y;

        this.pdf.setFontSize(6.5);
        this.pdf.setFont('courier', 'normal');
        this.pdf.setTextColor(...COLORS.text);

        for (const codeLine of visibleLines) {
          this.checkPageBreak(4);
          const wrappedCode = this.pdf.splitTextToSize(codeLine || ' ', this.contentWidth - 10);
          for (const wl of wrappedCode) {
            this.pdf.text(wl, this.margin + 5, this.y);
            this.y += 3.2;
          }
          codeEndY = this.y;
        }

        if (codeLines.length > 25) {
          this.pdf.setFont('helvetica', 'italic');
          this.pdf.setFontSize(7);
          this.pdf.setTextColor(...COLORS.textMuted);
          this.pdf.text(`... (${codeLines.length - 25} more lines)`, this.margin + 5, this.y);
          this.y += 4;
        }

        this.y += 2;
      }

      if (action.contentTemplate) {
        this.checkPageBreak(15);
        this.y += 2;
        this.pdf.setFontSize(7.5);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.setTextColor(...COLORS.purple);
        const tmplTitle = `Content Template: ${action.contentTemplate.title}`;
        const tmplLines = this.pdf.splitTextToSize(tmplTitle, this.contentWidth - 6);
        for (const line of tmplLines) {
          this.pdf.text(line, this.margin + 3, this.y);
          this.y += 3.5;
        }
        this.y += 1;

        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setTextColor(...COLORS.text);
        for (const item of action.contentTemplate.outline) {
          this.checkPageBreak(5);
          this.pdf.setFontSize(7);
          const outlineLines = this.pdf.splitTextToSize(`\u2022 ${item}`, this.contentWidth - 12);
          for (const line of outlineLines) {
            this.pdf.text(line, this.margin + 6, this.y);
            this.y += 3.2;
          }
        }

        if (action.contentTemplate.tips && action.contentTemplate.tips.length > 0) {
          this.y += 2;
          this.pdf.setFontSize(7);
          this.pdf.setFont('helvetica', 'italic');
          this.pdf.setTextColor(...COLORS.textLight);
          for (const tip of action.contentTemplate.tips) {
            this.checkPageBreak(5);
            const tipLines = this.pdf.splitTextToSize(`Tip: ${tip}`, this.contentWidth - 12);
            for (const line of tipLines) {
              this.pdf.text(line, this.margin + 6, this.y);
              this.y += 3.2;
            }
          }
        }
      }

      this.y += 2;
      if (i < pb.actions.length - 1) {
        this.addSeparator();
      }
    }
  }

  // ===================== CONTENT TOPICS =====================

  private addTopics(): void {
    const categories = [
      { key: 'authoritative' as const, label: 'Authoritative Topics (85-95%)', color: COLORS.primary },
      { key: 'thoughtLeadership' as const, label: 'Thought Leadership (70-84%)', color: COLORS.purple },
      { key: 'competitiveAdvantage' as const, label: 'Competitive Advantage (50-69%)', color: COLORS.blue },
      { key: 'emergingOpportunity' as const, label: 'Emerging Opportunities (30-49%)', color: COLORS.green },
    ];

    const totalTopics = categories.reduce((sum, cat) => sum + this.auditData.contentTopics[cat.key].length, 0);
    this.addSectionTitle(`Content Opportunities (${totalTopics} Topics)`);

    for (const category of categories) {
      const topics = this.auditData.contentTopics[category.key];
      if (topics.length === 0) continue;

      this.checkPageBreak(15);

      this.pdf.setFillColor(...category.color);
      this.pdf.roundedRect(this.margin, this.y, this.contentWidth, 7, 2, 2, 'F');
      this.pdf.setTextColor(255, 255, 255);
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(`${category.label} - ${topics.length} Topics`, this.margin + 4, this.y + 5);
      this.y += 11;

      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i] as typeof topics[0] & {
          difficulty?: string;
          priorityTier?: string;
          timeEstimate?: string;
          targetPlatform?: string;
          isBranded?: boolean;
        };

        this.checkPageBreak(20);

        this.pdf.setFontSize(9);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.setTextColor(...COLORS.dark);
        const titleText = `${i + 1}. ${topic.topic}`;
        const titleLines = this.pdf.splitTextToSize(titleText, this.contentWidth - 35);
        for (const line of titleLines) {
          this.checkPageBreak(5);
          this.pdf.text(line, this.margin + 2, this.y);
          this.y += 4;
        }

        if (topic.priorityTier) {
          const tierColors: Record<string, [number, number, number]> = {
            'Quick Win': COLORS.green,
            'High Impact': COLORS.blue,
            'Long-term': COLORS.purple,
          };
          const tColor = tierColors[topic.priorityTier] || COLORS.textLight;
          this.pdf.setFontSize(7);
          this.pdf.setFont('helvetica', 'bold');
          this.pdf.setTextColor(...tColor);
          this.pdf.text(topic.priorityTier, this.pageWidth - this.margin - 18, this.y - 4);
        }

        const metricsRow: string[] = [];
        if (topic.difficulty) metricsRow.push(topic.difficulty);
        if (topic.timeEstimate) metricsRow.push(topic.timeEstimate);
        if (topic.targetPlatform) metricsRow.push(`Target: ${topic.targetPlatform}`);
        if (topic.isBranded) metricsRow.push('Branded');

        if (metricsRow.length > 0) {
          this.pdf.setFontSize(7);
          this.pdf.setFont('helvetica', 'normal');
          this.pdf.setTextColor(...COLORS.textMuted);
          this.pdf.text(metricsRow.join(' | '), this.margin + 2, this.y);
          this.y += 4;
        }

        if (topic.justification) {
          this.pdf.setFontSize(7.5);
          this.pdf.setFont('helvetica', 'italic');
          this.pdf.setTextColor(...COLORS.textLight);
          const justLines = this.pdf.splitTextToSize(topic.justification, this.contentWidth - 6);
          for (const line of justLines.slice(0, 2)) {
            this.checkPageBreak(4);
            this.pdf.text(line, this.margin + 2, this.y);
            this.y += 3.2;
          }
        }

        this.y += 3;
      }

      this.y += 3;
    }
  }

  // ===================== RECOMMENDATIONS =====================

  private addRecommendations(): void {
    if (this.auditData.enhancedRecommendations && this.auditData.enhancedRecommendations.length > 0) {
      this.addSectionTitle('Actionable Recommendations');

      for (let i = 0; i < this.auditData.enhancedRecommendations.length; i++) {
        const rec = this.auditData.enhancedRecommendations[i];
        this.checkPageBreak(20);

        const priorityColors: Record<string, [number, number, number]> = {
          High: COLORS.red,
          Medium: COLORS.amber,
          Low: COLORS.blue,
        };
        const pColor = priorityColors[rec.priority] || COLORS.textLight;

        this.pdf.setFillColor(...pColor);
        this.pdf.circle(this.margin + 3, this.y - 0.5, 3, 'F');
        this.pdf.setTextColor(255, 255, 255);
        this.pdf.setFontSize(7);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.text(String(i + 1), this.margin + 1.8, this.y + 0.5);

        this.pdf.setFontSize(7.5);
        this.pdf.setTextColor(...pColor);
        this.pdf.text(`${rec.priority} — ${rec.category}`, this.margin + 9, this.y);
        this.y += 5;

        this.pdf.setTextColor(...COLORS.dark);
        this.pdf.setFontSize(8.5);
        this.pdf.setFont('helvetica', 'normal');
        const lines = this.pdf.splitTextToSize(rec.recommendation, this.contentWidth - 12);
        for (const line of lines) {
          this.checkPageBreak(4);
          this.pdf.text(line, this.margin + 9, this.y);
          this.y += 3.8;
        }

        if (rec.implementation) {
          this.pdf.setFontSize(7);
          this.pdf.setTextColor(...COLORS.textLight);
          this.pdf.text(`Timeframe: ${rec.implementation.timeframe} | Effort: ${rec.implementation.effort} | Impact: ${rec.implementation.expectedImpact}`, this.margin + 9, this.y);
          this.y += 4;

          if (rec.implementation.specificActions && rec.implementation.specificActions.length > 0) {
            for (const action of rec.implementation.specificActions) {
              this.checkPageBreak(5);
              this.pdf.setFontSize(7);
              this.pdf.setFont('helvetica', 'normal');
              this.pdf.setTextColor(...COLORS.text);
              const actionLines = this.pdf.splitTextToSize(`\u2022 ${action}`, this.contentWidth - 18);
              for (const aLine of actionLines) {
                this.pdf.text(aLine, this.margin + 12, this.y);
                this.y += 3.2;
              }
            }
          }
        }

        this.y += 4;
      }
      return;
    }

    if (!this.auditData.recommendations || this.auditData.recommendations.length === 0) return;

    this.addSectionTitle('Recommendations');

    for (let i = 0; i < this.auditData.recommendations.length; i++) {
      const rec = this.auditData.recommendations[i];
      this.checkPageBreak(12);

      this.pdf.setFillColor(...COLORS.primary);
      this.pdf.circle(this.margin + 3, this.y - 0.5, 3, 'F');
      this.pdf.setTextColor(255, 255, 255);
      this.pdf.setFontSize(7);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(String(i + 1), this.margin + 1.8, this.y + 0.5);

      this.pdf.setTextColor(...COLORS.dark);
      this.pdf.setFontSize(8.5);
      this.pdf.setFont('helvetica', 'normal');
      const lines = this.pdf.splitTextToSize(rec, this.contentWidth - 12);
      for (const line of lines) {
        this.checkPageBreak(4);
        this.pdf.text(line, this.margin + 9, this.y);
        this.y += 3.8;
      }
      this.y += 3;
    }
  }

  // ===================== FINAL FOOTER =====================

  private addFinalFooter(): void {
    this.addPageFooter();

    this.checkPageBreak(25);
    this.y += 8;
    this.pdf.setDrawColor(...COLORS.primary);
    this.pdf.setLineWidth(0.5);
    this.pdf.line(this.margin, this.y, this.pageWidth - this.margin, this.y);
    this.y += 8;

    this.pdf.setFontSize(9);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(...COLORS.primary);
    this.pdf.text(this.branding?.agencyName || 'Citation Rocket', this.pageWidth / 2, this.y, { align: 'center' });
    this.y += 5;
    this.pdf.setFontSize(7);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(...COLORS.textMuted);
    if (this.branding) {
      if (this.branding.footerText) this.pdf.text(this.branding.footerText.slice(0, 120), this.pageWidth / 2, this.y, { align: 'center' });
    } else {
      this.pdf.text('AI Readiness Optimization Platform', this.pageWidth / 2, this.y, { align: 'center' });
      this.y += 4;
      this.pdf.text(`\u00A9 ${new Date().getFullYear()} Citation Rocket. All rights reserved.`, this.pageWidth / 2, this.y, { align: 'center' });
    }
  }

  // ===================== GENERATE =====================

  private generate(): void {
    // Agency accent colour: swap the palette for this render only.
    const saved = { primary: COLORS.primary, primaryLight: COLORS.primaryLight, primaryBg: COLORS.primaryBg };
    const accent = this.branding ? hexToRgb(this.branding.accentColor) : null;
    if (accent) {
      COLORS.primary = accent;
      COLORS.primaryLight = tint(accent, 0.15);
      COLORS.primaryBg = tint(accent, 0.92);
    }
    try {
      this.render();
    } finally {
      Object.assign(COLORS, saved);
    }
  }

  private render(): void {
    this.addCoverPage();

    this.addPageFooter();
    this.pdf.addPage();
    this.pageCount++;
    this.addPageHeader();

    this.addScoreBreakdown();
    this.addIndustryBenchmark();
    this.addFindings();
    this.addCompanyIntelligence();
    this.addCompetitorAnalysis();
    this.addCitationSnapshot();
    this.addPlaybook();
    this.addTopics();
    this.addRecommendations();
    this.addFinalFooter();
  }

  public getFileName(): string {
    const prefix = this.reportTitle.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'AI-Readiness-Report';
    return `${prefix}-${this.domain}-${new Date().toISOString().split('T')[0]}.pdf`;
  }

  public downloadPDF(): void {
    console.log('Generating PDF...');
    this.generate();
    this.pdf.save(this.getFileName());
    console.log('PDF downloaded successfully');
  }

  public async sharePDF(): Promise<void> {
    console.log('Generating PDF for sharing...');
    this.generate();

    const blob = this.pdf.output('blob');
    const fileName = this.getFileName();
    const file = new File([blob], fileName, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `${this.reportTitle} - ${this.domain}`,
          text: `Overall Score: ${this.auditData.auditResults.overallScore}/100`,
          files: [file]
        });
        return;
      } catch (error: any) {
        if (error.name === 'AbortError') throw error;
      }
    }

    const url = URL.createObjectURL(blob);
    const newTab = window.open(url, '_blank');

    if (newTab) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      throw new Error('OPENED_IN_TAB');
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    throw new Error('FALLBACK_DOWNLOAD');
  }
}
