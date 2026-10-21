import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/api/client';

export type Account = {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'photographer' | 'marketing' | 'contractor';
  role_label: string;
  photographer_signature: string | null;
  /** Temporary account of the hired photographer (RF031): when it stops working, and its only event. */
  valid_until: string | null;
  bound_event_id: string | null;
};

type AuthState = {
  account: Account | null;
  /** true until the first /auth/me answer: avoids flashing the login screen on reload. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAccount: (account: Account | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Keeps "who is logged in" for the screens. It is only a convenience for the interface:
 * the server re-checks the session cookie on every request (RF002 note 4).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Account>('/auth/me')
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAccount(await api<Account>('/auth/login', { body: { email, password } }));
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccount(null);
  }, []);

  return (
    <AuthContext.Provider value={{ account, loading, login, logout, setAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
