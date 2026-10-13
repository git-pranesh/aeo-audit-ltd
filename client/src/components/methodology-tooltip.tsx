import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type MethodologyType = 
  | 'sample-based'
  | 'url-pattern'
  | 'text-analysis'
  | 'hybrid'
  | 'exact'
  | 'deterministic'
  | 'benchmark';

const methodologyDescriptions: Record<MethodologyType, { label: string; description: string }> = {
  'sample-based': {
    label: 'Estimated from sample',
    description: 'Measured by analyzing a representative sample of up to 20 pages spread across your site, then scaled proportionally. A full crawl of large sites could take hours, so sampling balances accuracy with speed.',
  },
  'url-pattern': {
    label: 'Detected from sitemap',
    description: 'Counted by analyzing your sitemap URL structure. URLs matching known content patterns (e.g., /blog/, /help/, /guides/) are identified as that content type.',
  },
  'text-analysis': {
    label: 'Measured from page content',
    description: 'Counted by scanning the actual text content of your pages for specific patterns, phrases, and data points. This is a direct measurement, not an estimate.',
  },
  'hybrid': {
    label: 'Sitemap + page analysis',
    description: 'Detected using a combination of sitemap URL patterns and actual page content analysis. The higher of the two methods is used to avoid undercounting.',
  },
  'exact': {
    label: 'Exact count',
    description: 'This is a precise, directly measured value with no estimation involved.',
  },
  'deterministic': {
    label: 'Calculated score',
    description: 'Computed using a deterministic formula based on your content signals. No AI opinions — purely mathematical, weighted scoring.',
  },
  'benchmark': {
    label: 'Industry benchmark',
    description: 'Based on content signal analysis patterns observed across this industry. These are representative ranges, not live data from a specific dataset.',
  },
};

interface MethodologyTooltipProps {
  type: MethodologyType;
  className?: string;
  size?: 'sm' | 'md';
}

export default function MethodologyTooltip({ type, className = '', size = 'sm' }: MethodologyTooltipProps) {
  const info = methodologyDescriptions[type];
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors ${className}`}
            aria-label={`How we measure: ${info.label}`}
          >
            <Info className={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] p-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-foreground">{info.label}</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{info.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MethodologyBannerProps {
  className?: string;
}

export function MethodologyBanner({ className = '' }: MethodologyBannerProps) {
  return (
    <div className={`flex items-start gap-2 text-[11px] text-muted-foreground/70 ${className}`}>
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        Metrics use a mix of methods: sitemap URL pattern matching, direct page content analysis, and representative page sampling. 
        Hover over the <Info className="h-2.5 w-2.5 inline-block mx-0.5 -mt-0.5" /> icon next to each metric to see exactly how it was measured.
        All scores use deterministic formulas — no AI opinions.
      </span>
    </div>
  );
}
