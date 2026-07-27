import { useState, useEffect } from 'react';
import { Play, Loader2 } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch } from '@/api/server';

interface SearchResult {
  id: string;
  title: string;
  year: number;
  poster: string;
  type: 'movie' | 'series';
  provider: string;
}

interface SourceSelectorProps {
  title: Title;
  onPlay: (url: string) => void;
}

const providerLabels: Record<string, string> = {
  collaps: 'Collaps',
  hdvb: 'HDVB',
  phantom: 'Phantom',
};

export default function SourceSelector({ title, onPlay }: SourceSelectorProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const search = async () => {
      setLoading(true);
      try {
        const res = await serverFetch(`/api/online/search?q=${encodeURIComponent(title.name)}&type=${title.type === 'tv' ? 'series' : 'movie'}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [title.name, title.type]);

  const handlePlay = async (provider: string, id: string) => {
    setPlayingId(`${provider}-${id}`);
    try {
      // Use HLS proxy that handles token refresh
      const hlsUrl = `/api/online/hls/${provider}/${encodeURIComponent(id)}`;
      onPlay(hlsUrl);
    } catch (err) {
      console.error('Stream error:', err);
    } finally {
      setPlayingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-[13px] text-white/50 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Поиск источников...
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-[13px] text-white/40 py-4">
        Источники не найдены
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-[14px] font-medium text-white/85">Источники</h3>
      {results.map((item) => {
        const key = `${item.provider}-${item.id}`;
        const isPlaying = playingId === key;
        return (
          <div key={key} className="flex items-center justify-between rounded-[12px] bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-white/85 truncate">{item.title}</div>
              <div className="text-[11px] text-white/40 mt-0.5">
                {providerLabels[item.provider] || item.provider} · {item.year || '—'}
              </div>
            </div>
            <button
              onClick={() => handlePlay(item.provider, item.id)}
              disabled={isPlaying}
              className="flex items-center gap-2 rounded-full bg-amber-300/90 px-4 py-2 text-[12px] font-semibold text-black/80 transition-cinematic hover:bg-amber-200/90 disabled:opacity-50"
            >
              {isPlaying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              Смотреть
            </button>
          </div>
        );
      })}
    </div>
  );
}
