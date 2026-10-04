// The boards on the leaderboard page, read from the Worker. Text only: nothing from it is parsed as HTML.
(() => {
  const API = 'https://seat-airlines-banners.trashmarket.workers.dev';
  const MEDALS = ['🥇', '🥈', '🥉'];
  const short = (a) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
  const cell = (text, cls) => {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  };
  const note = (body, cols, text) => {
    const tr = document.createElement('tr');
    const td = cell(text, 'note');
    td.colSpan = cols;
    tr.append(td);
    body.replaceChildren(tr);
  };
  const fill = (body, rows, cols, extra) => {
    if (!rows.length) return note(body, cols, 'Nobody has posted a score yet. Be the first.');
    body.replaceChildren(...rows.map((r, i) => {
      const tr = document.createElement('tr');
      const pilot = cell('', 'pilot');
      const link = document.createElement('a');
      link.href = `https://solscan.io/account/${encodeURIComponent(r.address)}`;
      link.rel = 'nofollow noopener';
      link.textContent = short(r.address);
      link.title = r.address;
      pilot.append(link);
      tr.append(cell(MEDALS[i] ?? String(i + 1)), pilot, cell(Number(r.score).toLocaleString('en-US'), 'num'));
      if (extra) tr.append(cell(extra(r), 'num'));
      return tr;
    }));
  };
  const load = async (path, cols, done) => {
    const body = document.querySelector(`[data-board="${path === '/scores' ? 'all' : 'today'}"]`);
    try {
      const res = await fetch(API + path, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      done(body, await res.json());
    } catch {
      note(body, cols, 'The board could not be reached just now. Try again in a moment.');
    }
  };
  load('/scores/today', 3, (body, data) => {
    const day = document.querySelector('[data-day]');
    if (day && data.day) day.textContent = `· ${new Date(`${data.day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })} (UTC)`;
    fill(body, data.scores ?? [], 3);
  });
  load('/scores', 4, (body, data) => fill(body, data.scores ?? [], 4, (r) => (r.survived ? `${Math.round(r.survived)} s` : '—')));
})();
