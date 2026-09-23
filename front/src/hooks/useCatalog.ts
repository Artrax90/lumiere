import { useState, useEffect } from 'react';
import { apiFetch, type Title } from '@/api/client';

export function useTopRated(mediaType: 'movie' | 'tv' = 'movie', page = 1) {
  const [data, setData] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const path = mediaType === 'movie' ? '/api/movies/top_rated' : '/api/tv/top_rated';
    apiFetch<{ results: Title[] }>(path, { page: String(page) })
      .then((res) => {
        if (!cancelled) {
          setData(res.results || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [mediaType, page]);

  return { data, loading };
}

export function useNowPlaying(page = 1) {
  const [data, setData] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{ results: Title[] }>('/api/movies/now_playing', { page: String(page) })
      .then((res) => {
        if (!cancelled) {
          setData(res.results || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page]);

  return { data, loading };
}

export function useGenreCatalog(mediaType: 'movie' | 'tv', genreId: number, page = 1) {
  const [data, setData] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const path = mediaType === 'movie' ? `/api/movies/genre/${genreId}` : `/api/tv/genre/${genreId}`;
    apiFetch<{ results: Title[] }>(path, { page: String(page) })
      .then((res) => {
        if (!cancelled) {
          setData(res.results || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [mediaType, genreId, page]);

  return { data, loading };
}
