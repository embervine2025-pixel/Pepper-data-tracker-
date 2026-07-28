import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` covers the initial token check, so routes don't flash the
  // sign-in screen before the stored session is confirmed.
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await api.get('/auth/me');
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // The API client fires this when a request comes back 401, which is how a
  // session that expired server-side gets cleared here.
  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener('pepper:signed-out', onSignedOut);
    return () => window.removeEventListener('pepper:signed-out', onSignedOut);
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { token, user: me } = await api.post('/auth/login', { email, password });
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: me } = await api.post('/auth/register', payload);
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const { user: me } = await api.patch('/auth/me', patch);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut, updateProfile }),
    [user, loading, signIn, register, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
