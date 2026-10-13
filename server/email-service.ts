import { Resend } from 'resend';

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function getCredentials() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@citationrocket.com';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured. Please add it as a project secret.');
  }

  return { apiKey, fromEmail };
}

function getResendClient() {
  const { apiKey, fromEmail } = getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

// ─── Brand constants ─────────────────────────────────────────────────────────
const BRAND = {
  black: '#1A1A1A',
  bg: '#F1F1EF',
  white: '#FFFFFF',
  muted: '#6b7280',
  border: '#e5e7eb',
  appUrl: process.env.PRODUCTION_URL || 'https://app.citationrocket.com',
};

// ─── Shared HTML wrapper ──────────────────────────────────────────────────────
function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: ${BRAND.black}; background: ${BRAND.bg}; margin: 0; padding: 0; }
    .wrapper { background: ${BRAND.bg}; padding: 32px 16px; }
    .container { max-width: 560px; margin: 0 auto; }
    .header { background: ${BRAND.black}; color: ${BRAND.white}; padding: 36px 28px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0 0 6px; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 0; font-size: 14px; opacity: 0.75; }
    .content { background: ${BRAND.white}; padding: 32px 28px; border-radius: 0 0 10px 10px; border: 1px solid ${BRAND.border}; border-top: none; }
    .btn { background: ${BRAND.black}; color: ${BRAND.white} !important; padding: 13px 30px; text-decoration: none; border-radius: 7px; display: inline-block; margin: 24px 0; font-weight: 600; font-size: 15px; }
    .feature-row { padding: 11px 14px; margin: 6px 0; background: ${BRAND.bg}; border-radius: 6px; border-left: 3px solid ${BRAND.black}; font-size: 14px; }
    .info-box { background: #fef9ec; border: 1px solid #f59e0b; padding: 14px 16px; border-radius: 7px; margin: 18px 0; font-size: 14px; }
    .receipt { background: ${BRAND.white}; padding: 18px; border-radius: 8px; margin: 18px 0; border: 1px solid ${BRAND.border}; }
    .receipt-row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; }
    .receipt-row:last-child { border-bottom: none; font-weight: 700; }
    .plan-badge { background: ${BRAND.black}; color: ${BRAND.white}; padding: 6px 14px; border-radius: 20px; display: inline-block; margin: 14px 0; font-size: 13px; font-weight: 600; }
    .footer { text-align: center; color: ${BRAND.muted}; padding: 24px 0 8px; font-size: 13px; }
    .footer a { color: ${BRAND.muted}; text-decoration: underline; }
    h2 { margin-top: 0; font-size: 18px; }
    ul { padding-left: 18px; font-size: 14px; }
    li { margin: 5px 0; }
    p { font-size: 14px; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      ${bodyHtml}
      <div class="footer">
        <p><strong>Citation Rocket</strong> &mdash; AI Readiness Optimization</p>
        <p>Questions? <a href="mailto:support@citationrocket.com">support@citationrocket.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

class EmailService {
  private fromName: string = 'Citation Rocket';

  async sendEmail(params: EmailParams): Promise<boolean> {
    try {
      console.log(`📧 Sending email to ${params.to}: ${params.subject}`);

      const { client, fromEmail } = getResendClient();
      
      const response = await client.emails.send({
        from: `${this.fromName} <${fromEmail}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text || params.subject
      });

      if (response.data?.id) {
        console.log('✅ Email sent successfully:', response.data.id);
        return true;
      } else {
        console.error('❌ Email sending failed:', response.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Email sending error:', error);
      return false;
    }
  }

  async sendSignupWelcomeEmail(
    userEmail: string,
    userName: string
  ): Promise<boolean> {
    const html = emailWrapper(`
      <div class="header">
        <h1>Welcome to Citation Rocket</h1>
        <p>Your account has been created successfully</p>
      </div>
      <div class="content">
        <h2>Hi ${userName},</h2>
        <p>You're now set up to see exactly how AI platforms like ChatGPT, Perplexity, Gemini, and Claude perceive your website — and how to improve that.</p>

        <div class="feature-row"><strong>Run your first audit</strong> — paste a URL and get a full AI readiness report in under 60 seconds</div>
        <div class="feature-row"><strong>Platform scores</strong> — see individual scores for each major AI platform</div>
        <div class="feature-row"><strong>Fix-it playbooks</strong> — step-by-step actions to close content gaps</div>
        <div class="feature-row"><strong>Competitor analysis</strong> — find out who AI platforms recommend instead of you</div>

        <div class="info-box">
          <strong>Your Free plan includes:</strong><br>
          1 domain &middot; 3 topics per category &middot; basic platform scores
        </div>

        <center>
          <a href="${BRAND.appUrl}" class="btn">Run Your First Audit</a>
        </center>

        <p style="margin-top: 24px;">
          <strong>Quick start:</strong> paste your website URL → click "Run Audit" → review your scores and the recommended fixes.
        </p>
        <p>Need help? Reply to this email and we'll get back to you.</p>
        <p>— The Citation Rocket Team</p>
      </div>
    `);

    return this.sendEmail({
      to: userEmail,
      subject: `Welcome to Citation Rocket — let's run your first audit`,
      html,
      text: `Welcome to Citation Rocket, ${userName}! Run your first audit at ${BRAND.appUrl}`
    });
  }

  async sendWelcomeEmail(
    userEmail: string,
    userName: string,
    planName: string,
    billingPeriod: 'monthly' | 'annual' = 'monthly'
  ): Promise<boolean> {
    const planDetails: Record<string, { name: string; monthlyPrice: string; annualPrice: string; audits: string; topics: string }> = {
      starter: {
        name: 'Starter',
        monthlyPrice: '$49',
        annualPrice: '$490',
        audits: '10 audits / month',
        topics: '12 topics per category',
      },
      pro: {
        name: 'Pro',
        monthlyPrice: '$149',
        annualPrice: '$1,490',
        audits: 'Unlimited audits',
        topics: '25 topics per category',
      },
      enterprise: {
        name: 'Enterprise',
        monthlyPrice: '$299',
        annualPrice: '$2,990',
        audits: 'Unlimited audits',
        topics: '100 topics per category',
      },
    };

    const plan = planDetails[planName.toLowerCase()];
    if (!plan) {
      console.error('sendWelcomeEmail: unknown plan:', planName);
      return false;
    }
    const price = billingPeriod === 'annual' ? plan.annualPrice : plan.monthlyPrice;
    const billingLabel = billingPeriod === 'annual' ? 'Annual (2 months free)' : 'Monthly';

    const html = emailWrapper(`
      <div class="header">
        <h1>${plan.name} Plan Activated</h1>
        <p>Thank you for subscribing to Citation Rocket</p>
      </div>
      <div class="content">
        <h2>Hi ${userName},</h2>
        <p>Your <strong>${plan.name}</strong> subscription is now active.</p>

        <div class="plan-badge">${plan.name} &mdash; ${price} / ${billingLabel}</div>

        <div class="feature-row">✓ ${plan.audits}</div>
        <div class="feature-row">✓ ${plan.topics}</div>
        <div class="feature-row">✓ Full audit results with competitor analysis</div>
        <div class="feature-row">✓ Citation intelligence &amp; market context</div>
        <div class="feature-row">✓ Fix-it playbooks with copy-pasteable actions</div>
        <div class="feature-row">✓ Priority email support</div>

        <center>
          <a href="${BRAND.appUrl}" class="btn">Go to Dashboard</a>
        </center>

        <p>Questions? Reply to this email and we'll help you get set up.</p>
        <p>— The Citation Rocket Team</p>
      </div>
    `);

    return this.sendEmail({
      to: userEmail,
      subject: `Your ${plan.name} plan is active — Citation Rocket`,
      html,
      text: `Your ${plan.name} plan is now active. Start auditing at ${BRAND.appUrl}`
    });
  }

  async sendDowngradeEmail(
    userEmail: string,
    userName: string,
    oldPlan: string,
    newPlan: string,
    accessEndDate?: string
  ): Promise<boolean> {
    const endDateStr = accessEndDate
      ? new Date(accessEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'the end of your billing period';

    const html = emailWrapper(`
      <div class="header">
        <h1>Your Plan Has Changed</h1>
        <p>Subscription update for Citation Rocket</p>
      </div>
      <div class="content">
        <h2>Hi ${userName},</h2>
        <p>Your subscription has been updated from <strong>${oldPlan.charAt(0).toUpperCase() + oldPlan.slice(1)}</strong> to <strong>${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)}</strong>.</p>

        <div class="info-box">
          <strong>Access:</strong> You keep full ${oldPlan} features until <strong>${endDateStr}</strong>. After that, your account moves to the ${newPlan} tier.
        </div>

        <p>Everything you've already audited is saved. You can re-run audits and continue using your existing reports.</p>
        <p>Want to reactivate your previous plan at any time? You can do that from the pricing page.</p>

        <center>
          <a href="${BRAND.appUrl}/pricing" class="btn">View Pricing Plans</a>
        </center>

        <p>Questions? Reply to this email and we'll be happy to help.</p>
        <p>— The Citation Rocket Team</p>
      </div>
    `);

    return this.sendEmail({
      to: userEmail,
      subject: `Your Citation Rocket plan has been updated`,
      html,
      text: `Your plan has been changed from ${oldPlan} to ${newPlan}. You keep access until ${endDateStr}. View plans at ${BRAND.appUrl}/pricing`
    });
  }

  async sendCancellationEmail(
    userEmail: string,
    userName: string,
    planName: string,
    cancellationReason?: string
  ): Promise<boolean> {
    const html = emailWrapper(`
      <div class="header">
        <h1>Subscription Cancelled</h1>
        <p>Your Citation Rocket subscription has been cancelled</p>
      </div>
      <div class="content">
        <h2>Hi ${userName},</h2>
        <p>We've processed your cancellation for the <strong>${planName.charAt(0).toUpperCase() + planName.slice(1)}</strong> plan.</p>

        <div class="info-box">
          <strong>Good news:</strong> You keep full access until the end of your current billing period. After that, your account switches to the Free plan.
        </div>

        ${cancellationReason ? `<p>We noted your reason: <em>"${cancellationReason}"</em>. Thank you for the feedback — it genuinely helps us improve.</p>` : ''}

        <p><strong>What stays intact:</strong></p>
        <ul>
          <li>All your existing audit history and reports</li>
          <li>Access to your dashboard</li>
          <li>Free plan features (1 domain, basic scores)</li>
        </ul>

        <p>Changed your mind? You can reactivate your subscription any time from the pricing page and pick up right where you left off.</p>

        <center>
          <a href="${BRAND.appUrl}/pricing" class="btn">View Plans</a>
        </center>

        <p>— The Citation Rocket Team</p>
      </div>
    `);

    return this.sendEmail({
      to: userEmail,
      subject: `Your Citation Rocket subscription has been cancelled`,
      html,
      text: `Your ${planName} plan has been cancelled. You retain access until the end of your billing period, then you'll move to the Free plan. Resubscribe at ${BRAND.appUrl}/pricing`
    });
  }

  async sendPaymentSuccessEmail(
    userEmail: string,
    userName: string,
    planName: string,
    amount: number,
    billingPeriod: 'monthly' | 'annual' = 'monthly'
  ): Promise<boolean> {
    const html = emailWrapper(`
      <div class="header">
        <h1>Payment Confirmed</h1>
        <p>Thank you for your purchase</p>
      </div>
      <div class="content">
        <h2>Hi ${userName},</h2>
        <p>Your payment was processed successfully. Your <strong>${planName.charAt(0).toUpperCase() + planName.slice(1)}</strong> plan is now active.</p>

        <div class="receipt">
          <div class="receipt-row"><span>Plan</span><span>${planName.charAt(0).toUpperCase() + planName.slice(1)}</span></div>
          <div class="receipt-row"><span>Billing</span><span>${billingPeriod === 'annual' ? 'Annual (2 months free)' : 'Monthly'}</span></div>
          <div class="receipt-row"><span>Amount Paid</span><span>$${amount}</span></div>
        </div>

        <center>
          <a href="${BRAND.appUrl}" class="btn">Go to Dashboard</a>
        </center>

        <p>Questions about your receipt? Reply to this email.</p>
        <p>— The Citation Rocket Team</p>
      </div>
    `);

    return this.sendEmail({
      to: userEmail,
      subject: `Payment confirmed — ${planName.charAt(0).toUpperCase() + planName.slice(1)} plan active`,
      html,
      text: `Payment successful! Your ${planName} plan is active. Amount: $${amount} (${billingPeriod}). Dashboard: ${BRAND.appUrl}`
    });
  }

  async sendWaitlistNotificationEmail(
    userEmail: string,
    featureName: string
  ): Promise<boolean> {
    const html = emailWrapper(`
      <div class="header">
        <h1>You're on the Waitlist</h1>
        <p>We'll notify you as soon as it's ready</p>
      </div>
      <div class="content">
        <p>Thanks for your interest in <strong>${featureName}</strong>. We're actively building it and you'll be among the first to know when it launches.</p>

        <p>In the meantime, here's what you can do today:</p>
        <div class="feature-row">Run AI readiness audits on any website</div>
        <div class="feature-row">Get platform-specific scores for ChatGPT, Perplexity, Gemini &amp; Claude</div>
        <div class="feature-row">Download detailed reports with fix-it playbooks</div>

        <center>
          <a href="${BRAND.appUrl}" class="btn">Run an Audit</a>
        </center>

        <p>— The Citation Rocket Team</p>
      </div>
    `);

    return this.sendEmail({
      to: userEmail,
      subject: `You're on the waitlist for ${featureName} — Citation Rocket`,
      html,
      text: `You're on the waitlist for ${featureName}. We'll notify you when it's ready. Citation Rocket: ${BRAND.appUrl}`
    });
  }

  async sendCitationAlertEmail(
    userEmail: string,
    userName: string,
    data: {
      websiteUrl: string;
      previousMentionRate: number;
      currentMentionRate: number;
      mentionRateChange: number;
      newCompetitors: string[];
      lostCompetitors: string[];
      visibilityGained: boolean;
      visibilityLost: boolean;
      auditId: string;
    }
  ): Promise<boolean> {
    const domain = (() => {
      try { return new URL(data.websiteUrl).hostname.replace('www.', ''); }
      catch { return data.websiteUrl; }
    })();

    const auditLink = `${BRAND.appUrl}/audit/${data.auditId}`;

    const changeDir = data.mentionRateChange > 0 ? '↑' : data.mentionRateChange < 0 ? '↓' : '→';
    const changeSummary = data.visibilityGained
      ? 'AI platforms are now mentioning your brand.'
      : data.visibilityLost
        ? 'AI platforms appear to have stopped mentioning your brand.'
        : data.mentionRateChange > 0
          ? `Your AI mention rate increased by ${data.mentionRateChange} percentage points.`
          : `Your AI mention rate decreased by ${Math.abs(data.mentionRateChange)} percentage points.`;

    let competitorSection = '';
    if (data.newCompetitors.length > 0) {
      competitorSection += `<div style="background:#fef9ec;border-left:3px solid #f59e0b;padding:12px;border-radius:6px;margin:10px 0;font-size:14px;"><strong>New competitors detected:</strong> ${data.newCompetitors.join(', ')}</div>`;
    }
    if (data.lostCompetitors.length > 0) {
      competitorSection += `<div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:12px;border-radius:6px;margin:10px 0;font-size:14px;"><strong>Competitors no longer appearing:</strong> ${data.lostCompetitors.join(', ')}</div>`;
    }

    const rateColor = data.mentionRateChange >= 0 ? '#16a34a' : '#dc2626';

    const html = emailWrapper(`
      <div class="header">
        <h1>Citation Alert for ${domain}</h1>
        <p>AI mention rate has changed significantly</p>
      </div>
      <div class="content">
        <p>Hi ${userName || 'there'},</p>
        <p>${changeSummary}</p>

        <div style="background:${BRAND.bg};padding:20px;border-radius:8px;text-align:center;margin:18px 0;border:1px solid ${BRAND.border};">
          <span style="font-size:28px;font-weight:700;color:${BRAND.muted};">${data.previousMentionRate}%</span>
          <span style="font-size:22px;margin:0 12px;">${changeDir}</span>
          <span style="font-size:28px;font-weight:700;color:${rateColor};">${data.currentMentionRate}%</span>
          <div style="color:${BRAND.muted};margin-top:6px;font-size:13px;">AI Mention Rate</div>
        </div>

        ${competitorSection}

        <center>
          <a href="${auditLink}" class="btn">View Full Report</a>
        </center>

        <p style="font-size:12px;color:${BRAND.muted};">This alert was triggered because the change exceeded your monitoring threshold. You can adjust your alert settings in the audit dashboard.</p>
        <p>— The Citation Rocket Team</p>
      </div>
    `);

    const subject = data.visibilityGained
      ? `Citation alert: ${domain} is now being mentioned by AI`
      : data.visibilityLost
        ? `Citation alert: ${domain} no longer being mentioned by AI`
        : `Citation alert: ${domain} mention rate ${data.mentionRateChange > 0 ? 'increased' : 'decreased'} ${Math.abs(data.mentionRateChange)}pp`;

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      text: `Citation alert for ${domain}: mention rate changed from ${data.previousMentionRate}% to ${data.currentMentionRate}% (${data.mentionRateChange > 0 ? '+' : ''}${data.mentionRateChange}pp). View report: ${auditLink}`
    });
  }

  /**
   * Internal admin alert email — never shown to end users.
   */
  async sendAdminAlertEmail(
    adminEmail: string,
    error: {
      category: string;
      message: string;
      data?: Record<string, unknown>;
      userId?: string;
      auditId?: string;
      timestamp: string;
    }
  ): Promise<boolean> {
    const dataStr = error.data
      ? `<pre style="background:#f1f1ef;padding:12px;border-radius:6px;font-size:12px;overflow:auto;white-space:pre-wrap;">${JSON.stringify(error.data, null, 2)}</pre>`
      : '';

    const html = emailWrapper(`
      <div class="header" style="background:#dc2626;">
        <h1>System Error Alert</h1>
        <p>Citation Rocket — ${error.timestamp}</p>
      </div>
      <div class="content">
        <p><strong>Category:</strong> ${error.category.toUpperCase()}</p>
        <p><strong>Message:</strong> ${error.message}</p>
        ${error.userId ? `<p><strong>User ID:</strong> ${error.userId}</p>` : ''}
        ${error.auditId ? `<p><strong>Audit ID:</strong> ${error.auditId}</p>` : ''}
        ${dataStr}
        <p style="margin-top:24px;font-size:12px;color:${BRAND.muted};">This is an automated alert from the Citation Rocket error monitor. Alerts are de-duplicated per hour.</p>
      </div>
    `);

    return this.sendEmail({
      to: adminEmail,
      subject: `[ALERT] Citation Rocket ${error.category.toUpperCase()} error — ${new Date(error.timestamp).toLocaleTimeString()}`,
      html,
      text: `[ALERT] ${error.category.toUpperCase()}: ${error.message}\nUser: ${error.userId || 'n/a'}\nAudit: ${error.auditId || 'n/a'}\nTime: ${error.timestamp}\nData: ${JSON.stringify(error.data || {})}`
    });
  }
}

export const emailService = new EmailService();
