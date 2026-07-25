import { useState, useEffect } from 'react';
import { apiFetch, type Genre } from '@/api/client';

export function useGenres(mediaType: 'movie' | 'tv' = 'movie') {
  const [data, setData] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<{ genres: Genre[] }>('/api/genres', { type: mediaType })
      .then((res) => {
        if (!cancelled) {
          setData(res.genres);
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
