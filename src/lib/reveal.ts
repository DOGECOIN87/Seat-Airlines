/**
 * Bring an element into view inside the box that scrolls it, and no further.
 *
 * `scrollIntoView` scrolls every ancestor that can be scrolled, including
 * ones that only clip (`overflow: hidden`) and the page itself. In the desk
 * cockpit the sections live in a docking workspace whose own boxes clip, so
 * a seat brought to the middle of the seat map would also slide the whole
 * workspace inside its frame and jump the page. Inside a `[data-scroll-root]`
 * this scrolls only the real scrollers between the element and that root;
 * anywhere else it is `scrollIntoView` unchanged.
 */
export function reveal(el: Element, options: ScrollIntoViewOptions = {}): void {
  const root = el.closest<HTMLElement>('[data-scroll-root]');
  if (!root) {
    el.scrollIntoView(options);
    return;
  }
  const block = options.block ?? 'start';
  const inline = options.inline ?? 'nearest';
  const behavior = options.behavior ?? 'auto';
  for (let box = el.parentElement; box; box = box.parentElement) {
    const style = getComputedStyle(box);
    const canX = /auto|scroll/.test(style.overflowX) && box.scrollWidth > box.clientWidth;
    const canY = /auto|scroll/.test(style.overflowY) && box.scrollHeight > box.clientHeight;
    if (canX || canY) {
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const left = canX ? box.scrollLeft + offset(r.left - b.left, r.width, box.clientWidth, inline) : box.scrollLeft;
      const top = canY ? box.scrollTop + offset(r.top - b.top, r.height, box.clientHeight, block) : box.scrollTop;
      box.scrollTo({ left, top, behavior });
    }
    if (box === root) break;
  }
}

/** How far to scroll one axis so a span at `at` (relative to the box) lands where asked. */
function offset(at: number, size: number, room: number, where: ScrollLogicalPosition): number {
  switch (where) {
    case 'center':
      return at - (room - size) / 2;
    case 'end':
      return at - (room - size);
    case 'nearest':
      if (at < 0) return at;
      if (at + size > room) return Math.min(at, at + size - room);
      return 0;
    default:
      return at;
  }
}
