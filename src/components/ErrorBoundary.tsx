import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The last line before a blank page.
 *
 * Without one, any error while rendering unmounts the whole app and leaves
 * a white screen: what a holder in Nightly's in-app browser saw going from
 * the game's end screen into the cabin. Two causes are handled:
 *
 *  - A part of the app that loads on demand (the cabin, the views) no longer
 *    exists, because the site was deployed again after this page loaded and
 *    those files were renamed. The page reloads itself, once, onto the new
 *    version.
 *  - Anything else: a plain screen that says so, shows the error, and offers
 *    a reload, rather than nothing.
 */

const RELOADED = 'sa.reloaded-for-update';

/** True for a module or chunk that failed to load. */
export const isLoadFailure = (e: unknown): boolean =>
  /dynamically imported module|Importing a module script failed|error loading dynamically|Loading chunk|ChunkLoadError|Failed to fetch/i
    .test(e instanceof Error ? `${e.name} ${e.message}` : String(e));

/** Reloads once per minute at most, so a page that keeps failing cannot reload forever. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

interface State { error: Error | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    if (isLoadFailure(error)) reloadOnce();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="sa-crash" role="alert">
        <div className="sa-crash__card">
          <p className="sa-crash__eyebrow">Seat Airlines</p>
          <h1 className="sa-crash__title">We hit some turbulence</h1>
          <p className="sa-crash__body">The page ran into a problem. Reloading usually fixes it.</p>
          <button type="button" className="sa-cta sa-shine sa-crash__button" onClick={() => window.location.reload()}>
            Reload <span aria-hidden>→</span>
          </button>
          <p className="sa-crash__detail">{error.message || String(error)}</p>
        </div>
      </div>
    );
  }
}
