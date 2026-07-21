import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, tokens } from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    const refreshToken = tokens.refresh;
    tokens.clear();
    setUser(null);
    // Best-effort: revoke server-side too, but never block the sign-out on it.
    if (refreshToken) void api.post('/auth/logout', { refreshToken }).catch(() => {});
  }, []);

  /**
   * Identity comes from GET /users/me, never from decoding the JWT. The browser
   * cannot verify a token's signature, so anything read out of it locally is
   * only a claim — the server is the one that decides who you are.
   */
  const loadUser = useCallback(async () => {
    if (!tokens.access) {
      setLoading(false);
      return;
    }
    try {
      setUser(await api.get<User>('/users/me'));
    } catch {
      tokens.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();

    // The API client raises this when a refresh finally fails.
    const onSignedOut = () => {
      tokens.clear();
      setUser(null);
    };
    window.addEventListener('designarc:signed-out', onSignedOut);
    return () => window.removeEventListener('designarc:signed-out', onSignedOut);
  }, [loadUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const pair = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', {
      email,
      password,
    });
    tokens.set(pair.accessToken, pair.refreshToken);

    const me = await api.get<User>('/users/me');
    if (me.role !== 'ADMIN') {
      // The console is Admin-only by design; the other three roles work from the
      // mobile app. Refusing here gives an honest message instead of a UI full
      // of 403s.
      tokens.clear();
      throw new Error(
        'This console is for administrators. Carpenters, painters and supervisors use the DesignArc mobile app.',
      );
    }
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
