// The boards and public wallet pictures, read from the Worker. No remote HTML.
(() => {
  const API = 'https://seat-airlines-banners.trashmarket.workers.dev';
  const MEDALS = ['🥇', '🥈', '🥉'];
  const short = (a) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
  const profiles = new Map();
  const pending = new Map();
  let retryAt = 0;
  const pictures = async (wallets) => {
    const missing = [...new Set(wallets)].filter(wallet => !profiles.has(wallet) && !pending.has(wallet));
    for (let start = 0; start < missing.length && retryAt <= Date.now(); start += 12) {
      const batch = missing.slice(start, start + 12);
      const work = (async () => {
        try {
          const res = await fetch(`${API}/fomo/profiles?wallets=${encodeURIComponent(batch.join(','))}`, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.json();
          if (data.available === false) retryAt = Date.now() + 60_000;
          batch.forEach(wallet => profiles.set(wallet, data.profiles?.[wallet] ?? null));
        } catch { retryAt = Date.now() + 60_000; }
      })().finally(() => batch.forEach(wallet => pending.delete(wallet)));
      batch.forEach(wallet => pending.set(wallet, work));
      await work;
    }
    await Promise.all(wallets.map(wallet => pending.get(wallet)));
  };
  const decorate = async (body, rows) => {
    await pictures(rows.map(row => row.address));
    body.querySelectorAll('[data-wallet]').forEach(avatar => {
      const profile = profiles.get(avatar.dataset.wallet);
      if (!profile?.image || profile.address !== avatar.dataset.wallet) return;
      try { if (new URL(profile.image).protocol !== 'https:') return; } catch { return; }
      const image = document.createElement('img');
      image.src = profile.image;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => avatar.replaceChildren(document.createTextNode(avatar.dataset.wallet.slice(0, 2))), { once: true });
      avatar.replaceChildren(image);
    });
  };
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
      const identity = document.createElement('span');
      identity.className = 'pilot-identity';
      const avatar = document.createElement('span');
      avatar.className = 'pilot-avatar';
      avatar.dataset.wallet = r.address;
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = r.address.slice(0, 2);
      const link = document.createElement('a');
      link.href = `https://solscan.io/account/${encodeURIComponent(r.address)}`;
      link.rel = 'nofollow noopener';
      link.textContent = short(r.address);
      link.title = r.address;
      identity.append(avatar, link);
      pilot.append(identity);
      tr.append(cell(MEDALS[i] ?? String(i + 1)), pilot, cell(Number(r.score).toLocaleString('en-US'), 'num'));
      if (extra) tr.append(cell(extra(r), 'num'));
      return tr;
    }));
    void decorate(body, rows);
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
