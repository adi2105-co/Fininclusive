/* FinInclusive · "I am a worker / I am a banker" choice for the sign-in and sign-up pages.
 * Adds the toggle by itself and checks that the account matches the choice. Backend untouched. */
(function () {
  'use strict';
  const page = document.body && document.body.dataset.page;
  if (page !== 'login' && page !== 'register') return;
  const box = document.querySelector('.authform .box'); if (!box) return;
  const qs = new URLSearchParams(location.search);
  let mode = qs.get('role') === 'banker' ? 'banker' : 'worker';
  try { if (!qs.get('role') && sessionStorage.getItem('fi-role') === 'banker') mode = 'banker'; } catch (e) { /* ignore */ }

  const first = page === 'login' ? box.querySelector('h1') : box.querySelector('#step1 h1');
  if (!first) return;
  const h1 = first, sub = h1.nextElementSibling;
  const orig = { h1: h1.textContent, sub: sub ? sub.textContent : '' };
  const seg = document.createElement('div');
  seg.className = 'fx-role'; seg.setAttribute('role', 'tablist'); seg.setAttribute('aria-label', 'I am a');
  seg.innerHTML = '<button type="button" role="tab" data-r="worker"><b>👷 I am a worker</b><small>Get a score, find loans</small></button><button type="button" role="tab" data-r="banker"><b>🏦 I am a banker</b><small>Review and approve loans</small></button>';
  h1.parentNode.insertBefore(seg, h1);

  const form = page === 'login' ? box.querySelector('#f') : box.querySelector('#f');
  const links = [...box.querySelectorAll('#step1 > p, .box > p')].filter(p => /New here|Already registered/.test(p.textContent));
  const demo = [...box.querySelectorAll('.card')].find(c => /Demo access/.test(c.textContent));
  let panel = null;
  if (page === 'register') {
    panel = document.createElement('div'); panel.className = 'fx-bankpanel'; panel.hidden = true;
    panel.innerHTML = '<p>Banker and lender accounts are created by the FinInclusive administrator, so there is no public sign-up for them.</p><a class="btn block" href="/login.html?role=banker">Sign in as a banker →</a>';
    form.parentNode.insertBefore(panel, form);
  }

  function apply() {
    seg.querySelectorAll('button').forEach(b => { const on = b.dataset.r === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const bk = mode === 'banker';
    try { sessionStorage.setItem('fi-role', mode); } catch (e) { /* ignore */ }
    if (page === 'login') {
      h1.textContent = bk ? 'Banker sign in 🏦' : orig.h1;
      if (sub) sub.textContent = bk ? 'Review loan applications and see how workers score.' : orig.sub;
      links.forEach(p => { p.hidden = bk; });
      if (demo) demo.hidden = false;
    } else {
      h1.textContent = bk ? 'Banker account' : orig.h1;
      if (sub) sub.hidden = bk;
      form.hidden = bk; panel.hidden = !bk;
      links.forEach(p => { p.hidden = bk; });
    }
  }
  seg.addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (!b) return; mode = b.dataset.r; apply(); });
  apply();

  /* make sure the account type matches the choice made above (login only) */
  if (page === 'login' && window.fetch) {
    const real = window.fetch.bind(window);
    window.fetch = async function (url, opt) {
      const res = await real(url, opt);
      try {
        if (String(url).indexOf('/api/auth/login') !== -1 && res.ok) {
          const d = await res.clone().json(), want = mode === 'banker' ? 'admin' : 'worker';
          if (d.role && d.role !== want) {
            await real('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const msg = d.role === 'admin' ? 'This is a banker account. Choose "I am a banker" above.' : 'This is a worker account. Choose "I am a worker" above.';
            return new Response(JSON.stringify({ error: msg }), { status: 401, headers: { 'Content-Type': 'application/json' } });
          }
        }
      } catch (e) { /* fall through to the normal result */ }
      return res;
    };
  }
})();
