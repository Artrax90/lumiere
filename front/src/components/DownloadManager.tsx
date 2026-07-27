import { useState, useEffect, useCallback } from 'react';
import { Download, Pause, Play, Trash2, Loader2, HardDrive, ArrowDown, ArrowUp } from 'lucide-react';
import { serverFetch } from '@/api/server';

interface TorrentDownload {
  hash: string;
  name: string;
  size: number;
  sizeFormatted: string;
  progress: number;
  downloadSpeed: number;
  downloadSpeedFormatted: string;
  uploadSpeed: number;
  uploadSpeedFormatted: string;
  state: string;
  eta: number;
  addedAt: number;
  savePath: string;
}

export default function DownloadManager() {
  const [torrents, setTorrents] = useState<TorrentDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [magnetInput, setMagnetInput] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchTorrents = useCallback(async () => {
    try {
      const token = localStorage.getItem('lumiere_access');
      const res = await serverFetch('/api/downloads', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setTorrents(data.torrents || []);
    } catch {
      setTorrents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTorrents();
    const interval = setInterval(fetchTorrents, 3000);
    return () => clearInterval(interval);
  }, [fetchTorrents]);

  const addTorrent = async () => {
    if (!magnetInput.trim()) return;
    setAdding(true);
    try {
      const token = localStorage.getItem('lumiere_access');
      await serverFetch('/api/downloads/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ magnet: magnetInput }),
      });
      setMagnetInput('');
      await fetchTorrents();
    } catch (err) {
      console.error('Add torrent error:', err);
    } finally {
      setAdding(false);
    }
  };

  const pauseTorrent = async (hash: string) => {
    try {
      const token = localStorage.getItem('lumiere_access');
      await serverFetch(`/api/downloads/${hash}/pause`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      await fetchTorrents();
    } catch {}
  };

  const resumeTorrent = async (hash: string) => {
    try {
      const token = localStorage.getItem('lumiere_access');
      await serverFetch(`/api/downloads/${hash}/resume`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      await fetchTorrents();
    } catch {}
  };

  const deleteTorrent = async (hash: string) => {
    try {
      const token = localStorage.getItem('lumiere_access');
      await serverFetch(`/api/downloads/${hash}?deleteFiles=false`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      await fetchTorrents();
    } catch {}
  };

  const stateLabel = (state: string) => {
    const labels: Record<string, string> = {
      uploading: 'Раздача',
      stalledUP: 'Раздача',
      downloading: 'Загрузка',
      stalledDL: 'Ожидание',
      pausedDL: 'Пауза',
      pausedUP: 'Пауза',
      queuedDL: 'В очереди',
      queuedUP: 'В очереди',
      checking: 'Проверка',
      error: 'Ошибка',
      missingFiles: 'Файлы не найдены',
    };
    return labels[state] || state;
  };

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 animate-row-reveal">
          <div className="flex items-center gap-3">
            <Download className="h-6 w-6 text-amber-300/70" strokeWidth={1.5} />
            <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Загрузки</h1>
          </div>
          <p className="mt-2 text-[15px] text-white/50">Управление торрентами через qBittorrent</p>
        </div>

        {/* Add torrent */}
        <div className="mb-8 glass-panel rounded-[20px] p-6 animate-row-reveal">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={magnetInput}
              onChange={(e) => setMagnetInput(e.target.value)}
              placeholder="Вставьте magnet-ссылку..."
              className="flex-1 rounded-[12px] bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30"
            />
            <button
              onClick={addTorrent}
              disabled={adding || !magnetInput.trim()}
              className="flex items-center gap-2 rounded-full bg-amber-300/90 px-6 py-3 text-[14px] font-semibold text-black/80 transition-cinematic hover:bg-amber-200/90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Добавить
            </button>
          </div>
        </div>

        {/* Torrent list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        ) : torrents.length === 0 ? (
          <div className="text-center py-20">
            <Download className="mx-auto h-12 w-12 text-white/15 mb-4" />
            <p className="text-[14px] text-white/40">Нет активных загрузок</p>
          </div>
        ) : (
          <div className="space-y-3">
            {torrents.map((torrent) => (
              <div
                key={torrent.hash}
                className="rounded-[16px] glass-panel p-5 animate-row-reveal"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-white/90 truncate">{torrent.name}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/40">
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />{torrent.sizeFormatted}
                      </span>
                      <span className="flex items-center gap-1 text-green-400/70">
                        <ArrowDown className="h-3 w-3" />{torrent.downloadSpeedFormatted}
                      </span>
                      <span className="flex items-center gap-1 text-blue-400/70">
                        <ArrowUp className="h-3 w-3" />{torrent.uploadSpeedFormatted}
                      </span>
                      <span className={`${
                        torrent.state.includes('downloading') ? 'text-amber-300' :
                        torrent.state.includes('paused') ? 'text-white/30' :
                        torrent.state.includes('uploading') ? 'text-green-400' :
                        'text-white/40'
                      }`}>
                        {stateLabel(torrent.state)}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-300/80 transition-all duration-300"
                          style={{ width: `${torrent.progress}%` }}
                        />
                      </div>
                      <span className="text-[12px] text-white/50 min-w-[40px] text-right">{torrent.progress}%</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {torrent.state.includes('paused') ? (
                      <button
                        onClick={() => resumeTorrent(torrent.hash)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => pauseTorrent(torrent.hash)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition"
                      >
                        <Pause className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteTorrent(torrent.hash)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-red-400/70 hover:bg-red-400/20 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
