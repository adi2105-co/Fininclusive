/* FinInclusive · dashboard upgrades (worker portal + banker portal)
 * Loads AFTER app.js / admin.js. It watches the page they draw into #view and adds
 * new widgets built from the SAME endpoints, so no backend change is needed.
 * If anything here fails, the original page keeps working: this layer only decorates.
 */
(function () {
  'use strict';
  const view = document.getElementById('view');
  if (!view || typeof api !== 'function') return;
  const ADMIN = /admin/i.test(location.pathname);
  const DAY = 864e5;
  const q = (s, r) => (r || view).querySelector(s);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fi-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fi-' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const memo = {};
  function get(path, ttl) {
    const m = memo[path], life = ttl == null ? 2500 : ttl;
    if (m && Date.now() - m.t < life) return m.p;
    const p = api(path); memo[path] = { t: Date.now(), p }; p.catch(() => { delete memo[path]; }); return p;
  }
  const ts = d => new Date(String(d).replace(' ', 'T') + (/[zZ]$|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z')).getTime();
  const ymd = off => new Date(Date.now() - off * DAY).toISOString().slice(0, 10);
  const ago = d => { const n = Math.max(0, Math.floor((Date.now() - ts(d)) / DAY)); return n === 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago'; };
  const mark = '<i data-fx hidden></i>';

  function streakOf(rows) {
    const set = new Set(rows.map(r => r.date)); let n = 0, off = set.has(ymd(0)) ? 0 : 1;
    while (set.has(ymd(off + n))) n++;
    return n;
  }

  /* ================= WORKER: dashboard ================= */
  function roadHTML(s, l) {
    const stops = {};
    l.lenders.filter(x => !/^Not offered/.test(x.reason || '') && (x.min_score || 0) > 0).forEach(x => { (stops[x.min_score] = stops[x.min_score] || []).push(x); });
    const all = Object.keys(stops).map(Number).sort((a, b) => a - b);
    const xs = all.filter(v => v <= s.score).slice(-1).concat(all.filter(v => v > s.score).slice(0, 4));
    const pos = v => clamp((v - 300) / 550 * 100, 0, 100);
    const next = all.find(v => v > s.score);
    const open = l.lenders.filter(x => x.eligible).length;
    const nextHtml = next
      ? 'Reach <b>' + next + '</b> (' + (next - s.score) + ' more points) to open <b>' + stops[next].map(x => esc(x.name)).join(', ') + '</b>'
      : 'Every score gate is open to you. Keep your record clean to stay here.';
    const flags = xs.map(v => '<div class="fx-flag' + (s.score >= v ? ' got' : '') + '" style="left:' + pos(v) + '%" title="' + esc(stops[v].map(x => x.name).join(', ')) + '"><span>' + v + '</span><em>+' + stops[v].length + '</em></div>').join('');
    return '<section class="card fx-road" data-fx><div class="fx-road-head"><div><h3>Your credit road</h3><p class="hint">Each flag is a score where more lenders open up. ' + open + ' lender' + (open === 1 ? ' is' : 's are') + ' open to you now.</p></div><div class="fx-next">' + nextHtml + '</div></div>' +
      '<div class="fx-scene">' + flags + '<div class="fx-you" style="left:' + pos(s.score) + '%"><span class="fx-pin"><b>' + s.score + '</b></span></div><div class="fx-track"><i class="fx-fill" style="width:' + pos(s.score) + '%"></i></div><div class="fx-scale"><span>300</span><span>575</span><span>850</span></div></div></section>';
  }

  function readyHTML(s, rows, prof) {
    const m = s.metrics, d30 = new Set(rows.filter(r => Date.now() - new Date(r.date) <= 30 * DAY).map(r => r.date)).size;
    const items = [
      { ok: d30 >= 12, t: 'Log 12 or more working days this month', d: d30 + ' logged in the last 30 days', a: '#/earnings' },
      { ok: m.weeks >= 4, t: 'Build 4 weeks of income history', d: m.weeks + ' weeks of data so far', a: '#/earnings' },
      { ok: m.hasData ? m.dti <= 0.3 : false, t: 'Keep debt payments under 30% of income', d: m.hasData ? 'Now ' + Math.round(m.dti * 100) + '%' : 'Log earnings to measure this', a: '#/profile' },
      { ok: m.bills >= 85, t: 'Pay 85% or more of your bills on time', d: 'Now ' + m.bills + '%', a: '#/profile' },
      { ok: m.upi >= 40, t: 'Make 40 or more UPI payments a month', d: 'Now ' + m.upi + ' a month', a: '#/profile' },
      { ok: m.rating >= 4.3, t: 'Keep your rating at 4.3 or above', d: m.rating ? 'Now ' + m.rating + ' stars' : 'Add ratings when you log a day', a: '#/earnings' },
      { ok: !!(prof.phone && prof.pan), t: 'Add your phone and PAN to your profile', d: prof.phone && prof.pan ? 'Done' : 'Lenders ask for both', a: '#/profile' },
    ];
    const n = items.filter(i => i.ok).length, p = Math.round(n / items.length * 100);
    return '<section class="card fx-ready" data-fx><h3>Loan readiness</h3><div class="fx-ready-top"><div class="fx-ring" style="--p:' + p + '"><b>' + n + '/' + items.length + '</b></div><p>' + (n === items.length ? 'You are fully ready. Pick a lender and apply.' : (items.length - n) + ' thing' + (items.length - n === 1 ? '' : 's') + ' to fix before lenders see your best side.') + '</p></div>' +
      '<ul class="fx-list">' + items.map(i => '<li class="' + (i.ok ? 'ok' : '') + '"><span class="fx-chk">' + (i.ok ? '✓' : '') + '</span><div><b>' + esc(i.t) + '</b><small>' + esc(i.d) + '</small></div>' + (i.ok ? '' : '<a href="' + i.a + '">Fix</a>') + '</li>').join('') + '</ul></section>';
  }

  function emiHTML(s) {
    const e = s.eligibility, max = e.maxLoan >= 5000 ? e.maxLoan : 50000, min = Math.min(5000, max), stepA = max > 200000 ? 5000 : 1000;
    const a0 = clamp(Math.round(max / 2 / stepA) * stepA, min, max);
    return '<section class="card fx-emi" data-fx><h3>EMI planner</h3><p class="hint">Try a loan before you apply. Nothing is saved.</p>' +
      '<div class="fx-row"><label>Amount <b id="fxAv">' + inr(a0) + '</b></label><input type="range" id="fxA" min="' + min + '" max="' + max + '" step="' + stepA + '" value="' + a0 + '"></div>' +
      '<div class="fx-row"><label>Repay over <b id="fxTv">24 months</b></label><input type="range" id="fxT" min="6" max="60" step="6" value="24"></div>' +
      '<div class="fx-row"><label>Interest <b id="fxRv">' + e.rate + '% a year</b></label><input type="range" id="fxR" min="7" max="36" step="0.5" value="' + clamp(e.rate, 7, 36) + '"></div>' +
      '<div class="fx-out"><div><small>Monthly payment</small><b class="mono" id="fxE"></b></div><div><small>Total interest</small><b class="mono" id="fxI"></b></div><div><small>Total repaid</small><b class="mono" id="fxP"></b></div></div>' +
      '<div class="fx-meter"><i id="fxM"></i><u></u></div><p class="hint" id="fxMsg"></p></section>';
  }
  function wireEmi(s) {
    const income = Math.max(1, s.metrics.income), debt = s.metrics.debt || 0, A = q('#fxA'), T = q('#fxT'), Rr = q('#fxR');
    if (!A) return;
    const upd = () => {
      const p = +A.value, n = +T.value, r = +Rr.value / 1200, em = r ? p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : p / n, tot = em * n;
      q('#fxAv').textContent = inr(p); q('#fxTv').textContent = n + ' months'; q('#fxRv').textContent = Rr.value + '% a year';
      q('#fxE').textContent = inr(em); q('#fxI').textContent = inr(tot - p); q('#fxP').textContent = inr(tot);
      const share = (em + debt) / income, m = q('#fxM'); m.style.width = clamp(share / 0.6 * 100, 2, 100) + '%';
      m.className = share <= 0.3 ? 'g' : share <= 0.4 ? 'y' : 'r';
      q('#fxMsg').textContent = income <= 1 ? 'Log some earnings so we can judge what is affordable.' : 'With your current debts, repayments would take ' + Math.round(share * 100) + '% of your income. ' + (share <= 0.3 ? 'Comfortable.' : share <= 0.4 ? 'Within the 40% limit most lenders use.' : 'Above the 40% limit. Try a smaller amount or a longer tenure.');
    };
    [A, T, Rr].forEach(i => i.addEventListener('input', upd)); upd();
  }

  function badgesHTML(s, rows, loans) {
    const m = s.metrics, st = streakOf(rows);
    const B = [
      { i: '🌱', t: 'First log', d: 'Log your first working day', ok: rows.length > 0 },
      { i: '🔥', t: '7-day streak', d: 'Log 7 days in a row. Streak now: ' + st, ok: st >= 7 },
      { i: '📅', t: 'Steady earner', d: 'Four weeks of income logged', ok: m.weeks >= 4 },
      { i: '🧾', t: 'Debt-light', d: 'Debt under 20% of income', ok: m.hasData && m.dti < 0.2 },
      { i: '📱', t: 'Digital native', d: '60 or more UPI payments a month', ok: m.upi >= 60 },
      { i: '⏰', t: 'On-time champion', d: 'Bills paid on time 90% or more', ok: m.bills >= 90 },
      { i: '⭐', t: 'Five-star hustle', d: 'Rating of 4.7 or higher', ok: m.rating >= 4.7 },
      { i: '🚀', t: '700 club', d: 'Credit score of 700 or more', ok: s.score >= 700 },
      { i: '🏦', t: 'First application', d: 'Send your first loan application', ok: loans.length > 0 },
    ];
    const n = B.filter(b => b.ok).length;
    return '<section class="card fx-badges" data-fx><div class="fx-head"><h3>Achievements</h3><span class="pill info">' + n + ' of ' + B.length + '</span></div><div class="fx-bgrid">' +
      B.map(b => '<div class="fx-badge ' + (b.ok ? 'on' : '') + '" title="' + esc(b.d) + '"><span>' + b.i + '</span><b>' + esc(b.t) + '</b><small>' + esc(b.d) + '</small></div>').join('') + '</div></section>';
  }

  function insightsHTML(s, rows) {
    const out = [], w = s.weekly || [];
    const last4 = w.slice(-4).reduce((a, b) => a + b, 0), prev4 = w.slice(-8, -4).reduce((a, b) => a + b, 0);
    if (prev4 > 0) { const c = Math.round((last4 - prev4) / prev4 * 100); out.push([c >= 0 ? '📈' : '📉', 'Income is ' + (c >= 0 ? 'up ' : 'down ') + Math.abs(c) + '%', 'Last 4 weeks compared with the 4 before']); }
    const act = w.slice(-4).filter(x => x > 0); if (act.length >= 2) out.push(['🔮', 'About ' + inr(act.reduce((a, b) => a + b, 0) / act.length * 4.3) + ' expected next month', 'Based on your average of the last ' + act.length + ' active weeks']);
    const rec = rows.filter(r => Date.now() - new Date(r.date) <= 90 * DAY);
    if (rec.length >= 5) {
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], by = {};
      rec.forEach(r => { const d = new Date(r.date + 'T00:00:00').getDay(); (by[d] = by[d] || []).push(r.income); });
      const best = Object.entries(by).filter(e => e[1].length >= 2).map(e => [+e[0], e[1].reduce((a, b) => a + b, 0) / e[1].length]).sort((a, b) => b[1] - a[1])[0];
      if (best) out.push(['🗓️', names[best[0]] + ' pays you best', 'About ' + inr(best[1]) + ' on an average ' + names[best[0]]]);
      const pl = {}; rec.filter(r => Date.now() - new Date(r.date) <= 30 * DAY).forEach(r => { pl[r.platform] = (pl[r.platform] || 0) + r.income; });
      const top = Object.entries(pl).sort((a, b) => b[1] - a[1])[0];
      if (top) out.push(['🏆', esc(top[0]) + ' is your top earner', inr(top[1]) + ' in the last 30 days']);
    }
    return '<section class="card fx-insights" data-fx><h3>What your numbers say</h3>' + (out.length ? out.map(o => '<div class="tip"><span class="fx-ic">' + o[0] + '</span><div><b>' + o[1] + '</b><div class="hint">' + o[2] + '</div></div></div>').join('') : '<div class="empty">Log a few more days and insights will appear here.</div>') + '</section>';
  }

  async function dashboard(top) {
    const r = await Promise.all([get('/me/score'), get('/me/lenders'), get('/me/earnings'), get('/me/loans'), get('/me/profile')]);
    if (!top.isConnected || q('[data-fx]')) return;
    const s = r[0], l = r[1], rows = r[2], loans = r[3], prof = r[4];
    top.insertAdjacentHTML('afterend', roadHTML(s, l));
    view.insertAdjacentHTML('beforeend', '<div class="grid g2 fx-grid" data-fx>' + readyHTML(s, rows, prof) + emiHTML(s) + '</div><div class="grid g2 fx-grid" data-fx>' + badgesHTML(s, rows, loans) + insightsHTML(s, rows) + '</div>');
    wireEmi(s);
  }

  /* ================= WORKER: earnings ================= */
  async function earnings(top) {
    const rows = await get('/me/earnings');
    if (!top.isConnected || q('[data-fx]')) return;
    const by = {}; rows.forEach(r => { by[r.date] = (by[r.date] || 0) + r.income; });
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const dow = (end.getDay() + 6) % 7, start = new Date(end.getTime() - (dow + 11 * 7) * DAY);
    const vals = Object.values(by), mx = Math.max(1, ...vals), cells = []; let active = 0;
    for (let i = 0; i < 12 * 7; i++) {
      const d = new Date(start.getTime() + i * DAY); if (d > end) { cells.push('<i class="fx-cell x"></i>'); continue; }
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), v = by[key] || 0;
      if (v) active++;
      const lv = v ? clamp(Math.ceil(v / mx * 4), 1, 4) : 0;
      cells.push('<i class="fx-cell l' + lv + '" title="' + key + (v ? ': ' + inr(v) : ': nothing logged') + '"></i>');
    }
    const st = streakOf(rows);
    top.insertAdjacentHTML('afterend', '<section class="card fx-cal" data-fx><div class="fx-head"><div><h3>Your last 12 weeks</h3><p class="hint">Each square is a day. Darker means you earned more.</p></div><div class="fx-chips"><span class="pill ' + (st >= 3 ? 'ok' : 'mut') + '">🔥 ' + st + '-day streak</span><span class="pill info">' + active + ' active days</span></div></div>' +
      '<div class="fx-calwrap"><div class="fx-days"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div><div class="fx-calgrid">' + cells.join('') + '</div></div>' +
      '<div class="fx-legend"><span>Less</span><i class="fx-cell l0"></i><i class="fx-cell l1"></i><i class="fx-cell l2"></i><i class="fx-cell l3"></i><i class="fx-cell l4"></i><span>More</span></div></section>');
  }

  /* ================= WORKER: score ================= */
  async function score(top) {
    const s = await get('/me/score');
    const sim = q('.sim'); if (!sim || !top.isConnected || q('[data-fx]')) return;
    const done = store.get('plan', {}), tips = s.tips || [], gain = tips.reduce((a, t) => a + t.gain, 0);
    sim.insertAdjacentHTML('beforebegin', '<section class="card fx-plan" data-fx style="margin-bottom:18px"><div class="fx-head"><div><h3>Your improvement plan</h3><p class="hint">The three changes that can add the most points. Tick them off as you go.</p></div><span class="pill info">up to +' + gain + ' points</span></div>' +
      tips.map((t, i) => '<label class="fx-todo"><input type="checkbox" data-plan="' + esc(t.label) + '" ' + (done[t.label] ? 'checked' : '') + '><span class="fx-chk"></span><div><b>' + esc(t.label) + ' <em>+' + t.gain + ' pts</em></b><small>' + esc(t.tip) + '</small></div></label>').join('') + '</section>');
    view.querySelectorAll('[data-plan]').forEach(c => c.addEventListener('change', () => { const d = store.get('plan', {}); d[c.dataset.plan] = c.checked; store.set('plan', d); }));
  }

  /* ================= WORKER: loans ================= */
  function loans(top) {
    const ll = q('#ll'), filters = q('.filters'); if (!ll || !filters || q('[data-fx]')) return;
    let ids = store.get('short', []);
    filters.insertAdjacentHTML('beforeend', '<button class="fchip" id="fxShort" data-fx>♥ Shortlist (<span id="fxN">' + ids.length + '</span>)</button>');
    const chip = q('#fxShort'), count = () => { q('#fxN').textContent = ids.length; };
    const decorate = () => {
      ll.querySelectorAll('.lender').forEach(card => {
        const b = card.querySelector('[data-apply]'); if (!b) return; const id = b.dataset.apply;
        card.classList.toggle('fx-hearted', ids.includes(id));
        if (card.querySelector('.fx-heart')) return;
        card.insertAdjacentHTML('beforeend', '<button class="fx-heart ' + (ids.includes(id) ? 'on' : '') + '" aria-label="Shortlist this lender" aria-pressed="' + ids.includes(id) + '">♥</button>');
        card.querySelector('.fx-heart').addEventListener('click', ev => {
          ev.stopPropagation(); ids = ids.includes(id) ? ids.filter(x => x !== id) : ids.concat(id); store.set('short', ids);
          const on = ids.includes(id); ev.currentTarget.classList.toggle('on', on); ev.currentTarget.setAttribute('aria-pressed', on); card.classList.toggle('fx-hearted', on); count();
        });
      });
    };
    new MutationObserver(decorate).observe(ll, { childList: true });
    decorate();
    chip.addEventListener('click', () => { const on = ll.classList.toggle('fx-only-short'); chip.classList.toggle('fx-on', on); });
  }

  /* ================= WORKER: applications ================= */
  async function applications(top) {
    const a = await get('/me/loans');
    if (!a.length || !top.isConnected || q('[data-fx]')) return;
    const list = a.slice().sort((x, y) => ts(y.created_at) - ts(x.created_at)), last = list[0];
    const n = k => list.filter(x => x.status === k).length, asked = list.filter(x => x.status !== 'rejected').reduce((t, x) => t + x.amount, 0);
    const dec = last.status === 'approved' ? 'Approved' : last.status === 'rejected' ? 'Not approved' : 'Decision';
    const cls = last.status === 'approved' ? 'ok' : last.status === 'rejected' ? 'bad' : '';
    top.insertAdjacentHTML('afterend', '<section class="card fx-apptrack" data-fx><div class="fx-head"><div><h3>Latest application</h3><p class="hint">' + esc(last.product) + ' · ' + inr(last.amount) + ' over ' + last.tenure_months + ' months · sent ' + ago(last.created_at) + '</p></div>' +
      '<div class="fx-chips"><span class="pill warn">' + n('pending') + ' waiting</span><span class="pill ok">' + n('approved') + ' approved</span><span class="pill bad">' + n('rejected') + ' declined</span></div></div>' +
      '<ol class="fx-steps"><li class="done"><span>✓</span>Submitted</li><li class="' + (last.status === 'pending' ? 'now' : 'done') + '"><span>' + (last.status === 'pending' ? '…' : '✓') + '</span>Banker review</li><li class="' + cls + (last.status === 'pending' ? '' : ' done') + '"><span>' + (last.status === 'approved' ? '✓' : last.status === 'rejected' ? '✕' : '') + '</span>' + dec + '</li></ol>' +
      (last.reviewer_note ? '<p class="fx-note">Banker note: ' + esc(last.reviewer_note) + '</p>' : '') + '<p class="hint">You have asked for ' + inr(asked) + ' across active and approved applications.</p></section>');
  }

  /* ================= WORKER: profile ================= */
  async function profile(top) {
    const p = await get('/me/profile');
    if (!top.isConnected || q('[data-fx]')) return;
    const f = [['name', 'Full name', p.name], ['phone', 'Mobile number', p.phone], ['pan', 'PAN', p.pan], ['city', 'City', p.city], ['declared_income', 'Typical monthly income', p.declared_income], ['upi_txns', 'UPI payments a month', p.upi_txns], ['account_age_months', 'Months doing this work', p.account_age_months]];
    const miss = f.filter(x => !x[2]), pc = Math.round((f.length - miss.length) / f.length * 100);
    top.insertAdjacentHTML('afterend', '<section class="card fx-pcomp" data-fx><div class="fx-ring" style="--p:' + pc + '"><b>' + pc + '%</b></div><div><h3>Profile ' + (pc === 100 ? 'complete' : 'completeness') + '</h3><p class="hint">' + (miss.length ? 'Still missing: ' + miss.map(x => esc(x[1])).join(', ') + '. A complete profile makes lenders more comfortable.' : 'Everything lenders ask for is filled in.') + '</p></div></section>');
  }

  /* ================= BANKER ================= */
  async function adminOverview(top) {
    const r = await Promise.all([get('/admin/stats'), get('/admin/workers?q='), get('/admin/loans?status=pending')]);
    const kpis = q('.grid.g4'); if (!top.isConnected || !kpis || q('[data-fx]')) return;
    const st = r[0], ws = r[1], pend = r[2], g = k => st.applications.find(a => a.status === k) || { c: 0, amt: 0 };
    const all = g('pending').c + g('approved').c + g('rejected').c, dec = g('approved').c + g('rejected').c;
    const rate = dec ? Math.round(g('approved').c / dec * 100) : 0, avgTicket = g('approved').c ? g('approved').amt / g('approved').c : 0;
    const row = (l, c, amt, w, cl) => '<div class="fx-frow"><span>' + l + '</span><div class="fx-fbar"><i class="' + cl + '" style="width:' + w + '%"></i></div><b>' + c + '</b><small>' + inr(amt) + '</small></div>';
    kpis.insertAdjacentHTML('afterend', '<div class="grid g2 fx-grid" data-fx><section class="card fx-funnel"><div class="fx-head"><h3>Decision funnel</h3><span class="pill info">' + rate + '% approved</span></div>' +
      row('Submitted', all, g('pending').amt + g('approved').amt + g('rejected').amt, 100, 'a') + row('Decided', dec, g('approved').amt + g('rejected').amt, all ? dec / all * 100 : 0, 'b') + row('Approved', g('approved').c, g('approved').amt, all ? g('approved').c / all * 100 : 0, 'c') + row('Declined', g('rejected').c, g('rejected').amt, all ? g('rejected').c / all * 100 : 0, 'd') +
      '<p class="hint">Average approved loan: ' + inr(avgTicket) + '</p></section>' +
      '<section class="card fx-attn"><div class="fx-head"><h3>Needs attention</h3><span class="pill warn">' + pend.length + ' waiting</span></div>' +
      (pend.length ? pend.slice().sort((a, b) => ts(a.created_at) - ts(b.created_at)).slice(0, 5).map(x => '<a class="tip fx-link" href="#/loans"><div style="flex:1"><b>' + esc(x.name) + '</b><div class="hint">' + esc(x.product) + ' · ' + inr(x.amount) + ' · score ' + x.score_at_apply + '</div></div><span class="pill ' + (Date.now() - ts(x.created_at) > 3 * DAY ? 'bad' : 'mut') + '">' + ago(x.created_at) + '</span></a>').join('') : '<div class="empty">Queue is clear. Nothing is waiting.</div>') + '</section></div>');
    const bins = Array.from({ length: 11 }, (_, i) => ({ lo: 300 + i * 50, n: 0 }));
    ws.forEach(w => { const i = clamp(Math.floor((w.score - 300) / 50), 0, 10); bins[i].n++; });
    const bm = Math.max(1, ...bins.map(b => b.n));
    view.insertAdjacentHTML('beforeend', '<section class="card fx-hist" data-fx style="margin-top:18px"><div class="fx-head"><div><h3>Where your workers score</h3><p class="hint">Number of workers in each 50-point band. ' + ws.length + ' verified workers.</p></div></div><div class="fx-bars">' +
      bins.map(b => '<div class="fx-col" title="' + b.lo + '-' + (b.lo + 49) + ': ' + b.n + ' workers"><b>' + (b.n || '') + '</b><i class="' + (b.lo >= 700 ? 'g' : b.lo >= 600 ? 'y' : 'r') + '" style="height:' + Math.max(b.n ? 6 : 2, b.n / bm * 100) + '%"></i><span>' + b.lo + '</span></div>').join('') + '</div></section>');
    teamCard();
  }

  /* banker team: see the bankers and add a new one (needs the /admin/bankers routes) */
  async function teamCard() {
    view.insertAdjacentHTML('beforeend', '<section class="card fx-team" data-fx style="margin-top:18px"><div class="fx-head"><div><h3>Banker team</h3><p class="hint">Bankers can review loans and see every worker. Add a colleague here.</p></div><span class="pill info" id="fxTc"></span></div>' +
      '<div class="fx-teamgrid"><div id="fxTl" class="fx-tlist"><div class="empty">Loading...</div></div>' +
      '<form id="fxTf" class="fx-tform" autocomplete="off"><h4>Add a banker</h4><div id="fxTm"></div>' +
      '<div class="field"><label for="fxTn">Full name</label><input id="fxTn" required minlength="2" placeholder="Meera Shah"></div>' +
      '<div class="field"><label for="fxTe">Work email</label><input id="fxTe" type="email" required placeholder="meera@bank.com"></div>' +
      '<div class="field"><label for="fxTp">Temporary password</label><input id="fxTp" type="text" required minlength="8" placeholder="Min 8 chars, Aa + 123" autocomplete="new-password"></div>' +
      '<button class="btn block" type="submit">Create banker account</button></form></div></section>');
    const list = q('#fxTl'), msg = q('#fxTm');
    const paint = async () => {
      try {
        const rows = await api('/admin/bankers');
        q('#fxTc').textContent = rows.length + ' banker' + (rows.length === 1 ? '' : 's');
        list.innerHTML = rows.map(b => '<div class="fx-trow"><span class="fx-av">' + esc((b.name || '?').trim().charAt(0).toUpperCase()) + '</span><div><b>' + esc(b.name) + '</b><small>' + esc(b.email) + '</small></div><span class="hint">' + (b.last_login ? 'last seen ' + ago(b.last_login) : 'never signed in') + '</span></div>').join('');
      } catch (e) { list.innerHTML = '<div class="empty">Could not load the team.</div>'; }
    };
    paint();
    q('#fxTf').addEventListener('submit', async ev => {
      ev.preventDefault(); const form = ev.currentTarget, btn = form.querySelector('button'); btn.disabled = true; msg.innerHTML = '';
      try {
        await api('/admin/bankers', { method: 'POST', body: { name: q('#fxTn').value, email: q('#fxTe').value, password: q('#fxTp').value } });
        msg.innerHTML = '<div class="alert ok">Banker added. They can sign in now with that email and password.</div>';
        form.reset(); paint();
      } catch (e) { msg.innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
      btn.disabled = false;
    });
  }

  function adminWorkers(top) {
    const wt = q('#wt'); if (!wt || q('[data-fx]')) return;
    top.insertAdjacentHTML('beforeend', mark);
    const decorate = () => wt.querySelectorAll('tbody tr').forEach(tr => {
      const c = tr.children[4]; if (!c || c.querySelector('.fx-sb')) return;
      const v = parseInt(c.textContent, 10); if (isNaN(v)) return;
      c.insertAdjacentHTML('beforeend', '<i class="fx-sb"><u class="' + (v >= 700 ? 'g' : v >= 600 ? 'y' : 'r') + '" style="width:' + clamp((v - 300) / 550 * 100, 3, 100) + '%"></u></i>');
    });
    new MutationObserver(decorate).observe(wt, { childList: true }); decorate();
  }

  async function adminLoans(top) {
    const a = await get('/admin/loans');
    if (!top.isConnected || q('[data-fx]')) return;
    const by = k => a.filter(x => x.status === k), sum = l => l.reduce((t, x) => t + x.amount, 0);
    const avg = a.length ? Math.round(a.reduce((t, x) => t + x.score_at_apply, 0) / a.length) : 0;
    top.insertAdjacentHTML('afterend', '<div class="fx-strip" data-fx><div><small>Waiting</small><b class="mono">' + by('pending').length + '</b><span>' + inr(sum(by('pending'))) + '</span></div><div><small>Approved</small><b class="mono">' + by('approved').length + '</b><span>' + inr(sum(by('approved'))) + '</span></div><div><small>Declined</small><b class="mono">' + by('rejected').length + '</b><span>' + inr(sum(by('rejected'))) + '</span></div><div><small>Average score</small><b class="mono">' + (avg || '-') + '</b><span>at time of applying</span></div></div>');
  }

  /* ================= router ================= */
  const WORKER = [
    [t => /^Hello,/.test(t), dashboard, v => v.querySelector('.gauge')],
    [t => t === 'Earnings tracker', earnings, v => v.querySelector('#ef')],
    [t => /^Credit score/.test(t), score, v => v.querySelector('.sim')],
    [t => t === 'Loan marketplace', loans, v => v.querySelector('#ll')],
    [t => t === 'My applications', applications, v => true],
    [t => /^Profile/.test(t), profile, v => v.querySelector('#pf')],
  ];
  const BANKER = [
    [t => t === 'Banker overview', adminOverview, v => v.querySelector('.grid.g4')],
    [t => t === 'Workers', adminWorkers, v => v.querySelector('#wt')],
    [t => t === 'Loan review queue', adminLoans, v => true],
  ];
  let busyFor = null, pending = false;
  async function run() {
    if (q('[data-fx]')) return;
    const h = q('.top h1'), top = q('.top'); if (!h || !top || busyFor === top) return;
    const hit = (ADMIN ? BANKER : WORKER).find(p => p[0](h.textContent.trim()) && p[2](view));
    if (!hit) return;
    busyFor = top;
    try { await hit[1](top); } catch (e) { /* decoration only: never break the page */ } finally { if (busyFor === top) busyFor = null; }
  }
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; run(); }); };
  new MutationObserver(schedule).observe(view, { childList: true });
  addEventListener('hashchange', () => setTimeout(schedule, 80));
  schedule();
})();
