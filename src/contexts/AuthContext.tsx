import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const isInvalidRefreshTokenError = (message: string | undefined): boolean =>
  /invalid refresh token|refresh token not found/i.test(message ?? '');

const clearPersistedAuthTokens = (): void => {
  if (typeof window === 'undefined') return;

  Object.keys(localStorage)
    .filter((key) => key.endsWith('-auth-token'))
    .forEach((key) => localStorage.removeItem(key));
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);
        if (event === 'SIGNED_OUT') {
          clearPersistedAuthTokens();
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error && isInvalidRefreshTokenError(error.message)) {
        console.warn('Invalid Supabase refresh token detected. Clearing persisted auth session.');
        clearPersistedAuthTokens();
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setLoading(false);
        return;
      }

      if (error) {
        console.error('Failed to restore Supabase session:', error);
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
