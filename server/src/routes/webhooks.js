import express from 'express';
import { constructWebhookEvent } from '../utils/payments.js';
import { markOrderPaid } from '../utils/orderService.js';

const router = express.Router();

// POST /api/webhooks/stripe
// Stripe's authoritative payment confirmation. Must receive the RAW request
// body (not JSON-parsed) so the signature can be verified — this route is
// mounted before the global express.json() parser in app.js.
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const orderId = pi.metadata && pi.metadata.orderId;
        if (orderId) {
          await markOrderPaid(orderId, { method: 'Card', paymentIntentId: pi.id });
        }
        break;
      }
      case 'payment_intent.payment_failed':
        // Could notify the customer here; payment status stays 'unpaid'.
        break;
      default:
        break;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[webhook] handler error:', err);
    return res.status(500).send('Webhook handler error');
  }

  res.json({ received: true });
});

export default router;
