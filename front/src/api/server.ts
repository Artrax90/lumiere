const SERVER_URL_KEY = 'lumiere_server_url';

export function getServerUrl(): string {
  const stored = localStorage.getItem(SERVER_URL_KEY);
  if (stored) return stored;
  // Web fallback: use current origin
  return window.location.origin;
}

export function setServerUrl(url: string) {
  const clean = url.replace(/\/+$/, '');
  localStorage.setItem(SERVER_URL_KEY, clean);
}

export function clearServerUrl() {
  localStorage.removeItem(SERVER_URL_KEY);
}

export function hasServerUrl(): boolean {
  return !!localStorage.getItem(SERVER_URL_KEY);
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

    // Try LAN auto-login
    try {
      const base = getServerUrl();
      const lanRes = await fetch(`${base}/api/auth/lan-login`, { method: 'POST' });
      if (lanRes.ok) {
        const data = await lanRes.json();
        localStorage.setItem('lumiere_access', data.accessToken);
        localStorage.setItem('lumiere_refresh', data.refreshToken);
        return true;
      }
    } catch {}

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

  const res = await fetch(url, init);

  // If 401 and request had auth header, try to refresh token and retry once
  if (res.status === 401 && init?.headers) {
    const headers = init.headers as Record<string, string>;
    if (headers['Authorization'] || headers['authorization']) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        const newToken = localStorage.getItem('lumiere_access');
        if (newToken) {
          const newHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` };
          return fetch(url, { ...init, headers: newHeaders });
        }
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
