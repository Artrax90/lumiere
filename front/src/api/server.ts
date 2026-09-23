const SERVER_URL_KEY = 'lumiere_server_url';
export const DEFAULT_SERVER_URL = '';

export function getServerUrl(): string {
  const stored = localStorage.getItem(SERVER_URL_KEY);
  if (stored && stored !== 'null' && stored !== 'undefined' && !stored.startsWith('file:') && !stored.startsWith('wgt-')) {
    return stored.replace(/\/+$/, '');
  }
  // Web fallback: use current origin if loaded over HTTP(S) and not a local file
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return window.location.origin;
  }
  const injected = typeof window !== 'undefined' ? (window as any).__DEFAULT_SERVER_URL__ : undefined;
  if (injected && typeof injected === 'string' && !injected.startsWith('file:') && !injected.startsWith('wgt-')) {
    return injected.replace(/\/+$/, '');
  }
  return DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string) {
  let clean = url.trim().replace(/\/+$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }
  localStorage.setItem(SERVER_URL_KEY, clean);
}

export function clearServerUrl() {
  localStorage.removeItem(SERVER_URL_KEY);
}

export function hasServerUrl(): boolean {
  const stored = localStorage.getItem(SERVER_URL_KEY);
  return !!(stored && stored !== 'null' && stored !== 'undefined' && !stored.startsWith('file:') && !stored.startsWith('wgt-'));
}

export async function checkServerHealth(url?: string): Promise<boolean> {
  const target = (url || getServerUrl()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    // Try refresh token
    const refreshToken = localStorage.getItem('lumiere_refresh');
    if (refreshToken) {
      try {
        const base = getServerUrl();
        const res = await fetch(`${base}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('lumiere_access', data.accessToken);
          localStorage.setItem('lumiere_refresh', data.refreshToken);
          return true;
        }
      } catch {}
    }

    return false;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getServerUrl();
  const url = path.startsWith('http') ? path : `${base}${path}`;

  const token = localStorage.getItem('lumiere_access');
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });

  // If 401 and request had auth header, try to refresh token and retry once
  if (res.status === 401 && headers.has('Authorization')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = localStorage.getItem('lumiere_access');
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
        return fetch(url, { ...init, headers });
      }
    }
  }

  return res;
}

// Make relative URLs absolute using the server URL
export function serverUrl(path: string): string {
  if (!path || path.startsWith('http') || path.startsWith('data:')) return path;
  const base = getServerUrl();
  return `${base}${path}`;
}
