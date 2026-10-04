import type { CSSProperties, ReactNode } from 'react';
import type { CabinRow } from '../content/cabin';

/** A physical aircraft row: both seat banks always stay beside the aisle. */
export default function AircraftRow({ row, renderSeat }: {
  row: CabinRow;
  renderSeat: (id: string) => ReactNode;
}) {
  const label = row.n === null ? 'Flight deck' : `Row ${row.n}`;
  return (
    <div className="sa-aircraft-row" role="group" aria-label={label} data-row={row.n ?? 'deck'}>
      <span className="sa-aircraft-row__number" aria-hidden>{row.n ?? ''}</span>
      {[row.left, row.right].map((bank, side) => (
        <ul
          key={side}
          className="sa-aircraft-row__bank"
          aria-label={`${label}, ${side === 0 ? 'left' : 'right'} seats`}
          style={{ '--bank-cols': bank.length } as CSSProperties}
        >
          {bank.map((letter) => renderSeat(row.n === null ? letter : `${row.n}${letter}`))}
        </ul>
      ))}
      <span className="sa-aircraft-row__number" aria-hidden>{row.n ?? ''}</span>
    </div>
  );
}
