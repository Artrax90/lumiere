import { useState, useEffect } from 'react';
import { apiFetch, type Title } from '@/api/client';

export function useTrending(mediaType: 'movie' | 'tv' = 'movie') {
  const [data, setData] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const path = mediaType === 'movie' ? '/api/movies/trending' : '/api/tv/trending';
    apiFetch<{ results: Title[] }>(path)
      .then((res) => {
        if (!cancelled) {
          setData(res.results);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [mediaType]);

  return { data, loading, error };
}
