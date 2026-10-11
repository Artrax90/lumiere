// Platform detection for Lumiere (Web / Android / Tizen TV)

export function isTizen(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).tizen !== 'undefined' || /Tizen|SmartTV/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof (window as any).Capacitor?.isNativePlatform === 'function' && (window as any).Capacitor.isNativePlatform()) {
    return true;
  }
  const p = window.location.protocol;
  return p === 'capacitor:' || p === 'file:' || (p === 'https:' && window.location.hostname === 'localhost');
}

export function isTV(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).__IS_TV__ !== undefined) return (window as any).__IS_TV__;

  // 1. Explicit user toggle or saved preference
  try {
    const pref = localStorage.getItem('lumiere_device_mode');
    if (pref === 'tv') return true;
    if (pref === 'mobile') return false;
  } catch {}

  // 2. Tizen TV is always TV
  if (isTizen()) return true;

  // 3. Known TV User-Agent identifiers
  if (/Android.*TV|GoogleTV|Large Screen|MiTV|AFTT|BRAVIA|SmartTV|Android.*Box|Nexus Player|SHIELD|Chromecast|ATV|box|tv|CrKey|AppleTV/i.test(navigator.userAgent)) {
    return true;
  }

  // 4. Android native app running in landscape widescreen (TV stick / Android TV / Box)
  if (isAndroid()) {
    const isLandscape = window.screen.width > window.screen.height || window.innerWidth > window.innerHeight;
    const isWideScreen = Math.max(window.screen.width, window.innerWidth) >= 900;
    if (isLandscape && isWideScreen) {
      return true;
    }
  }

  return false;
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
