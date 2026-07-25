import { useState, useEffect } from 'react';
import { apiFetch, type Episode } from '@/api/client';

export function useSeason(tvId: number | null, seasonNumber: number | null) {
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

    apiFetch<{ episodes: Episode[] }>(`/api/tv/${tvId}/season/${seasonNumber}`)
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
  }, [tvId, seasonNumber]);

  return { data, loading, error };
}
