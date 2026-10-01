/*
 * Back from X. The Worker sends the player here with the handle in the
 * fragment (never sent to any server); this keeps it for the game's tab,
 * which hears about it through storage, and closes if it can.
 *
 * Only a trip this browser started is kept: the game wrote a nonce before
 * sending the player off, and the handle has to come back with it. A link
 * somebody else made cannot connect this browser to their account.
 */
(function () {
  var title = document.getElementById('title');
  var said = document.getElementById('said');
  var q = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  var pending = null;
  try { pending = localStorage.getItem('sa.x.pending'); } catch (e) { /* storage blocked */ }
  var handle = q.get('x');
  if (handle && /^[0-9a-f]{64}$/.test(handle) && pending && q.get('n') === pending) {
    try {
      localStorage.setItem('sa.x.handle', handle);
      localStorage.setItem('sa.x.user', q.get('u') || '');
      localStorage.removeItem('sa.x.pending');
    } catch (e) {
      title.textContent = 'Could not save the connection';
      said.textContent = 'This browser would not let the site remember it. Check that site data is allowed, then try again.';
      return;
    }
    title.textContent = 'X connected';
    said.textContent = (q.get('u') ? 'Posting as @' + q.get('u') + '. ' : '') + 'Go back to your flight and press Post.';
    setTimeout(function () { window.close(); }, 1200);
    return;
  }
  try { localStorage.removeItem('sa.x.pending'); } catch (e) { /* nothing to clear */ }
  title.textContent = 'X was not connected';
  said.textContent = q.get('error') || (handle ? 'That link did not come from this browser.' : 'Nothing came back from X.');
})();
