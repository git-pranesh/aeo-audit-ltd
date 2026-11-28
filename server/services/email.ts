/**
 * Transactional email through Resend (RESEND_API_KEY). Two uses only:
 *  - the welcome email to a buyer when their payment succeeds
 *  - sale, refund and chargeback alerts to the founder
 * Sends from and to support@citationrocket.com, so replies land in one inbox.
 * Never throws: a failed email must not fail the payment webhook.
 */

const FROM = 'Pranesh at Citation Rocket <support@citationrocket.com>';
const OWNER = process.env.SALES_ALERT_EMAIL || 'support@citationrocket.com';
const APP = 'https://app.citationrocket.com';
const DEMO = 'https://youtu.be/fOwpDB9JQjw';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function send(msg: { to: string; subject: string; html: string; text: string; idempotencyKey?: string; replyTo?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`Email skipped (RESEND_API_KEY not set): ${msg.subject}`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(msg.idempotencyKey ? { 'Idempotency-Key': msg.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: FROM, to: [msg.to], reply_to: msg.replyTo || 'support@citationrocket.com', subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Email failed (${res.status}): ${msg.subject}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`Email failed: ${msg.subject}: ${err?.message}`);
    return false;
  }
}

/** First word of the buyer's name, cleaned; empty when it does not look like a name. */
function firstName(name?: string): string {
  const w = (name || '').trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, '') || '';
  return w.length >= 2 && w.length <= 30 ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}

export async function sendWelcomeEmail(p: { email: string; name?: string; agency: boolean; paymentId: string }): Promise<boolean> {
  const hi = firstName(p.name) ? `Hi ${firstName(p.name)},` : 'Hi,';
  const plan = p.agency ? 'Lifetime Agency' : 'Lifetime';
  const text = [
    hi,
    '',
    `Thanks for buying Citation Rocket ${plan}. Your licence is tied to ${p.email}.`,
    '',
    `1. Sign in or create an account at ${APP} with this same email. The licence attaches itself.`,
    '2. Add your OpenRouter key in Settings. A few dollars of credit covers many audits.',
    '3. Run your first audit.',
    '',
    `7-minute walkthrough: ${DEMO}`,
    '',
    'Reply to this email if anything is unclear. I read every one.',
    'Pranesh, founder',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px">
<p>${esc(hi)}</p>
<p>Thanks for buying Citation Rocket ${plan}. Your licence is tied to <b>${esc(p.email)}</b>.</p>
<ol style="padding-left:20px">
<li>Sign in or create an account at <a href="${APP}">app.citationrocket.com</a> with this same email. The licence attaches itself.</li>
<li>Add your OpenRouter key in Settings. A few dollars of credit covers many audits.</li>
<li>Run your first audit.</li>
</ol>
<p><a href="${DEMO}">Watch the 7-minute walkthrough</a></p>
<p>Reply to this email if anything is unclear. I read every one.<br>Pranesh, founder</p>
</div>`;
  return send({ to: p.email, subject: 'Your Citation Rocket licence is ready', html, text, idempotencyKey: `welcome-${p.paymentId}` });
}

export type SaleAlertKind = 'sale' | 'refund' | 'chargeback';

export async function sendSaleAlert(p: {
  kind: SaleAlertKind;
  paymentId: string;
  email?: string;
  name?: string;
  agency?: boolean;
  amountPaid?: number; // cents
  partner?: boolean;
  source?: string;
  totalSold?: number;
}): Promise<boolean> {
  const plan = p.agency ? 'Lifetime Agency' : 'Lifetime';
  const amount = typeof p.amountPaid === 'number' ? `$${(p.amountPaid / 100).toFixed(p.amountPaid % 100 ? 2 : 0)}` : 'unknown amount';
  const subject =
    p.kind === 'sale' ? `New sale: ${plan}, ${amount}${p.totalSold ? ` (sale #${p.totalSold})` : ''}`
    : p.kind === 'refund' ? `Refund: ${p.email || p.paymentId}`
    : `Chargeback lost: ${p.email || p.paymentId}`;
  const rows: [string, string][] = [
    ['Buyer', [p.name, p.email].filter(Boolean).join(' · ') || 'unknown'],
    ...(p.kind === 'sale' ? ([['Plan', plan], ['Paid', amount], ['Partner', p.partner ? 'yes (see Affonso)' : 'none'], ['Came from', p.source || 'unknown']] as [string, string][]) : []),
    ['Order', p.paymentId],
    ...(p.totalSold ? ([['Paid licences so far', String(p.totalSold)]] as [string, string][]) : []),
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nAll sales: ${APP}/admin`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#111">
<table cellpadding="4">${rows.map(([k, v]) => `<tr><td style="color:#666">${k}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>
<p><a href="${APP}/admin">All sales in Admin</a></p></div>`;
  return send({ to: OWNER, subject, html, text, idempotencyKey: `alert-${p.kind}-${p.paymentId}` });
}

/**
 * Support ticket from the website chat bot (DM Champ custom function) when it cannot answer
 * or the visitor asks for a person. Goes to the owner inbox; Reply-To is the visitor, so a
 * normal reply from the inbox reaches them directly.
 */
export async function sendSupportTicket(p: { name?: string; email?: string; question: string; summary?: string; page?: string; ticketId: string }): Promise<boolean> {
  const who = [p.name, p.email].filter(Boolean).join(' · ') || 'No contact details left';
  const short = p.question.replace(/\s+/g, ' ').trim().slice(0, 70);
  const rows: [string, string][] = [
    ['From', who],
    ['Question', p.question],
    ...(p.summary ? ([['Chat summary', p.summary]] as [string, string][]) : []),
    ...(p.page ? ([['Page', p.page]] as [string, string][]) : []),
    ['Ticket', p.ticketId],
  ];
  const note = p.email
    ? 'Reply to this email to answer the visitor directly.'
    : 'No email was left, so answer in DM Champ: https://app.dmchamp.com/chats';
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n\n') + `\n\n${note}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#111;max-width:640px">
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
<p style="color:#444">${esc(note)}</p></div>`;
  return send({ to: OWNER, subject: `Support ticket: ${short}`, html, text, replyTo: p.email, idempotencyKey: `ticket-${p.ticketId}` });
}
