import { useEffect, useRef } from 'react';
import { lockScroll } from './scrollLock';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every window over the page does, written once.
 *
 * The page holds still under it, focus goes into it and stays there, and
 * Escape closes it — this window only. The section panel under a seat's
 * window listens for Escape too, and one key press used to be able to close
 * both, so the window hears it first (capture, on `window`) and stops it
 * there. Closing hands focus back to whatever opened it, so a keyboard is
 * left on the seat it was on rather than at the top of the page.
 *
 * Returns the ref for the window's card: focus starts on whatever inside it
 * carries `data-autofocus`, or the card itself.
 */
export function useModal(onClose: () => void) {
  const card = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = lockScroll();
    const root = card.current;
    (root?.querySelector<HTMLElement>('[data-autofocus]') ?? root)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = root.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      release();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return card;
}
