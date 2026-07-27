import { useState, useEffect } from 'react';
import { serverUrl } from '@/api/server';

// Check if we're on native platform
function isNative(): boolean {
  const p = window.location.protocol;
  return p === 'capacitor:' || p === 'file:' || (p === 'https:' && window.location.hostname === 'localhost');
}

// Hook that converts a relative URL to a blob URL via fetch on native
export function useBlobUrl(path: string): string {
  const fullUrl = serverUrl(path);
  const [blobUrl, setBlobUrl] = useState<string>(fullUrl);

  useEffect(() => {
    if (!fullUrl || !isNative()) {
      setBlobUrl(fullUrl);
      return;
    }

    let revoked = false;
    let currentBlob: string | null = null;

    fetch(fullUrl)
      .then(res => {
        if (!res.ok) throw new Error('Failed');
        return res.blob();
      })
      .then(blob => {
        if (revoked) return;
        currentBlob = URL.createObjectURL(blob);
        setBlobUrl(currentBlob);
      })
      .catch(() => {
        if (!revoked) setBlobUrl(fullUrl);
      });

    return () => {
      revoked = true;
      if (currentBlob) URL.revokeObjectURL(currentBlob);
    };
  }, [fullUrl]);

  return blobUrl;
}
