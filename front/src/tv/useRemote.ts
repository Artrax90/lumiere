import { useEffect } from 'react';

// Samsung Tizen TV remote key codes
export const TV_KEYS = {
  // D-pad
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  ENTER: 13,
  // Navigation
  BACK: 10009,
  EXIT: 10182,
  // Media
  PLAY_PAUSE: 10252,
  REWIND: 412,
  FAST_FORWARD: 417,
  // Colors
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
  // Volume
  VOL_UP: 447,
  VOL_DOWN: 448,
  // Channel
  CH_UP: 427,
  CH_DOWN: 428,
} as const;

// Register Samsung TV keys for event handling
function registerTvKeys() {
  try {
    const tizen = (window as any).tizen;
    if (!tizen?.tvinputdevice) return;

    const keysToRegister = [
      'MediaPlayPause',
      'MediaRewind',
      'MediaFastForward',
      'ColorF0Red',
      'ColorF1Green',
      'ColorF2Yellow',
      'ColorF3Blue',
      'VolumeUp',
      'VolumeDown',
      'ChannelUp',
      'ChannelDown',
    ];

    tizen.tvinputdevice.registerKeyBatch(keysToRegister);
  } catch {
    // Not on Tizen — ignore
  }
}

interface UseRemoteOptions {
  onBack?: () => void;
  onExit?: () => void;
  onPlayPause?: () => void;
  onRed?: () => void;
  onGreen?: () => void;
  onYellow?: () => void;
  onBlue?: () => void;
}

export function useRemote(options: UseRemoteOptions = {}) {
  useEffect(() => {
    // Register TV keys on mount
    registerTvKeys();

    const handler = (e: KeyboardEvent) => {
      switch (e.keyCode) {
        case TV_KEYS.BACK:
          options.onBack?.();
          e.preventDefault();
          break;
        case TV_KEYS.EXIT:
          options.onExit?.();
          e.preventDefault();
          break;
        case TV_KEYS.PLAY_PAUSE:
          options.onPlayPause?.();
          e.preventDefault();
          break;
        case TV_KEYS.RED:
          options.onRed?.();
          e.preventDefault();
          break;
        case TV_KEYS.GREEN:
          options.onGreen?.();
          e.preventDefault();
          break;
        case TV_KEYS.YELLOW:
          options.onYellow?.();
          e.preventDefault();
          break;
        case TV_KEYS.BLUE:
          options.onBlue?.();
          e.preventDefault();
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [options.onBack, options.onExit, options.onPlayPause, options.onRed, options.onGreen, options.onYellow, options.onBlue]);
}
