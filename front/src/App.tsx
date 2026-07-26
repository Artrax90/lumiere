import { useState, useCallback, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { Title, Episode } from '@/api/client';
import { useTrending } from '@/hooks/useTrending';
import { useAuth } from '@/contexts/AuthContext';

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
import LiveTV from '@/components/LiveTV';
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

type Mood = 'warm' | 'cool' | 'neutral' | 'tension' | 'playful' | 'organic';

export default function App() {
  const { user, loading, needsSetup } = useAuth();
  const [section, setSection] = useState<NavSection>('home');
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [playing, setPlaying] = useState<Title | null>(null);
  const [playingExternalSubs, setPlayingExternalSubs] = useState<any[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [mood, setMood] = useState<Mood>('warm');

  const { data: trendingMovies } = useTrending('movie');

  const handleMoodChange = useCallback((m: Mood) => {
    setMood(m);
  }, []);

  const handleSelect = useCallback((title: Title) => {
    setSelectedTitle(title);
    setSelectedEpisode(null);
    setSection('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const lastSavedTime = useRef(0);

  const handlePlay = useCallback((title: Title, externalSubs?: any[]) => {
    setPlaying(title);
    setPlayingExternalSubs(externalSubs || []);
    lastSavedTime.current = 0;

    // Report activity to server
    const token = localStorage.getItem('lumiere_access');
    if (token) {
      fetch('/api/user/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'watching',
          titleId: title.id,
          titleName: title.name,
        }),
      }).catch(() => {});
    }
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    // Save position every 5 seconds
    if (playing && Math.abs(time - lastSavedTime.current) > 5) {
      savePlaybackPosition(playing.id, time, playing);
      lastSavedTime.current = time;
    }
  }, [playing]);

  const handlePlayerExit = useCallback(() => {
    if (playing) {
      savePlaybackPosition(playing.id, lastSavedTime.current, playing);
    }
    setPlaying(null);
  }, [playing]);

  const handleEpisodeSelect = useCallback((ep: Episode) => {
    setSelectedEpisode(ep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleNavigate = useCallback((s: NavSection) => {
    setSelectedTitle(null);
    setSelectedEpisode(null);
    setSection(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AmbientBackground mood="warm" />
        {needsSetup ? <SetupView /> : <LoginView />}
      </>
    );
  }

  return (
    <div className="relative min-h-screen w-full">
      <AmbientBackground mood={mood} />

      <TopNav active={section} onNavigate={handleNavigate} />

      {!playing && (
        <button
          onClick={() => setAiOpen(true)}
          className="fixed bottom-8 right-8 z-40 flex items-center gap-2 rounded-full glass-strong px-5 py-3.5 text-[13px] font-medium text-white/85 shadow-2xl transition-cinematic hover:scale-105 hover:text-white"
          aria-label="Open assistant"
        >
          <Sparkles className="h-4 w-4 text-amber-300" strokeWidth={1.5} />
          Ask Lumière
        </button>
      )}

      <main>
        {playing ? (
          <Player
            title={playing}
            onExit={handlePlayerExit}
            initialTime={getPlaybackPosition(playing.id)}
            onTimeUpdate={handleTimeUpdate}
            externalSubs={playingExternalSubs}
          />
        ) : selectedEpisode ? (
          <EpisodeDetails
            episode={selectedEpisode}
            onBack={() => setSelectedEpisode(null)}
            onPlay={handlePlay}
            onSelectEpisode={handleEpisodeSelect}
          />
        ) : selectedTitle ? (
          <MovieDetails
            title={selectedTitle}
            onBack={() => setSelectedTitle(null)}
            onPlay={handlePlay}
            onSelect={handleSelect}
          />
        ) : section === 'home' ? (
          <Home
            heroTitles={trendingMovies}
            onSelect={handleSelect}
            onPlay={handlePlay}
            onMoodChange={handleMoodChange}
            mood={mood}
          />
        ) : section === 'search' ? (
          <SearchView onSelect={handleSelect} />
        ) : section === 'live' ? (
          <LiveTV onSelect={handlePlay} titles={trendingMovies} />
        ) : section === 'settings' ? (
          <SettingsView onClose={() => setSection('home')} />
        ) : section === 'collections' ? (
          <CollectionsView onSelect={handleSelect} />
        ) : section === 'movies' ? (
          <MoviesLibrary onSelect={handleSelect} />
        ) : section === 'shows' ? (
          <TVShows onSelect={handleSelect} onPlay={handlePlay} onEpisodeSelect={handleEpisodeSelect} />
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
