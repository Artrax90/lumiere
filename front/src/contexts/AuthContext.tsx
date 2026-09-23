import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { serverFetch, hasServerUrl, setServerUrl, getServerUrl, checkServerHealth, clearServerUrl } from '@/api/server';
import { isTizen } from '@/hooks/usePlatform';

export interface User {
  id: number;
  email: string;
  name: string;
  avatar: string;
  role?: string;
  isKids?: boolean;
  createdAt: string;
}

export interface Profile {
  id: number;
  name: string;
  email: string;
  avatar: string;
  role: string;
  isKids: boolean;
  hasPin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  isLan: boolean;
  profiles: Profile[];
  serverReady: boolean;
  connectionError: string | null;
  fetchProfiles: () => Promise<Profile[]>;
  quickLogin: (userId: number, pin?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchProfile: () => void;
  changeServer: () => void;
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

import { Capacitor } from '@capacitor/core';

// Detect native platform reliably across Android, iOS and Tizen
function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  if (isTizen()) return true;
  const p = window.location.protocol;
  if (p === 'capacitor:' || p === 'file:' || p.startsWith('wgt-')) return true;
  // Capacitor with androidScheme:'https' or 'http' uses localhost
  if ((p === 'https:' || p === 'http:') && window.location.hostname === 'localhost') return true;
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isLan, setIsLan] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const native = isNativeApp();

  // On web: set server URL to current origin immediately
  // On native: wait for user to enter server URL
  const [serverReady, setServerReady] = useState(() => {
    if (!native) {
      if (window.location.protocol.startsWith('http') && window.location.hostname !== 'localhost') {
        setServerUrl(window.location.origin);
        return true;
      }
    }
    return hasServerUrl();
  });

  const changeServer = useCallback(() => {
    clearServerUrl();
    clearTokens();
    localStorage.removeItem('lumiere_user');
    localStorage.removeItem('lumiere_active_profile');
    setUser(null);
    setConnectionError(null);
    setServerReady(false);
  }, []);

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

  const fetchProfiles = useCallback(async (): Promise<Profile[]> => {
    try {
      const res = await serverFetch('/api/auth/profiles');
      if (res.ok) {
        const data = await res.json();
        const list = data.profiles || [];
        setProfiles(list);
        return list;
      }
    } catch {}
    return [];
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
      setConnectionError(null);

      const currentServer = getServerUrl();
      const isHealthy = await checkServerHealth(currentServer);
      if (!isHealthy) {
        console.warn('[AuthContext] Server health check failed for:', currentServer);
        setConnectionError(`Не удалось подключиться к ${currentServer}`);
        setServerReady(false);
        setLoading(false);
        return;
      }

      // Check if server needs initial setup
      try {
        const statusRes = await serverFetch('/api/setup/status');
        if (statusRes.ok) {
          const status = await statusRes.json();
          if (status.needsSetup) {
            setNeedsSetup(true);
            setLoading(false);
            return;
          }
        }
      } catch {
        setLoading(false);
        return;
      }

      // Check LAN status
      let lanDetected = false;
      try {
        const lanRes = await serverFetch('/api/auth/lan-status');
        if (lanRes.ok) {
          const lanData = await lanRes.json();
          lanDetected = !!lanData.isLan;
          setIsLan(lanDetected);
        }
      } catch {}

      // Check existing token
      const token = getAccessToken();
      if (token) {
        const profile = await fetchProfile(token);
        if (profile) {
          setUser(profile);
          setLoading(false);
          return;
        } else {
          // Token expired — try refresh token
          const refreshToken = localStorage.getItem('lumiere_refresh');
          if (refreshToken) {
            try {
              const refreshRes = await serverFetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
              });
              if (refreshRes.ok) {
                const data = await refreshRes.json();
                storeTokens(data.accessToken, data.refreshToken);
                const newProfile = await fetchProfile(data.accessToken);
                if (newProfile) {
                  setUser(newProfile);
                  setLoading(false);
                  return;
                }
              }
            } catch {}
          }
          clearTokens();
        }
      }

      // If not logged in and on LAN, fetch profile list for the profile picker
      if (lanDetected) {
        await fetchProfiles();
      }

      setLoading(false);
    };
    init();
  }, [serverReady, fetchProfile, fetchProfiles, native]);

  const quickLogin = useCallback(async (userId: number, pin?: string) => {
    const res = await serverFetch('/api/auth/quick-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка входа');
    storeTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

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
    if (isLan) {
      await fetchProfiles();
    }
  }, [isLan, fetchProfiles]);

  const switchProfile = useCallback(() => {
    clearTokens();
    setUser(null);
    if (isLan) {
      fetchProfiles();
    }
  }, [isLan, fetchProfiles]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        needsSetup,
        isLan,
        profiles,
        serverReady,
        connectionError,
        fetchProfiles,
        quickLogin,
        login,
        logout,
        switchProfile,
        changeServer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
