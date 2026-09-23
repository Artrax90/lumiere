import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Settings, Film, Tv, Sparkles, Bell, Puzzle, Download, Grid3x3, Home, Radio, Bookmark } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { serverFetch } from '@/api/server';

export type NavSection = 'home' | 'movies' | 'shows' | 'anime' | 'live' | 'iptv' | 'my' | 'search' | 'library' | 'collections' | 'settings' | 'profile' | 'plugins' | 'downloads' | 'notifications';

interface TopNavProps {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

const navItems = [
  { id: 'home' as NavSection, labelKey: 'nav.home', icon: Film },
  { id: 'movies' as NavSection, labelKey: 'nav.movies', icon: Film },
  { id: 'shows' as NavSection, labelKey: 'nav.tv', icon: Tv },
  { id: 'anime' as NavSection, labelKey: 'nav.anime', icon: Sparkles },
  { id: 'iptv' as NavSection, labelKey: 'nav.iptv', icon: Tv },
  { id: 'my' as NavSection, labelKey: 'nav.my', icon: Bookmark },
  { id: 'collections' as NavSection, labelKey: 'nav.collections', icon: Grid3x3 },
];

const mobileNavItems = [
  { id: 'home' as NavSection, labelKey: 'nav.home', icon: Home },
  { id: 'movies' as NavSection, labelKey: 'nav.movies', icon: Film },
  { id: 'shows' as NavSection, labelKey: 'nav.tv', icon: Tv },
  { id: 'iptv' as NavSection, labelKey: 'nav.iptv', icon: Radio },
  { id: 'my' as NavSection, labelKey: 'nav.my', icon: Bookmark },
  { id: 'search' as NavSection, labelKey: 'nav.search', icon: Search },
];

export default function TopNav({ active, onNavigate }: TopNavProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeSession, setActiveSession] = useState<{ id: string; title: string; deviceName: string; isPaused: boolean } | null>(null);

  useEffect(() => {
    const fetchUnread = () => {
      serverFetch('/api/notifications')
        .then((r) => r.json())
        .then((data) => {
          if (data && typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          }
        })
        .catch(() => {});
    };

    const fetchActiveSessions = () => {
      serverFetch('/api/sessions/active')
        .then((r) => r.json())
        .then((data) => {
          const sessions = data?.sessions || [];
          const tvSession = sessions.find((s: any) => s.deviceType === 'tv' || (s.deviceName && s.deviceName.toLowerCase().includes('tv')));
          if (tvSession) {
            setActiveSession({
              id: tvSession.id,
              title: tvSession.mediaTitle || 'Медиа',
              deviceName: tvSession.deviceName || 'Smart TV',
              isPaused: !!tvSession.isPaused,
            });
          } else if (sessions.length > 0) {
            setActiveSession({
              id: sessions[0].id,
              title: sessions[0].mediaTitle || 'Медиа',
              deviceName: sessions[0].deviceName || 'Устройство',
              isPaused: !!sessions[0].isPaused,
            });
          } else {
            setActiveSession(null);
          }
        })
        .catch(() => {});
    };

    fetchUnread();
    fetchActiveSessions();
    const intervalNotifs = setInterval(fetchUnread, 30000);
    const intervalSessions = setInterval(fetchActiveSessions, 5000);
    return () => {
      clearInterval(intervalNotifs);
      clearInterval(intervalSessions);
    };
  }, [active]);

  return (
    <>
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out"
      style={{
        background: scrolled
          ? 'linear-gradient(180deg, rgba(5,5,6,0.82) 0%, rgba(5,5,6,0.38) 72%, transparent 100%)'
          : 'linear-gradient(180deg, rgba(5,5,6,0.52) 0%, transparent 100%)',
        backdropFilter: scrolled ? 'blur(24px) saturate(145%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(145%)' : 'none',
      }}
    >
      <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3 sm:px-6 md:px-8 md:py-4 lg:px-14">
        {/* Brand — refined, quieter */}
        <button
          onClick={() => onNavigate('home')}
          className="group flex items-center gap-3 shrink-0"
          aria-label="Lumiere home"
        >
          <div className="relative flex h-7 w-7 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/70 to-amber-600/35 blur-[5px] opacity-55 transition-opacity duration-500 group-hover:opacity-85" />
            <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
          </div>
          <span className="text-display text-[18px] font-medium tracking-tight text-white/92">
            Lumière
          </span>
        </button>

        {/* Primary nav — centered, visible only on large screens to prevent collisions */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 xl:flex">
          {navItems.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="group relative px-5 py-2 text-[14px] font-medium transition-lux"
                style={{
                  color: isActive ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.52)',
                }}
              >
                <span className="relative z-10">{t(item.labelKey)}</span>
                {/* Active underline — refined */}
                <span
                  className="absolute inset-x-4 -bottom-0.5 h-px transition-all duration-400 ease-out"
                  style={{
                    background: 'rgba(232,193,112,0.65)',
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? 'scaleX(1)' : 'scaleX(0.25)',
                  }}
                />
                {/* Hover wash — softer */}
                <span
                  className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                />
              </button>
            );
          })}
        </div>

        {/* Right cluster — refined icon sizes and responsive visibility */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {activeSession && (
            <button
              onClick={() => onNavigate('settings')}
              className="hidden 2xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[12px] font-medium hover:bg-emerald-500/20 transition-all shadow-lg mr-2"
              title="Сейчас воспроизводится. Нажмите для перехода в мониторинг сессий"
            >
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full ${activeSession.isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${activeSession.isPaused ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              </span>
              <span className="text-white/60 text-[11px]">{activeSession.deviceName}:</span>
              <span className="max-w-[130px] truncate text-white/95 font-medium">{activeSession.title}</span>
              {activeSession.isPaused && <span className="text-[10px] text-amber-300/80 font-mono">[пауза]</span>}
            </button>
          )}

          <button
            onClick={() => onNavigate('search')}
            className="group hidden xl:flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Search"
          >
            <Search className="h-[17px] w-[17px] text-white/55 transition-colors duration-300 group-hover:text-white/88" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onNavigate('notifications')}
            className="group relative flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Notifications"
          >
            <Bell className="h-[17px] w-[17px] text-white/70 transition-colors duration-300 group-hover:text-white/95" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 px-0.5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-black ring-2 ring-[#08080a] shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onNavigate('plugins')}
            className="group hidden xl:flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Plugin Store"
          >
            <Puzzle className="h-[17px] w-[17px] text-white/55 transition-colors duration-300 group-hover:text-white/88" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onNavigate('downloads')}
            className="group hidden xl:flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Downloads"
          >
            <Download className="h-[17px] w-[17px] text-white/55 transition-colors duration-300 group-hover:text-white/88" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className="group flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Settings"
          >
            <Settings className="h-[17px] w-[17px] text-white/55 transition-colors duration-300 group-hover:text-white/88" strokeWidth={1.5} />
          </button>
          <div className="hidden sm:block mx-1.5 sm:mx-2.5 h-5 w-px bg-white/[0.08]" />
          <button
            onClick={() => onNavigate('profile')}
            className="group flex items-center gap-2 rounded-full py-1 pl-1 pr-2 sm:pr-3 transition-lux hover:bg-white/[0.07]"
            aria-label="Profile"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-200/85 to-amber-700/55 text-[11px] font-semibold text-black/65">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="hidden text-[13px] font-medium text-white/65 transition-colors duration-300 group-hover:text-white/88 lg:inline">
              {user?.name || 'User'}
            </span>
          </button>
        </div>
      </nav>
    </header>

    {/* Mobile & Tablet bottom navigation */}
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0a0a0c]/90 backdrop-blur-xl xl:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around px-2 py-1.5">
        {mobileNavItems.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors"
              style={{ color: isActive ? '#e8c170' : 'rgba(255,255,255,0.4)' }}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
}

