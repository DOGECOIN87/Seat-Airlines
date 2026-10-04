/**
 * The day's top pilots, posted to the airline's X account once a day.
 *
 * Every score posted to the board is logged (`game_posts`), so "today" is
 * every flight posted today — not only the ones that beat a pilot's own
 * best, which is all `game_scores` keeps. The Worker's cron reads the day's
 * best per wallet, writes the post, and makes it as the airline (see
 * `postAsAirline` in xshare.ts). A day nobody flew posts nothing, and a day
 * already posted is never posted twice.
 */

/** How many pilots the post names. */
export const DAILY_TOP = 5;

export interface DayRow { address: string; score: number }

/** The UTC day a moment falls in: its start and end, ms epoch, and its key. */
export function utcDay(at: number): { start: number; end: number; key: string } {
  const d = new Date(at);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { start, end: start + 24 * 60 * 60 * 1000, key: new Date(start).toISOString().slice(0, 10) };
}

/** A wallet, as people say them: the first four and the last four. */
export const shortAddress = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

const MEDALS = ['🥇', '🥈', '🥉'];

/** The post. Null when nobody flew. */
export function dailyText(rows: readonly DayRow[], dayStart: number, site: string): string | null {
  if (!rows.length) return null;
  const date = new Date(dayStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const lines = rows.slice(0, DAILY_TOP).map((r, i) => `${MEDALS[i] ?? `${i + 1}.`} ${shortAddress(r.address)} · ${r.score.toLocaleString('en-US')}`);
  const pilots = rows.length === 1 ? 'Top pilot' : `Top ${Math.min(rows.length, DAILY_TOP)} pilots`;
  return [`✈️ SEAT AIRLINES · ${pilots} · ${date}`, '', ...lines, '', `Think you can fly further? ${site}`].join('\n');
}

/** The day's best flight per wallet, best first. */
export async function dayTop(db: D1Database, start: number, end: number, n = DAILY_TOP): Promise<DayRow[]> {
  const { results } = await db
    .prepare(`SELECT address, MAX(score) AS score FROM game_posts
      WHERE posted_at >= ? AND posted_at < ? GROUP BY address ORDER BY score DESC, MIN(posted_at) ASC LIMIT ?`)
    .bind(start, end, n)
    .all<DayRow>();
  return results;
}
