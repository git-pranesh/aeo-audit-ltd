/**
 * Dodo Payments webhook: one-time purchases only.
 *
 *   payment.succeeded → create a license bound to the buyer's email
 *   refund.succeeded  → revoke it
 *   duplicate delivery → no-op (license id derives from the payment id)
 *
 * Configure in Dodo: endpoint https://<app>/api/webhooks/dodo, events
 * payment.succeeded + refund.succeeded. Set DODO_WEBHOOK_SECRET and the product
 * ids DODO_PRODUCT_LIFETIME / DODO_PRODUCT_AGENCY.
 */

import { Router, text } from 'express';
import { Webhook } from 'standardwebhooks';
import { createPurchasedLicense, findLicenseByOrder, setLicenseStatus } from '../services/license-service';

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
      }
    } else if (event?.type === 'refund.succeeded' && paymentId) {
      const licenseId = await findLicenseByOrder(paymentId);
      if (licenseId) {
        await setLicenseStatus(licenseId, 'refunded');
        console.log(`Webhook: refund for ${paymentId} → license refunded`);
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing failed:', err?.message);
    // 500 makes Dodo retry; every branch above is idempotent.
    res.status(500).json({ error: 'Processing failed' });
  }
});
