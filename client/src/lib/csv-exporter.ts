import type { AuditData } from "@shared/schema";

interface CSVExporterOptions {
  auditData: AuditData;
  websiteUrl: string;
  generatedAt: string;
}

export class CSVExporter {
  private auditData: AuditData;
  private websiteUrl: string;
  private generatedAt: string;
  private domain: string;

  constructor(options: CSVExporterOptions) {
    this.auditData = options.auditData;
    this.websiteUrl = options.websiteUrl;
    this.generatedAt = options.generatedAt;
    this.domain = new URL(options.websiteUrl).hostname.replace('www.', '');
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private generateOverviewCSV(): string {
    const { auditResults } = this.auditData;
    const rows = [
      ['AI Readiness Report'],
      ['Website', this.domain],
      ['URL', this.websiteUrl],
      ['Generated', new Date(this.generatedAt).toLocaleString()],
      [''],
      ['OVERALL PERFORMANCE'],
      ['Overall Score', auditResults.overallScore.toString()],
      ['Letter Grade', auditResults.letterGrade],
      [''],
      ['PLATFORM SCORES'],
      ['ChatGPT', auditResults.platformScores.chatgpt.toString()],
      ['Perplexity', auditResults.platformScores.perplexity.toString()],
      ['Gemini', auditResults.platformScores.gemini.toString()],
      ['Claude', auditResults.platformScores.claude.toString()],
      [''],
      ['TECHNICAL FINDINGS'],
      ['Domain Authority', auditResults.technicalFindings.domainAuthority],
      ['Content Structure', auditResults.technicalFindings.contentStructure],
      ['Schema Markup', auditResults.technicalFindings.schemaMarkup],
      ['Entity Recognition', auditResults.technicalFindings.entityRecognition]
    ];

    return rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
  }

  private generateStrengthsWeaknessesCSV(): string {
    const { auditResults } = this.auditData;
    const rows = [
      ['Type', 'Finding'],
      ...auditResults.strengths.map(strength => ['Strength', strength]),
      ...auditResults.weaknesses.map(weakness => ['Weakness', weakness])
    ];

    return rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
  }

  private generateCompanyIntelligenceCSV(): string {
    if (!this.auditData.companyIntelligence) return '';

    const { companyIntelligence } = this.auditData;
    const rows = [
      ['Field', 'Value'],
      ['Industry', companyIntelligence.industry],
      ['Business Type', companyIntelligence.businessType],
      ['Target Audience', companyIntelligence.targetAudience],
      ['Value Proposition', companyIntelligence.valueProposition],
      ['Market Position', companyIntelligence.marketPosition]
    ];

    if (companyIntelligence.businessModel) {
      rows.push(['Business Model', companyIntelligence.businessModel]);
    }

    if (companyIntelligence.geographicFocus) {
      rows.push(['Geographic Focus', companyIntelligence.geographicFocus.join('; ')]);
    }

    if (companyIntelligence.serviceOfferings) {
      rows.push(['Service Offerings', companyIntelligence.serviceOfferings.join('; ')]);
    }

    return rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
  }

  private generateCompetitorAnalysisCSV(): string {
    if (!this.auditData.competitorAnalysis) return '';

    const { competitorAnalysis } = this.auditData;
    const rows = [
      ['Analysis Type', 'Details'],
      ['Main Competitors', competitorAnalysis.mainCompetitors.join('; ')],
      ...competitorAnalysis.competitorStrengths.map(strength => ['Competitor Strength', strength]),
      ...competitorAnalysis.competitorWeaknesses.map(weakness => ['Competitor Weakness', weakness]),
      ...competitorAnalysis.marketOpportunities.map(opportunity => ['Market Opportunity', opportunity])
    ];

    if (competitorAnalysis.competitiveAdvantages) {
      rows.push(...competitorAnalysis.competitiveAdvantages.map(advantage => ['Competitive Advantage', advantage]));
    }

    return rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
  }

  private generateTopicsCSV(): string {
    const categories = [
      { key: 'authoritative', label: 'Authoritative' },
      { key: 'thoughtLeadership', label: 'Thought Leadership' },
      { key: 'competitiveAdvantage', label: 'Competitive Advantage' },
      { key: 'emergingOpportunity', label: 'Emerging Opportunity' }
    ];

    const headers = [
      'Category',
      'Topic',
      'Priority Tier',
      'Difficulty',
      'Time Estimate',
      'Target Platform',
      'Is Branded',
      'Content Type',
      'Gap Filled',
      'Justification',
      'Search Volume',
      'Competition Level'
    ];

    const rows = [headers];

    categories.forEach(category => {
      const topics = this.auditData.contentTopics[category.key as keyof typeof this.auditData.contentTopics];
      topics.forEach(topic => {
        rows.push([
          category.label,
          topic.topic,
          topic.priorityTier || 'N/A',
          topic.difficulty || 'N/A',
          topic.timeEstimate || 'N/A',
          topic.targetPlatform || 'N/A',
          topic.isBranded === true ? 'Yes' : topic.isBranded === false ? 'No' : 'N/A',
          topic.contentType || 'N/A',
          topic.gapFilled || 'N/A',
          topic.justification,
          topic.searchVolume || 'N/A',
          topic.competitionLevel || 'N/A'
        ]);
      });
    });

    return rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
  }

  private generateCitationIntelligenceCSV(): string {
    const rows: string[][] = [['Metric', 'Value']];
    
    if (this.auditData.visibilityPotential) {
      const { visibilityPotential } = this.auditData;
      rows.push(
        ['Overall Visibility Potential', visibilityPotential.overallPotential],
        ['ChatGPT Alignment', visibilityPotential.platformAlignment.chatgpt],
        ['Perplexity Alignment', visibilityPotential.platformAlignment.perplexity],
        ['Gemini Alignment', visibilityPotential.platformAlignment.gemini],
        ['Claude Alignment', visibilityPotential.platformAlignment.claude]
      );
    }
    
    // Add strengths from auditResults (single source of truth)
    if (this.auditData.auditResults?.strengths?.length > 0) {
      rows.push(
        [''],
        ['Strengths', ''],
        ...this.auditData.auditResults.strengths.map((strength: string) => ['', strength])
      );
    }

    if (this.auditData.competitorGaps) {
      const { competitorGaps } = this.auditData;
      rows.push(
        [''],
        ['Opportunity Areas', ''],
        ...competitorGaps.opportunityAreas.map(area => ['', area])
      );
    }

    if (this.auditData.disclaimers) {
      rows.push(
        [''],
        ['Note', this.auditData.disclaimers.note],
        ['Search Volume Note', this.auditData.disclaimers.searchVolumeNote]
      );
    }

    if (!this.auditData.visibilityPotential && this.auditData.citationIntelligence) {
      const { citationIntelligence } = this.auditData;
      rows.push(
        ['Note', 'Scores indicate content alignment potential, not actual citation counts.'],
        ['Overall Potential', citationIntelligence.currentCitationPresence?.totalCitations?.toString() || 'N/A'],
        [''],
        ['Top Content', ''],
        ...(citationIntelligence.currentCitationPresence?.topCitedContent || []).map((content: string) => ['', content]),
        [''],
        ['Opportunities', ''],
        ...(citationIntelligence.citationOpportunities || []).map((opportunity: string) => ['', opportunity])
      );
    }

    return rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
  }

  private generateRecommendationsCSV(): string {
    const rows = [
      ['Priority', 'Recommendation'],
      ...this.auditData.recommendations.map((recommendation, index) => [
        (index + 1).toString(),
        recommendation
      ])
    ];

    return rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
  }

  public generateFullCSV(): string {
    const sections = [
      this.generateOverviewCSV(),
      '',
      'STRENGTHS & WEAKNESSES',
      this.generateStrengthsWeaknessesCSV(),
      ''
    ];

    if (this.auditData.companyIntelligence) {
      sections.push(
        'COMPANY INTELLIGENCE',
        this.generateCompanyIntelligenceCSV(),
        ''
      );
    }

    if (this.auditData.competitorAnalysis) {
      sections.push(
        'COMPETITOR ANALYSIS',
        this.generateCompetitorAnalysisCSV(),
        ''
      );
    }

    sections.push(
      'CONTENT TOPICS',
      this.generateTopicsCSV(),
      ''
    );

    if (this.auditData.citationIntelligence) {
      sections.push(
        'CITATION INTELLIGENCE',
        this.generateCitationIntelligenceCSV(),
        ''
      );
    }

    sections.push(
      'RECOMMENDATIONS',
      this.generateRecommendationsCSV()
    );

    return sections.join('\n');
  }

  public generateTopicsOnlyCSV(): string {
    return this.generateTopicsCSV();
  }

  public downloadCSV(filename: string, csvContent: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}

