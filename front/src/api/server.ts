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

export function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getServerUrl();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetch(url, init);
}

// Make relative URLs absolute using the server URL
export function serverUrl(path: string): string {
  if (!path || path.startsWith('http') || path.startsWith('data:')) return path;
  const base = getServerUrl();
  return `${base}${path}`;
}
