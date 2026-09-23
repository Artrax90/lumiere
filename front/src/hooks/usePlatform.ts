// Platform detection for Lumiere (Web / Android / Tizen TV)

export function isTizen(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).tizen !== 'undefined' || /Tizen|SmartTV/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.protocol;
  return p === 'capacitor:' || p === 'file:' || (p === 'https:' && window.location.hostname === 'localhost');
}

export function isTV(): boolean {
  return isTizen();
}

export function isMobile(): boolean {
  return isAndroid() && !isTV();
}

export function isWeb(): boolean {
  return !isTizen() && !isAndroid();
}

export type Platform = 'web' | 'android' | 'tizen';

export function getPlatform(): Platform {
  if (isTizen()) return 'tizen';
  if (isAndroid()) return 'android';
  return 'web';
}
