import { useEffect, useId, useState } from 'react';
import { fetchBoard, hasBoard, readBest, recentBoard, shortWallet, type BoardEntry } from '../lib/scoresApi';
import ModalWindow from './ModalWindow';

interface ScoresDialogProps {
  /** The visitor's wallet, to find them on the board. */
  address: string | null;
  onClose: () => void;
}

type BoardView = 'podium' | 'ladder';

/**
 * The high scores, from inside the site. The board is deliberately a small
 * interaction rather than a static table: tap a pilot to inspect the run,
 * switch between the podium and full ladder, and keep the Mars ceiling in
 * sight even when the top score is still earthly.
 */
export default function ScoresDialog({ address, onClose }: ScoresDialogProps) {
  const title = useId();
  const [cached] = useState(() => (hasBoard ? recentBoard() : null));
  /* Undefined while it is read; null when there is no board to be had. */
  const [board, setBoard] = useState<BoardEntry[] | null | undefined>(hasBoard ? cached ?? undefined : null);
  const [best] = useState(readBest);
  const [view, setView] = useState<BoardView>('podium');
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!hasBoard || cached) return;
    const ctl = new AbortController();
    void fetchBoard(ctl.signal).then((rows) => { if (!ctl.signal.aborted) setBoard(rows); });
    return () => ctl.abort();
  }, [cached]);

  const topScore = board?.[0]?.score ?? best;
  const selectedRow = board?.[selected] ?? null;
  const relativeProgress = (score: number) => topScore > 0 ? Math.min(100, Math.max(4, (score / topScore) * 100)) : 4;

  return (
    <ModalWindow labelledBy={title} onClose={onClose} className="sa-scores">
      <header className="sa-modal__head">
        <div className="min-w-0">
          <p className="sa-modal__eyebrow">Flight recorder · daily board</p>
          <h2 id={title} className="sa-modal__title">Top pilots</h2>
        </div>
        <div className="sa-scores__mars-mark" aria-label="Mars hard ceiling">
          <span>MAX ALT</span>
          <strong>MARS</strong>
        </div>
        <button type="button" onClick={onClose} className="sa-modal__close" aria-label="Close the high scores" data-autofocus>
          <span aria-hidden>×</span>
        </button>
      </header>
      <div className="sa-modal__body">
        <div className="sa-scores__mission">
          <p className="sa-scores__lead">
            Climb to 10,000 ft, survive the engine-out, dodge the saucer — then keep climbing. Mars is the hard ceiling.
          </p>
          <span className="sa-scores__mission-chip">100,000,000 ft target</span>
        </div>

        {board === undefined ? (
          <p className="sa-scores__state" role="status">Loading flight data…</p>
        ) : board === null ? (
          <p className="sa-scores__state">
            {hasBoard ? 'Board unavailable. Try again soon.' : 'No board on this deployment.'}
          </p>
        ) : board.length === 0 ? (
          <p className="sa-scores__state">No scores yet. Be first on the Mars route.</p>
        ) : (
          <>
            <div className="sa-scores__toolbar">
              <div className="sa-scores__tabs" role="group" aria-label="Leaderboard view">
                <button type="button" aria-pressed={view === 'podium'} className={view === 'podium' ? 'is-active' : undefined} onClick={() => setView('podium')}>
                  Podium
                </button>
                <button type="button" aria-pressed={view === 'ladder'} className={view === 'ladder' ? 'is-active' : undefined} onClick={() => setView('ladder')}>
                  Full ladder
                </button>
              </div>
              <span className="sa-scores__live-dot"><i aria-hidden /> Live</span>
            </div>

            {view === 'podium' ? (
              <div className="sa-scores__podium" role="group" aria-label="Top three pilots">
                {board.slice(0, 3).map((row, i) => {
                  const you = row.address === address;
                  return (
                    <button
                      type="button"
                      key={row.address}
                      className={`sa-scores__podium-card sa-scores__podium-card--${i + 1}${you ? ' is-you' : ''}${selected === i ? ' is-selected' : ''}`}
                      onClick={() => setSelected(i)}
                      aria-pressed={selected === i}
                    >
                      <span className="sa-scores__podium-rank">{i + 1}</span>
                      <strong>{shortWallet(row.address)}</strong>
                      <span>{row.score.toLocaleString('en-US')}</span>
                      {you && <small>You</small>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <ol className="sa-scores__list">
                {board.map((row, i) => {
                  const you = row.address === address;
                  return (
                    <li key={row.address} className={`${you ? 'is-you ' : ''}${selected === i ? 'is-selected' : ''}`}>
                      <button type="button" onClick={() => setSelected(i)} aria-pressed={selected === i}>
                        <span className={`sa-scores__rank${i < 3 ? ` sa-scores__rank--${i + 1}` : ''}`}>{i + 1}</span>
                        <span className="sa-scores__who">
                          <span className="sa-scores__wallet">
                            {shortWallet(row.address)}
                            {you && <span className="sa-scores__you">You</span>}
                          </span>
                          <span className="sa-scores__meta">
                            {row.survived > 0 ? `${Math.round(row.survived)} s on one engine` : 'Short of 10,000 ft'}
                          </span>
                          <span className="sa-scores__progress" aria-hidden><i style={{ width: `${relativeProgress(row.score)}%` }} /></span>
                        </span>
                        <span className="sa-scores__score">{row.score.toLocaleString('en-US')}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            {selectedRow && (
              <div className="sa-scores__pilot-card" aria-live="polite">
                <div className="sa-scores__pilot-avatar" aria-hidden>{selected + 1}</div>
                <div className="sa-scores__pilot-copy">
                  <span className="sa-scores__pilot-kicker">Selected pilot · rank #{selected + 1}</span>
                  <strong>{shortWallet(selectedRow.address)}{selectedRow.address === address ? ' · you' : ''}</strong>
                  <small>
                    {selectedRow.survived > 0
                      ? `${Math.round(selectedRow.survived)} s after engine-out · climbed to the blast in ${Math.round(selectedRow.climb)} s`
                      : 'Run ended before the 10,000 ft brief'}
                  </small>
                </div>
                <span className="sa-scores__pilot-score">{selectedRow.score.toLocaleString('en-US')}</span>
              </div>
            )}
          </>
        )}

        <div className="sa-scores__stats">
          <span><small>Your best</small><strong>{best > 0 ? best.toLocaleString('en-US') : '—'}</strong></span>
          <span><small>Board leader</small><strong>{topScore > 0 ? topScore.toLocaleString('en-US') : '—'}</strong></span>
          <span><small>To Mars</small><strong>100M ft</strong></span>
        </div>
        <p className="sa-scores__fine">
          Fly from the landing to score. Posting signs a message, never a transaction. Select a pilot to inspect their flight card.
        </p>
      </div>
    </ModalWindow>
  );
}
