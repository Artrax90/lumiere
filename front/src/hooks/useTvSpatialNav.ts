import { useEffect, useRef } from 'react';
import { isTV } from './usePlatform';

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= -800 && rect.top <= window.innerHeight + 800;
}

export function useTvSpatialNav() {
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const isTvMode = isTV();
    if (!isTvMode) return;

    const selector = [
      '[tabindex="0"]:not([disabled])',
      'button:not([disabled]):not([tabindex="-1"])',
      'a[href]:not([tabindex="-1"])',
      'input:not([disabled]):not([type="hidden"])',
    ].join(',');

    // Helper: find and focus best visible candidate
    const restoreFocus = () => {
      if (document.querySelector('.player-view') || document.querySelector('video') || document.querySelector('[data-modal="true"], [role="dialog"], [aria-modal="true"]')) return;
      const all = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
      if (all.length === 0) return;

      const inVp = all.filter(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 20 && r.bottom <= window.innerHeight - 20 && r.left >= 0 && r.right <= window.innerWidth;
      });
      const nonHeader = inVp.filter(el => !el.closest('header'));
      const target = nonHeader[0] || inVp[0] || all[0];
      if (target) {
        target.focus({ preventScroll: true });
      }
    };

    // Watchdog: ensures the focus outline is NEVER lost on TV
    const watchdog = setInterval(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body || !active.isConnected) {
        restoreFocus();
      }
    }, 1200);

    const handleKeyDown = (e: KeyboardEvent) => {
      // If a full-screen player or a modal is active, let them handle all remote keys directly!
      if (document.querySelector('.player-view') || document.querySelector('video') || document.querySelector('[data-modal="true"], [role="dialog"], [aria-modal="true"]')) {
        return;
      }

      // Throttle key repeats to avoid flooding TV CPU
      const now = performance.now();
      if (now - lastKeyTimeRef.current < 75) return;
      lastKeyTimeRef.current = now;

      const activeEl = document.activeElement as HTMLElement | null;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

      const key = e.key;
      const keyCode = (e as any).keyCode;

      const isUp = key === 'ArrowUp' || keyCode === 19 || keyCode === 38;
      const isDown = key === 'ArrowDown' || keyCode === 20 || keyCode === 40;
      const isLeft = key === 'ArrowLeft' || keyCode === 21 || keyCode === 37;
      const isRight = key === 'ArrowRight' || keyCode === 22 || keyCode === 39;
      const isEnter = key === 'Enter' || key === 'Select' || keyCode === 23 || keyCode === 66 || keyCode === 13;
      const isBack = key === 'GoBack' || key === 'Escape' || keyCode === 4 || keyCode === 10009 || keyCode === 27;

      if (isBack) {
        if (isInput) {
          activeEl?.blur();
          return;
        }
        const backBtn = document.querySelector<HTMLElement>('button[aria-label="Back"], button[aria-label="Назад"], .back-btn');
        if (backBtn) {
          e.preventDefault();
          backBtn.click();
        }
        return;
      }

      if (!isUp && !isDown && !isLeft && !isRight && !isEnter) {
        return;
      }

      // If enter pressed on active element
      if (isEnter) {
        if (activeEl && activeEl !== document.body && !isInput) {
          e.preventDefault();
          activeEl.click();
        }
        return;
      }

      // If user is inside an input, only allow Up/Down to escape the input
      if (isInput && (isLeft || isRight)) {
        return;
      }

      const all = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
      if (all.length === 0) return;

      if (!activeEl || activeEl === document.body || !activeEl.isConnected) {
        e.preventDefault();
        restoreFocus();
        return;
      }

      const isInHeader = !!activeEl.closest('header');

      // 1. FAST HORIZONTAL ROW NAVIGATION (Netflix style: smooth horizontal centering)
      const rowContainer = activeEl.closest<HTMLElement>('.overflow-x-auto, [data-tv-row="true"], [data-tv-pills="true"]');
      if (rowContainer && (isLeft || isRight)) {
        const rowItems = Array.from(rowContainer.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
        const curIdx = rowItems.indexOf(activeEl);
        if (curIdx !== -1) {
          if (isRight && curIdx < rowItems.length - 1) {
            e.preventDefault();
            const next = rowItems[curIdx + 1];
            next.focus();
            next.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
            return;
          }
          if (isLeft && curIdx > 0) {
            e.preventDefault();
            const prev = rowItems[curIdx - 1];
            prev.focus();
            prev.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
            return;
          }
          if (isLeft && curIdx === 0) {
            e.preventDefault();
            return;
          }
        }
      }

      // 2. FAST TOP NAV BAR NAVIGATION
      const navContainer = activeEl.closest<HTMLElement>('nav');
      if (navContainer && (isLeft || isRight)) {
        const navItems = Array.from(navContainer.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
        const curIdx = navItems.indexOf(activeEl);
        if (curIdx !== -1) {
          if (isRight && curIdx < navItems.length - 1) {
            e.preventDefault();
            navItems[curIdx + 1].focus();
            return;
          }
          if (isLeft && curIdx > 0) {
            e.preventDefault();
            navItems[curIdx - 1].focus();
            return;
          }
        }
      }

      // 3. DOWN FROM TOP NAV: Land on top-most content card
      if (isInHeader && isDown) {
        const contentCandidates = all.filter(c => !c.closest('header') && isVisible(c));
        if (contentCandidates.length > 0) {
          contentCandidates.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            if (Math.abs(ra.top - rb.top) > 25) return ra.top - rb.top;
            return ra.left - rb.left;
          });
          e.preventDefault();
          const target = contentCandidates[0];
          target.focus();
          target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          return;
        }
      }

      const curRect = activeEl.getBoundingClientRect();
      const curCx = curRect.left + curRect.width / 2;
      const curCy = curRect.top + curRect.height / 2;

      // 4. SHELF-INTERNAL VERTICAL NAVIGATION (e.g. NetflixRow pills above carousel)
      const shelfSectionEl = activeEl.closest<HTMLElement>('[data-shelf-section="true"]');
      if (shelfSectionEl) {
        const carousel = shelfSectionEl.querySelector<HTMLElement>('.overflow-x-auto');
        const pillsContainer = shelfSectionEl.querySelector<HTMLElement>('[data-tv-pills="true"]');

        if (pillsContainer && carousel) {
          if (isDown && activeEl.closest('[data-tv-pills="true"]')) {
            const rowCards = Array.from(carousel.querySelectorAll<HTMLElement>(selector))
              .filter(c => c !== activeEl && isVisible(c) && (c.getBoundingClientRect().top >= curRect.bottom - 4));
            if (rowCards.length > 0) {
              rowCards.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return Math.abs((ra.left + ra.width / 2) - curCx) - Math.abs((rb.left + rb.width / 2) - curCx);
              });
              e.preventDefault();
              const target = rowCards[0];
              target.focus();
              target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
              return;
            }
          } else if (isUp && activeEl.closest('.overflow-x-auto')) {
            const pills = Array.from(pillsContainer.querySelectorAll<HTMLElement>(selector))
              .filter(c => c !== activeEl && isVisible(c) && (c.getBoundingClientRect().bottom <= curRect.top + 4));
            if (pills.length > 0) {
              pills.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return Math.abs((ra.left + ra.width / 2) - curCx) - Math.abs((rb.left + rb.width / 2) - curCx);
              });
              e.preventDefault();
              const target = pills[0];
              target.focus();
              target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
              return;
            }
          }
        }
      }

      // 5. GLOBAL SPATIAL SEARCH FOR VERTICAL & CROSS-CONTAINER NAVIGATION
      let candidatePool = all;
      if (!isInHeader && isUp) {
        // When moving UP in content: ONLY consider header if there are NO content elements above us!
        const contentAbove = all.filter(c => !c.closest('header') && c !== activeEl && (c.getBoundingClientRect().bottom <= curRect.bottom - 6));
        if (contentAbove.length > 0) {
          candidatePool = all.filter(c => !c.closest('header'));
        }
      }

      let bestTarget: HTMLElement | null = null;
      let minScore = Infinity;

      for (const candidate of candidatePool) {
        if (candidate === activeEl) continue;
        const r = candidate.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;

        let isValidDirection = false;
        let primaryDist = 0;
        let secondaryDist = 0;

        if (isRight) {
          if (cx > curCx + 4 && r.left >= curRect.left + 4) {
            isValidDirection = true;
            primaryDist = cx - curCx;
            secondaryDist = Math.abs(cy - curCy);
          }
        } else if (isLeft) {
          if (cx < curCx - 4 && r.right <= curRect.right - 4) {
            isValidDirection = true;
            primaryDist = curCx - cx;
            secondaryDist = Math.abs(cy - curCy);
          }
        } else if (isDown) {
          if (cy > curCy + 6 && r.top >= curRect.top + 6) {
            isValidDirection = true;
            primaryDist = cy - curCy;
            secondaryDist = Math.abs(cx - curCx);
          }
        } else if (isUp) {
          if (cy < curCy - 6 && r.bottom <= curRect.bottom - 6) {
            isValidDirection = true;
            primaryDist = curCy - cy;
            secondaryDist = Math.abs(cx - curCx);
          }
        }

        if (isValidDirection) {
          // Weight horizontal alignment heavily (2.5x) when moving Up/Down to stay in vertical column
          const score = (isLeft || isRight)
            ? primaryDist + secondaryDist * 3.5
            : primaryDist + secondaryDist * 2.5;

          if (score < minScore) {
            minScore = score;
            bestTarget = candidate;
          }
        }
      }

      // If spatial search found no exact match in quadrant, find closest item in vertical direction
      if (!bestTarget && (isUp || isDown)) {
        const directionalCandidates = candidatePool.filter(c => {
          if (c === activeEl) return false;
          const r = c.getBoundingClientRect();
          return isDown ? r.top > curRect.top + 10 : r.bottom < curRect.bottom - 10;
        });

        if (directionalCandidates.length > 0) {
          directionalCandidates.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const da = isDown ? ra.top - curRect.bottom : curRect.top - ra.bottom;
            const db = isDown ? rb.top - curRect.bottom : curRect.top - rb.bottom;
            const cxa = Math.abs((ra.left + ra.width / 2) - curCx);
            const cxb = Math.abs((rb.left + rb.width / 2) - curCx);
            return (da + cxa * 2) - (db + cxb * 2);
          });
          bestTarget = directionalCandidates[0];
        }
      }

      if (bestTarget) {
        e.preventDefault();
        bestTarget.focus();
        bestTarget.scrollIntoView({
          behavior: 'auto',
          block: (isUp || isDown) ? 'center' : 'nearest',
          inline: 'center',
        });
      } else {
        if (isDown) {
          e.preventDefault();
          window.scrollBy({ top: 240, behavior: 'auto' });
        } else if (isUp) {
          e.preventDefault();
          window.scrollBy({ top: -240, behavior: 'auto' });
        } else if (isLeft || isRight) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleTvKeyCapture, true);
    function handleTvKeyCapture(e: KeyboardEvent) {
      handleKeyDown(e);
    }

    return () => {
      clearInterval(watchdog);
      window.removeEventListener('keydown', handleTvKeyCapture, true);
    };
  }, []);
}
