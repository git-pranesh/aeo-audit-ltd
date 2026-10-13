import AppShell from "@/components/app-shell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const SUPPORT_EMAIL = "support@citationrocket.com";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I get started?",
    a: (
      <ol className="list-decimal pl-5 space-y-1">
        <li>Create an account (use the same email you purchased with).</li>
        <li>Your license activates automatically for direct purchases, or enter your code in Settings.</li>
        <li>Add your OpenRouter key in Settings.</li>
        <li>Enter a website, confirm the business details, and run the audit.</li>
      </ol>
    ),
  },
  {
    q: "Why do I need my own OpenRouter key?",
    a: "Your lifetime license covers the software. AI calls run on your own OpenRouter account, so you only pay the model provider for what you use — usually a few cents per audit. One OpenRouter key covers every model we use. We recommend a dedicated key with a low spending limit.",
  },
  {
    q: "What does an audit include?",
    a: "AI Readiness Score and platform scores (ChatGPT, Perplexity, Gemini, Claude), content and technical signals, an industry benchmark, strengths and gaps, the Fix-It Playbook, content topic ideas, PDF and CSV exports and the AEO Pack (llms.txt, llms-full.txt, robots.txt rules for AI crawlers, Organization/WebSite/FAQ schema built from your real pages, Article and Breadcrumb templates, homepage Markdown and install instructions).",
  },
  {
    q: "What is the Citation Snapshot?",
    a: "An optional, manual check: we ask AI search up to 8 real buyer questions and show whether you were mentioned and which brands were cited instead. It uses web-search calls on your OpenRouter key and only the latest result is kept.",
  },
  {
    q: "Are there limits?",
    a: "Unlimited domains under fair use: up to 3 audits per hour, 10 per day, 2 running at once, 10 pages read per audit, up to 3 competitors per audit. Your latest 25 audits are kept — download PDFs, CSVs or the AEO Pack for anything you want to keep longer.",
  },
  {
    q: "Does Citation Rocket monitor my site automatically?",
    a: "No. Nothing runs in the background. Re-run an audit whenever you want a fresh score — the report shows the change versus your previous audit of the same domain.",
  },
  {
    q: "My site couldn't be read. What now?",
    a: "Some sites block automated visitors or render everything with JavaScript. We try a direct fetch first and a reader fallback second; if both fail, the report says so and scores reflect only what we could access.",
  },
  {
    q: "What's in the Agency license?",
    a: "Everything in Lifetime plus custom branding on PDF reports: your agency name, logo, accent colour, report title and footer/contact line. Set it up in Settings.",
  },
  {
    q: "How is my data handled?",
    a: "Your OpenRouter key is encrypted at rest and never sent back to your browser. We store compact final reports only — not raw page HTML, prompts or model responses. Deleting your account deletes your audits and saved key.",
  },
];

export default function HelpSupport() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Help</h1>
        <Accordion type="single" collapsible className="space-y-2">
          {FAQ.map(({ q, a }) => (
            <AccordionItem key={q} value={q} className="border rounded-lg px-4">
              <AccordionTrigger className="text-left">{q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="text-sm text-muted-foreground">
          Still stuck? Email <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>
    </AppShell>
  );
}
