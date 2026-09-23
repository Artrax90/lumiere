import { useState, useEffect, useMemo } from 'react';
import { Clock, Heart, Trophy, Monitor, Star, LogOut } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import Card from './Card';

interface ProfileViewProps {
  onSelect: (title: Title) => void;
}

const tabs = [
  { id: 'overview', label: 'Обзор', icon: Clock },
  { id: 'favorites', label: 'Избранное', icon: Heart },
  { id: 'achievements', label: 'Достижения', icon: Trophy },
  { id: 'devices', label: 'Устройства', icon: Monitor },
];

export default function ProfileView({ onSelect }: ProfileViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const { user, logout } = useAuth();
  const [favorites, setFavorites] = useState<Title[]>([]);

  useEffect(() => {
    let active = true;
    serverFetch('/api/user/favorites')
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data.favorites) return;
        const titles: Title[] = data.favorites.map((f: any) => ({
          id: f.tmdbId,
          name: f.titleName,
          type: f.mediaType || 'movie',
          poster: f.poster || '',
          backdrop: f.poster || '',
          year: 0,
          score: 0,
          genres: [],
          runtime: '',
          rating: '',
          description: '',
          logoText: f.titleName,
        }));
        setFavorites(titles);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    try {
      const raw = localStorage.getItem('playback_positions');
      const positions = raw ? JSON.parse(raw) : {};
      let totalSeconds = 0;
      let watchedCount = 0;
      const genreCounts: Record<string, number> = {};

      for (const val of Object.values(positions)) {
        const time = typeof val === 'object' && val !== null ? (val as any).time || 0 : Number(val || 0);
        if (time > 30) {
          totalSeconds += time;
          watchedCount++;
          const t = typeof val === 'object' && val !== null ? (val as any).title : null;
          if (t && Array.isArray(t.genres)) {
            for (const g of t.genres) {
              genreCounts[g] = (genreCounts[g] || 0) + 1;
            }
          }
        }
      }

      const totalHours = Math.round(totalSeconds / 3600);
      const topGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count], _, arr) => ({
          name,
          count,
          pct: arr[0] ? Math.round((count / arr[0][1]) * 100) : 100,
        }));

      return {
        totalHours,
        watchedCount,
        topGenres,
      };
    } catch {
      return { totalHours: 0, watchedCount: 0, topGenres: [] };
    }
  }, []);

  const achievements = useMemo(() => [
    { id: 'a1', name: 'Первый сеанс', desc: 'Запустили первый фильм или серию', icon: '🎬', unlocked: stats.watchedCount >= 1 },
    { id: 'a2', name: 'Киноман', desc: 'Посмотрели более 5 фильмов или серий', icon: '🍿', unlocked: stats.watchedCount >= 5 },
    { id: 'a3', name: 'Марафонец', desc: 'Провели более 10 часов за просмотром', icon: '⏱️', unlocked: stats.totalHours >= 10 },
    { id: 'a4', name: 'Коллекционер', desc: 'Добавили тайтлы в избранное', icon: '⭐', unlocked: favorites.length > 0 },
    { id: 'a5', name: 'Знаток IPTV', desc: 'Подключили собственный плейлист каналов', icon: '📡', unlocked: !!localStorage.getItem('lumiere_iptv') },
  ], [stats, favorites.length]);

  const devices = useMemo(() => [
    {
      id: 'd1',
      name: window.navigator.userAgent.includes('Tizen')
        ? 'Samsung Smart TV'
        : window.navigator.userAgent.includes('Mobile')
        ? 'Мобильное устройство'
        : 'Веб-клиент (ПК / Ноутбук)',
      location: window.location.hostname === 'localhost' ? 'Локальный сеанс' : window.location.hostname,
      lastActive: 'Сейчас',
      current: true,
    }
  ], []);

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1300px]">
        <div className="mb-10 animate-row-reveal">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-200/90 to-amber-700/50 text-[24px] font-semibold text-black/65 md:h-20 md:w-20 md:text-[28px]">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#08080a] bg-amber-400 md:h-7 md:w-7">
                <Trophy className="h-3 w-3 text-black/70 md:h-3.5 md:w-3.5" strokeWidth={1.5} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-display text-[24px] font-medium tracking-tight text-white/95 md:text-[32px]">{user?.name || 'Пользователь'}</h1>
              <div className="mt-1 flex items-center gap-2 text-[12px] text-white/45 md:gap-3 md:text-[13px]">
                <span className="truncate">{user?.email || ''}</span>
                <span className="text-white/15 shrink-0">·</span>
                <span className="flex items-center gap-1 shrink-0"><Star className="h-3 w-3 text-amber-300/70" fill="currentColor" strokeWidth={0} />Киноман</span>
              </div>
            </div>
            <div className="shrink-0">
              <button
                onClick={logout}
                className="flex items-center gap-2 rounded-full glass px-3 py-2 text-[12px] font-medium text-white/60 transition-cinematic hover:text-white/90 hover:bg-white/[0.08] md:px-4 md:text-[13px]"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} /><span className="hidden md:inline">Выйти</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4 animate-row-reveal">
          <StatCard label="Часов просмотрено" value={stats.totalHours} suffix="ч" />
          <StatCard label="Просмотрено тайтлов" value={stats.watchedCount} />
          <StatCard label="В избранном" value={favorites.length} />
          <StatCard label="Достижения" value={achievements.filter((a) => a.unlocked).length} suffix={`/${achievements.length}`} />
        </div>

        <div className="mb-8 flex gap-1 overflow-x-auto border-b border-white/[0.06] animate-row-reveal no-scrollbar">
          {tabs.map((t) => {
            const TIcon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex shrink-0 items-center gap-2 px-4 py-3 text-[13px] font-medium transition-cinematic whitespace-nowrap"
                style={{
                  color: activeTab === t.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                  borderBottom: activeTab === t.id ? '2px solid rgba(232,193,112,0.65)' : '2px solid transparent',
                }}
              >
                <TIcon className="h-4 w-4" strokeWidth={1.5} />{t.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-12 animate-fade-in">
            <section>
              <div className="mb-5 flex items-center gap-3">
                <h3 className="text-display text-[20px] font-medium tracking-tight text-white/90">Популярные жанры</h3>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              {stats.topGenres.length > 0 ? (
                <div className="space-y-3">
                  {stats.topGenres.map((g) => (
                    <div key={g.name} className="flex items-center gap-4">
                      <div className="w-24 text-[13px] font-medium text-white/70">{g.name}</div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: 'linear-gradient(90deg, rgba(232,193,112,0.6), rgba(232,193,112,0.9))' }} />
                      </div>
                      <div className="w-10 text-right text-[12px] text-white/40">{g.count}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-white/35 text-[13px]">
                  История просмотров пуста. Смотрите фильмы и сериалы, чтобы формировать статистику жанров.
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'favorites' && (
          favorites.length > 0 ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-fade-in">
              {favorites.map((t, i) => (
                <div key={t.id} className="animate-stagger-in" style={{ animationDelay: `${Math.min(i * 50, 600)}ms` }}>
                  <Card title={t} variant="portrait" onSelect={onSelect} fill />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-white/40 animate-fade-in">
              <p className="text-[15px] font-medium text-white/70">В избранном пока ничего нет</p>
              <p className="mt-1 text-[13px] text-white/35">
                Добавляйте понравившиеся фильмы и сериалы на странице просмотра или каталоге
              </p>
            </div>
          )
        )}

        {activeTab === 'achievements' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
            {achievements.map((a, i) => (
              <div
                key={a.id}
                className="flex items-center gap-4 rounded-[16px] glass-panel p-5 animate-stagger-in"
                style={{ animationDelay: `${i * 80}ms`, opacity: a.unlocked ? 1 : 0.5 }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full text-[28px]" style={{ background: a.unlocked ? 'rgba(232,193,112,0.12)' : 'rgba(255,255,255,0.04)' }}>
                  {a.icon}
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-white/90">{a.name}</div>
                  <div className="mt-0.5 text-[12px] text-white/45">{a.desc}</div>
                  {!a.unlocked && <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">Заблокировано</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'devices' && (
          <div className="space-y-3 animate-fade-in">
            {devices.map((d, i) => (
              <div key={d.id} className="flex items-center gap-4 rounded-[14px] glass-panel p-4 animate-stagger-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
                  <Monitor className="h-4 w-4 text-white/50" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-medium text-white/85">{d.name}</div>
                  <div className="text-[12px] text-white/40">{d.location} · Последняя активность: {d.lastActive}</div>
                </div>
                {d.current && (
                  <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300/90">Это устройство</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="glass-panel rounded-[16px] p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">{label}</div>
      <div className="mt-2 text-display text-[32px] font-medium text-white/95">
        {value}<span className="text-[18px] text-white/40">{suffix}</span>
      </div>
    </div>
  );
}
