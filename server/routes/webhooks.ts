/**
 * Dodo Payments webhook: one-time purchases only.
 *
 *   payment.succeeded → create a license bound to the buyer's email
 *   refund.succeeded  → mark it refunded (e.g. a refund issued manually or by law)
 *   dispute.lost      → revoke it (chargeback)
 *   duplicate delivery → no-op (license id derives from the payment id)
 *
 * Configure in Dodo: endpoint https://<app>/api/webhooks/dodo, events
 * payment.succeeded, refund.succeeded and dispute.lost. Set DODO_WEBHOOK_SECRET and the product
 * ids DODO_PRODUCT_LIFETIME / DODO_PRODUCT_AGENCY.
 */

import { Router, text } from 'express';
import { Webhook } from 'standardwebhooks';
import { createPurchasedLicense, findLicenseByOrder, setLicenseStatus } from '../services/license-service';
import { sendMetaEvent, sha256 } from '../services/meta-capi';
import { PLAN_VALUE_USD } from '../../shared/meta';

export const webhooksRouter = Router();

webhooksRouter.post('/dodo', text({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DODO_WEBHOOK_SECRET is not configured: rejecting webhook');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const raw = typeof req.body === 'string' ? req.body : '';
  let event: any;
  try {
    event = new Webhook(secret).verify(raw, {
      'webhook-id': String(req.headers['webhook-id'] || ''),
      'webhook-timestamp': String(req.headers['webhook-timestamp'] || ''),
      'webhook-signature': String(req.headers['webhook-signature'] || ''),
    });
  } catch {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  try {
    const data = event?.data ?? {};
    const paymentId: string | undefined = data.payment_id;

    if (event?.type === 'payment.succeeded' && paymentId) {
      const productIds: string[] = (data.product_cart ?? []).map((p: any) => p?.product_id).filter(Boolean);
      const agencyId = process.env.DODO_PRODUCT_AGENCY;
      const lifetimeId = process.env.DODO_PRODUCT_LIFETIME;
      const isAgency = !!agencyId && productIds.includes(agencyId);
      const isLifetime = isAgency || (!!lifetimeId && productIds.includes(lifetimeId));
      const email: string | undefined = data.customer?.email;

      if (!isLifetime) {
        console.warn(`Webhook: payment ${paymentId} is not for a Citation Rocket license product: ignored`);
      } else if (!email) {
        console.error(`Webhook: payment ${paymentId} has no customer email: create a code manually in Admin`);
      } else {
        const { created } = await createPurchasedLicense({ orderReference: paymentId, email, whiteLabel: isAgency });
        console.log(`Webhook: payment ${paymentId} → license ${created ? 'created' : 'already existed'}${isAgency ? ' (agency)' : ''}`);
        const meta0 = (data.metadata ?? {}) as Record<string, string>;
        if (created && meta0.consent === 'allowed') {
          // Browser identifiers captured by citationrocket.com/buy and passed through Dodo checkout metadata.
          const meta = (data.metadata ?? {}) as Record<string, string>;
          const plan = isAgency ? 'agency' : 'lifetime';
          await sendMetaEvent({
            event_name: 'Purchase',
            event_id: paymentId, // the "Payment received" page fires the browser Purchase with the same id
            event_source_url: 'https://www.citationrocket.com/pricing',
            action_source: 'website',
            user_data: {
              em: [sha256(email)],
              client_user_agent: meta.ua || undefined,
              fbp: meta.fbp || undefined,
              fbc: meta.fbc || undefined,
            },
            custom_data: { value: PLAN_VALUE_USD[plan], currency: 'USD', content_name: plan === 'agency' ? 'Lifetime Agency' : 'Lifetime', content_type: 'product' },
          });
        }
      }
    } else if (event?.type === 'refund.succeeded' && paymentId) {
      const licenseId = await findLicenseByOrder(paymentId);
      if (licenseId) {
        await setLicenseStatus(licenseId, 'refunded');
        console.log(`Webhook: refund for ${paymentId} → license refunded`);
      }
    } else if (event?.type === 'dispute.lost' && paymentId) {
      const licenseId = await findLicenseByOrder(paymentId);
      if (licenseId) {
        await setLicenseStatus(licenseId, 'revoked');
        console.log(`Webhook: chargeback lost for ${paymentId} → license revoked`);
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing failed:', err?.message);
    // 500 makes Dodo retry; every branch above is idempotent.
    res.status(500).json({ error: 'Processing failed' });
  }
});
