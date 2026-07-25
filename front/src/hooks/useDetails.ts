import { useState, useEffect } from 'react';
import { apiFetch, type Title } from '@/api/client';

export function useDetails(id: number | null, mediaType: 'movie' | 'tv' = 'movie') {
  const [data, setData] = useState<Title | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const basePath = mediaType === 'movie' ? '/api/movies' : '/api/tv';
    apiFetch<Title>(`${basePath}/${id}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
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
  }, [id, mediaType]);

  return { data, loading, error };
}
