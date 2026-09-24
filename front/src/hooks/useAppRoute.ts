import { useState, useEffect, useCallback } from 'react';
import type { NavSection } from '@/components/TopNav';
import { isWeb } from './usePlatform';

export interface AppRoute {
  section: NavSection;
  id?: number;
  type?: 'movie' | 'tv' | 'anime';
  searchQuery?: string;
}

const SECTION_PATHS: Record<NavSection, string> = {
  home: '/',
  movies: '/film',
  shows: '/series',
  anime: '/anime',
  iptv: '/iptv',
  live: '/iptv',
  my: '/my',
  collections: '/collections',
  search: '/search',
  settings: '/settings',
  profile: '/profile',
  plugins: '/plugins',
  downloads: '/downloads',
  notifications: '/notifications',
  library: '/my',
};

const SECTION_TITLES: Partial<Record<NavSection, string>> = {
  home: 'Lumière',
  movies: 'Фильмы — Lumière',
  shows: 'Сериалы — Lumière',
  anime: 'Аниме — Lumière',
  iptv: 'IPTV — Lumière',
  live: 'IPTV — Lumière',
  my: 'Моё — Lumière',
  collections: 'Коллекции — Lumière',
  search: 'Поиск — Lumière',
  settings: 'Настройки — Lumière',
  profile: 'Профиль — Lumière',
  plugins: 'Плагины — Lumière',
  downloads: 'Загрузки — Lumière',
  notifications: 'Уведомления — Lumière',
};

export function getSectionPath(section: NavSection, id?: number): string {
  if (id) {
    if (section === 'movies') return `/film/${id}`;
    if (section === 'shows') return `/series/${id}`;
    if (section === 'anime') return `/anime/${id}`;
  }
  return SECTION_PATHS[section] || '/';
}

export function parseRoute(pathname: string, searchStr = ''): AppRoute {
  if (!pathname || pathname === '/' || pathname === '/index.html') {
    return { section: 'home' };
  }

  // Remove leading/trailing slashes
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  const segments = clean.split('/');
  const first = segments[0]?.toLowerCase() || '';
  const second = segments[1];
  const numId = second && /^\d+$/.test(second) ? parseInt(second, 10) : undefined;

  let query: string | undefined;
  if (searchStr) {
    try {
      const sp = new URLSearchParams(searchStr);
      query = sp.get('q') || sp.get('search') || undefined;
    } catch {}
  }

  switch (first) {
    case 'film':
    case 'films':
    case 'movie':
    case 'movies':
      return { section: 'movies', id: numId, type: 'movie' };

    case 'series':
    case 'shows':
    case 'serials':
      return { section: 'shows', id: numId, type: 'tv' };

    case 'anime':
      return { section: 'anime', id: numId, type: 'anime' };

    case 'iptv':
    case 'live':
    case 'tv-live':
      return { section: 'iptv' };

    case 'my':
    case 'favorites':
    case 'watchlist':
      return { section: 'my' };

    case 'collections':
      return { section: 'collections' };

    case 'search':
      return { section: 'search', searchQuery: query };

    case 'settings':
      return { section: 'settings' };

    case 'profile':
      return { section: 'profile' };

    case 'plugins':
      return { section: 'plugins' };

    case 'downloads':
      return { section: 'downloads' };

    case 'notifications':
      return { section: 'notifications' };

    default:
      return { section: 'home' };
  }
}

export function updateDocumentTitle(section: NavSection, titleName?: string) {
  if (typeof document === 'undefined') return;
  if (titleName) {
    document.title = `${titleName} — Lumière`;
  } else {
    document.title = SECTION_TITLES[section] || 'Lumière';
  }
}

export function useAppRoute(onRouteChange?: (newRoute: AppRoute) => void) {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === 'undefined' || !isWeb()) {
      return { section: 'home' };
    }
    return parseRoute(window.location.pathname, window.location.search);
  });

  const pushRoute = useCallback((section: NavSection, id?: number, titleName?: string) => {
    const nextRoute: AppRoute = { section, id };
    setRoute(nextRoute);
    updateDocumentTitle(section, titleName);

    if (isWeb() && typeof window !== 'undefined') {
      const path = getSectionPath(section, id);
      if (window.location.pathname !== path) {
        window.history.pushState({ section, id, titleName }, '', path);
      }
    }
  }, []);

  const replaceRoute = useCallback((section: NavSection, id?: number, titleName?: string) => {
    const nextRoute: AppRoute = { section, id };
    setRoute(nextRoute);
    updateDocumentTitle(section, titleName);

    if (isWeb() && typeof window !== 'undefined') {
      const path = getSectionPath(section, id);
      if (window.location.pathname !== path) {
        window.history.replaceState({ section, id, titleName }, '', path);
      }
    }
  }, []);

  // Listen to browser Back / Forward (popstate)
  useEffect(() => {
    if (!isWeb() || typeof window === 'undefined') return;

    const handlePopState = (e: PopStateEvent) => {
      const parsed = parseRoute(window.location.pathname, window.location.search);
      setRoute(parsed);
      updateDocumentTitle(parsed.section, e.state?.titleName);
      if (onRouteChange) {
        onRouteChange(parsed);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onRouteChange]);

  return {
    route,
    pushRoute,
    replaceRoute,
    getSectionPath,
  };
}
