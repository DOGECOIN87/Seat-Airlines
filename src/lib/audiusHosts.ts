/**
 * The Audius hosts the radio asks, in order (see "Hosts" in audius.ts).
 *
 * On their own, with nothing else, so that vite.config.ts can read them for
 * the page's Content-Security-Policy: the policy names exactly the hosts the
 * radio uses, and adding one here admits it there.
 */
export const AUDIUS_HOSTS: readonly string[] = [
  'https://api.audius.co',
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
];
