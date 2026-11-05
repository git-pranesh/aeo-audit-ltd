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
    a: "Your lifetime license covers the software. AI calls run on your own OpenRouter account, so you only pay the model provider for what you use, under $0.001 per audit with the default model (measured). One OpenRouter key covers every model, and you can choose any model in Settings, free to premium. We recommend a dedicated key with a low spending limit.",
  },
  {
    q: "What does an audit include?",
    a: "AI Readiness Score and platform scores (ChatGPT, Perplexity, Gemini, Claude), content and technical signals, an industry benchmark, strengths and gaps, the Fix-It Playbook, content topic ideas, PDF and CSV exports and the AEO Pack (llms.txt, llms-full.txt, robots.txt rules for AI crawlers, Organization/WebSite/FAQ schema built from your real pages, Article and Breadcrumb templates, homepage Markdown and install instructions).",
  },
  {
    q: "What is the AI Citation Check?",
    a: "An optional check you start yourself. Choose any of five engines: Perplexity, Gemini, Claude, GPT and Grok. AI writes 8 questions a real customer would ask (3 naming you, 5 not naming you), or you can write up to 25 of your own. You see the cost first: about 5 cents on Perplexity alone, about 80 cents to $1 on all five, on your OpenRouter key. The report separates answers where the question did not name you, which is the number that matters, and keeps a dated history of past checks.",
  },
  {
    q: "Are there limits?",
    a: "Unlimited domains under fair use. Lifetime: 3 audits per hour, 10 per 24 hours, latest 25 audits saved. Agency: 10 per hour, 30 per 24 hours, latest 100 saved. Both: 2 audits running at once, up to 10 pages read per audit, up to 3 competitors per audit. Download PDFs, CSVs or the AEO Pack for anything you want to keep longer.",
  },
  {
    q: "Does Citation Rocket monitor my site automatically?",
    a: "No. Nothing runs in the background. Re-run an audit whenever you want a fresh score. The report shows the change versus your previous audit of the same domain.",
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
    a: "Your OpenRouter key is encrypted at rest and never sent back to your browser. We store compact final reports only, not raw page HTML, prompts or model responses. Deleting your account deletes your audits and saved key.",
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
          Full guide with screenshots: <a className="text-primary underline" href="https://www.citationrocket.com/help" target="_blank" rel="noreferrer">Help Centre</a>. Still stuck? Email <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>
    </AppShell>
  );
}
