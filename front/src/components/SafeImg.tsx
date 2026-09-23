import { useState, useEffect } from 'react';
import { serverUrl } from '@/api/server';

interface Props {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
  onError?: () => void;
}

export default function SafeImg({ src, alt, className, style, loading, onLoad, onError }: Props) {
  const fullUrl = serverUrl(src);
  const [imgSrc, setImgSrc] = useState(fullUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImgSrc(serverUrl(src));
    setFailed(false);
  }, [src]);

  const handleError = () => {
    // If native app and direct image load failed, attempt a fetch -> blob fallback
    const isNative = typeof window !== 'undefined' &&
      (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' ||
       (window.location.protocol === 'https:' && window.location.hostname === 'localhost') ||
       (window.location.protocol === 'http:' && window.location.hostname === 'localhost'));

    if (isNative && fullUrl && !imgSrc.startsWith('blob:')) {
      fetch(fullUrl)
        .then(res => {
          if (!res.ok) throw new Error('Fetch failed');
          return res.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          setImgSrc(blobUrl);
        })
        .catch(() => {
          setFailed(true);
          onError?.();
        });
      return;
    }

    setFailed(true);
    onError?.();
  };

  if (!fullUrl || failed) {
    return (
      <div
        className={`bg-white/[0.03] flex items-center justify-center ${className || ''}`}
        style={style}
      />
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onLoad={onLoad}
      onError={handleError}
    />
  );
}
