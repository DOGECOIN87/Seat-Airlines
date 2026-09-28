import { useId } from 'react';
import { formatActivityTime, shortSignature, transactionStatus, type WalletActivity as Activity } from '../lib/transactions';

/**
 * A seated holder's recent signatures, read off the chain.
 *
 * Drawn in two places — the readout beside the seat map and a seat's own
 * window — from the one poll the seat map is already running, so opening a
 * seat does not start a second one for the same wallet.
 */
export default function WalletActivity({ activity }: { activity: Activity }) {
  const title = useId();
  return (
    <section className="sa-activity" aria-labelledby={title}>
      <div className="sa-activity__head">
        <p id={title} className="sa-map__label">Recent wallet activity</p>
        <span className={`sa-activity__status ${activity.failed ? 'sa-activity__status--quiet' : ''}`}>
          {activity.loading ? 'Updating' : activity.configured ? 'Live' : 'RPC not set'}
        </span>
      </div>
      {!activity.configured ? (
        <p className="sa-activity__empty">Connect a Solana RPC endpoint to read confirmed transactions for this holder.</p>
      ) : activity.loading && !activity.rows.length ? (
        <p className="sa-activity__empty">Reading the chain…</p>
      ) : activity.failed ? (
        <p className="sa-activity__empty">Transaction history is temporarily unavailable. The wallet holder above is still live.</p>
      ) : activity.rows.length ? (
        <ul className="sa-activity__list">
          {activity.rows.map((transaction) => (
            <li key={transaction.signature} className="sa-activity__row">
              <span className={`sa-activity__dot ${transaction.err ? 'sa-activity__dot--failed' : ''}`} aria-hidden />
              <span className="sa-activity__copy">
                <a
                  href={`https://solscan.io/tx/${transaction.signature}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="sa-activity__signature"
                >
                  {shortSignature(transaction.signature)}
                </a>
                <span className="sa-activity__meta">{formatActivityTime(transaction.blockTime)} · {transactionStatus(transaction)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sa-activity__empty">No recent signatures found for this wallet.</p>
      )}
      {activity.refreshedAt && !activity.loading && (
        <p className="sa-activity__updated">Updated {formatActivityTime(Math.floor(activity.refreshedAt / 1000))}</p>
      )}
    </section>
  );
}
