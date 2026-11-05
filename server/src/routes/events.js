import express from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { subscribeToOrder } from '../utils/events.js';
import { getOrderRow } from '../utils/orderService.js';

const router = express.Router();

// GET /api/events/orders/:orderId/stream?token=...
// Server-Sent Events stream of live updates for a single order.
// EventSource cannot send Authorization headers, so the JWT is passed as a
// query param and validated by authRequired (which understands ?token=).
router.get('/orders/:orderId/stream', authRequired, async (req, res) => {
  const order = await getOrderRow(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  // Authorization: customer (own), vendor (own shop), admin (all).
  const { role, id } = req.user;
  let allowed = role === 'admin';
  if (role === 'customer') allowed = order.customer_id === id;
  if (role === 'vendor') {
    allowed =
      !!order.shop_id &&
      !!(await db
        .prepare('SELECT 1 FROM shops WHERE id = ? AND owner_user_id = ?')
        .get(order.shop_id, id));
  }
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  // SSE headers.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
  });
  res.write('retry: 3000\n\n'); // tell the browser to reconnect after 3s

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Initial hello so the client knows the stream is live.
  send({ kind: 'hello', orderId: order.id, at: new Date().toISOString() });

  const unsubscribe = subscribeToOrder(order.id, send);

  // Heartbeat comment every 25s to keep proxies/load balancers from timing out.
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
