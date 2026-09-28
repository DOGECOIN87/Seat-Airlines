/**
 * Holding the page still under whatever is open over it.
 *
 * More than one thing can want the page still at once — a phone's section
 * sheet, and a seat's window opened from inside it — and each used to save
 * `overflow` and put it back on its own. Closed in the wrong order, the last
 * one out restored the `hidden` the first one had set, and the page stayed
 * frozen. Counted instead: the first lock saves and freezes, the last
 * release restores, in whatever order they come.
 */

let locks = 0;
let saved = '';

/** Hold the page still. Returns the release, which is safe to call twice. */
export function lockScroll(): () => void {
  if (locks++ === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.body.style.overflow = saved;
  };
}
