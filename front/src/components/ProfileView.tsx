import { useState } from 'react';
import { Clock, Heart, Trophy, Monitor, Star, LogOut } from 'lucide-react';
import type { Title } from '@/api/client';
import { usePopular } from '@/hooks/usePopular';
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

const profileStats = {
  totalHours: 847,
  titlesWatched: 213,
  completionRate: 78,
  topGenres: [
    { name: 'Sci-Fi', count: 42, pct: 100 },
    { name: 'Drama', count: 38, pct: 90 },
    { name: 'Thriller', count: 24, pct: 57 },
    { name: 'Anime', count: 19, pct: 45 },
    { name: 'Documentary', count: 15, pct: 36 },
  ],
  achievements: [
    { id: 'a1', name: 'Киноман', desc: 'Посмотрели 100+ фильмов', icon: '🎬', unlocked: true },
    { id: 'a2', name: 'Ночная сова', desc: 'Смотрели после 2:00 20 раз', icon: '🦉', unlocked: true },
    { id: 'a3', name: 'Перфекционист', desc: 'Закончили 5 полных сериалов', icon: '✅', unlocked: true },
    { id: 'a4', name: 'Коллекционер 4K', desc: 'Скачали 10 фильмов в 4K', icon: '💎', unlocked: true },
    { id: 'a5', name: 'Мировой путешественник', desc: 'Смотрели фильмы из 15 стран', icon: '🌍', unlocked: false },
    { id: 'a6', name: 'Фестивальный гурман', desc: 'Посмотрели 20 лауреатов премий', icon: '🏆', unlocked: false },
  ],
  devices: [
    { id: 'd1', name: 'Apple TV 4K', location: 'Гостиная', lastActive: 'Сейчас', current: true },
    { id: 'd2', name: 'Lumière TV', location: 'Спальня', lastActive: '2ч назад', current: false },
    { id: 'd3', name: 'iPhone 16 Pro', location: 'Мобильный', lastActive: 'Вчера', current: false },
  ],
};

export default function ProfileView({ onSelect }: ProfileViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const { user, logout } = useAuth();
  const { data: popular } = usePopular('movie');
  const favorites = popular.filter((t) => t.score >= 7).slice(0, 6);

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1300px]">
        <div className="mb-10 animate-row-reveal">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-200/90 to-amber-700/50 text-[28px] font-semibold text-black/65">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#08080a] bg-amber-400">
                <Trophy className="h-3.5 w-3.5 text-black/70" strokeWidth={1.5} />
              </div>
            </div>
            <div>
              <h1 className="text-display text-[32px] font-medium tracking-tight text-white/95">{user?.name || 'Пользователь'}</h1>
              <div className="mt-1 flex items-center gap-3 text-[13px] text-white/45">
                <span>{user?.email || ''}</span>
                <span className="text-white/15">·</span>
                <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-300/70" fill="currentColor" strokeWidth={0} />Киноман</span>
              </div>
            </div>
            <div className="ml-auto">
              <button
                onClick={logout}
                className="flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/60 transition-cinematic hover:text-white/90 hover:bg-white/[0.08]"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} />Выйти
              </button>
            </div>
          </div>
        </div>

        <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4 animate-row-reveal">
          <StatCard label="Часов просмотрено" value={profileStats.totalHours} suffix="ч" />
          <StatCard label="Просмотрено фильмов" value={profileStats.titlesWatched} />
          <StatCard label="Процент завершения" value={profileStats.completionRate} suffix="%" />
          <StatCard label="Достижения" value={profileStats.achievements.filter((a) => a.unlocked).length} suffix={`/${profileStats.achievements.length}`} />
        </div>

        <div className="mb-8 flex gap-1 border-b border-white/[0.06] animate-row-reveal">
          {tabs.map((t) => {
            const TIcon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-cinematic"
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
              <div className="space-y-3">
                {profileStats.topGenres.map((g) => (
                  <div key={g.name} className="flex items-center gap-4">
                    <div className="w-24 text-[13px] font-medium text-white/70">{g.name}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: 'linear-gradient(90deg, rgba(232,193,112,0.6), rgba(232,193,112,0.9))' }} />
                    </div>
                    <div className="w-10 text-right text-[12px] text-white/40">{g.count}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'favorites' && (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-fade-in">
            {favorites.map((t, i) => (
              <div key={t.id} className="animate-stagger-in" style={{ animationDelay: `${Math.min(i * 50, 600)}ms` }}>
                <Card title={t} variant="portrait" onSelect={onSelect} />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
            {profileStats.achievements.map((a, i) => (
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
            {profileStats.devices.map((d, i) => (
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
