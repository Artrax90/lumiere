import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Tv,
  Monitor,
  Smartphone,
  StopCircle,
  RefreshCw,
  Clock,
  User,
  Trash2,
  CheckCircle2,
  Film,
  Radio,
  AlertCircle
} from 'lucide-react';
import { serverFetch } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';

interface ActiveSession {
  id: string;
  userId: number;
  userName: string;
  userAvatar: string;
  userEmail: string;
  isKids: boolean;
  deviceType: 'tv' | 'web' | 'mobile';
  deviceName: string;
  clientIp: string;
  mediaType: 'movie' | 'tv' | 'iptv';
  mediaId: string;
  mediaTitle: string;
  mediaPoster: string;
  season: number;
  episode: number;
  currentTime: number;
  duration: number;
  isPaused: boolean;
  terminateRequested: boolean;
  startedAt: string;
  lastHeartbeat: string;
}

interface PlaybackHistoryItem {
  id: number;
  userId: number;
  userName: string;
  userAvatar: string;
  deviceType: string;
  deviceName: string;
  mediaType: string;
  mediaId: string;
  mediaTitle: string;
  mediaPoster: string;
  season: number;
  episode: number;
  watchedSeconds: number;
  duration: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export default function ActiveSessionsView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [history, setHistory] = useState<PlaybackHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSessions = useCallback(async () => {
    try {
      const res = await serverFetch('/api/sessions/active');
      if (res.ok) {
        const data = await res.json();
        setSessions(data?.sessions || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const url = selectedUserFilter !== 'all'
        ? `/api/sessions/history?userId=${selectedUserFilter}`
        : '/api/sessions/history';
      const res = await serverFetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistory(data?.history || []);
      }
    } catch {
      // Ignore
    }
  }, [selectedUserFilter]);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchSessions(), fetchHistory()]);
    setRefreshing(false);
    setLoading(false);
  }, [fetchSessions, fetchHistory]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(fetchSessions, 4000);
    return () => clearInterval(interval);
  }, [loadAll, fetchSessions]);

  const handleTerminate = async (sessionId: string, title: string) => {
    setTerminatingId(sessionId);
    try {
      await serverFetch(`/api/sessions/${sessionId}/terminate`, { method: 'POST' });
      showToast(`Сигнал остановки отправлен для «${title}»`);
      await fetchSessions();
    } catch {
      showToast('Ошибка при остановке сессии');
    } finally {
      setTerminatingId(null);
    }
  };

  const handleDeleteHistory = async (id: number) => {
    try {
      await serverFetch(`/api/sessions/history/${id}`, { method: 'DELETE' });
      setHistory(prev => prev.filter(h => h.id !== id));
      showToast('Запись удалена из истории');
    } catch {
      showToast('Ошибка при удалении');
    }
  };

  const handleClearAllHistory = async () => {
    if (!confirm('Вы уверены, что хотите очистить историю просмотров?')) return;
    try {
      await serverFetch('/api/sessions/history', { method: 'DELETE' });
      setHistory([]);
      showToast('История просмотров очищена');
    } catch {
      showToast('Ошибка при очистке истории');
    }
  };

  const getDeviceIcon = (type: string) => {
    if (type === 'tv') return <Tv className="h-4 w-4 text-sky-400" />;
    if (type === 'mobile') return <Smartphone className="h-4 w-4 text-emerald-400" />;
    return <Monitor className="h-4 w-4 text-amber-400" />;
  };

  const uniqueUsers = Array.from(new Set(history.map(h => JSON.stringify({ id: h.userId, name: h.userName }))))
    .map(s => JSON.parse(s) as { id: number; name: string });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Toast Notification */}
      {toast && (
        <div className="flex items-center gap-2 rounded-[12px] bg-amber-500/10 border border-amber-500/30 p-3.5 text-[13px] text-amber-200 animate-fade-in shadow-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-white/[0.08] bg-white/[0.02] p-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/15 border border-amber-400/30 text-amber-300">
            <Tv className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-white/95 flex items-center gap-2.5">
              Мониторинг сессий
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                sessions.length > 0
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/[0.05] border-white/10 text-white/40'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${sessions.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
                {sessions.length > 0 ? `Активно: ${sessions.length}` : 'Нет активных сессий'}
              </span>
            </h2>
            <p className="text-[12px] text-white/45 mt-0.5">
              Просматривайте в реальном времени, кто что смотрит в домашней сети, и управляйте воспроизведением
            </p>
          </div>
        </div>

        <button
          onClick={loadAll}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2 text-[12px] font-medium text-white/80 hover:text-white transition-cinematic active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Обновить</span>
        </button>
      </div>

      {/* SECTION 1: Active Playback Sessions */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-medium text-white/90 flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
            Кто что смотрит сейчас
          </h3>
          <span className="text-[12px] text-white/40">Автообновление каждые 4 сек.</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-[13px] text-white/40">
            <RefreshCw className="h-5 w-5 animate-spin mr-3 text-amber-400" />
            Загрузка активных сессий...
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.01] p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-white/30 mb-3">
              <Film className="h-6 w-6" />
            </div>
            <p className="text-[14px] font-medium text-white/60">Сейчас никто ничего не смотрит</p>
            <p className="text-[12px] text-white/30 mt-1">При запуске фильма, сериала или ТВ-канала на Smart TV, ПК или смартфоне здесь появится карточка сессии</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((sess) => {
              const progressPercent = sess.duration > 0
                ? Math.min(100, Math.round((sess.currentTime / sess.duration) * 100))
                : 0;

              return (
                <div
                  key={sess.id}
                  className="group relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-neutral-900/80 p-5 shadow-2xl transition-all duration-300 hover:border-amber-400/30 hover:shadow-amber-500/5"
                >
                  {/* Backdrop subtle glow */}
                  <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-amber-400/5 blur-3xl pointer-events-none" />

                  <div className="flex gap-4">
                    {/* Media Poster */}
                    <div className="relative h-32 w-22 shrink-0 overflow-hidden rounded-[12px] bg-white/[0.05] border border-white/[0.1] shadow-md">
                      {sess.mediaPoster ? (
                        <img
                          src={sess.mediaPoster.startsWith('/') ? sess.mediaPoster : sess.mediaPoster}
                          alt={sess.mediaTitle}
                          className="h-full w-full object-cover"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/20">
                          <Film className="h-8 w-8" />
                        </div>
                      )}
                      {/* Play/Pause overlay badge on poster */}
                      <div className="absolute bottom-1.5 left-1.5 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md p-1 border border-white/20">
                        {sess.isPaused ? (
                          <Pause className="h-3 w-3 text-amber-300" />
                        ) : (
                          <Play className="h-3 w-3 text-emerald-400 fill-emerald-400" />
                        )}
                      </div>
                    </div>

                    {/* Session Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        {/* User & Device Row */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-[11px] font-bold text-black shadow-sm">
                              {sess.userName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[13px] font-semibold text-white/90 truncate">
                              {sess.userName}
                            </span>
                            {sess.isKids && (
                              <span className="rounded bg-sky-500/20 border border-sky-500/30 px-1.5 py-0.2 text-[9px] font-medium text-sky-300">
                                Детский
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[11px] text-white/60 shrink-0">
                            {getDeviceIcon(sess.deviceType)}
                            <span className="truncate max-w-[110px]">{sess.deviceName}</span>
                          </div>
                        </div>

                        {/* Title */}
                        <div className="text-[15px] font-medium text-white truncate" title={sess.mediaTitle}>
                          {sess.mediaTitle}
                        </div>

                        {/* Subtitle / Season info */}
                        <div className="text-[12px] text-white/50 flex items-center gap-2 mt-0.5">
                          {sess.mediaType === 'tv' && sess.season > 0 && (
                            <span className="text-amber-300/80 font-medium">
                              Сезон {sess.season}, Серия {sess.episode}
                            </span>
                          )}
                          {((sess.mediaType as string) === 'iptv' || (sess.mediaType as string) === 'live') && (
                            <span className="text-sky-300/80 font-medium">ТВ-трансляция</span>
                          )}
                          {sess.clientIp && (
                            <span className="text-white/30 text-[11px]">IP: {sess.clientIp}</span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar & Actions */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-white/50 mb-1.5">
                          <span className="font-mono">{formatDuration(sess.currentTime)}</span>
                          <span className="flex items-center gap-1 font-mono">
                            {sess.duration > 0 ? formatDuration(sess.duration) : 'Live'}
                            {progressPercent > 0 && ` (${progressPercent}%)`}
                          </span>
                        </div>

                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Admin Remote Control Footer */}
                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] text-white/40">
                        <Clock className="h-3 w-3" />
                        <span>Обновлено {formatRelativeTime(sess.lastHeartbeat)}</span>
                      </div>

                      <button
                        onClick={() => handleTerminate(sess.id, sess.mediaTitle)}
                        disabled={terminatingId === sess.id || sess.terminateRequested}
                        className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-[11px] font-medium text-red-300 transition-cinematic active:scale-95 disabled:opacity-50"
                        title="Удаленно остановить воспроизведение на устройстве"
                      >
                        <StopCircle className="h-3.5 w-3.5 text-red-400" />
                        <span>{sess.terminateRequested ? 'Останавливается...' : 'Остановить просмотр'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Unified Playback History */}
      <div className="pt-4 border-t border-white/[0.08]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-medium text-white/90 flex items-center gap-2">
              <Film className="h-4 w-4 text-amber-300" />
              История просмотров
            </h3>
            <p className="text-[12px] text-white/40 mt-0.5">
              Журнал просмотров всех участников домашней сети с отслеживанием прогресса
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Filter by user (if admin) */}
            {isAdmin && uniqueUsers.length > 1 && (
              <select
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="rounded-full bg-white/[0.05] border border-white/10 px-3.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-amber-300/40"
              >
                <option value="all" className="bg-neutral-900 text-white">Все пользователи</option>
                {uniqueUsers.map(u => (
                  <option key={u.id} value={u.id} className="bg-neutral-900 text-white">{u.name}</option>
                ))}
              </select>
            )}

            {history.length > 0 && (
              <button
                onClick={handleClearAllHistory}
                className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-1.5 text-[12px] font-medium text-red-300 transition-cinematic"
              >
                <Trash2 className="h-3 w-3" />
                <span>Очистить историю</span>
              </button>
            )}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.01] p-8 text-center text-[13px] text-white/40">
            История просмотров пуста
          </div>
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-white/[0.01]">
            <div className="divide-y divide-white/[0.05]">
              {history.map((item) => {
                const percent = item.duration > 0
                  ? Math.min(100, Math.round((item.watchedSeconds / item.duration) * 100))
                  : 0;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 p-4 transition-cinematic hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Thumbnail */}
                      <div className="h-12 w-9 shrink-0 overflow-hidden rounded-[8px] bg-white/[0.05] border border-white/[0.1]">
                        {item.mediaPoster ? (
                          <img
                            src={item.mediaPoster}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-white/20">
                            <Film className="h-4 w-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-[14px] font-medium text-white/95 truncate">
                          {item.mediaTitle}
                        </div>
                        <div className="text-[12px] text-white/45 flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-white/70">{item.userName}</span>
                          <span>•</span>
                          <span>{item.deviceName || 'Устройство'}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(item.endedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Completion status */}
                      <div className="text-right">
                        <div className="text-[12px] font-medium text-white/80 font-mono">
                          {formatDuration(item.watchedSeconds)} / {formatDuration(item.duration)}
                        </div>
                        <div className="text-[11px] text-white/40">
                          {item.completed ? (
                            <span className="text-emerald-400 font-medium">Просмотрено</span>
                          ) : (
                            <span>{percent}%</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteHistory(item.id)}
                        className="rounded-lg p-1.5 text-white/30 hover:bg-white/[0.05] hover:text-red-400 transition-cinematic"
                        title="Удалить из истории"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
