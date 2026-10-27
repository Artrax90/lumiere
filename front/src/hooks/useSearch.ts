import { useState, useEffect, useRef } from 'react';
import { apiFetch, type Title } from '@/api/client';

export interface SearchSourceData {
  results: Title[];
  count: number;
}

export interface SearchResponse {
  results: Title[];
  tmdb?: SearchSourceData;
  kp?: SearchSourceData;
}

export function useSearch(query: string, debounceMs = 250) {
  const [data, setData] = useState<Title[]>([]);
  const [tmdbData, setTmdbData] = useState<SearchSourceData>({ results: [], count: 0 });
  const [kpData, setKpData] = useState<SearchSourceData>({ results: [], count: 0 });
  const [activeSource, setActiveSource] = useState<'tmdb' | 'kp'>('tmdb');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim()) {
      setData([]);
      setTmdbData({ results: [], count: 0 });
      setKpData({ results: [], count: 0 });
      setActiveSource('tmdb');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      apiFetch<SearchResponse>('/api/search', { q: query })
        .then((res) => {
          const tmdb = res.tmdb || { results: res.results || [], count: (res.results || []).length };
          const kp = res.kp || { results: [], count: 0 };

          if (kp.results) {
            kp.results.forEach((it) => {
              it.source = 'kp';
              it.kpId = it.id;
            });
          }

          setTmdbData(tmdb);
          setKpData(kp);

          // Auto-switch: if TMDB has 0 and KP has > 0, switch to KP
          if (tmdb.results.length === 0 && kp.results.length > 0) {
            setActiveSource('kp');
            setData(kp.results);
          } else {
            setActiveSource('tmdb');
            setData(tmdb.results);
          }

          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, debounceMs]);

  const switchSource = (source: 'tmdb' | 'kp') => {
    setActiveSource(source);
    setData(source === 'kp' ? kpData.results : tmdbData.results);
  };

  return {
    data,
    tmdbData,
    kpData,
    activeSource,
    switchSource,
    loading,
    error,
  };
}
