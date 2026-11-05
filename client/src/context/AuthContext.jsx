import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, if we have a token, fetch the current user.
  useEffect(() => {
    let active = true;
    async function load() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await api('/auth/me');
        if (active) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const applyAuth = useCallback((payload) => {
    setToken(payload.token);
    setUser(payload.user);
    return payload.user;
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await api('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
      return applyAuth(data);
    },
    [applyAuth]
  );

  const register = useCallback(
    async (payload) => {
      const data = await api('/auth/register', {
        method: 'POST',
        auth: false,
        body: payload,
      });
      return applyAuth(data);
    },
    [applyAuth]
  );

  const registerVendor = useCallback(
    async (payload) => {
      const data = await api('/auth/register-vendor', {
        method: 'POST',
        auth: false,
        body: payload,
      });
      return applyAuth(data);
    },
    [applyAuth]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, registerVendor, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
