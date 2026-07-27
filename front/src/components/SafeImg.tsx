import { useState, useEffect } from 'react';
import { serverUrl } from '@/api/server';

interface Props {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
}

// Load images via fetch() so Capacitor's native HTTP handler intercepts them
export default function SafeImg({ src, alt, className, style, loading, onLoad }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const fullUrl = serverUrl(src);

  useEffect(() => {
    if (!fullUrl) {
      console.log('[SafeImg] empty URL for:', alt);
      return;
    }

    let revoked = false;
    let currentBlob: string | null = null;

    // Only use fetch→blob for cross-origin (native app)
    const isNative = window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' ||
      (window.location.protocol === 'https:' && window.location.hostname === 'localhost');

    if (!isNative) {
      setBlobUrl(fullUrl);
      return;
    }

    console.log('[SafeImg] fetching:', fullUrl.substring(0, 80));

    fetch(fullUrl)
      .then(res => {
        if (!res.ok) {
          console.warn('[SafeImg] fetch not ok:', res.status, fullUrl);
          throw new Error('Failed');
        }
        return res.blob();
      })
      .then(blob => {
        if (revoked) return;
        currentBlob = URL.createObjectURL(blob);
        setBlobUrl(currentBlob);
      })
      .catch((err) => {
        console.warn('[SafeImg] fetch failed:', fullUrl, err.message);
        if (!revoked) setBlobUrl(fullUrl); // fallback to direct URL
      });

    return () => {
      revoked = true;
      if (currentBlob) URL.revokeObjectURL(currentBlob);
    };
  }, [fullUrl]);

  if (!blobUrl) return null;

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onLoad={onLoad}
    />
  );
}
