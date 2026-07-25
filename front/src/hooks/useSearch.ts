import { useState, useEffect, useRef } from 'react';
import { apiFetch, type Title } from '@/api/client';

export function useSearch(query: string, debounceMs = 300) {
  const [data, setData] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim()) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      apiFetch<{ results: Title[] }>('/api/search', { q: query })
        .then((res) => {
          setData(res.results);
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

  return { data, loading, error };
}
