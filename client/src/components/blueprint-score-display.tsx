/**
 * Blueprint Score Display Component
 *
 * Shows the 8 AEO blueprint module scores.
 * Import and add to audit-results.tsx after the existing score breakdown section.
 *
 * Usage in audit-results.tsx:
 *   import BlueprintScoreDisplay from '@/components/blueprint-score-display';
 *   ...
 *   {auditData.blueprintResult && (
 *     <BlueprintScoreDisplay blueprint={auditData.blueprintResult} />
 *   )}
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle, Clock, ExternalLink } from 'lucide-react';

interface BlueprintModule {
  score: number;
  max: number;
}

interface BlueprintResult {
  rawScore: number;
  normalizedScore: number;
  answerCapsule: BlueprintModule & { answerCapsuleScore: number; hasDefinitionFirstPattern: boolean; questionFramedHeadingCount: number; h1IsDeclarative: boolean };
  eeat: BlueprintModule & { eeAtScore: number; hasAuthorByline: boolean; knowledgeGraphEntityFound: boolean; wikidataEntityFound: boolean; hasOrganizationSchema: boolean; eeAtBreakdown: { experience: number; expertise: number; authority: number; trust: number } };
  botAccess: BlueprintModule & { botAccessScore: number; citationBotsBlocked: string[]; llmsTxtPresent: boolean; hasSitemapInRobotsTxt: boolean };
  offsite: BlueprintModule & { offsiteScore: number; g2ProfileExists: boolean; wikipediaArticleExists: boolean; wikidataQNumber: string | null; redditBrandMentionCount: number };
  freshness: BlueprintModule & { freshnessScore: number; daysSinceModified: number | null; hasVisibleLastUpdatedAnnotation: boolean; freshnessStatus: 'green' | 'yellow' | 'red' };
  schemaCompleteness: { schemaCompletenessScore: number; organization: { present: boolean; criticalMissing: string[] }; article: { present: boolean; hasDateModified: boolean }; faqPage: { present: boolean } };
  fanOut: { fanOutScore: number; h1IsQuestionStyle: boolean; answerBlocksPresent?: number; headingsWithAnswerBlockBelow: number };
  entityConsistency: { entityConsistencyScore: number; entityCoherenceRating: 'strong' | 'moderate' | 'weak' };
  criticalGaps: Array<{ module: string; signal: string; impact: 'critical' | 'high' | 'medium'; fix: string; estimatedScoreGain: number }>;
  quickWins: Array<{ action: string; timeEstimate: string; module: string; scoreGain: number; difficulty: 'easy' | 'medium' | 'hard' }>;
}

interface Props {
  blueprint: BlueprintResult;
}

export default function BlueprintScoreDisplay({ blueprint }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeModule, setActiveModule] = useState<string | null>(null);

  const grade = blueprint.normalizedScore >= 80 ? 'A' :
                blueprint.normalizedScore >= 65 ? 'B' :
                blueprint.normalizedScore >= 50 ? 'C' :
                blueprint.normalizedScore >= 35 ? 'D' : 'F';

  const gradeColor = blueprint.normalizedScore >= 70 ? 'text-green-500' :
                     blueprint.normalizedScore >= 50 ? 'text-yellow-500' : 'text-red-500';

  const modules = [
    {
      key: 'eeat',
      label: 'E-E-A-T',
      score: blueprint.eeat.eeAtScore,
      max: 35,
      description: 'Author credentials, entity recognition, trust signals',
      correlation: 'r=0.81',
      details: [
        { label: 'Author byline', value: blueprint.eeat.hasAuthorByline },
        { label: 'Knowledge Graph entity', value: blueprint.eeat.knowledgeGraphEntityFound },
        { label: 'Wikidata entity', value: blueprint.eeat.wikidataEntityFound },
        { label: 'Organization schema', value: blueprint.eeat.hasOrganizationSchema },
      ],
    },
    {
      key: 'offsite',
      label: 'Off-Site Authority',
      score: blueprint.offsite.offsiteScore,
      max: 30,
      description: 'G2, Wikipedia, Wikidata, Reddit brand presence',
      correlation: 'r=0.664',
      details: [
        { label: 'G2 profile', value: blueprint.offsite.g2ProfileExists },
        { label: 'Wikipedia article', value: blueprint.offsite.wikipediaArticleExists },
        { label: 'Wikidata entity', value: !!blueprint.offsite.wikidataQNumber },
        { label: 'Reddit mentions', value: blueprint.offsite.redditBrandMentionCount > 0 },
      ],
    },
    {
      key: 'answerCapsule',
      label: 'Answer Capsule',
      score: blueprint.answerCapsule.answerCapsuleScore,
      max: 25,
      description: 'First 150 words structured as AI-extractable answer',
      correlation: 'Strongest on-site predictor',
      details: [
        { label: 'Definition-first opening', value: blueprint.answerCapsule.hasDefinitionFirstPattern },
        { label: 'Declarative H1', value: blueprint.answerCapsule.h1IsDeclarative },
        { label: `Question headings (${blueprint.answerCapsule.questionFramedHeadingCount})`, value: blueprint.answerCapsule.questionFramedHeadingCount > 0 },
      ],
    },
    {
      key: 'schema',
      label: 'Schema Completeness',
      score: blueprint.schemaCompleteness.schemaCompletenessScore,
      max: 20,
      description: 'Organization, Article, FAQPage, BreadcrumbList schemas',
      correlation: 'Consistent positive signal',
      details: [
        { label: 'Organization schema', value: blueprint.schemaCompleteness.organization.present },
        { label: 'Article schema', value: blueprint.schemaCompleteness.article.present },
        { label: 'dateModified in Article', value: blueprint.schemaCompleteness.article.hasDateModified },
        { label: 'FAQPage schema', value: blueprint.schemaCompleteness.faqPage.present },
      ],
    },
    {
      key: 'freshness',
      label: 'Content Freshness',
      score: blueprint.freshness.freshnessScore,
      max: 15,
      description: 'Content age, dateModified schema, visible update annotations',
      correlation: '25.7% fresher than non-cited',
      details: [
        {
          label: blueprint.freshness.daysSinceModified !== null
            ? `Last modified: ${blueprint.freshness.daysSinceModified} days ago`
            : 'No dateModified found',
          value: blueprint.freshness.daysSinceModified !== null && blueprint.freshness.daysSinceModified <= 90
        },
        { label: 'Visible "Last Updated" annotation', value: blueprint.freshness.hasVisibleLastUpdatedAnnotation },
      ],
    },
    {
      key: 'botAccess',
      label: 'AI Bot Access',
      score: blueprint.botAccess.botAccessScore,
      max: 10,
      description: 'robots.txt allows citation bots, llms.txt present',
      correlation: 'Blocking = invisible to AI',
      details: [
        {
          label: blueprint.botAccess.citationBotsBlocked.length === 0
            ? 'All citation bots allowed'
            : `Blocked: ${blueprint.botAccess.citationBotsBlocked.join(', ')}`,
          value: blueprint.botAccess.citationBotsBlocked.length === 0
        },
        { label: 'llms.txt present', value: blueprint.botAccess.llmsTxtPresent },
        { label: 'Sitemap in robots.txt', value: blueprint.botAccess.hasSitemapInRobotsTxt },
      ],
    },
    {
      key: 'fanOut',
      label: 'Fan-Out Coverage',
      score: blueprint.fanOut.fanOutScore,
      max: 10,
      description: 'Heading structure, answer density, section length',
      correlation: 'Structural optimisation',
      details: [
        { label: 'H1 is declarative (not question)', value: !blueprint.fanOut.h1IsQuestionStyle },
        { label: `Answer blocks under headings: ${blueprint.fanOut.headingsWithAnswerBlockBelow}`, value: blueprint.fanOut.headingsWithAnswerBlockBelow > 0 },
      ],
    },
    {
      key: 'entity',
      label: 'Entity Consistency',
      score: blueprint.entityConsistency.entityConsistencyScore,
      max: 5,
      description: 'Brand name consistent across platforms',
      correlation: 'Entity coherence',
      details: [
        { label: `Entity coherence: ${blueprint.entityConsistency.entityCoherenceRating}`, value: blueprint.entityConsistency.entityCoherenceRating === 'strong' },
      ],
    },
  ];

  const criticalCount = blueprint.criticalGaps.filter(g => g.impact === 'critical').length;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">AEO Blueprint Score</h3>
          <p className="text-sm text-muted-foreground">Based on research-backed citation correlation signals</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`text-4xl font-bold ${gradeColor}`}>{blueprint.normalizedScore}</div>
            <div className="text-sm text-muted-foreground">out of 100</div>
          </div>
          <div className={`text-3xl font-bold w-12 h-12 rounded-full border-2 flex items-center justify-center ${gradeColor} border-current`}>
            {grade}
          </div>
        </div>
      </div>

      {/* Raw score bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Raw score: {blueprint.rawScore}/150</span>
          <span>Normalized: {blueprint.normalizedScore}/100</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              blueprint.normalizedScore >= 70 ? 'bg-green-500' :
              blueprint.normalizedScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${blueprint.normalizedScore}%` }}
          />
        </div>
      </div>

      {/* Critical gaps banner */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-500 font-medium">
            {criticalCount} critical issue{criticalCount > 1 ? 's' : ''} blocking AI citations
          </span>
        </div>
      )}

      {/* Module grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {modules.map((mod) => {
          const pct = mod.score / mod.max;
          const color = pct >= 0.7 ? 'text-green-500 border-green-500/30' :
                        pct >= 0.4 ? 'text-yellow-500 border-yellow-500/30' : 'text-red-500 border-red-500/30';

          return (
            <button
              key={mod.key}
              onClick={() => setActiveModule(activeModule === mod.key ? null : mod.key)}
              className={`rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${color}`}
            >
              <div className="text-xs text-muted-foreground mb-1">{mod.label}</div>
              <div className={`text-xl font-bold ${color.split(' ')[0]}`}>
                {mod.score}<span className="text-sm font-normal text-muted-foreground">/{mod.max}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1 mt-2">
                <div
                  className={`h-1 rounded-full ${pct >= 0.7 ? 'bg-green-500' : pct >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.round(pct * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Module detail panel */}
      {activeModule && (() => {
        const mod = modules.find(m => m.key === activeModule);
        if (!mod) return null;
        return (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{mod.label}</div>
                <div className="text-sm text-muted-foreground">{mod.description}</div>
                <div className="text-xs text-muted-foreground mt-1">Correlation: {mod.correlation}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold">{mod.score}/{mod.max}</div>
              </div>
            </div>
            <div className="space-y-2">
              {mod.details.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {d.value
                    ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    : <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  }
                  <span className={d.value ? '' : 'text-muted-foreground'}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Quick wins */}
      {blueprint.quickWins.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-sm font-medium w-full text-left"
          >
            <Clock className="h-4 w-4 text-primary" />
            {blueprint.quickWins.length} Quick Wins Available
            {expanded ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
          </button>

          {expanded && (
            <div className="space-y-2">
              {blueprint.quickWins.map((win, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                    win.difficulty === 'easy' ? 'bg-green-500/10 text-green-500' :
                    win.difficulty === 'medium' ? 'bg-yellow-500/10 text-yellow-500' :
                    'bg-red-500/10 text-red-500'
                  }`}>
                    {win.difficulty}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{win.action}</div>
                    <div className="text-xs text-muted-foreground">{win.module} · {win.timeEstimate}</div>
                  </div>
                  <div className="text-sm font-bold text-green-500 flex-shrink-0">+{win.scoreGain}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Critical gaps */}
      {blueprint.criticalGaps.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Critical Gaps to Fix</div>
          {blueprint.criticalGaps.slice(0, 3).map((gap, i) => (
            <div key={i} className={`rounded-lg border p-3 space-y-1 ${
              gap.impact === 'critical' ? 'border-red-500/30 bg-red-500/5' :
              gap.impact === 'high' ? 'border-yellow-500/30 bg-yellow-500/5' :
              'border-border bg-muted/20'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  gap.impact === 'critical' ? 'bg-red-500/20 text-red-500' :
                  gap.impact === 'high' ? 'bg-yellow-500/20 text-yellow-500' :
                  'bg-muted text-muted-foreground'
                }`}>{gap.impact}</span>
                <span className="text-sm font-medium">{gap.signal}</span>
                <span className="ml-auto text-xs text-green-500 font-medium">+{gap.estimatedScoreGain} pts</span>
              </div>
              <div className="text-xs text-muted-foreground">{gap.fix}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
