import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

// Inner form rendered inside <Elements>. Collects card details and confirms
// the PaymentIntent, then tells our backend to finalise (the Stripe webhook is
// the authoritative confirmation; this gives the user instant feedback).
function CheckoutForm({ orderId, amount, paymentIntentId, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (stripeError) {
        setError(stripeError.message);
        toast.error(stripeError.message);
        return;
      }
      // Confirmed on Stripe's side — finalise on our backend.
      const { order } = await api(`/orders/${orderId}/pay`, {
        method: 'POST',
        body: { paymentIntentId },
      });
      toast.success('Payment successful — thank you!');
      onPaid(order);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <PaymentElement />
      {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
      <div className="btn-row">
        <button className="btn accent" disabled={!stripe || busy}>
          {busy ? 'Processing…' : `Pay €${Number(amount).toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}

// Loads a payment intent for the order, then mounts Stripe Elements.
export default function StripeCheckout({ orderId, publishableKey, onPaid }) {
  const [intent, setIntent] = useState(null);
  const [error, setError] = useState('');
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  );

  useEffect(() => {
    let active = true;
    api(`/orders/${orderId}/payment-intent`, { method: 'POST' })
      .then((d) => active && setIntent(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [orderId]);

  if (error) return <div className="alert error">{error}</div>;
  if (!intent || !stripePromise) return <p className="muted small">Loading secure checkout…</p>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret }}>
      <CheckoutForm
        orderId={orderId}
        amount={intent.amount}
        paymentIntentId={intent.paymentIntentId}
        onPaid={onPaid}
      />
    </Elements>
  );
}
