// In-memory Server-Sent Events bus, keyed by order id.
// For a single-process MVP this is sufficient. For multi-instance production,
// back this with Redis pub/sub (see README "Scaling realtime").
import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
// Many concurrent order streams may attach listeners; lift the default cap.
emitter.setMaxListeners(0);

function channel(orderId) {
  return `order:${orderId}`;
}

// Subscribe a callback to a given order's events. Returns an unsubscribe fn.
export function subscribeToOrder(orderId, listener) {
  const ch = channel(orderId);
  emitter.on(ch, listener);
  return () => emitter.off(ch, listener);
}

// Publish a payload to everyone watching an order.
export function publishOrderEvent(orderId, payload) {
  emitter.emit(channel(orderId), payload);
}
