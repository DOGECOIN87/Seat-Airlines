import { useId } from 'react';
import { shortAddress } from '../lib/manifest';
import type { PersonalMove } from '../lib/seatMoves';
import { formatTokens } from '../lib/seatLadder';
import ModalWindow from './ModalWindow';

interface SeatChangeProps {
  move: PersonalMove;
  /** Open the seat map, to see who is where now. */
  onSeats: () => void;
  onClose: () => void;
}

/**
 * Your seat changed.
 *
 * Being out-held is the whole game, and it used to be one line in the cabin
 * radio. Now it stops the page, the way a gate change does: the old seat and
 * the new, who went past you, and the exact bag it takes to win the seat
 * back. Moving forward gets the same card, as an upgrade.
 */
export default function SeatChange({ move, onSeats, onClose }: SeatChangeProps) {
  const title = useId();
  const seat = (id: string | null) => id ?? 'Hold';
  const rival = move.passed.length === 1 ? shortAddress(move.passed[0]) : null;

  const lines: string[] = [];
  if (move.up) {
    if (rival) lines.push(`You passed ${rival}.`);
    else if (move.passed.length > 1) lines.push(`You passed ${move.passed.length} holders.`);
  } else {
    if (move.sold) lines.push('Your bag got smaller.');
    else if (rival) lines.push(`${rival} passed you.`);
    else if (move.passed.length > 1) lines.push(`${move.passed.length} holders passed you.`);
    if (move.winBack !== null && move.from) {
      lines.push(move.winBack > 0 ? `Hold ${formatTokens(move.winBack)} more to win ${move.from} back.` : `Hold a little more to win ${move.from} back.`);
    }
  }

  return (
    <ModalWindow labelledBy={title} onClose={onClose} className={`sa-seatchange${move.up ? ' is-up' : ''}`}>
      <div className="sa-seatchange__body">
        <p className="sa-modal__eyebrow">{move.up ? 'Upgrade' : move.to ? 'Seat change' : 'Seat lost'}</p>
        <h2 id={title} className="sa-seatchange__route">
          <span>{seat(move.from)}</span>
          <span className="sa-seatchange__arrow" aria-label="to">→</span>
          <span className="sa-seatchange__to">{seat(move.to)}</span>
        </h2>
        {lines.map((line) => <p key={line} className="sa-seatchange__line">{line}</p>)}
        <div className="sa-seatchange__actions">
          <button type="button" onClick={onSeats} className="sa-cta">Seats</button>
          <button type="button" onClick={onClose} className="sa-ghost" data-autofocus>OK</button>
        </div>
      </div>
    </ModalWindow>
  );
}
