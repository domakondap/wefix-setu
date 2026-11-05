// Payment provider abstraction.
//
// • If STRIPE_SECRET_KEY is configured → real Stripe (PaymentIntents + webhook
//   signature verification).
// • Otherwise → a built-in mock so the app works end-to-end in demos/tests.
//
// Amounts are handled in major units (e.g. euros) at the call site and
// converted to the smallest unit (cents) here.
import { config } from '../config.js';

let stripe = null;
if (config.stripe.secretKey) {
  // Lazy import so the dependency is only loaded when actually used.
  const { default: Stripe } = await import('stripe');
  stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2024-12-18.acacia' });
}

export const paymentsEnabled = config.paymentsProvider;

// Create a payment intent for an order. Returns a uniform shape regardless of
// provider so the route/frontend can branch on `provider`.
export async function createPaymentIntent({ amount, orderId, publicId, email }) {
  const amountMinor = Math.round(Number(amount) * 100);

  if (stripe) {
    const intent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: config.currency,
      metadata: { orderId: String(orderId), publicId },
      receipt_email: email || undefined,
      description: `WeFix Setu repair order ${publicId}`,
      automatic_payment_methods: { enabled: true },
    });
    return {
      provider: 'stripe',
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      publishableKey: config.stripe.publishableKey,
      amount,
      currency: config.currency,
    };
  }

  // Mock: synthesize a client secret. The frontend will use the mock pay flow.
  return {
    provider: 'mock',
    clientSecret: `mock_pi_${orderId}_secret`,
    paymentIntentId: `mock_pi_${orderId}`,
    publishableKey: '',
    amount,
    currency: config.currency,
  };
}

// Retrieve a payment intent's current status (used to confirm payment
// immediately in the UI, in addition to the authoritative webhook).
export async function retrievePaymentIntent(paymentIntentId) {
  if (!stripe) {
    return { id: paymentIntentId, status: 'succeeded', metadata: {} }; // mock
  }
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return { id: intent.id, status: intent.status, metadata: intent.metadata || {} };
}

// Verify and parse a Stripe webhook. Returns the event or throws.
export function constructWebhookEvent(rawBody, signature) {
  if (!stripe) throw new Error('Stripe is not configured.');
  if (!config.stripe.webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

// Issue a refund for a paid order's payment intent (best-effort).
export async function refundPayment(paymentIntentId) {
  if (!stripe || !paymentIntentId || String(paymentIntentId).startsWith('mock_')) {
    return { provider: 'mock', refunded: true };
  }
  const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
  return { provider: 'stripe', refunded: refund.status === 'succeeded', id: refund.id };
}

export const isStripe = !!stripe;
