import { useState } from 'react';
import { Bell, Download, Sparkles, Puzzle, RefreshCw, ChevronRight, Star } from 'lucide-react';
import type { Title } from '@/api/client';
import SafeImg from './SafeImg';

interface NotificationItem {
  id: string;
  type: 'recommendation' | 'download' | 'plugin' | 'update';
  title: string;
  message: string;
  image?: string;
  timestamp: string;
  read: boolean;
}

const initialNotifications: NotificationItem[] = [
  { id: 'n1', type: 'recommendation', title: 'Рекомендация', message: 'Интерстеллар теперь доступен в 4K HDR', image: 'https://images.pexels.com/photos/733047/pexels-photo-733047.jpeg?auto=compress&cs=tinysrgb&w=600', timestamp: '2ч назад', read: false },
  { id: 'n2', type: 'download', title: 'Загрузка завершена', message: 'Дюна готова к просмотру', image: 'https://images.pexels.com/photos/3026904/pexels-photo-3026904.jpeg?auto=compress&cs=tinysrgb&w=400&h=600&fit=crop', timestamp: '5ч назад', read: false },
  { id: 'n3', type: 'plugin', title: 'Плагин обновлён', message: 'Trakt Sync v2.4.1 — улучшена точность', timestamp: '1д назад', read: true },
];

interface NotificationsViewProps {
  onSelect: (title: Title) => void;
  titles: Title[];
}

const typeConfig = {
  recommendation: { icon: Sparkles, color: 'rgba(232,193,112,0.7)' },
  download: { icon: Download, color: 'rgba(100,200,150,0.7)' },
  plugin: { icon: Puzzle, color: 'rgba(180,180,200,0.7)' },
  update: { icon: RefreshCw, color: 'rgba(110,150,255,0.7)' },
};

export default function NotificationsView({ onSelect, titles }: NotificationsViewProps) {
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = filter === 'all' ? items : items.filter((n) => !n.read);
  const unreadCount = items.filter((n) => !n.read).length;

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleAction = (n: NotificationItem) => {
    if (n.type === 'recommendation' && n.image) {
      const title = titles.find((t) => t.backdrop === n.image || t.poster === n.image);
      if (title) onSelect(title);
    }
    setItems((prev) => prev.map((item) => item.id === n.id ? { ...item, read: true } : item));
  };

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[700px]">
        {/* Header */}
        <div className="mb-8 animate-row-reveal">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Bell className="h-5 w-5 text-white/50 shrink-0" strokeWidth={1.5} />
              <h1 className="truncate text-display text-[24px] font-medium tracking-tight text-white/95 md:text-[38px]">Notifications</h1>
              {unreadCount > 0 && (
                <span className="rounded-full bg-amber-300/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200/90 shrink-0">{unreadCount}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[13px] font-medium text-white/50 transition-cinematic hover:text-white/85 shrink-0">
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-2 animate-row-reveal">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic capitalize"
              style={{
                background: filter === f ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === f ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                border: filter === f ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3 animate-detail-rise" style={{ animationDelay: '100ms' }}>
          {filtered.map((n, i) => {
            const config = typeConfig[n.type];
            const NIcon = config.icon;
            return (
              <button
                key={n.id}
                onClick={() => handleAction(n)}
                className="group flex w-full items-start gap-4 rounded-[14px] glass-panel p-4 text-left transition-cinematic hover:bg-white/[0.06] animate-stagger-in"
                style={{ animationDelay: `${i * 50}ms`, opacity: n.read ? 0.6 : 1 }}
              >
                {/* Image or icon */}
                {n.image ? (
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px]">
                    <SafeImg src={n.image} alt={n.title} className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-white/5">
                    <NIcon className="h-4 w-4" strokeWidth={1.5} style={{ color: config.color }} />
                  </div>
                )}

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300/90" />}
                    <h3 className="truncate text-[13px] font-semibold text-white/90">{n.title}</h3>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/55">{n.message}</p>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/35">
                    <NIcon className="h-3 w-3" strokeWidth={1.5} style={{ color: config.color }} />
                    <span className="capitalize">{n.type}</span>
                    <span className="text-white/15">·</span>
                    <span>{n.timestamp}</span>
                  </div>
                </div>

                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/20 transition-cinematic group-hover:text-white/50" strokeWidth={1.5} />
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-20 text-center">
              <Bell className="mx-auto h-10 w-10 text-white/15" strokeWidth={1} />
              <p className="mt-4 text-display text-[20px] font-medium text-white/60">All caught up</p>
              <p className="mt-2 text-[13px] text-white/40">New recommendations and updates will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
