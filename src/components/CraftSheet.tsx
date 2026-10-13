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
  const launch = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (locked ? back : launch).current?.focus({ preventScroll: true });
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
  }, [locked, onClose]);

  return (
    <div className="sa-craft-sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`sa-craft-sheet__card sa-craft-sheet__card--${model}`} role="dialog" aria-modal="true" aria-labelledby={title}>
        <button type="button" className="sa-craft-sheet__close" onClick={onClose} aria-label="Back to the hangar">×</button>
        <div className="sa-craft-sheet__stage">
          <div className="sa-craft-sheet__pad" aria-hidden />
          <AircraftModelPreview model={model} active />
          <span className="sa-craft-sheet__stand">{spec.tag}</span>
        </div>
        <div className="sa-craft-sheet__info">
          <p className="sa-craft-sheet__eyebrow"><i aria-hidden /> Spec sheet</p>
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
            <button ref={back} type="button" className="sa-craft-sheet__back" onClick={onClose}>Back to hangar</button>
            <button ref={launch} type="button" className="sa-craft-sheet__launch" onClick={onLaunch} disabled={locked}>
              {locked ? 'Hold 1M $SEAT to unlock' : launchLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
