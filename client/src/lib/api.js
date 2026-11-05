// Thin fetch wrapper that attaches the JWT and normalizes errors.
const BASE = import.meta.env.VITE_API_BASE || '';

const TOKEN_KEY = 'wefix_token';

// We use sessionStorage (per-tab) rather than localStorage (shared across all
// tabs). This lets you stay signed in as different roles in different tabs at
// the same time — e.g. admin in one tab, vendor in another — without one
// login clobbering the other's token. The session persists across refreshes
// and is cleared when the tab closes.
//
// One-time migration: if an older localStorage token exists, adopt it and
// remove it so existing sessions aren't logged out by this change.
const legacy = typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_KEY);
if (legacy && !sessionStorage.getItem(TOKEN_KEY)) {
  sessionStorage.setItem(TOKEN_KEY, legacy);
}
if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Builds an absolute URL for the SSE stream (EventSource can't set headers,
// so the token rides as a query param).
export function streamUrl(orderId) {
  const token = getToken();
  return `${BASE}/api/events/orders/${orderId}/stream?token=${encodeURIComponent(token || '')}`;
}
