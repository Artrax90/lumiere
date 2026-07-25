import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface User {
  id: number;
  email: string;
  name: string;
  avatar: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  inviteCodes: string[];
  isLan: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, inviteCode: string) => Promise<void>;
  setupAdmin: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function storeTokens(access: string, refresh: string) {
  localStorage.setItem('lumiere_access', access);
  localStorage.setItem('lumiere_refresh', refresh);
}

function getAccessToken(): string | null {
  return localStorage.getItem('lumiere_access');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('lumiere_refresh');
}

function clearTokens() {
  localStorage.removeItem('lumiere_access');
  localStorage.removeItem('lumiere_refresh');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<string[]>([]);
  const [isLan, setIsLan] = useState(false);

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch profile');
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const storeAndSetUser = useCallback((data: { user: User; accessToken: string; refreshToken: string }) => {
    storeTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  useEffect(() => {
    const init = async () => {
      // Check if setup is needed
      try {
        const statusRes = await fetch('/api/setup/status');
        const status = await statusRes.json();
        if (status.needsSetup) {
          setNeedsSetup(true);
          setLoading(false);
          return;
        }
      } catch {}

      // Check if we're on LAN
      let lanMode = false;
      try {
        const lanRes = await fetch('/api/auth/lan-status');
        const lanData = await lanRes.json();
        setIsLan(lanData.isLan);
        lanMode = lanData.isLan;
      } catch {}

      // If on LAN, try auto-login first
      if (lanMode) {
        try {
          const lanLoginRes = await fetch('/api/auth/lan-login', { method: 'POST' });
          if (lanLoginRes.ok) {
            const lanData = await lanLoginRes.json();
            storeAndSetUser(lanData);
            setLoading(false);
            return;
          }
        } catch {}
      }

      // Check existing session
      const accessToken = getAccessToken();
      if (accessToken) {
        const profile = await fetchProfile(accessToken);
        if (profile && !profile.error) {
          setUser(profile);
        } else {
          clearTokens();
        }
      }
      setLoading(false);
    };
    init();
  }, [fetchProfile, storeAndSetUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    storeAndSetUser(data);
  }, [storeAndSetUser]);

  const register = useCallback(async (email: string, password: string, name: string, inviteCode: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, inviteCode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    storeAndSetUser(data);
  }, [storeAndSetUser]);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {}
    }
    clearTokens();
    setUser(null);
  }, []);

  const setupAdmin = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch('/api/setup/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Setup failed');
    setInviteCodes(data.inviteCodes);
    setNeedsSetup(false);
    // Auto-login as admin
    await login(email, password);
  }, [login]);

  return (
    <AuthContext.Provider value={{ user, loading, needsSetup, inviteCodes, isLan, login, register, setupAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
