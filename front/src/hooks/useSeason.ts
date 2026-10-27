import { useState, useEffect } from 'react';
import { apiFetch, type Episode } from '@/api/client';

export function useSeason(tvId: number | null, seasonNumber: number | null, source?: 'tmdb' | 'kp') {
  const [data, setData] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tvId || seasonNumber === null) {
      setData([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const isKp = source === 'kp';
    const path = isKp ? `/api/kp/${tvId}/season/${seasonNumber}` : `/api/tv/${tvId}/season/${seasonNumber}`;

    apiFetch<{ episodes: Episode[] }>(path)
      .then((res) => {
        if (!cancelled) {
          setData(res.episodes);
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
  }, [tvId, seasonNumber, source]);

  return { data, loading, error };
}
