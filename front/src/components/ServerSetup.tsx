import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Wifi, Loader2, AlertCircle, Delete, X, Sparkles, Check } from 'lucide-react';
import { setServerUrl, getServerUrl, DEFAULT_SERVER_URL } from '@/api/server';
import TvKeyboard from '@/components/TvKeyboard';

interface Props {
  onConnected: () => void;
  initialError?: string | null;
}

interface DiscoveredServer {
  label: string;
  raw: string;
  url: string;
}

export default function ServerSetup({ onConnected, initialError }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(() => {
    const current = getServerUrl();
    if (current && !current.startsWith('file:') && !current.startsWith('wgt-')) {
      const stripped = current.replace(/^https?:\/\//, '');
      if (stripped && stripped !== 'localhost' && stripped !== '127.0.0.1') {
        return stripped;
      }
    }
    return '';
  });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [discoveredServer, setDiscoveredServer] = useState<DiscoveredServer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const discoverBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  // Auto-scan current server origin if running in a web browser
  useEffect(() => {
    let cancelled = false;
    const candidates: DiscoveredServer[] = [];

    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && window.location.origin && window.location.origin !== 'null') {
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        candidates.push({
          label: 'Текущий сервер',
          raw: window.location.host,
          url: window.location.origin
        });
      }
    }

    if (candidates.length === 0) return;

    const probe = async () => {
      for (const c of candidates) {
        try {
          const res = await fetch(`${c.url}/api/health`, { signal: AbortSignal.timeout(2500) });
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'ok' && !cancelled) {
              setDiscoveredServer(c);
              setUrl(c.raw);
              break;
            }
          }
        } catch {}
      }
    };

    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAppend = (char: string) => {
    setUrl((prev) => {
      let val = prev;
      if (char === 'https://' || char === 'http://') {
        val = val.replace(/^https?:\/\//i, '');
        return char + val;
      }
      let next = val + char;
      while (/^https?:\/\/(https?:\/\/)/i.test(next)) {
        next = next.replace(/^https?:\/\//i, '');
      }
      return next;
    });
    setError('');
  };

  const handleBackspace = () => {
    setUrl((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setUrl('');
    setError('');
  };

  const testAndSave = async (target?: string) => {
    let raw = (target !== undefined ? target : url).trim();
    if (!raw) return;

    // Strip doubled or nested protocols like "http://https://" or "https://http://"
    while (/^https?:\/\/(https?:\/\/)/i.test(raw)) {
      raw = raw.replace(/^https?:\/\//i, '');
    }

    setTesting(true);
    setError('');

    // Generate smart candidates: if user entered https://, try https then http.
    // If http://, try http then https.
    // If no scheme: for domain try https first, for IP try http first.
    const candidates: string[] = [];
    if (/^https:\/\//i.test(raw)) {
      const stripped = raw.replace(/^https:\/\//i, '').replace(/\/+$/, '');
      candidates.push(`https://${stripped}`);
      candidates.push(`http://${stripped}`);
    } else if (/^http:\/\//i.test(raw)) {
      const stripped = raw.replace(/^http:\/\//i, '').replace(/\/+$/, '');
      candidates.push(`http://${stripped}`);
      candidates.push(`https://${stripped}`);
    } else {
      const stripped = raw.replace(/\/+$/, '');
      const isIp = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(stripped);
      if (isIp) {
        candidates.push(`http://${stripped}`);
        candidates.push(`https://${stripped}`);
      } else {
        candidates.push(`https://${stripped}`);
        candidates.push(`http://${stripped}`);
      }
    }

    let connectedUrl = '';
    for (const testUrl of candidates) {
      try {
        const res = await fetch(`${testUrl}/api/health`, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok') {
            connectedUrl = testUrl;
            break;
          }
        }
      } catch {}
    }

    if (connectedUrl) {
      localStorage.removeItem('lumiere_access');
      localStorage.removeItem('lumiere_refresh');
      localStorage.removeItem('lumiere_user');
      localStorage.removeItem('lumiere_active_profile');

      setServerUrl(connectedUrl);
      onConnected();
    } else {
      setError(`Не удалось подключиться к ${candidates[0]}`);
    }
    setTesting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-6 bg-[#060608] text-white">
      <div className="w-full max-w-5xl animate-scale-in">
        {/* Header / Logo */}
        <div className="mb-5 flex flex-col items-center gap-2">
          <div className="relative flex h-11 w-11 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/70 to-amber-600/35 blur-[10px] opacity-60" />
            <div className="relative h-5 w-5 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
          </div>
          <h1 className="text-display text-[26px] font-medium tracking-tight text-white/95">Lumière</h1>
          <p className="text-[12px] text-white/45">Подключение к медиасерверу</p>
        </div>

        {/* 2-Column Balanced Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Discovered Server + Input + Connect button (5 cols) */}
          <div className="lg:col-span-5 space-y-3.5 bg-white/[0.03] border border-white/[0.08] p-5 rounded-[22px] backdrop-blur-xl">
            {/* Discovered Server Banner */}
            {discoveredServer && (
              <div className="rounded-[16px] bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-transparent border border-amber-400/30 p-3.5 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="text-[13px] font-semibold text-amber-300">
                      {discoveredServer.label}
                    </span>
                  </div>
                  <span className="text-[12px] font-mono text-white/50">{discoveredServer.raw}</span>
                </div>
                <button
                  ref={discoverBtnRef}
                  autoFocus
                  type="button"
                  onClick={() => testAndSave(discoveredServer.raw)}
                  disabled={testing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-[12px] bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-black font-semibold text-[14px] shadow-lg shadow-amber-500/20 hover:brightness-110 focus:scale-[1.02] focus:ring-4 focus:ring-amber-300/80 outline-none transition-all cursor-pointer active:scale-95"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <Sparkles className="h-4 w-4 text-black" />}
                  <span>Подключиться в 1 клик</span>
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-[12px] bg-red-500/10 border border-red-500/20 p-3 text-[13px] text-red-300 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Address Display Box */}
            <div>
              <div className="flex items-center justify-between mb-1 px-0.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Адрес сервера (IP:порт)</label>
                {url.length > 0 && (
                  <span className="text-[11px] text-white/35 font-mono">{url.length} симв.</span>
                )}
              </div>

              <div className="relative flex items-center">
                <Server className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35 pointer-events-none" strokeWidth={1.5} />
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => {
                    let val = e.target.value;
                    while (/^https?:\/\/(https?:\/\/)/i.test(val)) {
                      val = val.replace(/^https?:\/\//i, '');
                    }
                    setUrl(val);
                    setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && testAndSave()}
                  placeholder="myserver.com или 192.168.1.100:3500"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-[14px] bg-white/[0.05] border border-white/[0.12] py-3 pl-10 pr-20 text-[15px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 transition-all"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {url.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={handleBackspace}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-[8px] bg-white/[0.08] hover:bg-white/[0.16] focus:ring-2 focus:ring-amber-400 text-amber-300 active:scale-90 transition-all outline-none"
                        title="Стереть символ"
                        aria-label="Стереть символ"
                      >
                        <Delete className="h-3.5 w-3.5 pointer-events-none" />
                      </button>
                      <button
                        type="button"
                        onClick={handleClear}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-[8px] bg-white/[0.08] hover:bg-red-500/25 focus:ring-2 focus:ring-red-400 text-white/50 hover:text-red-300 active:scale-90 transition-all outline-none"
                        title="Очистить всё"
                        aria-label="Очистить всё"
                      >
                        <X className="h-3.5 w-3.5 pointer-events-none" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Connect Button */}
            <button
              type="button"
              onClick={() => testAndSave()}
              disabled={testing || !url.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 py-3.5 text-[15px] font-semibold text-black transition-all hover:brightness-110 focus:scale-[1.02] focus:ring-4 focus:ring-amber-300/80 active:scale-[0.98] disabled:opacity-40 outline-none cursor-pointer shadow-lg shadow-amber-500/15"
            >
              {testing ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-black" />
              ) : (
                <Wifi className="h-4.5 w-4.5 text-black" strokeWidth={2.2} />
              )}
              <span>{testing ? 'Проверка подключения...' : 'Подключиться'}</span>
            </button>
          </div>

          {/* Right Column: Integrated TV Keyboard (7 cols) */}
          <div className="lg:col-span-7">
            <TvKeyboard
              onInput={handleAppend}
              onBackspace={handleBackspace}
              onClear={handleClear}
              onSubmit={() => testAndSave()}
              submitLabel="Подключиться"
              presets={['https://', 'http://', '192.168.', ':3500']}
            />
          </div>
        </div>

        <p className="mt-4 text-center text-[12px] text-white/30">
          Используйте стрелки на пульте для выбора кнопок и кнопку ОК для ввода.
        </p>
      </div>
    </div>
  );
}

