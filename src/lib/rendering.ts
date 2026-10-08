/** Use mobile defaults before the GPU becomes hot, rather than waiting for dropped frames. */
export function renderingProfile() {
  const lowPower = window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 768px)').matches
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.hardwareConcurrency ?? 8) <= 4;
  return {
    lowPower,
    fps: lowPower ? 30 : 60,
    pixelRatio: Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2),
    antialias: !lowPower,
    powerPreference: lowPower ? 'low-power' as const : 'high-performance' as const,
  };
}

/** Pause scene animation when its canvas is outside the page or in a hidden panel. */
export function observeElementVisibility(element: Element, update: (visible: boolean) => void): () => void {
  const rect = element.getBoundingClientRect();
  update(rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
    && rect.right > 0 && rect.left < innerWidth);
  if (!('IntersectionObserver' in window)) return () => {};
  const observer = new IntersectionObserver(entries => {
    update(entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0
      && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0));
  }, { threshold: 0 });
  observer.observe(element);
  return () => observer.disconnect();
}
