import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DeckIcon, type DeckIconName } from './InstrumentDeck';
import { lockScroll } from '../lib/scrollLock';

/**
 * The page's sections, beside the view rather than below it.
 *
 * The seat map, the network, the cabin chat and check-in used to be a long
 * scroll under the aircraft, so whichever one you went to, the aeroplane went
 * off the top of the screen — and clicking a seat to look from it moved a
 * camera nobody could see. Now each opens in a panel alongside the view,
 * which narrows to make room, and closes back to the full width.
 *
 * The tabs are a bar along the bottom of the screen at every size — they
 * used to be a rail down the view's right edge on a desk, which took a
 * column off the view for four buttons. On a desk a section opens in a
 * panel beside the view; a phone has no width to share, so there it rises
 * over the page as a sheet, with the bar still under your thumb to change
 * section or put it away. The same two components draw both; the layout is
 * the stylesheet's (see "The cockpit" in index.css).
 */

export type PanelKey = 'wall' | 'network' | 'chat' | 'check-in';

interface PanelDef {
  key: PanelKey;
  /** On the tab. */
  label: string;
  icon: DeckIconName;
  /** Over the panel. */
  eyebrow: string;
  title: string;
}

export const PANELS: readonly PanelDef[] = [
  { key: 'wall', label: 'Seats', icon: 'wall', eyebrow: 'Seats', title: 'The wall' },
  { key: 'network', label: 'Network', icon: 'network', eyebrow: 'Network', title: 'Directory' },
  { key: 'chat', label: 'Chat', icon: 'chat', eyebrow: 'Chat', title: 'Cabin rooms' },
  { key: 'check-in', label: 'Check in', icon: 'pass', eyebrow: 'Check in', title: 'Your seat' },
];

/** A section key from a location hash — the sections' old anchors still open them. */
export function panelFromHash(hash: string): PanelKey | null {
  const key = hash.replace(/^#\/?/, '');
  return PANELS.some((p) => p.key === key) ? (key as PanelKey) : null;
}

/** The narrow layout, where a section is a sheet over the page rather than a panel beside the view. */
export const SHEET_QUERY = '(max-width: 1023.98px)';

interface SectionDockProps {
  open: PanelKey | null;
  onToggle: (key: PanelKey) => void;
  /** Open the high scores. They are a window over the page, not a section. */
  onScores: () => void;
  scoresOpen: boolean;
  /** Which sections have a tab. All of them when left out. */
  panels?: readonly PanelKey[];
}

export function SectionDock({ open, onToggle, onScores, scoresOpen, panels }: SectionDockProps) {
  return (
    <nav className="sa-dock" aria-label="Sections">
      <div className="sa-dock__track">
        {PANELS.filter((p) => !panels || panels.includes(p.key)).map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onToggle(p.key)}
            aria-expanded={open === p.key}
            aria-controls="sa-panel"
            className={`sa-dock__btn${open === p.key ? ' is-on' : ''}`}
          >
            <DeckIcon name={p.icon} className="sa-dock__icon" />
            <span className="sa-dock__label">{p.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onScores}
          aria-haspopup="dialog"
          aria-expanded={scoresOpen}
          className={`sa-dock__btn${scoresOpen ? ' is-on' : ''}`}
        >
          <DeckIcon name="trophy" className="sa-dock__icon" />
          <span className="sa-dock__label">Scores</span>
        </button>
      </div>
    </nav>
  );
}

interface SectionPanelProps {
  open: PanelKey | null;
  onClose: () => void;
  /** What goes in the panel for a section. */
  render: (key: PanelKey) => ReactNode;
}

export function SectionPanel({ open, onClose, render }: SectionPanelProps) {
  /* What is drawn lags what is open by the length of the close, so a closing
     panel slides away with its section still in it rather than going blank
     first. */
  const [shown, setShown] = useState<PanelKey | null>(open);
  useEffect(() => {
    if (open) {
      setShown(open);
      return;
    }
    const id = window.setTimeout(() => setShown(null), 450);
    return () => window.clearTimeout(id);
  }, [open]);

  /* What is open is drawn at once, so its title is there to take focus in
     the same commit that opens it; only a closing panel falls back on what
     it was showing. */
  const def = PANELS.find((p) => p.key === (open ?? shown));
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);

  // A section opens at its top, with focus on its title for anybody on keys.
  useEffect(() => {
    if (!open) return;
    body.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [open]);

  /* A field the keyboard comes up over is brought back into sight.

     On a phone the sheet is fixed to the bottom of the screen, above the tab
     bar, and the keyboard rises over exactly that part of it — so the card
     editor's lower fields and every composer were typed into blind. The
     viewport is asked to shrink for the keyboard (`interactive-widget` in
     index.html), which makes the sheet shorter; this then scrolls the sheet's
     own body so the field is inside what is left. It waits for the resize,
     because scrolling before it lands measures a screen that is about to
     change, and falls back on a timer for browsers that never send one. */
  useEffect(() => {
    const root = body.current;
    if (!open || !root) return;
    let timer = 0;
    const onFocus = (e: FocusEvent) => {
      const field = e.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      if (!window.matchMedia(SHEET_QUERY).matches) return;
      const viewport = window.visualViewport;
      const reveal = () => {
        window.clearTimeout(timer);
        viewport?.removeEventListener('resize', reveal);
        if (document.activeElement === field) field.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      viewport?.addEventListener('resize', reveal, { once: true });
      window.clearTimeout(timer);
      timer = window.setTimeout(reveal, 400);
    };
    root.addEventListener('focusin', onFocus);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener('focusin', onFocus);
    };
  }, [open, def?.key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    /* As a sheet it covers the page, so the page holds still under it. */
    const release = window.matchMedia(SHEET_QUERY).matches ? lockScroll() : null;
    return () => {
      window.removeEventListener('keydown', onKey);
      release?.();
    };
  }, [open, onClose]);

  return (
    <>
    {/* Behind a phone's sheet the page is frosted, and a tap anywhere off
        the sheet puts it away. */}
    <div className="sa-panel-scrim sa-frost" onClick={onClose} aria-hidden />
    <div className="sa-panel-slot" inert={!open} aria-hidden={!open}>
      {def && (
        <section id="sa-panel" className="sa-panel" aria-labelledby="sa-panel-title">
          <header className="sa-panel__head">
            <div className="min-w-0">
              <p className="sa-eyebrow">{def.eyebrow}</p>
              <h2 id="sa-panel-title" ref={heading} tabIndex={-1} className="sa-panel__title">
                {def.title}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="sa-panel__close" aria-label={`Close ${def.label}`}>
              <span aria-hidden>×</span>
            </button>
          </header>
          <div ref={body} className="sa-panel__body @container">
            {render(def.key)}
          </div>
        </section>
      )}
    </div>
    </>
  );
}
