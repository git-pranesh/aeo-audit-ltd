// Dev tool. Usage: npx tsx scripts/simulate-dodo-webhook.mts payment.succeeded <payment_id> <email> <product_id>
//            npx tsx scripts/simulate-dodo-webhook.mts dispute.lost <payment_id>
// Sends a correctly signed Dodo-format payment.succeeded webhook (real live product id) to the local app.
import 'dotenv/config'
import { Webhook } from 'standardwebhooks'
const [type, paymentId, email, product] = process.argv.slice(2)
const body = JSON.stringify(type === 'payment.succeeded'
  ? { business_id: 'bus_test', type, timestamp: new Date().toISOString(), data: { payment_id: paymentId, status: 'succeeded', total_amount: 9900, currency: 'USD', customer: { customer_id: 'cus_test', email, name: 'Flow Test' }, product_cart: [{ product_id: product, quantity: 1 }] } }
  : { business_id: 'bus_test', type, timestamp: new Date().toISOString(), data: { payment_id: paymentId, dispute_id: 'dsp_test' } })
const id = 'msg_' + Date.now(), ts = new Date()
const sig = new Webhook(process.env.DODO_WEBHOOK_SECRET!).sign(id, ts, body)
const res = await fetch('http://localhost:5001/api/webhooks/dodo', { method: 'POST', body, headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': sig } })
console.log(type, res.status, await res.text())
