import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Wifi, Loader2, AlertCircle, CheckCircle2, Delete, X } from 'lucide-react';
import { setServerUrl, getServerUrl, DEFAULT_SERVER_URL } from '@/api/server';

interface Props {
  onConnected: () => void;
  initialError?: string | null;
}

export default function ServerSetup({ onConnected, initialError }: Props) {
  const { t } = useTranslation();
  const placeholderHost = '192.168.1.100:3000';
  const [url, setUrl] = useState(() => {
    const current = getServerUrl();
    if (current && !current.startsWith('file:') && !current.startsWith('wgt-')) {
      return current.replace(/^https?:\/\//, '');
    }
    return '';
  });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(initialError || '');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const handleBackspace = () => {
    setUrl((prev) => prev.slice(0, -1));
    setError('');
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setUrl('');
    setError('');
    inputRef.current?.focus();
  };

  const testAndSave = async (target?: string) => {
    const raw = (target !== undefined ? target : url).trim();
    if (!raw) return;

    setTesting(true);
    setError('');

    let serverUrl = raw;
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      serverUrl = `http://${serverUrl}`;
    }
    serverUrl = serverUrl.replace(/\/+$/, '');

    try {
      const res = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.status === 'ok') {
        // Clear old sessions/tokens so user is prompted to authenticate or pick profile
        localStorage.removeItem('lumiere_access');
        localStorage.removeItem('lumiere_refresh');
        localStorage.removeItem('lumiere_user');
        localStorage.removeItem('lumiere_active_profile');

        setServerUrl(serverUrl);
        onConnected();
      } else {
        setError('Сервер ответил с ошибкой');
      }
    } catch (err: any) {
      setError(`Не удалось подключиться к ${serverUrl}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 bg-[#08080a]">
      <div className="w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/70 to-amber-600/35 blur-[10px] opacity-60" />
            <div className="relative h-6 w-6 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
          </div>
          <h1 className="text-display text-[32px] font-medium tracking-tight text-white/95">Lumière</h1>
          <p className="text-[14px] text-white/45">Подключение к медиасерверу</p>
        </div>

        {/* Form */}
        <div className="space-y-4 rounded-[20px] bg-white/[0.03] border border-white/[0.07] p-6 backdrop-blur-xl">
          {error && (
            <div className="flex items-start gap-2.5 rounded-[12px] bg-red-500/10 border border-red-500/20 p-3.5 text-[13px] text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-medium text-white/50">Адрес сервера (IP:порт)</label>
              {url.length > 0 && (
                <span className="text-[11px] text-white/30 font-mono">{url.length} симв.</span>
              )}
            </div>
            <div className="relative flex items-center">
              <Server className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30 pointer-events-none" strokeWidth={1.5} />
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && testAndSave()}
                placeholder={placeholderHost}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-[14px] bg-white/[0.05] border border-white/[0.1] py-3.5 pl-11 pr-24 text-[15px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-amber-300/40"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {url.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleBackspace}
                      className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/[0.07] hover:bg-white/[0.15] text-amber-300 active:scale-95 transition-all"
                      title="Стереть символ (Backspace)"
                      aria-label="Стереть символ"
                    >
                      <Delete className="h-4 w-4 pointer-events-none" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/[0.07] hover:bg-red-500/20 text-white/50 hover:text-red-300 active:scale-95 transition-all"
                      title="Очистить всё"
                      aria-label="Очистить всё"
                    >
                      <X className="h-4 w-4 pointer-events-none" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            ref={buttonRef}
            onClick={() => testAndSave()}
            disabled={testing || !url.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-amber-200/90 to-amber-600/70 py-3.5 text-[14px] font-semibold text-black/80 transition-all hover:from-amber-200 hover:to-amber-500 active:scale-[0.98] disabled:opacity-40"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" strokeWidth={1.8} />
            )}
            {testing ? 'Проверка подключения...' : 'Подключиться'}
          </button>

        </div>

        <p className="mt-6 text-center text-[12px] text-white/30">
          Убедитесь, что ПК с сервером Lumière и телевизор находятся в одной Wi-Fi сети.
        </p>
      </div>
    </div>
  );
}
