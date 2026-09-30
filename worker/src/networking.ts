/**
 * The cabin directory: what a profile and a message are allowed to be.
 *
 * Split out from the Worker for the same reason `verify.ts` is — nothing in
 * here is Cloudflare-shaped, so the rules that decide whether a stranger can
 * write to somebody else's card can be run and tested without deploying
 * anything.
 *
 * ── Why a session token and not a signature per write ─────────────────────
 * The advert path signs every publish, because a publish is rare and pins one
 * exact image. The directory is the opposite: a holder saves a card, reads
 * the roster, sends a note, reads their replies. A wallet popup per action
 * would make the hub unusable, and people who are asked to sign constantly
 * stop reading what they sign.
 *
 * So the wallet signs once, for a session: the signature proves the key, and
 * what comes back is a bearer token good for a day. The token is stored here
 * only as a SHA-256 of itself, so this table cannot be read back into
 * anybody's account.
 */

import { fromBase58, sha256Hex } from './verify';

/** How long a signed-in session lasts before the wallet is asked again. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** How far out of date a sign-in signature may be. Same bound as an advert. */
export const SIGNIN_MAX_AGE_MS = 5 * 60 * 1000;
/** Anything one wallet may send an hour: introductions and room posts alike. */
export const MESSAGES_PER_HOUR = 20;
/** How many of each direction, and of each room, the hub reads back. */
export const MESSAGE_PAGE = 50;
/**
 * The PA, rationed by the day rather than the hour.
 *
 * A thing said once a day is listened to; a thing said twenty times is
 * weather. This is the number the boarding pass has printed on it — *"You
 * have the PA. One announcement a day. Use it well."* — and it was a promise
 * on a ticket long before there was anywhere to keep it.
 */
export const ANNOUNCEMENTS_PER_DAY = 1;
/** How far back the PA is read. It is a notice board, not a history. */
export const ANNOUNCEMENT_PAGE = 5;
/** Long enough for an introduction, short of an essay. */
export const MAX_BODY_CHARS = 1_000;

const FIELD_LIMITS = {
  displayName: 80,
  role: 120,
  email: 254,
  website: 300,
  linkedin: 300,
} as const;

/* ── Social links ────────────────────────────────────────────────────────
   Beside the email, the website and LinkedIn: the accounts people are
   actually reached on. Each is kept as its handle, never as a link, and the
   page builds the one link each network has from it — so what goes out on
   a card is always `https://x.com/<handle>` and never whatever somebody
   typed. Discord is the exception that proves it: a username has no page to
   link to, so it is kept as text, and only an invite is kept as a link, and
   only on discord.gg.

   A holder can type a handle, an @handle, or paste the link from their
   profile; all three come out the same. Anything that is not a handle the
   network itself would accept is refused rather than stored. */

export const SOCIAL_NETWORKS = ['x', 'telegram', 'discord', 'linktree', 'instagram', 'tiktok', 'youtube', 'github'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export type SocialLinks = Partial<Record<SocialNetwork, string>>;

interface SocialRule {
  label: string;
  /** Hosts a pasted profile link may be on, `www.` aside. */
  hosts: readonly string[];
  /**
   * What the handle's part of a pasted link starts with, where the network
   * puts one there (`youtube.com/@name`): a link without it is some other
   * page of theirs (`youtube.com/channel/…`), not a handle.
   */
  prefix?: string;
  handle: RegExp;
}

const SOCIAL_RULES: Record<SocialNetwork, SocialRule> = {
  x: { label: 'X', hosts: ['x.com', 'twitter.com'], handle: /^[A-Za-z0-9_]{1,15}$/ },
  telegram: { label: 'Telegram', hosts: ['t.me', 'telegram.me'], handle: /^[A-Za-z0-9_]{5,32}$/ },
  discord: { label: 'Discord', hosts: [], handle: /^[a-z0-9_.]{2,32}$/ },
  linktree: { label: 'Linktree', hosts: ['linktr.ee'], handle: /^[A-Za-z0-9_.]{1,30}$/ },
  instagram: { label: 'Instagram', hosts: ['instagram.com'], handle: /^[A-Za-z0-9_.]{1,30}$/ },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com'], prefix: '@', handle: /^[A-Za-z0-9_.]{2,24}$/ },
  youtube: { label: 'YouTube', hosts: ['youtube.com'], prefix: '@', handle: /^[A-Za-z0-9_.-]{3,30}$/ },
  github: { label: 'GitHub', hosts: ['github.com'], handle: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/ },
};

/** A Discord invite: its code, from discord.gg/… or discord.com/invite/…. */
const DISCORD_INVITE = /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)([A-Za-z0-9-]{2,32})\/?$/i;

/**
 * One network's entry as it is kept — a handle, or for Discord an invite
 * link — or null when it is not one. Empty is fine and means none.
 */
export function readSocial(network: SocialNetwork, value: string): string | null {
  const raw = value.trim();
  if (!raw) return '';
  if (network === 'discord') {
    const invite = DISCORD_INVITE.exec(raw);
    if (invite) return `https://discord.gg/${invite[1]}`;
    const name = raw.replace(/^@/, '').toLowerCase();
    return SOCIAL_RULES.discord.handle.test(name) ? name : null;
  }
  const rule = SOCIAL_RULES[network];
  let handle = raw;
  if (/^(?:https?:\/\/)?(?:www\.|m\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, '');
    if (!rule.hosts.includes(host)) return null;
    handle = url.pathname.split('/').filter(Boolean)[0] ?? '';
    if (rule.prefix && !handle.startsWith(rule.prefix)) return null;
  }
  handle = handle.replace(/^@/, '');
  return rule.handle.test(handle) ? handle : null;
}

/** Every network's entry, or the first that is not one. Unknown networks are dropped. */
export function readSocialLinks(value: unknown): { links: SocialLinks } | { error: string } {
  const links: SocialLinks = {};
  if (value === undefined || value === null) return { links };
  if (typeof value !== 'object') return { error: 'Those social links were not a list.' };
  const v = value as Record<string, unknown>;
  for (const network of SOCIAL_NETWORKS) {
    const entry = v[network];
    if (entry === undefined || entry === null || entry === '') continue;
    if (typeof entry !== 'string' || entry.length > 300) return { error: `That ${SOCIAL_RULES[network].label} account does not look right.` };
    const kept = readSocial(network, entry);
    if (kept === null) return { error: `That ${SOCIAL_RULES[network].label} account does not look right.` };
    if (kept) links[network] = kept;
  }
  return { links };
}

/** Links as they were stored, read back defensively: a bad row is no links, not an error. */
export function parseStoredLinks(json: string | null | undefined): SocialLinks {
  if (!json) return {};
  try {
    const out = readSocialLinks(JSON.parse(json));
    return 'links' in out ? out.links : {};
  } catch {
    return {};
  }
}

export interface NetworkingProfile {
  displayName: string;
  role: string;
  email: string;
  website: string;
  linkedin: string;
  links: SocialLinks;
}

export interface NetworkingMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  sentAt: string;
}

export const EMPTY_PROFILE: NetworkingProfile = {
  displayName: '', role: '', email: '', website: '', linkedin: '', links: {},
};

/** A Solana address is a 32-byte ed25519 key wearing base58. */
export function isAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  const bytes = fromBase58(value);
  return bytes !== null && bytes.length === 32;
}

/**
 * The text a holder signs to open a session. Readable on purpose: this is
 * what appears in the wallet popup, and it says what it gets them.
 */
export function signInChallenge(address: string, issued: string): string {
  return [
    'SEAT AIRLINES',
    'Sign in to the cabin directory.',
    '',
    'This lets you publish your card, read your section, and send and',
    'receive introductions for one day. It authorises no transaction.',
    '',
    `wallet: ${address}`,
    `issued: ${issued}`,
  ].join('\n');
}

/** Only http(s). A contact link is not a place to accept `javascript:`. */
export function isValidExternalUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Characters nobody types on purpose, and that change what text *looks*
 * like without being seen: control codes, zero-width spaces, a byte-order
 * mark, and the bidirectional overrides and isolates — the last of which
 * turn a display name into somebody else's by drawing it backwards. The
 * zero-width joiner is left alone; emoji are built out of it.
 *
 * Line breaks and tabs are listed separately, because a message may keep
 * them and a single-line field may not.
 */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Text as it is kept: nothing invisible, and newlines only where allowed. */
export function cleanText(value: string, multiline = false): string {
  const visible = value.replace(INVISIBLE, '');
  return multiline
    ? visible.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : visible.replace(/\s+/g, ' ').trim();
}

function field(value: unknown, limit: number): string {
  return typeof value === 'string' ? cleanText(value).slice(0, limit) : '';
}

/**
 * A submitted card, or the reason it was refused.
 *
 * Everything is optional — a holder who fills in nothing but a name has a
 * valid card — but a link that is not a link is refused rather than stored
 * and rendered as one.
 */
export function readProfileInput(value: unknown): { profile: NetworkingProfile } | { error: string } {
  if (!value || typeof value !== 'object') return { error: 'That card was not an object.' };
  const v = value as Record<string, unknown>;
  const socials = readSocialLinks(v.links);
  if ('error' in socials) return { error: socials.error };
  const profile: NetworkingProfile = {
    displayName: field(v.displayName, FIELD_LIMITS.displayName),
    role: field(v.role, FIELD_LIMITS.role),
    email: field(v.email, FIELD_LIMITS.email),
    website: field(v.website, FIELD_LIMITS.website),
    linkedin: field(v.linkedin, FIELD_LIMITS.linkedin),
    links: socials.links,
  };
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    return { error: 'That email address does not look like one.' };
  }
  for (const link of [profile.website, profile.linkedin]) {
    if (!isValidExternalUrl(link)) {
      return { error: 'Use a full http:// or https:// link for contact URLs.' };
    }
  }
  return { profile };
}

/** An introduction's text, or the reason it is not one. */
export function readMessageBody(value: unknown): { body: string } | { error: string } {
  if (typeof value !== 'string') return { error: 'That message was not text.' };
  /* Cleaned before the empty check, so a message of nothing but zero-width
     spaces is the empty message it looks like rather than a blank row in
     everybody's room. */
  const body = cleanText(value, true);
  if (!body) return { error: 'Write a short introduction before sending.' };
  if (body.length > MAX_BODY_CHARS) {
    return { error: `An introduction is at most ${MAX_BODY_CHARS} characters.` };
  }
  return { body };
}

/**
 * A bearer token: 32 random bytes, base64url.
 *
 * Not a JWT. Nothing here needs a token that carries claims — the session row
 * has the address — and a random string that means nothing until it is looked
 * up cannot be forged by getting the signing details wrong.
 */
export function mintToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** What actually goes in the sessions table. */
export function tokenHash(token: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(token));
}

/** The token out of an `Authorization: Bearer …` header, if there is one. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/.exec(header.trim());
  return match ? match[1] : null;
}

/** An id for a message. Time-ordered prefix, so a listing sorts sensibly. */
export function messageId(): string {
  return `${Date.now().toString(36)}-${mintToken().slice(0, 12)}`;
}
