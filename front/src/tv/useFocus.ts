import { useCallback, useEffect, useRef, useState } from 'react';

export interface FocusableElement {
  id: string;
  row: number;
  col: number;
  onSelect?: () => void;
}

interface UseFocusOptions {
  elements: FocusableElement[];
  initialFocus?: string;
  onBack?: () => void;
  onExit?: () => void;
  enabled?: boolean;
}

export function useFocus({ elements, initialFocus, onBack, onExit, enabled = true }: UseFocusOptions) {
  const [focusedId, setFocusedId] = useState<string | null>(initialFocus || null);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  const focusById = useCallback((id: string) => {
    setFocusedId(id);
    // Scroll element into view
    const el = document.querySelector(`[data-focus-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Never intercept typing in inputs, textareas, or contentEditable elements
    const activeEl = document.activeElement as HTMLElement | null;
    const targetEl = e.target as HTMLElement | null;
    const isInput = (el: HTMLElement | null) =>
      Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));

    if (isInput(activeEl) || isInput(targetEl)) {
      return;
    }

    const els = elementsRef.current;
    if (els.length === 0) return;

    const current = els.find(el => el.id === focusedId);
    if (!current) {
      // No focus yet — focus first element
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
        focusById(els[0].id);
        e.preventDefault();
      }
      return;
    }

    let target: FocusableElement | undefined;

    switch (e.key) {
      case 'ArrowRight':
        // Find next element in same row
        target = els
          .filter(el => el.row === current.row && el.col > current.col)
          .sort((a, b) => a.col - b.col)[0];
        // If no more in row, wrap to first in same row
        if (!target) {
          target = els
            .filter(el => el.row === current.row)
            .sort((a, b) => a.col - b.col)[0];
        }
        break;

      case 'ArrowLeft':
        // Find previous element in same row
        target = els
          .filter(el => el.row === current.row && el.col < current.col)
          .sort((a, b) => b.col - a.col)[0];
        // If no more in row, wrap to last in same row
        if (!target) {
          target = els
            .filter(el => el.row === current.row)
            .sort((a, b) => b.col - a.col)[0];
        }
        break;

      case 'ArrowDown':
        // Find element in next row (closest col)
        target = els
          .filter(el => el.row > current.row)
          .sort((a, b) => a.row - b.row || Math.abs(a.col - current.col) - Math.abs(b.col - current.col))[0];
        break;

      case 'ArrowUp':
        // Find element in previous row (closest col)
        target = els
          .filter(el => el.row < current.row)
          .sort((a, b) => b.row - a.row || Math.abs(a.col - current.col) - Math.abs(b.col - current.col))[0];
        break;

      case 'Enter':
        current.onSelect?.();
        e.preventDefault();
        return;

      case 'Backspace':
        // Samsung Back key fires 'Backspace' in some contexts
        onBack?.();
        e.preventDefault();
        return;
    }

    if (target) {
      focusById(target.id);
      e.preventDefault();
    }
  }, [focusedId, focusById, onBack]);

  // Samsung TV keydown handler
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Never intercept typing in inputs, textareas, or contentEditable elements
      const activeEl = document.activeElement as HTMLElement | null;
      const targetEl = e.target as HTMLElement | null;
      const isInput = (el: HTMLElement | null) =>
        Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));

      if (isInput(activeEl) || isInput(targetEl)) {
        return;
      }

      // Samsung Back key
      if (e.keyCode === 10009) {
        onBack?.();
        e.preventDefault();
        return;
      }
      // Samsung Exit key (long press Back)
      if (e.keyCode === 10182) {
        onExit?.();
        e.preventDefault();
        return;
      }
      // Samsung MediaPlayPause
      if (e.keyCode === 10252) {
        // Dispatch custom event for player
        document.dispatchEvent(new CustomEvent('tv-play-pause'));
        e.preventDefault();
        return;
      }

      handleKeyDown(e);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, handleKeyDown, onBack, onExit]);

  return {
    focusedId,
    focusById,
    setFocusedId,
  };
}
