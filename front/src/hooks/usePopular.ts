import { useState, useEffect } from 'react';
import { apiFetch, type Title } from '@/api/client';

export function usePopular(mediaType: 'movie' | 'tv' = 'movie', page = 1) {
  const [data, setData] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const path = mediaType === 'movie' ? '/api/movies/popular' : '/api/tv/popular';
    apiFetch<{ results: Title[] }>(path, { page: String(page) })
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
  }, [mediaType, page]);

  return { data, loading, error };
}
