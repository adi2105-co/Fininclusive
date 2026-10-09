/* FinInclusive · Pro layer: animated numbers, chart polish, sparklines, ad slider + popup. Frontend only. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  const RM = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const q = (s, r = document) => r.querySelector(s), qa = (s, r = document) => [...r.querySelectorAll(s)];
  const IN_APP = /\/app(\.html)?\/?$/.test(location.pathname);
  const money = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
  const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- sparkline (global, used by app.js) ---------- */
  window.spark = function (v, color, w = 96, h = 30) {
    if (!v || v.length < 2) return '';
    const mx = Math.max(...v), mn = Math.min(...v), r = (mx - mn) || 1;
    const pts = v.map((x, i) => [i / (v.length - 1) * w, h - 3 - (x - mn) / r * (h - 6)]);
    const col = color || (v[v.length - 1] >= v[0] ? '#22c55e' : '#ef4444');
    const id = 'sg' + Math.random().toString(36).slice(2, 7);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w} ${h} L0 ${h}Z" fill="url(#${id})"/><path d="${d}" pathLength="1" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="spark-line"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6" fill="${col}"/></svg>`;
  };

  /* ---------- Chart.js: gradient fills, smooth animation, custom tooltip ---------- */
  const rgba = (h, a) => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const grad = (chart, base, a0, a1) => { const a = chart.chartArea; if (!a) return rgba(base, a0); const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, rgba(base, a0)); g.addColorStop(1, rgba(base, a1)); return g; };
  function tip(ctx) {
    const { chart, tooltip } = ctx; let el = document.getElementById('pro-tip');
    if (!el) { el = document.createElement('div'); el.id = 'pro-tip'; document.body.appendChild(el); }
    if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
    const isMoney = chart.canvas.id === 'c1';
    el.innerHTML = tooltip.dataPoints.map(p => `<small>${safe(p.label)}</small><i style="background:${p.dataset._base || '#14b8a6'}"></i><b>${isMoney ? money(p.raw) : safe(p.formattedValue)}</b>`).join('');
    const r = chart.canvas.getBoundingClientRect();
    el.style.left = r.left + tooltip.caretX + 'px'; el.style.top = r.top + tooltip.caretY + 'px'; el.style.opacity = 1;
  }
  if (window.Chart) {
    const C = window.Chart;
    C.defaults.font.family = "'Plus Jakarta Sans',system-ui,sans-serif";
    C.defaults.animation.duration = RM ? 0 : 1100; C.defaults.animation.easing = 'easeOutQuart';
    if (C.defaults.animations) C.defaults.animations.colors = false; // gradients can't be interpolated
    C.defaults.plugins.tooltip.enabled = false;
    C.defaults.plugins.tooltip.external = tip;
    C.register({ id: 'proGradient', beforeUpdate(chart) {
      chart.data.datasets.forEach(ds => {
        if (ds._pro) return; ds._pro = 1;
        const type = ds.type || chart.config.type; if (type === 'doughnut' || type === 'pie') return;
        const base = (type === 'line' && typeof ds.borderColor === 'string') ? ds.borderColor : (typeof ds.backgroundColor === 'string' ? ds.backgroundColor : '#14b8a6');
        ds._base = base;
        if (type === 'bar') ds.backgroundColor = c => grad(c.chart, base, 1, .42);
        else if (type === 'line' && ds.fill) ds.backgroundColor = c => grad(c.chart, base, .4, 0);
      });
    } });
  }

  /* ---------- animated number tickers ---------- */
  const anim = new WeakSet();
  const parse = t => { const m = String(t).match(/(\d[\d,]*\.?\d*)/); if (!m) return null; return { pre: t.slice(0, m.index), num: parseFloat(m[1].replace(/,/g, '')), dec: (m[1].split('.')[1] || '').length, suf: t.slice(m.index + m[1].length), comma: m[1].includes(',') }; };
  const fmt = (p, v) => p.pre + (p.comma ? v.toLocaleString('en-IN', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) : v.toFixed(p.dec)) + p.suf;
  function tick(el) {
    if (anim.has(el) || el.children.length) return;
    const text = el.textContent.trim(); if (el.dataset.cu === text) return;
    const to = parse(text); const from = el.dataset.cu ? parse(el.dataset.cu) : null;
    el.dataset.cu = text; if (!to || RM) return;
    const a = from ? from.num : 0, b = to.num; if (a === b) return;
    anim.add(el); const t0 = performance.now(), dur = 950;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? fmt(to, a + (b - a) * e) : text;
      if (k < 1) requestAnimationFrame(step); else anim.delete(el);
    })(t0);
  }
  const SEL = '.kpi .v, #sim, .gauge svg text[font-size="44"]';
  const scan = root => qa(SEL, root).forEach(tick);
  const view = q('#view');
  if (view) { new MutationObserver(() => { scan(view); mountSlots(view); }).observe(view, { childList: true, subtree: true }); }
  // landing page counters: animate when they scroll into view
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); if (e.target.classList.contains('pc-count')) countUp(e.target); io.unobserve(e.target); } }), { threshold: .25 }) : null;
  function countUp(el) { const f = el.dataset.final; if (!f) return; const p = parse(f); el.textContent = f; el.dataset.cu = fmt(p, 0); tick(el); }
  function initLanding() {
    qa('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));
    qa('.pc-count').forEach(el => { const t = el.textContent, p = parse(t); if (!p || RM || !io) return; el.dataset.final = t; el.textContent = fmt(p, 0); io.observe(el); });
  }

  /* ---------- ADS: slider + popup ---------- */
  let eligCache = null, eligAt = 0;
  async function getElig() {
    if (!IN_APP || typeof api !== 'function') return null;
    if (eligCache && Date.now() - eligAt < 30000) return eligCache;
    try { eligCache = await api('/me/lenders'); eligAt = Date.now(); return eligCache; } catch { return null; }
  }
  async function adList() {
    const all = window.FI_ADS || [], d = await getElig();
    if (!d) return all.map(a => ({ ...a }));
    const out = [];
    all.forEach(a => { const l = d.lenders.find(x => x.id === a.id); if (l && l.eligible) out.push({ ...a, you: l.limit, match: l.match, yrate: l.your_rate }); });
    out.sort((x, y) => y.match - x.match);
    return out.length ? out : all.map(a => ({ ...a }));
  }
  const chips = a => `<div class="ad-chips"><div class="ad-chip"><small>Interest p.a.</small><b>${safe(a.rate)}</b></div><div class="ad-chip"><small>${a.you ? 'You can get' : 'Up to'}</small><b>${a.you ? money(a.you) : safe(a.amount)}</b></div><div class="ad-chip"><small>Tenure</small><b>≤ ${safe(a.tenure)}</b></div></div>`;
  const go = a => { if (IN_APP) { location.hash = '#/loans'; } else { location.href = '/register.html'; } };

  function slide(a, i) {
    return `<div class="ad-slide" style="--c1:${a.c1};--c2:${a.c2}" role="group" aria-label="Offer ${i + 1}">
      <div><div class="ad-brand"><span class="ad-logo">${safe(a.logo)}</span><span>${safe(a.brand)}<small>${safe(a.type)}${a.match ? `<span class="ad-elig">✓ ${a.match}% match</span>` : ''}</small></span></div>
      <h3>${safe(a.title)}</h3><p>${safe(a.sub)}</p>
      <div class="ad-cta"><button class="btn sm" data-cta="${i}">${IN_APP ? 'View &amp; apply' : 'Check my eligibility'} →</button><a class="btn ghost sm" href="${safe(a.url)}" target="_blank" rel="noopener noreferrer">Official site ↗</a></div></div>
      ${chips(a)}</div>`;
  }
  async function mount(el) {
    if (el.dataset.mounted) return; el.dataset.mounted = 1;
    const list = await adList(); if (!list.length || !el.isConnected) return;
    const D = 5500;
    el.innerHTML = `<div class="ads" role="region" aria-roledescription="carousel" aria-label="Featured loan offers"><span class="ads-tag">Ad</span><div class="ads-track">${list.map(slide).join('')}</div>
      <button class="ads-nav prev" aria-label="Previous offer">‹</button><button class="ads-nav next" aria-label="Next offer">›</button>
      <div class="ads-dots">${list.map((_, i) => `<button aria-label="Go to offer ${i + 1}"></button>`).join('')}</div><div class="ads-bar"></div></div>
      <p class="ads-fine">Demo placements of publicly listed lender products. Rates are indicative - confirm with the lender before applying.</p>`;
    const root = q('.ads', el), track = q('.ads-track', el), dots = qa('.ads-dots button', el), bar = q('.ads-bar', el);
    let i = 0, paused = false, timer;
    const show = n => {
      i = (n + list.length) % list.length; track.style.transform = `translateX(-${i * 100}%)`;
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      bar.classList.remove('run'); void bar.offsetWidth; bar.style.setProperty('--d', D + 'ms'); if (!RM && !paused) bar.classList.add('run');
    };
    const loop = () => { clearInterval(timer); if (RM) return; timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); if (!paused && !document.hidden) show(i + 1); }, D); };
    q('.prev', el).onclick = () => { show(i - 1); loop(); }; q('.next', el).onclick = () => { show(i + 1); loop(); };
    dots.forEach((d, k) => d.onclick = () => { show(k); loop(); });
    qa('[data-cta]', el).forEach(b => b.onclick = () => go(list[+b.dataset.cta]));
    root.addEventListener('mouseenter', () => { paused = true; bar.classList.remove('run'); });
    root.addEventListener('mouseleave', () => { paused = false; show(i); });
    let x0 = null; root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; paused = true; }, { passive: true });
    root.addEventListener('touchend', e => { if (x0 !== null) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1)); } x0 = null; paused = false; loop(); });
    show(0); loop();
  }
  function mountSlots(root) { qa('[data-ad-slot]:not([data-mounted])', root || document).forEach(mount); }

  async function popup() {
    try { if (sessionStorage.getItem('fi-pop')) return; } catch {}
    if (q('.overlay') || q('.ppop')) return;
    const list = await adList(); if (!list.length) return;
    const a = IN_APP ? list[0] : list[Math.floor(Math.random() * Math.min(4, list.length))];
    const prev = document.activeElement;
    const o = document.createElement('div'); o.className = 'ppop'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Featured loan offer');
    o.innerHTML = `<div class="ppop-card" style="--c1:${a.c1};--c2:${a.c2}"><button class="ppop-x" aria-label="Close">✕</button>
      <div class="ppop-head"><span class="ads-tag">Ad</span><div class="ad-brand" style="margin-top:22px"><span class="ad-logo">${safe(a.logo)}</span><span>${safe(a.brand)}<small>${safe(a.type)}</small></span></div>
      <h3>${a.match ? `You're a ${a.match}% match` : safe(a.title)}</h3><p>${a.match ? safe(a.title) + ' - you can borrow up to <b>' + money(a.you) + '</b>.' : safe(a.sub)}</p></div>
      <div class="ppop-body">${chips(a)}<div class="row2"><button class="btn" data-go>${IN_APP ? 'View &amp; apply' : 'Check my eligibility'} →</button><button class="btn ghost" data-no>Maybe later</button></div>
      <p class="ppop-fine">Demo placement · indicative terms · confirm on ${safe(a.brand)}'s official site</p></div></div>`;
    document.body.appendChild(o);
    const close = () => { o.remove(); document.removeEventListener('keydown', esc); try { sessionStorage.setItem('fi-pop', '1'); } catch {} prev && prev.focus && prev.focus(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    o.addEventListener('click', e => { if (e.target === o) close(); });
    q('.ppop-x', o).onclick = close; q('[data-no]', o).onclick = close;
    q('[data-go]', o).onclick = () => { close(); go(a); };
    q('[data-go]', o).focus();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLanding(); scan(document); mountSlots(document);
    setTimeout(popup, IN_APP ? 9000 : 7000);
  });
})();
