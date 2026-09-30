/**
 * The directory, as the hub sees it.
 *
 * One place that knows whether this browser holds a session, what the server
 * says is in the directory, and which of the four things that can go wrong
 * has gone wrong — so the component below is a view of that rather than a
 * pile of fetches.
 *
 * Nothing loads until there is a session. The roster and the inbox are both
 * private, so there is nothing to show a visitor who has not signed in, and
 * asking for it anyway would only produce a 401 per page view.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DirectoryRefused, DirectoryUnreachable, SessionExpired,
  fetchDirectory, fetchMessages, hasDirectory, saveProfile, sendMessage,
  onStoredSessionChange, signIn as openSession, signOut as closeSession, storedSession,
  type NetworkingMessage, type NetworkingProfile, type PublishedProfile, type Session,
} from './networkingApi';
import { ANNOUNCEMENT, zoneOfChannel } from './sectionAccess';
import type { ZoneKey } from '../content/cabin';

export interface DirectoryState {
  /** Whether this deployment has a directory service at all. */
  available: boolean;
  session: Session | null;
  /** Every published card, keyed by wallet. Empty until signed in. */
  profiles: Record<string, PublishedProfile>;
  inbox: NetworkingMessage[];
  sent: NetworkingMessage[];
  /** Your own cabin's room, keyed by its section. */
  channels: Partial<Record<ZoneKey, NetworkingMessage[]>>;
  /** The PA, newest first. */
  announcements: NetworkingMessage[];
  loading: boolean;
  /** True while a signature is being waited on. */
  signingIn: boolean;
  /** True while a card or an introduction is in flight. */
  saving: boolean;
  error: string | null;
  notice: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  save: (profile: NetworkingProfile) => Promise<boolean>;
  send: (to: string, body: string) => Promise<boolean>;
  dismiss: () => void;
}

/** Whether this browser will keep anything in `localStorage` at all. */
function storageWorks(): boolean {
  try {
    const probe = '__seat-airlines-probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** What to tell somebody, from whatever was thrown. */
function reason(e: unknown): string {
  /* Whatever the directory itself said is always repeated. The quiet case
     below used to be tested against every error, so a refusal from the
     server that happened to contain "denied" or "cancel" was dropped on the
     floor and the button simply stopped spinning. */
  if (e instanceof DirectoryUnreachable || e instanceof SessionExpired || e instanceof DirectoryRefused) return e.message;
  const message = e instanceof Error ? e.message : String(e);
  // A refused signing prompt is a choice, not a failure worth shouting about.
  return /reject|denied|cancel/i.test(message) ? '' : message;
}

export function useDirectory(
  address: string | null,
  sign: (message: string) => Promise<string>,
): DirectoryState {
  const [session, setSession] = useState<Session | null>(() => storedSession(address));
  const [profiles, setProfiles] = useState<Record<string, PublishedProfile>>({});
  const [inbox, setInbox] = useState<NetworkingMessage[]>([]);
  const [sent, setSent] = useState<NetworkingMessage[]>([]);
  const [channels, setChannels] = useState<Partial<Record<ZoneKey, NetworkingMessage[]>>>({});
  const [announcements, setAnnouncements] = useState<NetworkingMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* One write at a time, decided before React has re-rendered. The buttons
     are disabled on `saving`, but a double tap lands both taps before that
     render, and the second one published the card twice or sent the same
     introduction twice — the second spending one of the hour's twenty. */
  const writing = useRef(false);
  /* Which sign-in the button is waiting on. A later press, or giving up on
     one, moves it on, so an old attempt that settles late cannot flip the
     button back — though a signature it brings back is still used. */
  const attempt = useRef(0);
  /* There used to be a "still mounted?" ref here, checked after every await.
  
     It was re-armed on mount rather than only cleared on unmount, because
     StrictMode tears every effect down and builds it again in development and
     a ref that is only ever set false stays false for the rest of the page's
     life. That fixed the development case and left the one that actually bit:
     this panel renders inside a `<Suspense>` boundary, and when a boundary
     re-suspends React runs every effect's *cleanup* without unmounting
     anything. A signature approved in that window came back to a ref saying
     the component was gone, and the session was discarded — a token left in
     storage, the panel stuck on "Check your wallet…", and no way out of it
     but a reload.
  
     The guard was never buying anything either way: React 18 dropped the
     warning it was written for, because an update to a component that has
     genuinely gone is simply discarded. So it is gone, and every result below
     is allowed to land. */

  // A session belongs to one wallet. Reconnecting as somebody else starts over.
  useEffect(() => {
    setSession(storedSession(address));
    setProfiles({});
    setInbox([]);
    setSent([]);
    setChannels({});
    setAnnouncements([]);
    setError(null);
    setNotice(null);
  }, [address]);

  const load = useCallback(async (current: Session) => {
    setLoading(true);
    try {
      const [directory, messages] = await Promise.all([fetchDirectory(current), fetchMessages(current)]);
      setProfiles(directory);
      setInbox(messages.inbox);
      setSent(messages.sent);
      setChannels(messages.channels ?? {});
      setAnnouncements(messages.announcements ?? []);
      setError(null);
    } catch (e) {
      if (e instanceof SessionExpired) setSession(null);
      setError(reason(e) || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session);
  }, [session, load]);

  /* A session opened somewhere else in this browser is this one's too.

     Another tab signing in fires a storage event here; coming back to this
     tab re-reads storage as well, for the cases that never send one (a page
     restored from the back-forward cache, a browser that drops events for
     a tab in the background). Only ever adopts or drops the stored session
     for this wallet: `storedSession` refuses anybody else's. */
  useEffect(() => {
    const recheck = () => {
      const stored = storedSession(address);
      setSession((current) => {
        if (stored?.token === current?.token) return current;
        if (stored) return stored;
        /* Nothing stored: leave a live in-memory session alone, since storage
           may simply be blocked; drop one another tab has signed out. */
        return current && current.expires > Date.now() && storageWorks() ? null : current;
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    const stop = onStoredSessionChange(recheck);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', recheck);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', recheck);
    };
  }, [address]);

  /* A signing prompt that never answers.

     A wallet's in-app sheet can be swiped away, or the app backgrounded and
     the page with it, without the promise ever settling either way — and the
     button then said "Check your wallet…" for good, disabled, with a reload
     the only way out. If the page comes back to the front and the wallet has
     still not answered a few seconds later, or two minutes go by (the
     signature would be past its five-minute window by the time anybody
     noticed), the button is given back. */
  useEffect(() => {
    if (!signingIn) return;
    const waiting = attempt.current;
    const giveUp = () => {
      if (attempt.current !== waiting) return;
      attempt.current += 1;
      setSigningIn(false);
      setError('The wallet did not answer. Try signing in again.');
    };
    let grace = 0;
    const onVisible = () => {
      window.clearTimeout(grace);
      if (document.visibilityState === 'visible') grace = window.setTimeout(giveUp, 8_000);
    };
    const limit = window.setTimeout(giveUp, 120_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(grace);
      window.clearTimeout(limit);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signingIn]);

  const signIn = useCallback(async () => {
    if (!address) return;
    const mine = ++attempt.current;
    setSigningIn(true);
    setError(null);
    try {
      const opened = await openSession(address, sign);
      setSession(opened);
      setError(null);
    } catch (e) {
      const message = reason(e);
      if (message && attempt.current === mine) setError(message);
    } finally {
      if (attempt.current === mine) setSigningIn(false);
    }
  }, [address, sign]);

  const signOut = useCallback(async () => {
    const current = session;
    setSession(null);
    setProfiles({});
    setInbox([]);
    setSent([]);
    setChannels({});
    setAnnouncements([]);
    setNotice(null);
    await closeSession(current);
  }, [session]);

  const save = useCallback(async (profile: NetworkingProfile) => {
    if (!session || writing.current) return false;
    writing.current = true;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const published = await saveProfile(session, profile);
      setProfiles((current) => ({ ...current, [published.address]: published }));
      setNotice('Your card is published to the cabin directory.');
      return true;
    } catch (e) {
      if (e instanceof SessionExpired) setSession(null);
      setError(reason(e) || null);
      return false;
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }, [session]);

  const send = useCallback(async (to: string, body: string) => {
    if (!session || writing.current) return false;
    writing.current = true;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const message = await sendMessage(session, to, body);
      /* Put it where it will be read back from, so the page shows it without
         waiting for the next poll. Three destinations, the same three the
         server sorts by. */
      const room = zoneOfChannel(to);
      if (to === ANNOUNCEMENT) {
        setAnnouncements((current) => [message, ...current]);
        setNotice('Announcement made. The whole aircraft can hear it.');
      } else if (room) {
        setChannels((current) => ({ ...current, [room]: [message, ...(current[room] ?? [])] }));
        setNotice('Posted to your section.');
      } else {
        setSent((current) => [message, ...current]);
        setNotice('Introduction sent.');
      }
      return true;
    } catch (e) {
      if (e instanceof SessionExpired) setSession(null);
      setError(reason(e) || null);
      return false;
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }, [session]);

  const dismiss = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return {
    available: hasDirectory,
    session, profiles, inbox, sent, channels, announcements,
    loading, signingIn, saving, error, notice,
    signIn, signOut, save, send, dismiss,
  };
}
