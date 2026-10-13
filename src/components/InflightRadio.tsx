import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { CHANNELS, clock } from '../lib/audius';
import { radio, useRadio } from '../lib/useRadio';
import { DeckIcon } from './InstrumentDeck';
import AudiusLogo from './AudiusLogo';
import './InflightRadio.css';

/**
 * The in-flight radio: Audius's charts and catalogue, in a workspace tab.
 *
 * Drawn in the panel's own parts rather than a player's: what is playing is
 * one of the cockpit's displays, dark glass set into a raised console with
 * the transport under it; the channels are the same sunk track the walk
 * uses; and the list is the leaderboard's rows, the playing one lit the way
 * your own row is lit there.
 *
 * Everything that plays lives in `useRadio`, so this panel can be closed,
 * moved or nested without the music noticing. It asks Audius for its first
 * list when it first opens, and not before.
 */

const seg = (on: boolean) => `sa-seg__btn${on ? ' is-on' : ''}`;

/** How far along a range is, for the lit part of its track. */
const fill = (value: number, max: number): CSSProperties =>
  ({ '--fill': `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }) as CSSProperties;

export default function InflightRadio() {
  const r = useRadio();
  const [query, setQuery] = useState(r.source.kind === 'search' ? r.source.query : '');
  /* Where the seek bar is being dragged to. Committed on release, so a drag
     is one seek rather than a stream of them stuttering the audio. */
  const [scrub, setScrub] = useState<number | null>(null);
  const lastVolume = useRef(r.volume || 0.7);

  useEffect(() => {
    radio.ensureLoaded();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    radio.search(query);
  };
  const commit = () => {
    if (scrub === null) return;
    radio.seek(scrub);
    setScrub(null);
  };
  const mute = () => {
    if (r.volume > 0) {
      lastVolume.current = r.volume;
      radio.setVolume(0);
    } else {
      radio.setVolume(lastVolume.current || 0.7);
    }
  };

  const track = r.current;
  const tuned = r.source.kind === 'channel' ? r.source.channel.key : null;
  const heading = r.source.kind === 'search' ? `Results · ${r.source.query}` : `${r.source.channel.label} on Audius`;
  const position = scrub ?? r.position;
  const live = r.playing && !r.buffering;
  const tag = r.buffering ? 'Buffering' : r.playing ? 'On air' : track ? 'Paused' : 'Standby';

  return (
    <div className="sa-radio">
      {/* ── The console: the display, and the transport under it ── */}
      <div className="sa-radio__console">
        <section className="sa-radio__screen" aria-label="Now playing">
          <div className="sa-radio__art">
            {track?.artwork
              ? <img key={track.artwork} src={track.artwork} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              : <DeckIcon name="radio" />}
          </div>
          <div className="sa-radio__meta">
            <div className="sa-radio__labels">
              <span className="sa-radio__label">Now playing</span>
              <span className={`sa-radio__tag${live ? ' is-live' : ''}`}>{tag}</span>
              <a className="sa-radio__brand" href="https://audius.co" target="_blank" rel="noopener noreferrer" aria-label="Audius" title="Streaming from Audius">
                <AudiusLogo />
              </a>
            </div>
            <p className="sa-radio__title">
              {track?.link
                ? <a href={track.link} target="_blank" rel="noopener noreferrer" title="Open on Audius">{track.title}</a>
                : track?.title ?? 'Nothing playing'}
            </p>
            <p className="sa-radio__artist">{track?.artist ?? 'Pick a channel or search Audius'}</p>
          </div>
          <div className="sa-radio__seek">
            <span>{clock(position)}</span>
            <input
              type="range"
              className="sa-radio__range"
              min={0}
              max={Math.max(1, Math.floor(r.duration))}
              step={1}
              value={Math.min(position, r.duration || 0)}
              style={fill(position, r.duration)}
              disabled={!track || !r.duration}
              onChange={(e) => setScrub(Number(e.target.value))}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
              aria-label="Seek"
              aria-valuetext={`${clock(position)} of ${clock(r.duration)}`}
            />
            <span>{clock(r.duration)}</span>
          </div>
        </section>

        <div className="sa-radio__controls">
          <div className="sa-radio__transport">
            <button type="button" className="ui-round" onClick={radio.previous} disabled={!r.queue.length} aria-label="Previous track">
              <DeckIcon name="previous" />
            </button>
            <button
              type="button"
              className="sa-radio__play"
              onClick={radio.toggle}
              disabled={!track && !r.list.length}
              aria-label={r.playing ? 'Pause' : 'Play'}
            >
              <DeckIcon name={r.playing ? 'pause' : 'play'} />
            </button>
            <button type="button" className="ui-round" onClick={radio.next} disabled={!r.queue.length} aria-label="Next track">
              <DeckIcon name="next" />
            </button>
          </div>
          {r.volumeControl && (
            <div className="sa-radio__volume">
              <button type="button" className="ui-round" onClick={mute} aria-label={r.volume > 0 ? 'Mute the radio' : 'Unmute the radio'}>
                <DeckIcon name={r.volume > 0 ? 'sound' : 'mute'} />
              </button>
              <input
                type="range"
                className="sa-radio__range"
                min={0}
                max={1}
                step={0.05}
                value={r.volume}
                style={fill(r.volume, 1)}
                onChange={(e) => radio.setVolume(Number(e.target.value))}
                aria-label="Radio volume"
              />
            </div>
          )}
        </div>
        <p className="sr-only" role="status">{r.message}</p>
      </div>

      {/* ── Tuning: a channel, or a search ── */}
      <div className="sa-radio__tune">
        <span className="sa-strip-label">Channel</span>
        <div className="sa-seg" role="group" aria-label="Channels">
          {CHANNELS.map((c) => (
            <button key={c.key} type="button" onClick={() => radio.tune(c)} aria-pressed={tuned === c.key} className={seg(tuned === c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <form className="sa-radio__search" role="search" onSubmit={submit}>
        <input
          type="search"
          className="ui-field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Audius for a track or artist"
          aria-label="Search Audius"
          maxLength={100}
        />
        <button type="submit" className="ui-pill">Search</button>
      </form>

      {/* ── The list ── */}
      <div className="sa-radio__head">
        <h3 className="sa-radio__heading">{heading}</h3>
        {r.status === 'ready' && r.list.length > 0 && <span className="sa-radio__count">{r.list.length} tracks</span>}
      </div>
      {r.status === 'loading' && <p className="sa-radio__state" role="status">Tuning in…</p>}
      {r.status === 'error' && (
        <p className="sa-radio__state">
          Audius is not answering right now.
          <button type="button" className="ui-pill" onClick={radio.retry}>Try again</button>
        </p>
      )}
      {r.status === 'ready' && !r.list.length && <p className="sa-radio__state">{r.message}</p>}
      {r.list.length > 0 && (
        <ol className="sa-radio__list">
          {r.list.map((t, i) => {
            const on = track?.id === t.id;
            return (
              <li key={t.id} className={on ? 'is-on' : undefined}>
                <button type="button" onClick={() => radio.playAt(i)} aria-current={on ? 'true' : undefined}>
                  <span className="sa-radio__no">{on && r.playing ? <DeckIcon name="sound" /> : i + 1}</span>
                  <span className="sa-radio__thumb">{t.artwork && <img src={t.artwork} alt="" loading="lazy" />}</span>
                  <span className="sa-radio__row">
                    <span className="sa-radio__row-title">{t.title}</span>
                    <span className="sa-radio__row-artist">{t.artist}</span>
                  </span>
                  <span className="sa-radio__len">{t.duration ? clock(t.duration) : ''}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <p className="sa-radio__credit">
        Streaming from <a href="https://audius.co" target="_blank" rel="noopener noreferrer">Audius</a>. Open a
        track’s title to follow its artist there.
      </p>
    </div>
  );
}
