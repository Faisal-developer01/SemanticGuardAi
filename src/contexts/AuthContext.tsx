import React, { createContext, useContext, useEffect, useState } from 'react';
import type { UserRole } from '@/types/types';
import { authApi, clearTokens, getAccessToken, setTokens, type ApiUser } from '@/lib/api';
import { disconnectMonitoring } from '@/lib/realtime';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mfaEnabled: boolean;
  mfaMethod: 'totp' | 'email';
  emailVerified: boolean;
  status: string;
  avatarUrl?: string | null;
}

/** Result returned by {@link AuthContextType.login}. */
export type LoginResult =
  | { status: 'success'; user: AuthUser }
  | { status: 'mfa_required'; method: 'totp' | 'email' }
  | { status: 'error'; message: string };

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  /** Step 1: submit credentials. May return an `mfa_required` challenge. */
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Step 2 (when MFA is on): re-submit credentials together with the code. */
  verifyMfa: (email: string, password: string, code: string) => Promise<LoginResult>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  jwtToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAuthUser(u: ApiUser): AuthUser {
  return {
    id: u.id,
    name: u.fullName,
    email: u.email,
    role: u.role,
    mfaEnabled: u.mfaEnabled,
    mfaMethod: u.mfaMethod ?? 'totp',
    emailVerified: u.emailVerified,
    status: u.status,
    avatarUrl: u.avatarUrl,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(getAccessToken());
  const [loading, setLoading] = useState(true);

  // Bootstrap session from a persisted token on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: apiUser } = await authApi.me();
        if (!cancelled) {
          setUser(toAuthUser(apiUser));
          setJwtToken(getAccessToken());
        }
      } catch {
        clearTokens();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishLogin = async (): Promise<AuthUser> => {
    const { user: apiUser } = await authApi.me();
    const authUser = toAuthUser(apiUser);
    setUser(authUser);
    setJwtToken(getAccessToken());
    return authUser;
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await authApi.login(email, password);
      if (res.mfaRequired) {
        return { status: 'mfa_required', method: res.mfaMethod };
      }
      setTokens(res.accessToken, res.refreshToken);
      const authUser = await finishLogin();
      return { status: 'success', user: authUser };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  };

  const verifyMfa = async (
    email: string,
    password: string,
    code: string,
  ): Promise<LoginResult> => {
    try {
      const res = await authApi.login(email, password, code);
      if (res.mfaRequired) {
        // Code was rejected and a new challenge was issued.
        return { status: 'error', message: 'Invalid or expired code. A new code was sent.' };
      }
      setTokens(res.accessToken, res.refreshToken);
      const authUser = await finishLogin();
      return { status: 'success', user: authUser };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const { user: apiUser } = await authApi.me();
      setUser(toAuthUser(apiUser));
    } catch {
      /* ignore */
    }
  };

  const logout = () => {
    authApi.logout().catch(() => undefined);
    disconnectMonitoring();
    clearTokens();
    setUser(null);
    setJwtToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        verifyMfa,
        logout,
        refreshUser,
        setUser,
        jwtToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
