import { Card, CardContent } from "@/components/ui/card";
import { Bot, Check, Minus, X } from "lucide-react";

const SEARCH: [string, string][] = [
  ["OAI-SearchBot", "OpenAI · ChatGPT search"], ["ChatGPT-User", "OpenAI · pages ChatGPT opens"],
  ["Claude-SearchBot", "Anthropic · Claude search"], ["Claude-User", "Anthropic · pages Claude opens"],
  ["PerplexityBot", "Perplexity search"], ["Perplexity-User", "Perplexity · pages it opens"],
  ["bingbot", "Microsoft · Bing and Copilot"],
];
const TRAINING: [string, string][] = [
  ["GPTBot", "OpenAI"], ["ClaudeBot", "Anthropic"], ["Google-Extended", "Google · Gemini"],
  ["Applebot-Extended", "Apple"], ["CCBot", "Common Crawl"], ["meta-externalagent", "Meta"],
];

type BotAccess = { robotsTxtFetched?: boolean; citationBotsBlocked?: string[]; trainingBotsBlocked?: string[]; llmsTxtPresent?: boolean; hasSitemapInRobotsTxt?: boolean };

function Row({ name, note, status, training }: { name: string; note: string; status: "allowed" | "blocked" | "unknown"; training?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-mono truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {status === "allowed" && <span className="text-xs font-semibold text-green-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" />Allowed</span>}
      {status === "blocked" && <span className={`text-xs font-semibold flex items-center gap-1 ${training ? "text-amber-700" : "text-red-600"}`}><X className="h-3.5 w-3.5" />Blocked</span>}
      {status === "unknown" && <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Minus className="h-3.5 w-3.5" />Unknown</span>}
    </li>
  );
}

/** Every AI crawler we check in robots.txt, so the result is visible even when nothing is blocked. */
export default function CrawlerAccess({ botAccess }: { botAccess?: BotAccess }) {
  if (!botAccess) return null;
  const known = botAccess.robotsTxtFetched !== false;
  const blockedSearch = botAccess.citationBotsBlocked ?? [];
  const blockedTraining = botAccess.trainingBotsBlocked ?? [];
  const status = (bot: string, blocked: string[]) => (!known ? "unknown" : blocked.includes(bot) ? "blocked" : "allowed") as "allowed" | "blocked" | "unknown";

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />AI Crawler Access</h3>
          <p className={`text-sm mt-1 ${!known ? "text-muted-foreground" : blockedSearch.length ? "text-red-600 font-medium" : "text-green-700 font-medium"}`}>
            {!known
              ? "We couldn't read robots.txt (the site blocked our check), so crawler access is unknown."
              : blockedSearch.length
                ? `robots.txt blocks ${blockedSearch.length} of ${SEARCH.length} AI search crawlers. The fix is the #1 action in your playbook.`
                : `All ${SEARCH.length} AI search crawlers are allowed by robots.txt.`}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium">AI search and answer crawlers</p>
            <p className="text-xs text-muted-foreground">Needed to appear in AI search answers.</p>
            <ul className="divide-y divide-border/60">{SEARCH.map(([b, n]) => <Row key={b} name={b} note={n} status={status(b, blockedSearch)} />)}</ul>
          </div>
          <div>
            <p className="text-sm font-medium">AI training crawlers</p>
            <p className="text-xs text-muted-foreground">Blocking these is your choice; it doesn't block AI search.</p>
            <ul className="divide-y divide-border/60">{TRAINING.map(([b, n]) => <Row key={b} name={b} note={n} status={status(b, blockedTraining)} training />)}</ul>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          llms.txt: {botAccess.llmsTxtPresent ? "found" : "not found"} · Sitemap in robots.txt: {botAccess.hasSitemapInRobotsTxt ? "yes" : "no"} · Firewall or CDN bot blocking can't be seen from robots.txt.
        </p>
      </CardContent>
    </Card>
  );
}
