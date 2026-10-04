import { useEffect, useId, useState } from 'react';
import { fetchBoard, hasBoard, readBest, recentBoard, shortWallet, type BoardEntry } from '../lib/scoresApi';
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
 * door there was no seeing it again short of a reload. A board read in the
 * last minute — the landing's, or this window's last opening — is shown as
 * it is; anything older is read again, so a score posted since turns up.
 */
export default function ScoresDialog({ address, onClose }: ScoresDialogProps) {
  const title = useId();
  const [cached] = useState(() => (hasBoard ? recentBoard() : null));
  /* Undefined while it is read; null when there is no board to be had. */
  const [board, setBoard] = useState<BoardEntry[] | null | undefined>(hasBoard ? cached ?? undefined : null);
  const [best] = useState(readBest);
  useEffect(() => {
    if (!hasBoard || cached) return;
    const ctl = new AbortController();
    void fetchBoard(ctl.signal).then((rows) => { if (!ctl.signal.aborted) setBoard(rows); });
    return () => ctl.abort();
  }, [cached]);

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
          Climb to 10,000 ft, lose an engine, stay up.
        </p>

        {board === undefined ? (
          <p className="sa-scores__state" role="status">Loading…</p>
        ) : board === null ? (
          <p className="sa-scores__state">
            {hasBoard ? 'Board unavailable. Try again soon.' : 'No board on this deployment.'}
          </p>
        ) : board.length === 0 ? (
          <p className="sa-scores__state">No scores yet. Be first.</p>
        ) : (
          <ol className="sa-scores__list">
            {board.map((row, i) => {
              const you = row.address === address;
              return (
                <li key={row.address} className={you ? 'is-you' : undefined}>
                  <span className={`sa-scores__rank${i < 3 ? ` sa-scores__rank--${i + 1}` : ''}`}>{i + 1}</span>
                  <span className="sa-scores__pilot">
                  {row.x?.avatar && <img className="sa-scores__avatar" src={row.x.avatar} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" />}
                  <span className="sa-scores__who">
                    <span className="sa-scores__wallet">
                      {row.x ? (
                        <a className="sa-scores__x" href={`https://x.com/${encodeURIComponent(row.x.username)}`} target="_blank" rel="noopener noreferrer">@{row.x.username}</a>
                      ) : shortWallet(row.address)}
                      {you && <span className="sa-scores__you">You</span>}
                    </span>
                    <span className="sa-scores__meta">
                      {row.survived > 0 ? `${Math.round(row.survived)} s on one engine` : 'Short of 10,000 ft'}
                    </span>
                  </span>
                  </span>
                  <span className="sa-scores__score">{row.score.toLocaleString('en-US')}</span>
                </li>
              );
            })}
          </ol>
        )}

        <p className="sa-scores__mine">
          <span>Your best</span>
          <strong>{best > 0 ? best.toLocaleString('en-US') : '—'}</strong>
        </p>
        <p className="sa-scores__fine">
          Fly from the landing to score. Posting signs a message, never a transaction.
        </p>
      </div>
    </ModalWindow>
  );
}
