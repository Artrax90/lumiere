import { useState, useEffect, useCallback } from 'react';
import { Download, Pause, Play, Trash2, Loader2, HardDrive, ArrowDown, ArrowUp, Film, CheckCircle2, AlertCircle } from 'lucide-react';
import { serverFetch } from '@/api/server';

interface ServerDownloadItem {
  id: string;
  userId: number;
  title: string;
  mediaType: string;
  mediaId: number;
  season: number;
  episode: number;
  fileName: string;
  fileSize: number;
  fileSizeFormatted: string;
  downloadedBytes: number;
  downloadedBytesFormatted: string;
  progress: number;
  status: string;
  poster: string;
  streamUrl: string;
  createdAt: string;
  completedAt?: string;
}

interface DiskInfo {
  free: string;
  total: string;
}

export default function DownloadManager() {
  const [serverDownloads, setServerDownloads] = useState<ServerDownloadItem[]>([]);
  const [disk, setDisk] = useState<DiskInfo>({ free: '...', total: '...' });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const fetchServerDownloads = useCallback(async () => {
    try {
      const res = await serverFetch('/api/downloads/server/list');
      const data = await res.json();
      setServerDownloads(data.downloads || []);
      if (data.disk) setDisk(data.disk);
    } catch {
      setServerDownloads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServerDownloads();
    const interval = setInterval(fetchServerDownloads, 4000);
    return () => clearInterval(interval);
  }, [fetchServerDownloads]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const deleteServerDownload = async (id: string, title: string) => {
    try {
      const res = await serverFetch(`/api/downloads/server/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Файл «${title}» удален с сервера`);
        fetchServerDownloads();
      }
    } catch (err: any) {
      showToast(`Ошибка удаления: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 max-w-6xl mx-auto space-y-6 animate-detail-rise">
      {/* Toast Alert */}
      {toast && (
        <div className="rounded-[12px] bg-emerald-500/15 border border-emerald-500/30 p-4 text-[13px] text-emerald-300 animate-fade-in flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header and Disk Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <h1 className="text-display text-[28px] font-medium text-white/95 flex items-center gap-3">
            <Download className="h-7 w-7 text-amber-300/80" strokeWidth={1.75} />
            Скачано на сервер (Офлайн-медиа)
          </h1>
          <p className="mt-1 text-[13px] text-white/50">
            Файлы, загруженные на жесткий диск сервера Lumière для мгновенного просмотра без ожидания и интернета.
          </p>
        </div>

        {/* Disk Space Card */}
        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 rounded-[14px]">
          <HardDrive className="h-5 w-5 text-amber-300" strokeWidth={1.5} />
          <div>
            <div className="text-[11px] text-white/40 uppercase font-medium tracking-wider">Диск сервера</div>
            <div className="text-[13px] font-semibold text-white/90">
              Свободно: <span className="text-emerald-400">{disk.free}</span> / {disk.total}
            </div>
          </div>
        </div>
      </div>

      {/* Download List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/50 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
          <span>Загрузка списка загрузок...</span>
        </div>
      ) : serverDownloads.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.02] border border-white/[0.06] rounded-[20px] p-8">
          <Film className="h-12 w-12 text-white/20 mx-auto mb-3" />
          <h3 className="text-[16px] font-medium text-white/80">На сервере пока нет сохраненных фильмов</h3>
          <p className="mt-1 text-[13px] text-white/40 max-w-md mx-auto leading-relaxed">
            Вы можете поставить любой фильм или серию на загрузку из Telegram-бота, Smart TV или в поиске, нажав «Скачать на сервер».
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {serverDownloads.map((item) => {
            const isCompleted = item.status === 'completed';
            const isDownloading = item.status === 'downloading';

            return (
              <div
                key={item.id}
                className="group relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-[16px] bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-cinematic"
              >
                {/* Info */}
                <div className="flex items-center gap-4 min-w-0">
                  {item.poster ? (
                    <img
                      src={item.poster.startsWith('http') ? item.poster : `https://image.tmdb.org/t/p/w200${item.poster}`}
                      alt={item.title}
                      className="h-16 w-11 rounded-[8px] object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="h-16 w-11 rounded-[8px] bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/30 shrink-0">
                      <Film className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <h3 className="text-[15px] font-medium text-white/90 truncate flex items-center gap-2">
                      <span>{item.title}</span>
                      {isCompleted && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Готово к просмотру
                        </span>
                      )}
                      {isDownloading && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Скачивается {item.progress}%
                        </span>
                      )}
                    </h3>

                    <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[12px] text-white/45">
                      <span>Размер: <strong className="text-white/70">{item.fileSizeFormatted}</strong></span>
                      {isDownloading && (
                        <span>Скачано: {item.downloadedBytesFormatted}</span>
                      )}
                      <span>Файл: <code className="font-mono text-white/40">{item.fileName}</code></span>
                    </div>

                    {/* Progress Bar for active download */}
                    {isDownloading && (
                      <div className="mt-2.5 h-1.5 w-64 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-300 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {isCompleted && (
                    <a
                      href={item.streamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-full bg-amber-300/90 text-black px-4 py-2 text-[12px] font-semibold transition-cinematic hover:bg-amber-200 hover:scale-[1.02]"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Смотреть офлайн</span>
                    </a>
                  )}

                  <button
                    onClick={() => deleteServerDownload(item.id, item.title)}
                    className="flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 px-3 py-2 text-[12px] font-medium transition-cinematic"
                    title="Удалить с диска сервера"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Удалить с сервера</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
