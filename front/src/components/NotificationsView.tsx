import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Download, Sparkles, Puzzle, RefreshCw, ChevronRight, CheckCheck, Loader2 } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch, serverUrl } from '@/api/server';
import SafeImg from './SafeImg';

interface NotificationItem {
  id: string | number;
  type: 'recommendation' | 'download' | 'plugin' | 'update' | 'tv';
  title: string;
  message: string;
  image?: string;
  targetTitle?: Title;
  timestamp: string;
  read: boolean;
  actionData?: any;
  mediaId?: number;
  mediaType?: string;
}

interface NotificationsViewProps {
  onSelect: (title: Title) => void;
  titles: Title[];
}

const typeConfig: Record<string, { label: string; icon: any; color: string }> = {
  tv: { label: 'Новая серия', icon: Sparkles, color: 'rgba(232,193,112,0.95)' },
  recommendation: { label: 'Рекомендация', icon: Sparkles, color: 'rgba(232,193,112,0.85)' },
  download: { label: 'Загрузка', icon: Download, color: 'rgba(100,200,150,0.85)' },
  plugin: { label: 'Плагин', icon: Puzzle, color: 'rgba(180,180,200,0.85)' },
  update: { label: 'Система', icon: RefreshCw, color: 'rgba(110,150,255,0.85)' },
};

export default function NotificationsView({ onSelect, titles }: NotificationsViewProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const token = localStorage.getItem('lumiere_access');
      if (!token) return;

      const res = await serverFetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.notifications) && data.notifications.length > 0) {
          const mapped: NotificationItem[] = data.notifications.map((n: any) => ({
            id: n.id,
            type: (n.mediaType === 'tv' ? 'tv' : 'recommendation') as any,
            title: n.title,
            message: n.message,
            image: n.poster ? serverUrl(n.poster.startsWith('/api') || n.poster.startsWith('http') ? n.poster : `/api/image?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w300${n.poster}`)}`) : undefined,
            timestamp: n.createdAt ? new Date(n.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Недавно',
            read: !!n.isRead,
            actionData: n.actionData,
            mediaId: n.mediaId,
            mediaType: n.mediaType,
          }));
          setItems(mapped);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading notifications:', e);
    }

    // Fallback to initial recommendation notifications if empty
    const t0 = titles[0];
    const t1 = titles[1];
    setItems([
      {
        id: 'n1',
        type: 'recommendation',
        title: 'Рекомендация для вас',
        message: t0 ? `«${t0.name}» доступен для просмотра в высоком качестве` : 'Свежие премьеры недели доступны в каталоге',
        image: t0?.poster || t0?.backdrop,
        targetTitle: t0,
        timestamp: '2 ч. назад',
        read: false,
      },
      {
        id: 'n2',
        type: 'recommendation',
        title: 'Тренды недели',
        message: t1 ? `«${t1.name}» набирает популярность среди зрителей` : 'Высокие оценки от пользователей',
        image: t1?.poster || t1?.backdrop,
        targetTitle: t1,
        timestamp: '5 ч. назад',
        read: true,
      },
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, [titles]);

  const checkForNewEpisodes = async () => {
    setChecking(true);
    try {
      const token = localStorage.getItem('lumiere_access');
      if (token) {
        await serverFetch('/api/notifications/check', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        await loadNotifications();
      }
    } catch (e) {
      console.error('Check error:', e);
    } finally {
      setChecking(false);
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      const token = localStorage.getItem('lumiere_access');
      if (token) {
        await serverFetch('/api/notifications/read-all', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (e) {}
  };

  const handleAction = async (n: NotificationItem) => {
    // Mark as read
    setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    try {
      const token = localStorage.getItem('lumiere_access');
      if (token && typeof n.id === 'number') {
        serverFetch(`/api/notifications/${n.id}/read`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      }
    } catch {}

    if (n.targetTitle) {
      onSelect(n.targetTitle);
      return;
    }

    const mediaId = n.mediaId || (n.actionData && n.actionData.seriesId);
    if (mediaId) {
      try {
        const type = n.mediaType === 'movie' ? 'movie' : 'tv';
        const res = await serverFetch(`/api/${type}/${mediaId}?lang=ru`);
        if (res.ok) {
          const titleData = await res.json();
          onSelect(titleData);
        }
      } catch (e) {
        console.error('Failed to open notification title:', e);
      }
    }
  };

  const filtered = filter === 'all' ? items : items.filter((n) => !n.read);
  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[760px]">
        {/* Header */}
        <div className="mb-8 animate-row-reveal">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 border border-amber-400/20">
                <Bell className="h-5 w-5 text-amber-300" strokeWidth={1.5} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-black ring-2 ring-[#08080a]">
                    {unreadCount}
                  </span>
                )}
              </div>
              <h1 className="truncate text-display text-[26px] font-medium tracking-tight text-white/95 md:text-[34px]">
                Уведомления
              </h1>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={checkForNewEpisodes}
                disabled={checking}
                className="flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/80 transition-cinematic hover:bg-white/10 active:scale-95 disabled:opacity-50"
                title="Проверить выход новых серий отслеживаемых сериалов"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin text-amber-300' : ''}`} />
                <span>{checking ? 'Проверка...' : 'Проверить новые серии'}</span>
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1.5 rounded-full glass px-3.5 py-2 text-[13px] font-medium text-white/60 transition-cinematic hover:text-white/90 hover:bg-white/10"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Прочитать все</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-2 animate-row-reveal">
          <button
            onClick={() => setFilter('all')}
            className="rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
            style={{
              background: filter === 'all' ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
              color: filter === 'all' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
              border: filter === 'all' ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            Все ({items.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className="rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
            style={{
              background: filter === 'unread' ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
              color: filter === 'unread' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
              border: filter === 'unread' ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            Непрочитанные {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>

        {/* List */}
        <div className="space-y-3 animate-detail-rise">
          {filtered.map((n, i) => {
            const config = typeConfig[n.type] || typeConfig.recommendation;
            const NIcon = config.icon;
            return (
              <button
                key={n.id}
                onClick={() => handleAction(n)}
                className="group flex w-full items-start gap-4 rounded-[16px] glass-panel p-4 text-left transition-cinematic hover:bg-white/[0.06] animate-stagger-in"
                style={{
                  animationDelay: `${i * 40}ms`,
                  opacity: n.read ? 0.65 : 1,
                  borderLeft: !n.read ? '3px solid #e8c170' : '3px solid transparent'
                }}
              >
                {/* Image or icon */}
                {n.image ? (
                  <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-[10px] bg-white/5 shadow-md">
                    <SafeImg src={n.image} alt={n.title} className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  </div>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-white/5">
                    <NIcon className="h-5 w-5" strokeWidth={1.5} style={{ color: config.color }} />
                  </div>
                )}

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" />}
                    <h3 className="truncate text-[15px] font-semibold text-white/95 group-hover:text-amber-200 transition-colors">
                      {n.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/70">{n.message}</p>
                  <div className="mt-2.5 flex items-center gap-2 text-[11px] text-white/45">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-amber-300/90">{config.label}</span>
                    <span className="text-white/20">•</span>
                    <span>{n.timestamp}</span>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1 text-[12px] font-medium text-amber-300/80 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <span>Смотреть</span>
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2} />
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div className="py-20 text-center glass rounded-2xl p-8">
              <Bell className="mx-auto h-12 w-12 text-white/20" strokeWidth={1} />
              <p className="mt-4 text-display text-[20px] font-medium text-white/80">
                {filter === 'unread' ? 'Нет непрочитанных уведомлений' : 'Все уведомления прочитаны'}
              </p>
              <p className="mt-2 text-[13px] text-white/45 max-w-sm mx-auto">
                Здесь появляются оповещения о выходе новых серий отслеживаемых сериалов и персональные рекомендации.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
