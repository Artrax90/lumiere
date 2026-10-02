import { useEffect } from 'react';

/**
 * Global Left Mouse Button (LMB) drag-to-scroll handler.
 * Automatically enables mouse dragging for all horizontal scrolling containers across the entire Web application:
 * - Seasons and episode rows
 * - Home shelves (ShowcaseRow, ContentRow, Top10Row)
 * - IPTV tabs and categories
 * - Search query chips and category filters
 * - Profile and settings tabs
 * 
 * Safely ignores inputs, sliders, and video player controls.
 */
export function useGlobalDragScroll() {
  useEffect(() => {
    let activeContainer: HTMLElement | null = null;
    let startX = 0;
    let initialScrollLeft = 0;
    let hasMoved = false;

    const findScrollableParent = (el: HTMLElement | null): HTMLElement | null => {
      while (el && el !== document.body && el !== document.documentElement) {
        // Exclude video player timeline and interactive form elements
        if (el.classList.contains('player-timeline') || el.closest('.player-timeline')) {
          return null;
        }

        if (el.scrollWidth > el.clientWidth + 10) {
          const style = window.getComputedStyle(el);
          const ox = style.overflowX;
          if (ox === 'auto' || ox === 'scroll') {
            return el;
          }
        }
        el = el.parentElement;
      }
      return null;
    };

    const onMouseDown = (e: MouseEvent) => {
      // Only Left Mouse Button
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (!target) return;

      // Do not drag if clicking form controls or sliders
      if (target.closest('input, textarea, select, [role="slider"], .no-drag')) {
        return;
      }

      const container = findScrollableParent(target);
      if (!container) return;

      activeContainer = container;
      startX = e.pageX;
      initialScrollLeft = container.scrollLeft;
      hasMoved = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!activeContainer) return;

      const deltaX = e.pageX - startX;
      if (Math.abs(deltaX) > 4) {
        hasMoved = true;
        activeContainer.style.cursor = 'grabbing';
        activeContainer.style.userSelect = 'none';
        activeContainer.scrollLeft = initialScrollLeft - deltaX;
      }
    };

    const onMouseUp = () => {
      if (activeContainer) {
        activeContainer.style.cursor = '';
        activeContainer.style.removeProperty('user-select');
        activeContainer = null;
      }
    };

    // Capture and suppress accidental clicks on links/cards if the user dragged
    const onClickCapture = (e: MouseEvent) => {
      if (hasMoved) {
        e.stopPropagation();
        e.preventDefault();
        hasMoved = false;
      }
    };

    window.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp, { passive: true });
    window.addEventListener('click', onClickCapture, true);

    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('click', onClickCapture, true);
    };
  }, []);
}

export default useGlobalDragScroll;
