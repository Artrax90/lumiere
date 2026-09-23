import { useState, useEffect } from 'react';
import { History, Bookmark, Heart, Trash2, Film } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch } from '@/api/server';
import Card from './Card';

interface MyViewProps {
  onSelect: (title: Title) => void;
}

type TabType = 'watched' | 'watchlist' | 'favorites';

export default function MyView({ onSelect }: MyViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('watched');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Title[]>([]);

  const loadData = (tab: TabType) => {
    setLoading(true);
    let url = '/api/user/history';
    if (tab === 'watchlist') url = '/api/user/watchlist';
    if (tab === 'favorites') url = '/api/user/favorites';

    serverFetch(url)
      .then((res) => res.json())
      .then((data) => {
        let rawList: any[] = [];
        if (tab === 'watched') rawList = data.history || [];
        else if (tab === 'watchlist') rawList = data.watchlist || [];
        else if (tab === 'favorites') rawList = data.favorites || [];

        const titles: Title[] = rawList.map((item: any) => ({
          id: item.tmdbId,
          name: item.titleName,
          type: item.mediaType || 'movie',
          poster: item.poster || '',
          backdrop: item.poster || '',
          year: 0,
          score: 0,
          genres: [],
          runtime: '',
          rating: '',
          description: '',
          logoText: item.titleName,
        }));

        // Merge local playback history for watched tab if empty
        if (tab === 'watched' && titles.length === 0) {
          try {
            const raw = localStorage.getItem('playback_positions');
            const pos = raw ? JSON.parse(raw) : {};
            for (const val of Object.values(pos)) {
              const t = typeof val === 'object' && val !== null ? (val as any).title : null;
              if (t && t.id) {
                titles.push({
                  id: t.id,
                  name: t.name,
                  type: t.type || 'movie',
                  poster: t.poster || '',
                  backdrop: t.backdrop || '',
                  year: t.year || 0,
                  score: 0,
                  genres: [],
                  runtime: '',
                  rating: '',
                  description: '',
                  logoText: t.name,
                });
              }
            }
          } catch {}
        }

        setItems(titles);
      })
      .catch((err) => {
        console.error('Failed to load my items:', err);
        setItems([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const [isEditMode, setIsEditMode] = useState(false);

  const handleRemove = async (e: React.MouseEvent, titleId: number) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      let url = `/api/user/history/${titleId}`;
      if (activeTab === 'watchlist') url = `/api/user/watchlist/${titleId}`;
      if (activeTab === 'favorites') url = `/api/user/favorites/${titleId}`;

      await serverFetch(url, { method: 'DELETE' });

      if (activeTab === 'watched') {
        try {
          const raw = localStorage.getItem('playback_positions');
          if (raw) {
            const pos = JSON.parse(raw);
            delete pos[titleId];
            localStorage.setItem('playback_positions', JSON.stringify(pos));
          }
        } catch {}
      }

      setItems((prev) => prev.filter((i) => i.id !== titleId));
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  };

  const tabs = [
    { id: 'watched' as TabType, label: 'Просмотрено', icon: History, count: activeTab === 'watched' ? items.length : undefined },
    { id: 'watchlist' as TabType, label: 'Буду смотреть', icon: Bookmark, count: activeTab === 'watchlist' ? items.length : undefined },
    { id: 'favorites' as TabType, label: 'Закладки', icon: Heart, count: activeTab === 'favorites' ? items.length : undefined },
  ];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden px-4 pt-20 pb-24 sm:px-6 md:px-8 lg:px-14">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl md:text-4xl">Моё</h1>
          <p className="mt-1 text-xs sm:text-sm text-white/50">Ваша персональная медиатека: история, планы к просмотру и закладки</p>
        </div>

        {items.length > 0 && !loading && (
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`self-start sm:self-auto flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all shadow-md active:scale-95 ${
              isEditMode
                ? 'bg-amber-400 text-black shadow-amber-400/20'
                : 'bg-white/10 hover:bg-white/15 text-white/90 border border-white/15'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{isEditMode ? 'Готово' : 'Управление списком'}</span>
          </button>
        )}
      </div>

      {/* Tabs: Responsive Segmented Control */}
      <div className="mb-8 w-full max-w-2xl">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 rounded-2xl bg-white/[0.04] p-1.5 border border-white/10 backdrop-blur-md">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsEditMode(false);
                }}
                className={`flex items-center justify-center gap-1.5 sm:gap-2.5 rounded-xl py-3 px-2 sm:px-4 text-xs sm:text-sm md:text-base font-bold transition-all ${
                  isActive
                    ? 'bg-amber-400/25 text-amber-300 border border-amber-400/50 shadow-md shadow-amber-400/10'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.06] border border-transparent'
                }`}
              >
                <Icon className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${isActive ? 'text-amber-300' : 'text-white/50'}`} />
                <span className="truncate">{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span className={`hidden sm:inline-block rounded-full px-2 py-0.5 text-xs font-extrabold ${isActive ? 'bg-amber-400/30 text-amber-200' : 'bg-white/10 text-white/60'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-amber-400">
            {activeTab === 'watched' && <History className="h-8 w-8 opacity-60" />}
            {activeTab === 'watchlist' && <Bookmark className="h-8 w-8 opacity-60" />}
            {activeTab === 'favorites' && <Heart className="h-8 w-8 opacity-60" />}
          </div>
          <h3 className="text-lg font-bold text-white">
            {activeTab === 'watched' && 'История просмотров пуста'}
            {activeTab === 'watchlist' && 'Список «Буду смотреть» пуст'}
            {activeTab === 'favorites' && 'В закладках пока ничего нет'}
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-white/50">
            {activeTab === 'watched' && 'Фильмы и серии, которые вы начнёте смотреть, автоматически появятся здесь.'}
            {activeTab === 'watchlist' && 'Добавляйте фильмы и сериалы кнопкой «Буду смотреть» в карточке фильма.'}
            {activeTab === 'favorites' && 'Отмечайте любимые тайтлы сердечком в карточке фильма.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {items.map((title) => (
            <div key={title.id} className="group relative">
              <Card title={title} onSelect={isEditMode ? () => {} : onSelect} />
              <button
                onClick={(e) => handleRemove(e, title.id)}
                title="Удалить из списка"
                className={`absolute top-2 right-2 z-30 flex items-center justify-center rounded-full transition-all active:scale-90 ${
                  isEditMode
                    ? 'h-9 w-9 bg-red-600 text-white shadow-lg shadow-red-600/50 ring-2 ring-white/40 opacity-100 scale-100'
                    : 'h-8 w-8 bg-black/75 text-white/80 backdrop-blur-md opacity-0 hover:bg-red-600 hover:text-white group-hover:opacity-100 hover:scale-105'
                }`}
              >
                <Trash2 className={isEditMode ? "h-4.5 w-4.5" : "h-4 w-4"} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
