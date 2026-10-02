import { useRef, useEffect } from 'react';

/**
 * Reusable hook enabling drag-to-scroll with Left Mouse Button (LMB) across any horizontal container.
 * Features:
 * - Smooth responsive tracking
 * - Drag threshold (4px) to prevent accidental card/button clicks during dragging
 * - Preserves native scrollbars and keyboard accessibility
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasMoved = false;

    const onMouseDown = (e: MouseEvent) => {
      // Only Left Mouse Button
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;

      isDown = true;
      hasMoved = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const dist = x - startX;
      if (Math.abs(dist) > 4) {
        hasMoved = true;
      }
      el.scrollLeft = scrollLeft - dist;
    };

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = '';
      el.style.removeProperty('user-select');
    };

    // Capture click to prevent triggering navigation/cards if the user dragged
    const onClickCapture = (e: MouseEvent) => {
      if (hasMoved) {
        e.stopPropagation();
        e.preventDefault();
        hasMoved = false;
      }
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return ref;
}

export default useDragScroll;
