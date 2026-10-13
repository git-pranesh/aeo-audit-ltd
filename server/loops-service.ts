const LOOPS_BASE = 'https://app.loops.so/api/v1';

let cachedApiKey: string | null = null;

// Pulls the Loops key from the connected integration (or LOOPS_API_KEY secret if set).
async function getLoopsApiKey(): Promise<string> {
  if (process.env.LOOPS_API_KEY) return process.env.LOOPS_API_KEY;
  if (cachedApiKey) return cachedApiKey;

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Loops not configured: connect the Loops.so integration (or set LOOPS_API_KEY).');
  }

  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=loops-so`,
    { headers: { Accept: 'application/json', X_REPLIT_TOKEN: xReplitToken }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`Loops credential lookup failed (${res.status})`);
  const data = await res.json();
  const apiKey = data.items?.[0]?.settings?.api_key;
  if (!apiKey) throw new Error('Loops API key not found in connection settings.');

  cachedApiKey = apiKey;
  return apiKey;
}

async function loopsFetch(path: string, method: string, body: Record<string, any>) {
  const apiKey = await getLoopsApiKey();
  const res = await fetch(`${LOOPS_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Loops ${method} ${path} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

function quickWinTitle(qw: any): string {
  if (typeof qw === 'string') return qw;
  return qw?.title || qw?.action || qw?.name || '';
}

class LoopsService {
  async upsertContact(props: { email: string; [k: string]: any }): Promise<void> {
    if (!props.email) return;
    await loopsFetch('/contacts/update', 'PUT', props);
    console.log(`📇 Loops: upserted contact ${props.email}`);
  }

  async sendEvent(params: {
    email: string; userId?: string; eventName: string;
    eventProperties?: Record<string, any>; contactProperties?: Record<string, any>;
  }): Promise<void> {
    if (!params.email) return;
    await loopsFetch('/events/send', 'POST', params);
    console.log(`📇 Loops: sent event "${params.eventName}" for ${params.email}`);
  }

  // New signup → create the contact so it can be emailed later.
  async syncNewUser(input: { email: string; name?: string; userId?: string; plan?: string }): Promise<void> {
    const [firstName, ...rest] = (input.name || '').trim().split(' ');
    await this.upsertContact({
      email: input.email,
      userId: input.userId,
      firstName: firstName || undefined,
      lastName: rest.join(' ') || undefined,
      plan: input.plan || 'free',
      source: 'citation-rocket-app',
    });
  }

  // Audit finished → update props + fire events (first_audit_completed drives the drip).
  async syncAuditCompleted(input: {
    email: string; userId?: string; plan: string; companyName?: string;
    auditId: string; auditUrl: string; overallScore: number;
    quickWins: any[]; isFirstAudit: boolean;
  }): Promise<void> {
    const wins = (input.quickWins || []).map(quickWinTitle).filter(Boolean).slice(0, 3);
    const props = {
      plan: input.plan,
      companyName: input.companyName || '',
      auditScore: input.overallScore,
      auditUrl: input.auditUrl,
      quickWin1: wins[0] || '', quickWin2: wins[1] || '', quickWin3: wins[2] || '',
    };

    await this.upsertContact({ email: input.email, userId: input.userId, ...props });
    await this.sendEvent({ email: input.email, userId: input.userId, eventName: 'audit_completed', eventProperties: props });

    if (input.isFirstAudit) {
      await this.sendEvent({
        email: input.email, userId: input.userId,
        eventName: 'first_audit_completed',
        eventProperties: props,
        contactProperties: { checklistCompletedItems: 0 },
      });
    }
  }

  // Checklist changed → keep completed-count current so Loops can skip active users.
  async syncChecklistProgress(input: { email: string; completedCount: number }): Promise<void> {
    await this.upsertContact({ email: input.email, checklistCompletedItems: input.completedCount });
  }
}

export const loopsService = new LoopsService();
