import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { serverFetch, hasServerUrl, setServerUrl, getServerUrl } from '@/api/server';

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
  isLan: boolean;
  serverReady: boolean;
  login: (email: string, password: string) => Promise<void>;
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

function clearTokens() {
  localStorage.removeItem('lumiere_access');
  localStorage.removeItem('lumiere_refresh');
}

// Detect native platform without importing Capacitor
function isNativeApp(): boolean {
  const p = window.location.protocol;
  if (p === 'capacitor:' || p === 'file:') return true;
  // Capacitor with androidScheme:'https' uses https://localhost
  if (p === 'https:' && window.location.hostname === 'localhost') return true;
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isLan, setIsLan] = useState(false);
  const native = isNativeApp();

  // On web: set server URL to current origin immediately
  // On native: wait for user to enter server URL
  const [serverReady, setServerReady] = useState(() => {
    if (!native) {
      setServerUrl(window.location.origin);
      return true;
    }
    return hasServerUrl();
  });

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const res = await serverFetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  // Poll for server URL on native
  useEffect(() => {
    if (serverReady) return;
    const interval = setInterval(() => {
      if (hasServerUrl()) {
        setServerReady(true);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [serverReady]);

  useEffect(() => {
    if (!serverReady) return;

    const init = async () => {
      setLoading(true);

      // Check if server needs initial setup
      try {
        const statusRes = await serverFetch('/api/setup/status');
        if (!statusRes.ok) { setLoading(false); return; }
        const status = await statusRes.json();
        if (status.needsSetup) {
          setNeedsSetup(true);
          setLoading(false);
          return;
        }
      } catch {
        setLoading(false);
        return;
      }

      // Auto-login if server is a local IP (works on both native and web/TV)
      const serverHost = new URL(getServerUrl()).hostname;
      const isLocalIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(serverHost);

      if (isLocalIp) {
        try {
          const lanRes = await serverFetch('/api/auth/lan-status');
          const lanData = await lanRes.json();
          setIsLan(lanData.isLan);

          if (lanData.isLan) {
            const lanLoginRes = await serverFetch('/api/auth/lan-login', { method: 'POST' });
            if (lanLoginRes.ok) {
              const data = await lanLoginRes.json();
              storeTokens(data.accessToken, data.refreshToken);
              setUser(data.user);
              setLoading(false);
              return;
            }
          }
        } catch {}
      }

      // Check existing token
      const token = getAccessToken();
      if (token) {
        const profile = await fetchProfile(token);
        if (profile) {
          setUser(profile);
        } else {
          clearTokens();
        }
      }

      setLoading(false);
    };
    init();
  }, [serverReady, fetchProfile, native]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await serverFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    storeTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('lumiere_refresh');
    if (refreshToken) {
      try {
        await serverFetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {}
    }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, needsSetup, isLan, serverReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
