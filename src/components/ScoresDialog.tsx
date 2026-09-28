import { useEffect, useId, useState } from 'react';
import { fetchBoard, hasBoard, readBest, shortWallet, type BoardEntry } from '../lib/scoresApi';
import ModalWindow from './ModalWindow';

interface ScoresDialogProps {
  /** The visitor's wallet, to find them on the board. */
  address: string | null;
  onClose: () => void;
}

/**
 * The high scores, from inside the site.
 *
 * The board used to be on the landing and nowhere else, so once through the
 * door there was no seeing it again short of a reload. It is read fresh each
 * time it opens: a score posted from another tab should be on it.
 */
export default function ScoresDialog({ address, onClose }: ScoresDialogProps) {
  const title = useId();
  /* Undefined while it is read; null when there is no board to be had. */
  const [board, setBoard] = useState<BoardEntry[] | null | undefined>(hasBoard ? undefined : null);
  const [best] = useState(readBest);
  useEffect(() => {
    if (!hasBoard) return;
    const ctl = new AbortController();
    void fetchBoard(ctl.signal).then((rows) => { if (!ctl.signal.aborted) setBoard(rows); });
    return () => ctl.abort();
  }, []);

  return (
    <ModalWindow labelledBy={title} onClose={onClose} className="sa-scores">
      <header className="sa-modal__head">
        <div className="min-w-0">
          <p className="sa-modal__eyebrow">High scores</p>
          <h2 id={title} className="sa-modal__title">Top pilots</h2>
        </div>
        <button type="button" onClick={onClose} className="sa-modal__close" aria-label="Close the high scores" data-autofocus>
          <span aria-hidden>×</span>
        </button>
      </header>
      <div className="sa-modal__body">
        <p className="sa-scores__lead">
          The best flights on the way in: climb to 10,000 ft, lose an engine, and keep it in the air as long as you can.
        </p>

        {board === undefined ? (
          <p className="sa-scores__state" role="status">Reading the board…</p>
        ) : board === null ? (
          <p className="sa-scores__state">
            {hasBoard ? 'The board could not be reached just now. Try again in a moment.' : 'There is no board on this deployment.'}
          </p>
        ) : board.length === 0 ? (
          <p className="sa-scores__state">Nobody on the board yet. Climb to 10,000 ft and be first.</p>
        ) : (
          <ol className="sa-scores__list">
            {board.map((row, i) => {
              const you = row.address === address;
              return (
                <li key={row.address} className={you ? 'is-you' : undefined}>
                  <span className={`sa-scores__rank${i < 3 ? ` sa-scores__rank--${i + 1}` : ''}`}>{i + 1}</span>
                  <span className="sa-scores__who">
                    <span className="sa-scores__wallet">
                      {shortWallet(row.address)}
                      {you && <span className="sa-scores__you">You</span>}
                    </span>
                    <span className="sa-scores__meta">
                      {row.survived > 0 ? `${Math.round(row.survived)} s on one engine` : 'Short of 10,000 ft'}
                    </span>
                  </span>
                  <span className="sa-scores__score">{row.score.toLocaleString('en-US')}</span>
                </li>
              );
            })}
          </ol>
        )}

        <p className="sa-scores__mine">
          <span>Your best in this browser</span>
          <strong>{best > 0 ? best.toLocaleString('en-US') : '—'}</strong>
        </p>
        <p className="sa-scores__fine">
          Scores are flown on the landing, before you board: take the controls there to set one. Posting a score signs a
          short message with your wallet — never a transaction.
        </p>
      </div>
    </ModalWindow>
  );
}
