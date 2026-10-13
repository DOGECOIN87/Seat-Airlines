import { radio, useRadio } from '../lib/useRadio';
import { DeckIcon } from './InstrumentDeck';

/**
 * What the radio is playing, in the workspace bar.
 *
 * The radio keeps playing when its tab is closed, so the way to pause it
 * cannot live only in that tab. Nothing shows until a track has been picked.
 */
export default function RadioChip({ onOpen }: { onOpen: () => void }) {
  const r = useRadio();
  if (!r.current) return null;
  return (
    <div className="sa-radio-chip">
      <button type="button" onClick={radio.toggle} aria-label={r.playing ? 'Pause the radio' : 'Play the radio'}>
        <DeckIcon name={r.playing ? 'pause' : 'play'} />
      </button>
      <button type="button" className="sa-radio-chip__now" onClick={onOpen} title="Open the in-flight radio">
        <span className="sa-radio-chip__title">{r.current.title}</span>
        <span className="sa-radio-chip__artist">{r.current.artist}</span>
      </button>
    </div>
  );
}
