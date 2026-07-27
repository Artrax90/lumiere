import { useTranslation } from 'react-i18next';
import { Film, Tv, Search, Radio, Settings, Sparkles, Grid3x3 } from 'lucide-react';
import type { NavSection } from '@/components/TopNav';
import Focusable from './Focusable';

interface TvNavProps {
  active: NavSection;
  focusedId: string | null;
  onNavigate: (section: NavSection) => void;
}

const tvNavItems = [
  { id: 'home' as NavSection, labelKey: 'nav.home', icon: Film },
  { id: 'movies' as NavSection, labelKey: 'nav.movies', icon: Film },
  { id: 'shows' as NavSection, labelKey: 'nav.tv', icon: Tv },
  { id: 'anime' as NavSection, labelKey: 'nav.anime', icon: Sparkles },
  { id: 'iptv' as NavSection, labelKey: 'IPTV', icon: Radio },
  { id: 'collections' as NavSection, labelKey: 'nav.collections', icon: Grid3x3 },
  { id: 'search' as NavSection, labelKey: 'nav.search', icon: Search },
  { id: 'settings' as NavSection, labelKey: 'nav.settings', icon: Settings },
];

export default function TvNav({ active, focusedId, onNavigate }: TvNavProps) {
  const { t } = useTranslation();

  return (
    <nav className="fixed left-0 top-0 bottom-0 z-50 flex w-[220px] flex-col border-r border-white/[0.06] bg-[#0a0a0c]/95 px-4 py-8">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="relative flex h-7 w-7 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/70 to-amber-600/35 blur-[5px] opacity-55" />
          <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
        </div>
        <span className="text-display text-[20px] font-medium tracking-tight text-white/92">
          Lumière
        </span>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-1">
        {tvNavItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <Focusable
              key={item.id}
              id={`nav-${item.id}`}
              focusedId={focusedId}
              onSelect={() => onNavigate(item.id)}
              className={`group flex items-center gap-3 rounded-[12px] px-4 py-3 transition-cinematic ${
                isActive
                  ? 'bg-white/[0.08] text-white/95'
                  : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
              }`}
              focusClass="ring-2 ring-amber-300/80 ring-offset-1 ring-offset-[#0a0a0c]"
            >
              <Icon
                className={`h-5 w-5 ${isActive ? 'text-amber-300/80' : 'text-white/35'}`}
                strokeWidth={1.5}
              />
              <span className="text-[15px] font-medium">{t(item.labelKey)}</span>
            </Focusable>
          );
        })}
      </div>
    </nav>
  );
}
