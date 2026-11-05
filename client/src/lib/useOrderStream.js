import { useEffect, useRef, useState } from 'react';
import { api, streamUrl } from './api.js';

// Subscribes to an order's SSE stream and keeps a live order object in sync.
// Falls back to polling if the stream errors, and auto-reconnects.
//
// Returns: { order, connected, error, refresh }
export function useOrderStream(orderId) {
  const [order, setOrder] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  async function refresh() {
    try {
      const { order: o } = await api(`/orders/${orderId}`);
      setOrder(o);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (!orderId) return undefined;
    let es;
    let closed = false;

    // Always load the full detail first (timeline + shipments).
    refresh();

    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(refresh, 5000);
    }
    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function connect() {
      es = new EventSource(streamUrl(orderId));

      es.onopen = () => {
        setConnected(true);
        stopPolling(); // stream is live; no need to poll
      };

      es.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data);
          if (payload.kind === 'order') {
            // Merge: keep timeline/shipments we already have, overlay new fields.
            setOrder((prev) => ({ ...(prev || {}), ...payload.order }));
          } else if (payload.kind === 'event') {
            setOrder((prev) =>
              prev
                ? { ...prev, timeline: [...(prev.timeline || []), payload.event] }
                : prev
            );
          }
          // 'hello' / heartbeats need no action.
        } catch {
          /* ignore malformed frames */
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Fall back to polling and retry the stream shortly (with reconnect).
        startPolling();
        if (!closed) {
          setTimeout(() => {
            if (!closed) connect();
          }, 3000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (es) es.close();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  return { order, setOrder, connected, error, refresh };
}
