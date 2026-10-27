import { useState, useEffect } from 'react';
import { apiFetch, type Title } from '@/api/client';

export function useDetails(id: number | null, mediaType: 'movie' | 'tv' = 'movie', source?: 'tmdb' | 'kp') {
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

    const isKp = source === 'kp';
    const path = isKp ? `/api/kp/${id}` : (mediaType === 'movie' ? `/api/movies/${id}` : `/api/tv/${id}`);
    apiFetch<Title>(path)
      .then((res) => {
        if (!cancelled) {
          if (isKp && res) {
            res.source = 'kp';
            res.kpId = res.id;
          }
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
  }, [id, mediaType, source]);

  return { data, loading, error };
}
