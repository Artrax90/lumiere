import { useState, useCallback, useRef, useEffect } from 'react';

import type { Title, Episode } from '@/api/client';
import { useTrending } from '@/hooks/useTrending';
import { useAuth } from '@/contexts/AuthContext';
import { syncClient } from '@/api/sync';
import { serverFetch } from '@/api/server';
import ServerSetup from '@/components/ServerSetup';
import { isTizen } from '@/hooks/usePlatform';
import TvNav from '@/tv/TvNav';
import TvHome from '@/tv/TvHome';
import TvPlayer from '@/tv/TvPlayer';
import { useFocus, type FocusableElement } from '@/tv/useFocus';

const tv = isTizen();

// Save playback position to localStorage with timestamp and title info
function savePlaybackPosition(titleId: number, time: number, title?: Title) {
  try {
    const positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
    const entry: any = { time, timestamp: Date.now() };
    if (title) {
      entry.title = {
        id: title.id,
        name: title.name,
        poster: title.poster,
        backdrop: title.backdrop,
        year: title.year,
        type: title.type,
      };
    }
    positions[titleId] = entry;
    localStorage.setItem('playback_positions', JSON.stringify(positions));
  } catch {}
}

// Get playback position from localStorage
function getPlaybackPosition(titleId: number): number {
  try {
    const positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
    const entry = positions[titleId];
    return typeof entry === 'object' ? entry.time : (entry || 0);
  } catch {
    return 0;
  }
}

// Get all playback positions with timestamps and title info
export function getPlaybackPositions(): Record<number, { time: number; timestamp: number; title?: Title }> {
  try {
    const raw = JSON.parse(localStorage.getItem('playback_positions') || '{}');
    const result: Record<number, { time: number; timestamp: number; title?: Title }> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value === 'object' && value !== null) {
        result[Number(id)] = value as { time: number; timestamp: number; title?: Title };
      } else {
        // Legacy format: just a number
        result[Number(id)] = { time: value as number, timestamp: 0 };
      }
    }
    return result;
  } catch {
    return {};
  }
}

import AmbientBackground from '@/components/AmbientBackground';
import TopNav, { type NavSection } from '@/components/TopNav';
import LoginView from '@/components/LoginView';
import SetupView from '@/components/SetupView';
import Home from '@/components/Home';
import MovieDetails from '@/components/MovieDetails';
import SearchView from '@/components/SearchView';
import Player from '@/components/Player';
import SettingsView from '@/components/SettingsView';
import CollectionsView from '@/components/CollectionsView';
import MoviesLibrary from '@/components/MoviesLibrary';
import TVShows from '@/components/TVShows';
import EpisodeDetails from '@/components/EpisodeDetails';
import AnimeView from '@/components/AnimeView';
import ProfileView from '@/components/ProfileView';
import PluginStore from '@/components/PluginStore';
import DownloadManager from '@/components/DownloadManager';
import NotificationsView from '@/components/NotificationsView';
import IPTVView from '@/components/IPTVView';
import MyView from '@/components/MyView';

import { useAppRoute, type AppRoute } from '@/hooks/useAppRoute';
import { apiFetch } from '@/api/client';
import { isWeb } from '@/hooks/usePlatform';

type Mood = 'warm' | 'cool' | 'neutral' | 'tension' | 'playful' | 'organic';

export default function App() {
  const { user, loading, needsSetup, serverReady, connectionError } = useAuth();

  const handleRoutePopState = useCallback((newRoute: AppRoute) => {
    setSection(newRoute.section);
    if (!newRoute.id) {
      setSelectedTitle(null);
      setSelectedShow(null);
      setSelectedEpisode(null);
    } else if (newRoute.section === 'movies') {
      setSelectedShow(null);
      setSelectedEpisode(null);
      apiFetch<Title>(`/api/movies/${newRoute.id}`)
        .then((m) => setSelectedTitle(m))
        .catch(() => {});
    } else if (newRoute.section === 'shows') {
      setSelectedTitle(null);
      setSelectedEpisode(null);
      apiFetch<Title>(`/api/tv/${newRoute.id}`)
        .then((s) => setSelectedShow(s))
        .catch(() => {});
    }
  }, []);

  const { route, pushRoute, replaceRoute } = useAppRoute(handleRoutePopState);
  const [section, setSection] = useState<NavSection>(() => route.section);
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [selectedShow, setSelectedShow] = useState<Title | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Title | null>(null);
  const [playingExternalSubs, setPlayingExternalSubs] = useState<any[]>([]);
  const [mood, setMood] = useState<Mood>('warm');
  const [tvNavFocused, setTvNavFocused] = useState<string | null>(null);

  // Load initial deep link metadata if opened with /film/:id or /series/:id
  useEffect(() => {
    if (!route.id) return;
    if (route.section === 'movies') {
      apiFetch<Title>(`/api/movies/${route.id}`)
        .then((m) => setSelectedTitle(m))
        .catch(() => {});
    } else if (route.section === 'shows') {
      apiFetch<Title>(`/api/tv/${route.id}`)
        .then((s) => setSelectedShow(s))
        .catch(() => {});
    }
  }, []);

  const { data: trendingMovies } = useTrending('movie');

  const handleNavigate = useCallback((s: NavSection) => {
    setSelectedTitle(null);
    setSelectedEpisode(null);
    if (s !== 'shows') {
      setSelectedShow(null);
      setActiveEpisodeId(null);
    }
    setSection(s);
    pushRoute(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pushRoute]);

  // TV focus management
  const tvNavElements: FocusableElement[] = [
    { id: 'nav-home', row: 0, col: 0, onSelect: () => handleNavigate('home') },
    { id: 'nav-movies', row: 1, col: 0, onSelect: () => handleNavigate('movies') },
    { id: 'nav-shows', row: 2, col: 0, onSelect: () => handleNavigate('shows') },
    { id: 'nav-anime', row: 3, col: 0, onSelect: () => handleNavigate('anime') },
    { id: 'nav-iptv', row: 4, col: 0, onSelect: () => handleNavigate('iptv') },
    { id: 'nav-collections', row: 5, col: 0, onSelect: () => handleNavigate('collections') },
    { id: 'nav-search', row: 6, col: 0, onSelect: () => handleNavigate('search') },
    { id: 'nav-settings', row: 7, col: 0, onSelect: () => handleNavigate('settings') },
  ];

  useFocus({
    elements: tv ? tvNavElements : [],
    enabled: tv,
    initialFocus: 'nav-home',
    onBack: () => {
      if (section !== 'home') handleNavigate('home');
    },
  });

  // Start sync when user is authenticated
  useEffect(() => {
    if (user) {
      // Merge local data with server on login
      syncClient.mergeWithServer();
      // Start periodic sync (every 30 seconds)
      syncClient.start(30000);
    } else {
      syncClient.stop();
    }

    return () => {
      syncClient.stop();
    };
  }, [user]);

  const handleMoodChange = useCallback((m: Mood) => {
    setMood(m);
  }, []);

  const handleSelect = useCallback((title: Title) => {
    if (title.type === 'tv' || title.type === 'show') {
      let initSeason = 1;
      try {
        const saved = localStorage.getItem(`last_season_${title.id}`);
        if (saved) initSeason = parseInt(saved, 10) || 1;
      } catch {}
      setSelectedShow(title);
      setSelectedSeason(initSeason);
      setActiveEpisodeId(null);
      setSelectedEpisode(null);
      setSelectedTitle(null);
      setSection('shows');
      pushRoute('shows', title.id, title.name);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSelectedTitle(title);
    setSelectedEpisode(null);
    pushRoute(section === 'shows' ? 'shows' : 'movies', title.id, title.name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pushRoute, section]);

  const handleCloseMovieDetails = useCallback(() => {
    setSelectedTitle(null);
    if (isWeb() && typeof window !== 'undefined' && window.history.state?.id) {
      window.history.back();
    } else {
      replaceRoute(section || 'movies');
    }
  }, [section, replaceRoute]);

  const handleSelectShow = useCallback((show: Title | null) => {
    setSelectedShow(show);
    if (show) {
      pushRoute('shows', show.id, show.name);
    } else {
      if (isWeb() && typeof window !== 'undefined' && window.history.state?.id) {
        window.history.back();
      } else {
        replaceRoute('shows');
      }
    }
  }, [pushRoute, replaceRoute]);

  const lastSavedTime = useRef(0);

  const handlePlay = useCallback((title: Title, externalSubs?: any[]) => {
    if (!title.videoUrl) {
      handleSelect(title);
      return;
    }
    setPlaying(title);
    setPlayingExternalSubs(externalSubs || []);
    lastSavedTime.current = 0;

    // Report activity to server
    serverFetch('/api/user/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'watching',
        titleId: title.id,
        titleName: title.name,
      }),
    }).catch(() => {});
  }, [handleSelect]);

  const handleTimeUpdate = useCallback((time: number) => {
    // Save position every 5 seconds
    if (playing && Math.abs(time - lastSavedTime.current) > 5) {
      savePlaybackPosition(playing.id, time, playing);
      lastSavedTime.current = time;

      // Sync to server
      syncClient.saveWatchProgress({
        tmdbId: playing.id,
        mediaType: playing.type || 'movie',
        titleName: playing.name,
        poster: playing.poster,
        progress: Math.floor(time),
        timestamp: Date.now(),
      });
    }
  }, [playing]);

  const handlePlayerExit = useCallback(() => {
    if (playing) {
      savePlaybackPosition(playing.id, lastSavedTime.current, playing);
    }
    const isShow = playing?.type === 'tv' || playing?.type === 'anime' || Boolean((playing as any)?.episode);
    setPlaying(null);
    // Return directly to the series view with the current season & active episode highlighted
    if (selectedEpisode) {
      setSelectedEpisode(null);
      setSection('shows');
    } else if (isShow) {
      setSection('shows');
    }
  }, [playing, selectedEpisode]);

  const handleEpisodeSelect = useCallback((ep: Episode) => {
    setSelectedEpisode(ep);
    setSelectedSeason(ep.season);
    setActiveEpisodeId(ep.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);


  // Handle Android back button / swipe-back gesture
  useEffect(() => {
    const p = window.location.protocol;
    const isNative = p === 'capacitor:' || p === 'file:' || (p === 'https:' && window.location.hostname === 'localhost');
    if (!isNative) return;

    let removeListener: (() => void) | null = null;

    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('backButton', ({ canGoBack }) => {
        if (playing) {
          handlePlayerExit();
        } else if (selectedEpisode) {
          setSelectedEpisode(null);
          setSection('shows');
        } else if (selectedShow) {
          setSelectedShow(null);
        } else if (selectedTitle) {
          setSelectedTitle(null);
        } else if (section === 'settings') {
          const evt = new Event('settings-back', { cancelable: true });
          const handled = !document.dispatchEvent(evt);
          if (!handled) {
            setSection('home');
          }
        } else if (section !== 'home') {
          setSection('home');
        } else if (canGoBack) {
          CapApp.exitApp();
        }
      }).then(l => { removeListener = () => l.remove(); });
    });

    return () => { removeListener?.(); };
  }, [playing, selectedEpisode, selectedShow, selectedTitle, section, handlePlayerExit]);

  if (!serverReady) {
    return <ServerSetup onConnected={() => {}} initialError={connectionError} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <>
        <AmbientBackground mood="warm" />
        <SetupView />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AmbientBackground mood="warm" />
        <LoginView />
      </>
    );
  }

  return (
    <div className={`relative min-h-screen w-full ${tv ? 'pl-[220px]' : ''}`}>
      <AmbientBackground mood={mood} />

      {tv ? (
        <TvNav active={section} focusedId={tvNavFocused} onNavigate={handleNavigate} />
      ) : (
        <TopNav active={section} onNavigate={handleNavigate} />
      )}

      <main className="pb-20 xl:pb-0">
        {playing ? (
          tv ? (
            <TvPlayer
              title={playing}
              onExit={handlePlayerExit}
              initialTime={getPlaybackPosition(playing.id)}
              onTimeUpdate={handleTimeUpdate}
            />
          ) : (
            <Player
              title={playing}
              onExit={handlePlayerExit}
              initialTime={getPlaybackPosition(playing.id)}
              onTimeUpdate={handleTimeUpdate}
              externalSubs={playingExternalSubs}
            />
          )
        ) : selectedEpisode ? (
          <EpisodeDetails
            episode={selectedEpisode}
            series={selectedShow || undefined}
            onBack={() => {
              setSelectedEpisode(null);
              setSection('shows');
              if (selectedShow) {
                replaceRoute('shows', selectedShow.id, selectedShow.name);
              } else {
                replaceRoute('shows');
              }
            }}
            onPlay={handlePlay}
            onSelectEpisode={handleEpisodeSelect}
          />
        ) : selectedTitle ? (
          <MovieDetails
            title={selectedTitle}
            onBack={handleCloseMovieDetails}
            onPlay={handlePlay}
            onSelect={handleSelect}
          />
        ) : section === 'home' ? (
          tv ? (
            <TvHome onSelect={handleSelect} onPlay={handlePlay} />
          ) : (
            <Home
              heroTitles={trendingMovies}
              onSelect={handleSelect}
              onPlay={handlePlay}
              onMoodChange={handleMoodChange}
              mood={mood}
            />
          )
        ) : section === 'search' ? (
          <SearchView onSelect={handleSelect} initialQuery={route.searchQuery} />
        ) : (section === 'live' || section === 'iptv') ? (
          <IPTVView onPlay={handlePlay} />
        ) : section === 'settings' ? (
          <SettingsView onClose={() => handleNavigate('home')} />
        ) : section === 'collections' ? (
          <CollectionsView onSelect={handleSelect} />
        ) : section === 'my' ? (
          <MyView onSelect={handleSelect} />
        ) : section === 'movies' ? (
          <MoviesLibrary onSelect={handleSelect} />
        ) : section === 'shows' ? (
          <TVShows
            onSelect={handleSelect}
            onPlay={handlePlay}
            onEpisodeSelect={handleEpisodeSelect}
            selectedShow={selectedShow}
            onSelectShow={handleSelectShow}
            season={selectedSeason}
            onSelectSeason={setSelectedSeason}
            activeEpisodeId={activeEpisodeId}
          />
        ) : section === 'anime' ? (
          <AnimeView onSelect={handleSelect} onPlay={handlePlay} />
        ) : section === 'profile' ? (
          <ProfileView onSelect={handleSelect} />
        ) : section === 'plugins' ? (
          <PluginStore />
        ) : section === 'downloads' ? (
          <DownloadManager />
        ) : section === 'notifications' ? (
          <NotificationsView onSelect={handleSelect} titles={trendingMovies} />
        ) : (
          <Home
            heroTitles={trendingMovies}
            onSelect={handleSelect}
            onPlay={handlePlay}
            onMoodChange={handleMoodChange}
            mood={mood}
          />
        )}
      </main>
    </div>
  );
}
