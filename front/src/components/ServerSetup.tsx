import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Wifi, Loader2, AlertCircle } from 'lucide-react';
import { setServerUrl } from '@/api/server';

interface Props {
  onConnected: () => void;
}

export default function ServerSetup({ onConnected }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const testAndSave = async () => {
    if (!url.trim()) return;

    setTesting(true);
    setError('');

    let serverUrl = url.trim();
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      serverUrl = `http://${serverUrl}`;
    }

    try {
      const res = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('Server returned error');

      const data = await res.json();
      if (data.status === 'ok') {
        setServerUrl(serverUrl);
        onConnected();
      } else {
        setError('Сервер не отвечает');
      }
    } catch {
      setError('Не удалось подключиться к серверу');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm animate-scale-in">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/70 to-amber-600/35 blur-[8px] opacity-55" />
            <div className="relative h-5 w-5 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
          </div>
          <h1 className="text-display text-[28px] font-medium tracking-tight text-white/92">Lumière</h1>
          <p className="text-[14px] text-white/40">Введите адрес сервера</p>
        </div>

        {/* Input */}
        <div className="space-y-4">
          <div className="relative">
            <Server className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" strokeWidth={1.5} />
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && testAndSave()}
              placeholder="192.168.1.37:3000"
              className="w-full rounded-[14px] bg-white/[0.05] border border-white/[0.08] py-3.5 pl-11 pr-4 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-amber-300/30"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[13px] text-red-400/80">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={testAndSave}
            disabled={testing || !url.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-amber-200/85 to-amber-700/55 py-3.5 text-[14px] font-semibold text-black/70 transition-all hover:from-amber-200 hover:to-amber-600 disabled:opacity-40"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" strokeWidth={1.5} />
            )}
            {testing ? 'Подключение...' : 'Подключиться'}
          </button>
        </div>

        <p className="mt-6 text-center text-[12px] text-white/20">
          Адрес сервера Lumière в вашей сети
        </p>
      </div>
    </div>
  );
}
