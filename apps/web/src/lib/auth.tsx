import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from './api';

export type Role = 'CHIEF' | 'MARKET_ADMIN' | 'CASHIER';

export interface Me {
  user: { id: string; role: Role; fullName: string; username: string };
  demoMode: boolean;
  market: { id: string; name: string; address: string | null; isDemo: boolean } | null;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<Me | null>;
  logout: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const s = await get<Omit<Me, 'user'> & { user: Me['user'] | null }>('/auth/session');
      return s.user ? (s as Me) : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const me = meQuery.data ?? null;

  const value: AuthCtx = {
    me,
    loading: meQuery.isLoading,
    login: async (username, password) => {
      await post('/auth/login', { username, password });
      qc.clear();
      const r = await meQuery.refetch();
      return r.data ?? null;
    },
    logout: async () => {
      await post('/auth/logout').catch(() => undefined);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
    can: (...roles) => !!me && roles.includes(me.user.role),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
