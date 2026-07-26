import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Settings, Film, Tv, Sparkles, Bell, Puzzle, Download, Grid3x3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export type NavSection = 'home' | 'movies' | 'shows' | 'anime' | 'live' | 'iptv' | 'search' | 'library' | 'collections' | 'settings' | 'profile' | 'plugins' | 'downloads' | 'notifications';

interface TopNavProps {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

const navItems = [
  { id: 'home' as NavSection, labelKey: 'nav.home', icon: Film },
  { id: 'movies' as NavSection, labelKey: 'nav.movies', icon: Film },
  { id: 'shows' as NavSection, labelKey: 'nav.tv', icon: Tv },
  { id: 'anime' as NavSection, labelKey: 'nav.anime', icon: Sparkles },
  { id: 'iptv' as NavSection, labelKey: 'IPTV', icon: Tv },
  { id: 'collections' as NavSection, labelKey: 'nav.collections', icon: Grid3x3 },
];

export default function TopNav({ active, onNavigate }: TopNavProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
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
      <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-8 py-5 lg:px-14">
        {/* Brand — refined, quieter */}
        <button
          onClick={() => onNavigate('home')}
          className="group flex items-center gap-3"
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

        {/* Primary nav — centered, calmer spacing */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 md:flex">
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

        {/* Right cluster — refined icon sizes */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onNavigate('search')}
            className="group flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Search"
          >
            <Search className="h-[17px] w-[17px] text-white/55 transition-colors duration-300 group-hover:text-white/88" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onNavigate('notifications')}
            className="group relative flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Notifications"
          >
            <Bell className="h-[17px] w-[17px] text-white/55 transition-colors duration-300 group-hover:text-white/88" strokeWidth={1.5} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-300/90 ring-2 ring-[#08080a]" />
          </button>
          <button
            onClick={() => onNavigate('plugins')}
            className="group flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
            aria-label="Plugin Store"
          >
            <Puzzle className="h-[17px] w-[17px] text-white/55 transition-colors duration-300 group-hover:text-white/88" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onNavigate('downloads')}
            className="group flex h-9 w-9 items-center justify-center rounded-full transition-lux hover:bg-white/[0.07]"
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
          <div className="mx-2.5 h-5 w-px bg-white/[0.08]" />
          <button
            onClick={() => onNavigate('profile')}
            className="group flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-lux hover:bg-white/[0.07]"
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
  );
}
