# Citation Rocket

### Overview
Citation Rocket is an AI Readiness Optimizer SaaS that helps businesses understand and improve their visibility and citation potential within AI platforms like ChatGPT, Perplexity, Gemini, and Claude. Users submit a website URL and receive a comprehensive report detailing AI readiness scores, content gaps, competitive benchmarks, and actionable recommendations. The platform aims to empower B2B companies, agencies, and SaaS brands to enhance their presence in AI-generated answers and recommendations.

### User Preferences
Preferred communication style: Simple, everyday language.

### System Architecture
The application is built with a React 18 frontend using TypeScript, Vite, and Shadcn/ui for a light-themed UI. State management is handled by TanStack Query, routing by Wouter, and forms by React Hook Form with Zod validation. Authentication is managed via the Firebase client SDK.

The backend is an Express.js application with TypeScript, configured to handle various API routes for audit processing, data retrieval, subscription management, and administrative tasks. Key security measures include `helmet`, `cors`, and `express-rate-limit`.

Data storage is distributed: PostgreSQL with Drizzle ORM on Neon handles session management and relational data. Firestore stores user documents, audit payloads, citation history, and score history. Path aliases `@shared` and `@` are used for module organization.

The core functionality revolves around a two-step audit pipeline. Step 1 (`/api/audit/analyze`) extracts company intelligence using Perplexity Sonar, suggesting keywords and competitors. Step 2 (`/api/audit/batch`) performs a full audit, including sitemap scraping, content signal extraction, platform-specific scoring, topic generation, playbook creation, and a live citation snapshot via Perplexity Sonar.

The scoring engine employs a zero-based, earned-points model across four categories: Content Depth, Structure & Technical, Research & Citations, and Authority. Each category has a maximum point value, and signals are scored against benchmark values with penalty multipliers for low performance. Platform-specific weighting is applied, and the system includes scale-aware confidence floors and tie-breaking logic.

Content signal extraction prioritizes sitemap URLs, then scraped HTML (DOM structure, schema), and finally scraped text (word frequency). GPT-4.1-nano is used for content verification.

Topic generation provides suggestions across "authoritative," "thoughtLeadership," "competitiveAdvantage," and "emergingOpportunity" categories, leveraging content signals, platform scores, company intelligence, and keywords. Topics are deduplicated using keyword/word-overlap (Jaccard) similarity — not cosine/embedding similarity.

The fix-it playbook generator is deterministic, producing actionable steps, code snippets, and content templates based on identified signal gaps. Playbook modes vary by plan, offering different levels of detail and prioritization. A subset of these actions forms the "Quick Wins" checklist.

The re-audit process re-evaluates signals and scores, regenerates playbooks, and performs a smart checklist merge to preserve user progress, archiving resolved items and marking new ones.

A citation snapshot system uses Perplexity Sonar to generate 5-8 prompts and detect mentions of the company, providing a mention rate and listing cited competitors. This data is stored in a citation history subcollection, and a scheduler automatically refreshes snapshots based on user plan frequency. Changes in mention rates can trigger email alerts.

Admin features include a dashboard for system health, user management, and content editing. An "View-As-Plan" feature allows admins to simulate different subscription tiers.

### External Dependencies
*   **Neon PostgreSQL**: Primary relational database.
*   **Firebase Authentication**: User identity and authentication.
*   **Firebase Firestore**: Document database for user data, audits, and history.
*   **Perplexity Sonar / Sonar Pro models via OpenRouter**: Primary AI models for company intelligence extraction, deep research, topic generation, and live citation snapshots. All LLM calls (platform and BYOK) are routed exclusively through OpenRouter (`OPENROUTER_API_KEY` / a user's saved OpenRouter key) — there is no direct Perplexity API integration.
*   **OpenAI models**: `gpt-4o-mini` for fallback/orchestration and `gpt-4.1-nano` for content verification.
*   **Dodo Payments SDK**: Subscription management and payment processing.
*   **Svix**: Webhook signature verification for Dodo Payments.
*   **Resend**: Transactional email delivery.
*   **node-cron**: Scheduling for automated tasks like citation monitoring.
*   **Radix UI / Shadcn/ui**: Frontend UI component library.
*   **TanStack Query**: Client-side server state management.
*   **Drizzle ORM**: Type-safe SQL query builder for PostgreSQL.
*   **Zod**: Schema validation.
*   **Vitest**: Testing framework.