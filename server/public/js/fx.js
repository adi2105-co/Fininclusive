/* FinInclusive · shared depth effects (every page that loads it)
 * Pointer tilt + soft light on small cards. Skipped on touch screens and when the
 * visitor has asked their device to reduce motion.
 */
(function () {
  'use strict';
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SEL = '.feat,.kpi,.lender,.fx-tilt,.fx-badge,.stats>div,.j-card';
  let cur = null, raf = 0, ev = null;

  function reset(el) { if (!el) return; el.style.transform = ''; el.classList.remove('fx-hot'); }
  function apply() {
    raf = 0; const e = ev; if (!e) return;
    const el = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (cur && cur !== el) reset(cur);
    cur = el || null; if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    el.style.transform = 'perspective(900px) rotateX(' + ((0.5 - y) * 6).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * 8).toFixed(2) + 'deg) translateY(-3px)';
    el.classList.add('fx-hot');
  }
  document.addEventListener('pointermove', function (e) { ev = e; if (!raf) raf = requestAnimationFrame(apply); }, { passive: true });
  document.addEventListener('pointerleave', function () { reset(cur); cur = null; }, true);
  addEventListener('scroll', function () { if (cur) { reset(cur); cur = null; } }, { passive: true });
})();
