import { useEffect, useId, useRef } from 'react';
import AircraftModelPreview from './AircraftModelPreview';
import { CRAFT_SPECS } from '../lib/craftSpecs';
import type { PlayMode } from '../lib/rides';
import './CraftSheet.css';

interface CraftSheetProps {
  model: PlayMode;
  /** The UFO, before the wallet holds enough to fly it. */
  locked: boolean;
  /** What the launch button says: the hangar's own words for it. */
  launchLabel: string;
  onLaunch: () => void;
  onClose: () => void;
}

/**
 * A craft, up close: the model turning on its stand, and its spec sheet.
 *
 * Opened by picking a craft in the hangar, over the hangar, which stays where
 * it was underneath. Escape closes this and only this — the hangar's own
 * Escape would take the whole picker away — so it is caught on the way down,
 * before the hangar hears it.
 */
export default function CraftSheet({ model, locked, launchLabel, onLaunch, onClose }: CraftSheetProps) {
  const title = useId();
  const spec = CRAFT_SPECS[model];
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The sheet takes focus, not a button in it: no ring on open.
    card.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div className="sa-craft-sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={card} className={`sa-craft-sheet__card sa-craft-sheet__card--${model}`} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
        <button type="button" className="sa-craft-sheet__close" onClick={onClose} aria-label="Back to the hangar">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="sa-craft-sheet__stage">
          <div className="sa-craft-sheet__pad" aria-hidden />
          <AircraftModelPreview model={model} active />
        </div>
        <div className="sa-craft-sheet__info">
          <h2 id={title} className="sa-craft-sheet__name">{spec.name}</h2>
          <p className="sa-craft-sheet__role">{spec.role}</p>
          <p className="sa-craft-sheet__blurb">{spec.blurb}</p>
          <dl className="sa-craft-sheet__specs">
            {spec.specs.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <ul className="sa-craft-sheet__abilities" aria-label="Abilities">
            {spec.abilities.map((ability) => <li key={ability}>{ability}</li>)}
          </ul>
          <div className="sa-craft-sheet__actions">
            <button type="button" className="sa-craft-sheet__back" onClick={onClose}>Back to hangar</button>
            <button type="button" className="sa-craft-sheet__launch" onClick={onLaunch} disabled={locked}>
              {locked ? 'Hold 1M $SEAT to unlock' : launchLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
