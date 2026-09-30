import { useEffect, useMemo, useRef, useState } from 'react';
import type { Manifest, ManifestEntry } from '../lib/manifest';
import { CABIN_ZONES, type ZoneKey } from '../content/cabin';
import {
  ANNOUNCEMENT,
  canAnnounce,
  canMessage,
  canReadChannel,
  canViewContact,
  channelFor,
  defaultRole,
  isValidExternalUrl,
  outranks,
  sectionLabel,
  shortMember,
} from '../lib/sectionAccess';
import { EMPTY_PROFILE, SOCIALS, type NetworkingProfile, type SocialLinks } from '../lib/networkingApi';
import { useDirectory } from '../lib/useDirectory';

interface NetworkingHubProps {
  manifest: Manifest;
  address: string | null;
  viewerZone: ZoneKey | null;
  sign: (message: string) => Promise<string>;
  /**
   * Which half to draw. The directory — who is aboard, their cards, your own,
   * your introductions — and the chat — the PA and the cabins' rooms — each
   * open in a panel of their own beside the view. Both read the same session,
   * which is kept in storage, so moving between them signs nobody out.
   */
  part?: 'all' | 'directory' | 'chat';
}

const zoneAccent: Record<ZoneKey, string> = {
  deck: 'border-[#FF668F] bg-[#FFF2F5]',
  first: 'border-[#FF668F] bg-[#FFF2F5]',
  business: 'border-[#8E76E8] bg-[#F6F3FF]',
  exit: 'border-[#00A8D1] bg-[#EFFBFE]',
  economy: 'border-[#00A8D1] bg-[#EFFBFE]',
};

/**
 * The card's own fields, each with the keyboard it wants.
 *
 * A phone keyboard is chosen by these attributes and nothing else: without
 * them an email went in with a capital first letter and autocorrect turning
 * "gmail" into "gamil", and a link had no "/" or ".com" on the keys. The
 * lengths are the Worker's (`FIELD_LIMITS` in worker/src/networking.ts), so
 * what fits here is what is kept. The links stay `type="text"`: `url` would
 * have the browser refuse "example.com", which the card takes and completes.
 */
const CARD_FIELDS = [
  { key: 'displayName', label: 'Name or company', type: 'text', maxLength: 80, autoComplete: 'name', autoCapitalize: 'words' },
  { key: 'role', label: 'Role', type: 'text', maxLength: 120, autoComplete: 'organization-title', autoCapitalize: 'sentences' },
  {
    key: 'email', label: 'Email', maxLength: 254, type: 'email', inputMode: 'email', autoComplete: 'email',
    autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, placeholder: 'you@example.com',
  },
  {
    key: 'website', label: 'Website', type: 'text', maxLength: 300, inputMode: 'url', autoComplete: 'url',
    autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, placeholder: 'example.com',
  },
  {
    key: 'linkedin', label: 'LinkedIn', type: 'text', maxLength: 300, inputMode: 'url', autoComplete: 'off',
    autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, placeholder: 'linkedin.com/in/name',
  },
] as const satisfies readonly ({
  key: Exclude<keyof NetworkingProfile, 'links'>;
  label: string;
  type: 'text' | 'email';
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, 'maxLength' | 'inputMode' | 'autoComplete' | 'autoCapitalize' | 'autoCorrect' | 'spellCheck' | 'placeholder'>)[];

/**
 * A contact link as somebody types it, made into one.
 *
 * "example.com" is what people type, and the card used to refuse it with a
 * line about http:// that most of them then had to read twice. A bare
 * domain is completed to https; anything else is left as typed for the
 * check below it to refuse.
 */
function asLink(value: string): string {
  const raw = value.trim();
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return /^[\w-]+(\.[\w-]+)+(?:[/?#]|$)/.test(raw) ? `https://${raw}` : raw;
}

/** Where a message about the last thing somebody did is shown: beside it. */
type StatusAt = 'card' | 'intro' | 'room' | 'pa';

const StatusLine = ({ text, error, onDismiss, className = '' }: {
  text: string; error: boolean; onDismiss: () => void; className?: string;
}) => (
  <p
    role={error ? 'alert' : 'status'}
    className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-[11px] font-semibold ${error ? 'bg-[#FDECEC] text-[#96201F]' : 'bg-[#E8F7EF] text-[#17683B]'} ${className}`}
  >
    <span className="min-w-0 break-words">{text}</span>
    <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-my-1.5 -mr-2 grid h-8 w-8 shrink-0 place-items-center text-[16px] leading-none opacity-70">
      <span aria-hidden>×</span>
    </button>
  </p>
);

function holderName(entry: ManifestEntry): string {
  return `Holder ${entry.address.slice(0, 4)}`;
}

/** "Business, Exit Row and Economy" — a list a person would read aloud. */
const list = (items: string[]) =>
  items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const when = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <section className="ui-card" aria-label="Section networking">
    <div className="px-5 py-6 sm:px-7">
      {children}
    </div>
  </section>
);

/** A card's social accounts, each linked where its network has a page to link to. */
const SocialList = ({ links }: { links: SocialLinks | undefined }) => (
  <>
    {SOCIALS.map((social) => {
      const value = links?.[social.key];
      if (!value) return null;
      const href = social.href(value);
      const text = `${social.label} ${social.show(value)}`;
      return href
        ? <a key={social.key} className="underline" href={href} target="_blank" rel="noreferrer">{text}</a>
        : <span key={social.key}>{text}</span>;
    })}
  </>
);

const NetworkingHub = ({ manifest, address, viewerZone, sign, part = 'all' }: NetworkingHubProps) => {
  const directory = useDirectory(address, sign);
  const showDirectory = part !== 'chat';
  const showChat = part !== 'directory';
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<NetworkingProfile>(EMPTY_PROFILE);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState('');
  const [paDraft, setPaDraft] = useState('');
  /* Your own cabin is what you get by default. The rooms behind are yours to
     read, but they are somebody else's conversation, and opening on all five
     would bury your own section under whichever one is busiest. */
  const [listeningAft, setListeningAft] = useState(false);
  /* Which of the composers the status line belongs to. `card` is also
     everything that is not a composer's — signing in, a load — and goes
     where the line always has. */
  const [statusAt, setStatusAt] = useState<StatusAt>('card');
  const cardPanel = useRef<HTMLElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const [focusEdit, setFocusEdit] = useState(false);

  const published = address ? directory.profiles[address] : undefined;
  const currentEntry = manifest.entries.find((entry) => entry.address === address) ?? null;

  // The card the server holds is what the editor opens on. Re-synced when it
  // arrives, and left alone once somebody is typing into it.
  useEffect(() => {
    if (editing) return;
    setForm(published
      ? {
        displayName: published.displayName,
        role: published.role,
        email: published.email,
        website: published.website,
        linkedin: published.linkedin,
        /* A Worker from before the links has none to send. */
        links: published.links ?? {},
      }
      : EMPTY_PROFILE);
  }, [published, editing]);

  /* The rule, in the only terms that matter to the person reading it: the
     names of the cabins on either side of them. Stated rather than left to
     be worked out from a card that will not open. */
  const sections = useMemo(() => {
    if (!viewerZone) return null;
    /* Cabins with somebody in them, not cabins the aircraft has.
       Seats fill strictly by rank, so at the default manifest size the last
       one taken is the back of business and the two cabins behind it are
       empty — naming them would promise a reader thirty-eight rows of people
       who are not there. The hold is not a cabin at all: no manifest, no
       roster, no name to put to anybody in it. */
    const occupied = new Set(manifest.entries.map((entry) => entry.seat.zone));
    const ahead = CABIN_ZONES.filter((zone) => outranks(zone.key, viewerZone) && occupied.has(zone.key));
    const behind = CABIN_ZONES.filter((zone) => outranks(viewerZone, zone.key) && occupied.has(zone.key));
    return {
      ahead: list(ahead.map((zone) => sectionLabel(zone.key))),
      aheadCount: ahead.length,
      behind: list(behind.map((zone) => sectionLabel(zone.key))),
      behindCount: behind.length,
    };
  }, [viewerZone, manifest.entries]);
  const overheardBy = sections?.ahead ?? '';

  const senders = useMemo(() => {
    const byAddress = new Map(manifest.entries.map((entry) => [entry.address, entry] as const));
    return (from: string) => {
      const entry = byAddress.get(from);
      const name = directory.profiles[from]?.displayName;
      return name || (entry ? holderName(entry) : shortMember(from));
    };
  }, [manifest.entries, directory.profiles]);

  /* The cabins whose rooms this seat may listen to, behind it and occupied.
     Empty cabins are left out for the same reason the header leaves them out:
     naming a room with nobody in it promises a conversation that cannot
     exist. */
  const roomsAft = useMemo(() => {
    if (!viewerZone) return [];
    const occupied = new Set(manifest.entries.map((entry) => entry.seat.zone));
    return CABIN_ZONES
      .filter((zone) => zone.key !== viewerZone && canReadChannel(viewerZone, zone.key) && occupied.has(zone.key))
      .map((zone) => zone.key);
  }, [viewerZone, manifest.entries]);

  const rooms = viewerZone ? [viewerZone, ...(listeningAft ? roomsAft : [])] : [];

  /* After a save the editor goes, and the button that was focused goes with
     it — focus fell to the page, and a phone scrolled wherever it liked.
     It lands on the card's own Edit button instead, in the card it saved. */
  useEffect(() => {
    if (!focusEdit || editing) return;
    editButton.current?.focus({ preventScroll: true });
    editButton.current?.scrollIntoView({ block: 'nearest' });
    setFocusEdit(false);
  }, [focusEdit, editing]);

  /* The Edit button on your own seat in the roster opens the editor in the
     card panel, which on a phone is at the top of the list — a hundred cards
     above the button that was pressed. Brought into view, or the tap looked
     like it did nothing. */
  const openEditor = () => {
    setEditing(true);
    setStatusAt('card');
    requestAnimationFrame(() => cardPanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const dismiss = () => {
    directory.dismiss();
    setInvalid(null);
  };

  const postToRoom = async () => {
    if (!viewerZone) return;
    setStatusAt('room');
    const body = roomDraft.trim();
    if (!body) {
      setInvalid('Write something before posting.');
      return;
    }
    setInvalid(null);
    if (await directory.send(channelFor(viewerZone), body)) setRoomDraft('');
  };

  const announce = async () => {
    setStatusAt('pa');
    const body = paDraft.trim();
    if (!body) {
      setInvalid('Write an announcement first.');
      return;
    }
    setInvalid(null);
    if (await directory.send(ANNOUNCEMENT, body)) setPaDraft('');
  };

  const saveCard = async () => {
    setStatusAt('card');
    const card = { ...form, website: asLink(form.website), linkedin: asLink(form.linkedin) };
    setForm(card);
    if (![card.website, card.linkedin].every(isValidExternalUrl)) {
      setInvalid('Those links need to be web addresses, like example.com.');
      return;
    }
    if (card.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(card.email.trim())) {
      setInvalid('That email address does not look like one.');
      return;
    }
    setInvalid(null);
    if (await directory.save(card)) {
      setEditing(false);
      setFocusEdit(true);
    }
  };

  const submitMessage = async (target: ManifestEntry) => {
    if (!address || !canMessage(viewerZone, target.seat.zone, address, target.address)) return;
    setStatusAt('intro');
    const body = draft.trim();
    if (!body) {
      setInvalid('Write something first.');
      return;
    }
    setInvalid(null);
    if (await directory.send(target.address, body)) setDraft('');
  };

  if (!manifest.entries.length) {
    return (
      <Shell>
        <h3 className="font-heading text-2xl leading-tight text-ui-ink">Opens at boarding</h3>
        <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-ui-soft">Connect a wallet to see the roster.</p>
      </Shell>
    );
  }

  if (!directory.available) {
    return (
      <Shell>
        <h3 className="font-heading text-2xl leading-tight text-ui-ink">Directory offline</h3>
        <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-ui-soft">
          Set <code className="font-mono text-[12px]">VITE_DIRECTORY_API</code> to turn it on.
        </p>
      </Shell>
    );
  }

  const status = directory.error ?? invalid ?? directory.notice;
  const statusIsError = Boolean(directory.error ?? invalid);
  /* The line goes beside whatever it is about. It used to be one line at
     the foot of the card panel — which on a phone is the top of the sheet —
     so "Introduction sent", or why it was not, appeared a screen away from
     the box somebody had just pressed Send in. */
  const statusHere = (at: StatusAt, className?: string) =>
    status && statusAt === at
      ? <StatusLine text={status} error={statusIsError} onDismiss={dismiss} className={className} />
      : null;

  return (
    <section className="ui-card" aria-label={part === 'chat' ? 'Cabin chat' : 'Section networking'}>
      {showDirectory && (
      <header className="ui-rule-b px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-2xl leading-tight text-ui-ink">From your seat</h3>
            <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ui-soft">
              {sections ? (
                <>
                  You read <strong className="text-ui-ink">{sectionLabel(viewerZone as ZoneKey)}</strong>
                  {sections.behindCount ? <> and {sections.behind}</> : null}.
                </>
              ) : (
                'Connect a wallet to see who you can reach.'
              )}
            </p>
          </div>
          <div className="rounded-full border border-[#FFB300]/40 bg-[#FFF9E8] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8A5A00]">
            {viewerZone ? `${sectionLabel(viewerZone)} access` : 'Connect to unlock'}
          </div>
        </div>
      </header>
      )}

      {/* The PA.

          Above everything else because that is what a public address is: the
          one thing on this aeroplane the whole cabin hears at once, the hold
          included. It is shown to everybody and written by the flight deck,
          once a day, which is the perk their boarding pass has promised since
          long before there was anywhere to keep it. */}
      {showChat && directory.session && (directory.announcements.length > 0 || canAnnounce(viewerZone)) && (
        <div className={`${showDirectory ? 'border-t border-ui-line ' : ''}bg-[#FFFBEA] px-5 py-5 sm:px-7`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8A6D00]">The PA</p>
          {directory.announcements.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {directory.announcements.map((message) => (
                <li key={message.id} className="rounded-xl border border-[#E6D08A] bg-white/70 px-3.5 py-3">
                  <p className="text-[13px] leading-relaxed text-ui-ink">{message.body}</p>
                  <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-ui-faint">
                    {senders(message.from)} · {when(message.sentAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-ui-soft">Nothing announced yet.</p>
          )}

          {canAnnounce(viewerZone) && (
            <div className="mt-4 rounded-xl border border-[#E6D08A] bg-white/70 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8A6D00]">Yours to use</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ui-soft">One a day. Everyone hears it.</p>
              <textarea
                value={paDraft}
                onChange={(event) => setPaDraft(event.target.value)}
                placeholder="Cabin crew, doors to arrival…"
                rows={2}
                maxLength={1000}
                className="mt-2 w-full resize-none rounded-lg border border-ui-line bg-white px-3 py-2 text-[12px] text-ui-ink outline-none focus:border-[#C8A93B]"
              />
              <button type="button" onClick={() => void announce()} disabled={directory.saving} className="sa-cta mt-2 disabled:opacity-60">
                {directory.saving ? 'Announcing…' : 'Announce'} <span aria-hidden>→</span>
              </button>
              {statusHere('pa', 'mt-2')}
            </div>
          )}
        </div>
      )}

      {showDirectory && (
      <div className="grid gap-5 p-5 sm:p-7 @4xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="space-y-3">
          {manifest.entries.map((entry) => {
            const sameSection = canViewContact(viewerZone, entry.seat.zone);
            const messageable = canMessage(viewerZone, entry.seat.zone, address, entry.address);
            const active = selected === entry.address;
            const card = directory.profiles[entry.address];
            return (
              <article key={entry.address} className={`rounded-2xl border p-4 transition-colors ${zoneAccent[entry.seat.zone]}`}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() => {
                    setSelected(active ? null : entry.address);
                    /* The introduction's line belongs to the box it was
                       sent from; with that box closed it has nowhere to be. */
                    if (statusAt === 'intro') {
                      dismiss();
                      setStatusAt('card');
                    }
                  }}
                  aria-expanded={active}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-lg text-ui-ink">{card?.displayName || holderName(entry)}</span>
                      {entry.address === address && <span className="rounded-full bg-ui-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white">You</span>}
                    </span>
                    <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-ui-soft">
                      {sectionLabel(entry.seat.zone)} · seat {entry.seat.id} · {card?.role || defaultRole(entry.seat.zone)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-ui-deep">{active ? 'Close' : 'Open'}</span>
                </button>

                {active && (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    {sameSection ? (
                      <div className="space-y-2 text-[12px] text-ui-soft">
                        <p className="font-semibold text-ui-ink">
                          Contact card
                        </p>
                        {entry.address === address ? (
                          <>
                            <p>Seen by {sectionLabel(entry.seat.zone)} and every cabin ahead.</p>
                            <button type="button" onClick={() => (editing ? setEditing(false) : openEditor())} className="sa-cta mt-2">{editing ? 'Close' : 'Edit card'} <span aria-hidden>→</span></button>
                          </>
                        ) : !directory.session ? (
                          <p>Sign in to see contact details.</p>
                        ) : !card ? (
                          <p>No card yet.</p>
                        ) : card.readable ? (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                            <span>Email: {card.email || 'Not given'}</span>
                            {card.website && <a className="underline" href={card.website} target="_blank" rel="noreferrer">Website</a>}
                            {card.linkedin && <a className="underline" href={card.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                            <SocialList links={card.links} />
                          </div>
                        ) : (
                          /* The page thinks this card is level with you or
                             behind you and the server disagrees, so the two
                             are reading different seating — a directory with
                             no holder feed, or one still holding a minute-old
                             copy of it. Saying "forward of you" here would be
                             a confident wrong answer. */
                          <p>Links hidden while your seat syncs.</p>
                        )}
                        {messageable && directory.session && (
                          <div className="mt-4 rounded-xl border border-[#FF668F]/30 bg-white/70 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#B3265E]">
                              Introduction
                            </p>
                            {/* Nobody should learn this from the seat in front
                                quoting them. It is the first thing the box says. */}
                            <p className="mt-1.5 text-[11px] leading-relaxed text-ui-soft">
                              {overheardBy
                                ? `${overheardBy} can read this too.`
                                : 'Only the two of you can read this.'}
                            </p>
                            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Introduce yourself…" rows={3} maxLength={1000} className="mt-2 w-full resize-none rounded-lg border border-ui-line bg-white px-3 py-2 text-[12px] text-ui-ink outline-none focus:border-[#FF668F]" />
                            <button type="button" onClick={() => void submitMessage(entry)} disabled={directory.saving} className="sa-cta mt-2 disabled:opacity-60">{directory.saving ? 'Sending…' : 'Send'} <span aria-hidden>→</span></button>
                            {statusHere('intro', 'mt-2')}
                          </div>
                        )}
                        {/* There is no "you cannot write to this one" line any
                            more, and nothing to put in its place: a card you
                            can read is a card you can answer. The cabins you
                            cannot write to are the ones ahead of you, and they
                            do not reach this branch — they say so themselves,
                            below, in the terms that actually explain it. */}
                      </div>
                    ) : (
                      <p className="text-[12px] leading-relaxed text-ui-soft">Ahead of your cabin. Move up to read it.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* First when there is only room for one column, so signing in is not
            a hundred and seventy-eight cards down. */}
        <aside ref={cardPanel} className="order-first scroll-mt-4 rounded-2xl border border-ui-line bg-ui-bg p-4 sm:p-5 @4xl:order-none">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ui-deep">Your card</p>

          {!address ? (
            <p className="mt-4 text-[12px] leading-relaxed text-ui-soft">Connect a wallet to publish a card.</p>
          ) : !directory.session ? (
            <div className="mt-4 space-y-3 text-[12px] leading-relaxed text-ui-soft">
              <p>Sign a message to open the directory. No transaction.</p>
              <button type="button" onClick={() => { setStatusAt('card'); void directory.signIn(); }} disabled={directory.signingIn} className="sa-cta w-full justify-center disabled:opacity-60">
                {directory.signingIn ? 'Check your wallet…' : 'Sign in'} <span aria-hidden>→</span>
              </button>
            </div>
          ) : !currentEntry ? (
            <p className="mt-4 text-[12px] leading-relaxed text-ui-soft">Take a seat to publish a card.</p>
          ) : editing ? (
            /* A form, so the keyboard's Go key publishes as the button does.
               `noValidate` because the browser's own bubbles would refuse
               "example.com" in a field the card completes itself. */
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void saveCard();
              }}
              className="mt-4 space-y-3"
            >
              {CARD_FIELDS.map(({ key, label, ...field }) => (
                <label key={key} className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ui-faint">
                  {label}
                  <input
                    {...field}
                    value={form[key]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-ui-line bg-white px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-ui-ink outline-none placeholder:text-ui-faint/60 focus:border-ui-blue"
                  />
                </label>
              ))}
              {/* A handle, an @handle or the profile link all do: the server
                  keeps the handle, and says which one it could not read. */}
              {SOCIALS.map((social) => (
                <label key={social.key} className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ui-faint">
                  {social.label}
                  <input
                    type="text"
                    value={form.links[social.key] ?? ''}
                    placeholder={social.placeholder}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={300}
                    onChange={(event) => setForm((current) => ({ ...current, links: { ...current.links, [social.key]: event.target.value } }))}
                    className="mt-1 w-full rounded-lg border border-ui-line bg-white px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-ui-ink outline-none placeholder:text-ui-faint/60 focus:border-ui-blue"
                  />
                </label>
              ))}

              <p className="rounded-lg border border-ui-line bg-white px-3 py-2.5 text-[11px] leading-relaxed text-ui-soft">
                Holders only: your cabin and every cabin ahead.
              </p>
              <button type="submit" disabled={directory.saving} className="sa-cta w-full justify-center disabled:opacity-60">
                {directory.saving && statusAt === 'card' ? 'Publishing…' : 'Publish card'} <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setInvalid(null);
                }}
                className="block w-full py-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-ui-deep underline"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="mt-4 space-y-2 text-[12px] text-ui-soft">
              <p className="font-heading text-xl text-ui-ink">{form.displayName || shortMember(address)}</p>
              <p>{form.role || defaultRole(currentEntry.seat.zone)} · {sectionLabel(currentEntry.seat.zone)}</p>
              <p className="pt-2 text-[11px] leading-relaxed">
                {published ? `Published ${when(published.updated)}.` : 'Not published yet.'}
              </p>
              <button type="button" ref={editButton} onClick={openEditor} className="sa-cta mt-2">{published ? 'Edit card' : 'Publish a card'} <span aria-hidden>→</span></button>
            </div>
          )}

          {showDirectory && statusHere('card', 'mt-4')}

          {directory.session && (
            <div className="mt-5 border-t border-ui-line pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ui-deep">Introductions</p>
              {directory.loading ? (
                <p className="mt-3 text-[11px] text-ui-soft">Loading…</p>
              ) : directory.inbox.length ? (
                <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                  {directory.inbox.map((message) => (
                    <li key={message.id} className="rounded-xl border border-ui-line bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-ui-ink">{senders(message.from)}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-ui-soft">{message.body}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-ui-faint">{when(message.sentAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[11px] text-ui-soft">None yet.</p>
              )}
              {directory.sent.length > 0 && (
                <p className="mt-3 text-[11px] text-ui-soft">{directory.sent.length} sent.</p>
              )}

              {/* The other half of the rule: what carries forward from the
                  cabins behind you, because your seat is ahead of both ends
                  of it. */}
              {directory.overheard.length > 0 && (
                <div className="mt-5 border-t border-ui-line pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ui-deep">Overheard</p>
                  <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                    {directory.overheard.map((message) => (
                      <li key={message.id} className="rounded-xl border border-ui-line bg-white/60 px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-ui-ink">
                          {senders(message.from)} <span className="font-normal text-ui-faint">to</span> {senders(message.to)}
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-ui-soft">{message.body}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-ui-faint">{when(message.sentAt)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button type="button" onClick={() => void directory.signOut()} className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-ui-deep underline">
                Sign out
              </button>
            </div>
          )}

        </aside>
      </div>
      )}

      {/* The rooms.

          A cabin is somewhere to talk as well as somewhere to sit. You post
          in your own and read every one behind it — so the reading is the
          same line as a contact card, and the posting is narrower than both.
          A section's conversation belongs to the people sitting in it.

          Opens on your own cabin. The rest are a button away rather than
          always on, because five rooms at once buries the one you are in
          under whichever is busiest. */}
      {showChat && directory.session && viewerZone && (
        <div className={`${showDirectory || directory.announcements.length > 0 || canAnnounce(viewerZone) ? 'border-t border-ui-line ' : ''}px-5 py-6 sm:px-7`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ui-deep">The rooms</p>
              <h3 className="font-heading mt-1 text-xl leading-tight text-ui-ink">
                {sectionLabel(viewerZone)} is talking
              </h3>
            </div>
            {roomsAft.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const next = !listeningAft;
                  setListeningAft(next);
                  /* The sign-in only asked for the room you are sitting in,
                     because that is the one the hub draws. This is the moment
                     somebody says they want the rest, so this is when they
                     are fetched. */
                  if (next) void directory.hearAft();
                }}
                aria-pressed={listeningAft}
                className="rounded-full border border-ui-line px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ui-deep transition-colors hover:bg-black/5"
              >
                {listeningAft
                  ? `Just ${sectionLabel(viewerZone)}`
                  : `Listen to ${list(roomsAft.map((zone) => sectionLabel(zone)))} too`}
              </button>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-ui-line bg-white/70 p-3.5">
            <textarea
              value={roomDraft}
              onChange={(event) => setRoomDraft(event.target.value)}
              placeholder={`Say something to ${sectionLabel(viewerZone)}…`}
              rows={2}
              maxLength={1000}
              className="w-full resize-none rounded-lg border border-ui-line bg-white px-3 py-2 text-[12px] text-ui-ink outline-none focus:border-[#FF668F]"
            />
            <button type="button" onClick={() => void postToRoom()} disabled={directory.saving} className="sa-cta mt-2 disabled:opacity-60">
              {directory.saving ? 'Posting…' : 'Post'} <span aria-hidden>→</span>
            </button>
            {statusHere('room', 'mt-2')}
          </div>

          <div className={`mt-5 grid gap-4 ${rooms.length > 1 ? '@3xl:grid-cols-2' : ''}`}>
            {rooms.map((zone) => {
              /* Absent is not empty. A room the server has not been asked for
                 yet is still on its way; one it sent with nothing in it is
                 quiet. Saying "quiet back there" about a room nobody has
                 fetched would be a confident wrong answer. */
              const said = directory.channels[zone];
              return (
                <div key={zone} className={`rounded-2xl border p-4 ${zoneAccent[zone]}`}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ui-deep">
                    {sectionLabel(zone)}
                    {zone === viewerZone ? ' · yours' : ' · listening'}
                  </p>
                  {said === undefined ? (
                    <p className="mt-3 text-[11px] text-ui-soft">Listening…</p>
                  ) : said.length ? (
                    <ul className="mt-3 max-h-72 space-y-2.5 overflow-y-auto pr-1">
                      {said.map((message) => (
                        <li key={message.id} className="rounded-xl border border-ui-line bg-white/80 px-3 py-2.5">
                          <p className="text-[11px] font-semibold text-ui-ink">{senders(message.from)}</p>
                          <p className="mt-1 text-[12px] leading-relaxed text-ui-soft">{message.body}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-ui-faint">{when(message.sentAt)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[11px] text-ui-soft">
                      {zone === viewerZone ? 'No messages yet.' : 'Quiet back there.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* The chat on its own, before there is anything to show: what it takes
          to get in, said once, with the one button that does it. */}
      {part === 'chat' && !(directory.session && viewerZone) && (
        <div className="px-5 py-6 sm:px-7">
          {!address ? (
            <p className="text-[12px] leading-relaxed text-ui-soft">Connect a wallet to join your cabin.</p>
          ) : !directory.session ? (
            <div className="space-y-3 text-[12px] leading-relaxed text-ui-soft">
              <p>Sign a message to join. No transaction.</p>
              <button type="button" onClick={() => { setStatusAt('card'); void directory.signIn(); }} disabled={directory.signingIn} className="sa-cta w-full justify-center disabled:opacity-60">
                {directory.signingIn ? 'Check your wallet…' : 'Sign in'} <span aria-hidden>→</span>
              </button>
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-ui-soft">Take a seat to join a cabin.</p>
          )}
        </div>
      )}
      {part === 'chat' && statusHere('card', 'mx-5 mb-5 sm:mx-7')}
    </section>
  );
};

export default NetworkingHub;
