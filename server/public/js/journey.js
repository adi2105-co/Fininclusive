/* FinInclusive · 3D scroll journey (landing page only)
 * Scrolling flies a camera down a road through a town that lights up as the story
 * moves from "invisible to banks" to "approved". Plain Canvas 2D with its own
 * perspective projection: no libraries, so it works with the strict script policy.
 */
(function () {
  'use strict';
  const root = document.getElementById('journey');
  if (!root) return;
  const pin = root.querySelector('.j-pin');
  const canvas = root.querySelector('.j-canvas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!pin || !ctx) return;

  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const panels = [...root.querySelectorAll('.j-panel')];
  const dots = [...root.querySelectorAll('.j-dots button')];
  const bar = root.querySelector('.j-progress i');
  const scoreEl = root.querySelector('[data-j-score]');
  const barEls = [...root.querySelectorAll('[data-j-bar]')];

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mixc = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  const rgb = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')';
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(a, b, c) { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  /* ---------- world ---------- */
  const SMALL = Math.min(innerWidth, innerHeight) < 600;
  const TRAVEL = 2200, NEAR = 1.2, FAR = 560;
  const SCENES = [0, 0.2, 0.42, 0.64, 0.84];
  const GATES = [
    { p: 0.2, t: '1  Verify your email' },
    { p: 0.42, t: '2  Log your work' },
    { p: 0.64, t: '3  Get your score' },
    { p: 0.84, t: '4  Apply to lenders' },
  ];
  const R = rng(20261011);
  const buildings = [];
  const step = SMALL ? 26 : 17;
  for (let z = 30; z < TRAVEL + 20; z += step) {
    for (const s of [-1, 1]) {
      const w = 5 + R() * 5, d = 6 + R() * 4, tall = R() < 0.2;
      const h = 7 + R() * (tall ? 30 : 16), inner = 5.6 + R() * 2.2;
      buildings.push({ s, x: s * (inner + w / 2), w, d, h, z: z + R() * step * 0.5, id: buildings.length, off: (R() - 0.5) * 0.16, tint: R() });
    }
  }
  buildings.sort((a, b) => b.z - a.z);
  const coins = [];
  for (let i = 0; i < (SMALL ? 34 : 70); i++) { const s = R() < 0.5 ? -1 : 1; coins.push({ x: s * (1.4 + R() * 9), y: 0.9 + R() * 5.5, z: 60 + R() * (TRAVEL + 100), ph: R() * 6.28, thr: R() }); }
  const dust = []; for (let i = 0; i < (SMALL ? 60 : 110); i++) dust.push({ x: (R() - 0.5) * 30, y: R() * 9, z: R() * 300 });
  const stars = []; for (let i = 0; i < 90; i++) stars.push({ x: R(), y: R() * 0.55, a: R() });
  const skyline = []; for (let i = 0; i < 46; i++) skyline.push({ x: i / 46 + R() * 0.01, w: 0.012 + R() * 0.03, h: 0.03 + R() * 0.13 });

  const SKY_A = [4, 9, 22], SKY_B = [9, 38, 66];
  const HOR_A = [14, 28, 50], HOR_B = [26, 112, 118], HOR_C = [236, 170, 104];
  function palette(p) {
    const t = sstep(0.05, 0.7, p), w = sstep(0.72, 1, p);
    return { top: mixc(SKY_A, SKY_B, t), hor: mixc(mixc(HOR_A, HOR_B, t), HOR_C, w * 0.5) };
  }

  /* ---------- state ---------- */
  let W = 0, H = 0, DPR = 1, F = 1, vig = null;
  let target = 0, prog = 0, vel = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  let raf = 0, running = false, scene = -1, scoreTimer = 0, scoreShown = false;
  let slow = false, ft = [], lastNow = 0;
  const t0 = performance.now();

  function resize() {
    const r = pin.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, slow || SMALL ? 1.15 : 1.5);
    W = Math.max(320, r.width); H = Math.max(320, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    F = H * 0.95;
    vig = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(2,6,14,.62)');
  }

  function readScroll() {
    const r = root.getBoundingClientRect(), span = r.height - innerHeight;
    target = span > 0 ? clamp(-r.top / span, 0, 1) : 0;
  }

  /* ---------- drawing ---------- */
  let camZ = 0, camX = 0, camY = 1.75, cy = 0, cxp = 0, f = 1, pal = null, lit = 0;
  const fog = dz => { const t = clamp((dz - 18) / 430, 0, 1); return Math.pow(t, 0.9); };
  const shade = (c, fg, k) => rgb(mixc([c[0] * (k || 1), c[1] * (k || 1), c[2] * (k || 1)], pal.hor, fg));

  function drawSky(t, p) {
    const g = ctx.createLinearGradient(0, 0, 0, cy);
    g.addColorStop(0, rgb(pal.top)); g.addColorStop(1, rgb(pal.hor));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, cy + 1);
    const sa = clamp(1 - p * 1.25, 0, 1);
    if (sa > 0.02) {
      ctx.fillStyle = '#fff';
      for (const s of stars) { ctx.globalAlpha = sa * (0.25 + 0.6 * s.a) * (0.7 + 0.3 * Math.sin(t * 1.6 + s.a * 40)); ctx.fillRect(s.x * W, s.y * cy * 1.6 - camX * 0.4, 1.4, 1.4); }
      ctx.globalAlpha = 1;
    }
    // glow where the road meets the sky
    const gr = H * (0.22 + 0.5 * p), gx = cxp - camX * 2;
    const rg = ctx.createRadialGradient(gx, cy, 0, gx, cy, gr);
    rg.addColorStop(0, rgb(mixc([94, 234, 212], [255, 196, 120], sstep(0.6, 1, p)), 0.18 + 0.4 * p)); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, cy - gr, W, gr * 1.6);
    // distant skyline: moves a little with the pointer
    ctx.fillStyle = rgb(mixc(pal.hor, [8, 18, 34], 0.45), 0.9);
    for (const b of skyline) { const x = ((b.x * W - camX * 6) % (W + 80) + W + 80) % (W + 80) - 40; ctx.fillRect(x, cy - b.h * H, b.w * W, b.h * H + 2); }
    // beacon above the bank
    const k = f / Math.max(60, TRAVEL + 70 - camZ);
    const bx = cxp - camX * k * 0.0 + (0 - camX) * k, bw = Math.max(2, 3.4 * k);
    const bg = ctx.createLinearGradient(0, 0, 0, cy);
    bg.addColorStop(0, 'rgba(94,234,212,0)'); bg.addColorStop(1, rgb([140, 255, 232], 0.1 + 0.28 * lit));
    ctx.fillStyle = bg; ctx.fillRect(bx - bw / 2, 0, bw, cy);
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, cy, 0, H);
    g.addColorStop(0, rgb(mixc(pal.hor, [10, 18, 34], 0.55))); g.addColorStop(1, 'rgb(7,12,24)');
    ctx.fillStyle = g; ctx.fillRect(0, cy, W, H - cy);
  }

  function quadZ(x0, x1, za, zb, yy, fill) {
    const ka = f / (za - camZ), kb = f / (zb - camZ);
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.moveTo(cxp + (x0 - camX) * ka, cy + (camY - yy) * ka); ctx.lineTo(cxp + (x1 - camX) * ka, cy + (camY - yy) * ka);
    ctx.lineTo(cxp + (x1 - camX) * kb, cy + (camY - yy) * kb); ctx.lineTo(cxp + (x0 - camX) * kb, cy + (camY - yy) * kb);
    ctx.closePath(); ctx.fill();
  }

  function drawRoad(t) {
    const za = camZ + NEAR, zb = camZ + FAR, hw = 4.2;
    const g = ctx.createLinearGradient(0, cy, 0, H);
    g.addColorStop(0, rgb(mixc(pal.hor, [20, 30, 48], 0.5))); g.addColorStop(1, 'rgb(14,22,38)');
    quadZ(-hw, hw, za, zb, 0, g);
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createLinearGradient(0, cy, 0, H);
    gl.addColorStop(0, 'rgba(94,234,212,0)'); gl.addColorStop(1, 'rgba(94,234,212,' + (0.05 + 0.2 * lit) + ')');
    quadZ(-0.6, 0.6, za, zb, 0, gl);
    const el = 'rgba(94,234,212,' + (0.3 + 0.5 * lit) + ')';
    quadZ(-hw - 0.14, -hw + 0.06, za, zb, 0, el); quadZ(hw - 0.06, hw + 0.14, za, zb, 0, el);
    ctx.globalCompositeOperation = 'source-over';
    // lane dashes streaming toward the camera
    const first = Math.floor(camZ / 7);
    for (let i = 0; i < 74; i++) {
      const z = (first + i) * 7, dz = z - camZ; if (dz < NEAR + 0.4 || dz > FAR) continue;
      const a = (1 - fog(dz)) * 0.85; if (a < 0.03) continue;
      quadZ(-0.09, 0.09, Math.max(z, camZ + NEAR), z + 3.4, 0.01, 'rgba(190,255,240,' + a + ')');
    }
  }

  function windowsFront(b, L, k, fg) {
    const cols = Math.max(2, Math.floor(b.w / 1.9)), rows = Math.max(3, Math.floor((b.h - 1.5) / 2.3));
    const bodyH = b.h - 1.5, cw = b.w / cols, rh = bodyH / rows, ww = cw * 0.46 * k, wh = rh * 0.42 * k;
    const teal = new Path2D(), amber = new Path2D();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const hv = hash(b.id, 1, r * 31 + c); if (hv > L * 0.85 + 0.03) continue;
      const wx = cxp + (b.x - b.w / 2 + (c + 0.5) * cw - camX) * k - ww / 2, wy = cy + (camY - (1.2 + (r + 0.5) * rh)) * k - wh / 2;
      (hash(b.id, 2, r * 31 + c) < 0.22 ? amber : teal).rect(wx, wy, ww, wh);
    }
    ctx.globalAlpha = (1 - fg) * 0.9; ctx.fillStyle = 'rgb(94,234,212)'; ctx.fill(teal); ctx.fillStyle = 'rgb(255,196,98)'; ctx.fill(amber); ctx.globalAlpha = 1;
  }

  function windowsSide(b, L, xi, fg) {
    const cols = Math.max(2, Math.floor(b.d / 1.9)), rows = Math.max(3, Math.floor((b.h - 1.5) / 2.3));
    const bodyH = b.h - 1.5, rh = bodyH / rows, cd = b.d / cols;
    const teal = new Path2D(), amber = new Path2D();
    for (let c = 0; c < cols; c++) {
      const z0 = b.z + (c + 0.2) * cd, z1 = b.z + (c + 0.8) * cd; if (z0 < camZ + NEAR) continue;
      const k0 = f / (z0 - camZ), k1 = f / (z1 - camZ), xa = cxp + (xi - camX) * k0, xb = cxp + (xi - camX) * k1;
      for (let r = 0; r < rows; r++) {
        const hv = hash(b.id, 3, r * 31 + c); if (hv > L * 0.85 + 0.03) continue;
        const y0 = 1.2 + (r + 0.2) * rh, y1 = 1.2 + (r + 0.78) * rh, P = hash(b.id, 4, r * 31 + c) < 0.22 ? amber : teal;
        P.moveTo(xa, cy + (camY - y0) * k0); P.lineTo(xa, cy + (camY - y1) * k0); P.lineTo(xb, cy + (camY - y1) * k1); P.lineTo(xb, cy + (camY - y0) * k1); P.closePath();
      }
    }
    ctx.globalAlpha = (1 - fg) * 0.85; ctx.fillStyle = 'rgb(94,234,212)'; ctx.fill(teal); ctx.fillStyle = 'rgb(255,196,98)'; ctx.fill(amber); ctx.globalAlpha = 1;
  }

  function drawBuilding(b) {
    const z0 = b.z, z1 = b.z + b.d;
    if (z1 < camZ + NEAR + 0.5 || z0 - camZ > FAR) return;
    const L = clamp(lit + b.off, 0, 1), dz0 = z0 - camZ, fg = fog(Math.max(dz0, NEAR));
    const c = mixc(mixc([26, 38, 62], [18, 64, 86], L), [44, 62, 92], b.tint * 0.25);
    const xi = b.s < 0 ? b.x + b.w / 2 : b.x - b.w / 2;
    const za = Math.max(z0, camZ + NEAR), ka = f / (za - camZ), kb = f / (z1 - camZ);
    const xa = cxp + (xi - camX) * ka, xb = cxp + (xi - camX) * kb;
    ctx.fillStyle = shade(c, fg, 0.78); ctx.beginPath();
    ctx.moveTo(xa, cy + camY * ka); ctx.lineTo(xa, cy - (b.h - camY) * ka); ctx.lineTo(xb, cy - (b.h - camY) * kb); ctx.lineTo(xb, cy + camY * kb); ctx.closePath(); ctx.fill();
    if (!slow && ka > 2.4) windowsSide(b, L, xi, fg);
    if (dz0 > NEAR) {
      const k = f / dz0, x1 = cxp + (b.x - b.w / 2 - camX) * k, x2 = cxp + (b.x + b.w / 2 - camX) * k, yb = cy + camY * k, yt = cy - (b.h - camY) * k;
      ctx.fillStyle = shade(c, fg, 1); ctx.fillRect(x1, yt, x2 - x1, yb - yt);
      if (!slow && k > 3.2) windowsFront(b, L, k, fg);
      if (L > 0.45 && fg < 0.8) { ctx.strokeStyle = 'rgba(94,234,212,' + 0.28 * L * (1 - fg) + ')'; ctx.lineWidth = 1; ctx.strokeRect(x1, yt, x2 - x1, yb - yt); }
    }
  }

  function drawBank() {
    const z = TRAVEL + 70, dz = z - camZ; if (dz < NEAR || dz > 1900) return;
    const k = f / dz, fg = fog(dz) * 0.8, bw = 36, bh = 15;
    const x1 = cxp + (-bw / 2 - camX) * k, w = bw * k, yb = cy + camY * k, hh = bh * k;
    ctx.fillStyle = shade([50, 72, 104], fg, 1); ctx.fillRect(x1, yb - hh, w, hh);
    ctx.fillStyle = shade([66, 92, 128], fg, 1);
    ctx.beginPath(); ctx.moveTo(x1 - 0.04 * w, yb - hh); ctx.lineTo(x1 + 1.04 * w, yb - hh); ctx.lineTo(x1 + w / 2, yb - hh - 0.22 * hh); ctx.closePath(); ctx.fill();
    const cw = w * 0.05, gap = w / 8;
    ctx.fillStyle = shade([222, 232, 244], fg, 1);
    for (let i = 0; i < 8; i++) ctx.fillRect(x1 + gap * (i + 0.5) - cw / 2, yb - hh * 0.9, cw, hh * 0.84);
    ctx.fillRect(x1 - 0.02 * w, yb - hh * 0.07, w * 1.04, hh * 0.07);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,196,98,' + (0.18 + 0.5 * lit) * (1 - fg) + ')';
    for (let i = 0; i < 7; i++) ctx.fillRect(x1 + gap * (i + 1) - gap * 0.3, yb - hh * 0.75, gap * 0.6, hh * 0.5);
    ctx.globalCompositeOperation = 'source-over';
    const er = Math.max(2, hh * 0.1), ex = x1 + w / 2, ey = yb - hh - 0.06 * hh;
    ctx.fillStyle = shade([245, 197, 66], fg * 0.5, 1); ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.fill();
    if (er > 9) { ctx.fillStyle = '#5b3d00'; ctx.font = '800 ' + er * 1.2 + 'px "Plus Jakarta Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('₹', ex, ey + er * 0.06); }
  }

  function drawGates(t) {
    for (const g of GATES) {
      const z = g.p * TRAVEL, dz = z - camZ; if (dz < NEAR + 2 || dz > FAR) continue;
      const k = f / dz, fg = fog(dz), boost = 1 + clamp(1 - dz / 40, 0, 1) * 1.6;
      const xl = cxp + (-5 - camX) * k, xr = cxp + (5 - camX) * k, yb = cy + camY * k, yt = cy - (7.2 - camY) * k;
      const a = clamp((1 - fg) * (0.5 + 0.5 * lit) * boost, 0, 1);
      const gg = ctx.createLinearGradient(0, yt, 0, yb); gg.addColorStop(0, 'rgba(94,234,212,' + 0.12 * a + ')'); gg.addColorStop(1, 'rgba(94,234,212,0)');
      ctx.fillStyle = gg; ctx.fillRect(xl, yt, xr - xl, yb - yt);
      ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(xl, yb); ctx.lineTo(xl, yt); ctx.lineTo(xr, yt); ctx.lineTo(xr, yb);
      ctx.strokeStyle = 'rgba(94,234,212,' + 0.25 * a + ')'; ctx.lineWidth = Math.max(4, 0.5 * k); ctx.stroke();
      ctx.strokeStyle = 'rgba(190,255,240,' + a + ')'; ctx.lineWidth = Math.max(1.4, 0.16 * k); ctx.stroke();
      const pw = 11 * k, ph = 1.7 * k, px = (xl + xr) / 2 - pw / 2, py = yt - ph * 1.35;
      if (pw > 70) {
        ctx.fillStyle = 'rgba(6,20,40,' + 0.86 * (1 - fg) + ')'; ctx.strokeStyle = 'rgba(94,234,212,' + 0.7 * (1 - fg) + ')'; ctx.lineWidth = 1.2;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, ph * 0.3); else ctx.rect(px, py, pw, ph); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,' + (1 - fg) + ')'; ctx.font = '700 ' + Math.max(8, 0.72 * k) + 'px "Plus Jakarta Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(g.t, px + pw / 2, py + ph / 2 + 1, pw * 0.92);
      }
    }
  }

  function drawCoins(t) {
    const vis = clamp(0.12 + lit * 1.1, 0, 1);
    for (const c of coins) {
      if (c.thr > vis) continue;
      const dz = c.z - camZ; if (dz < NEAR + 1 || dz > 320) continue;
      const k = f / dz, r = 0.46 * k; if (r < 1.4) continue;
      const x = cxp + (c.x - camX) * k, y = cy + (camY - (c.y + Math.sin(t * 1.3 + c.ph) * 0.22)) * k, fg = fog(dz);
      const rx = Math.max(r * 0.14, Math.abs(Math.cos(t * 1.8 + c.ph)) * r);
      ctx.globalAlpha = 1 - fg * 0.85;
      ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.ellipse(x, y, rx, r, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#b97d0c'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.stroke();
      if (r > 11 && rx > r * 0.5) { ctx.fillStyle = '#8a5a00'; ctx.font = '800 ' + r * 1.05 + 'px "Plus Jakarta Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('₹', x, y + r * 0.05); }
    }
    ctx.globalAlpha = 1;
  }

  function drawDust(t) {
    ctx.fillStyle = '#cfeee8';
    for (const d of dust) {
      let dz = ((d.z - camZ) % 300 + 300) % 300; if (dz < NEAR + 1) continue;
      const k = f / dz, x = cxp + (d.x - camX) * k, y = cy + (camY - d.y - Math.sin(t * 0.4 + d.x) * 0.2) * k;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      ctx.globalAlpha = clamp(0.5 - dz / 600, 0, 0.5); const s = Math.min(3, 0.05 * k + 0.4); ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeed(v) {
    const a = clamp(Math.abs(v) * 0.9 - 0.08, 0, 0.5); if (a < 0.02 || slow) return;
    ctx.strokeStyle = 'rgba(190,255,240,' + a + ')'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < 18; i++) { const ang = hash(i, 9, 3) * 6.2832, r1 = Math.min(W, H) * (0.3 + hash(i, 5, 1) * 0.2), r2 = r1 + Math.min(W, H) * 0.16 * a * 2; ctx.moveTo(cxp + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.lineTo(cxp + Math.cos(ang) * r2, cy + Math.sin(ang) * r2); }
    ctx.stroke();
  }

  function draw(p, t) {
    pal = palette(p); lit = sstep(0.08, 0.72, p);
    camZ = p * TRAVEL; camX = mx * 1.1 + Math.sin(p * 9) * 0.5; camY = 1.75 + Math.sin(t * 0.9) * 0.03;
    cy = H * 0.54 + my * H * 0.025; cxp = W / 2; f = F * (1 + clamp(Math.abs(vel), 0, 0.8) * 0.05);
    ctx.clearRect(0, 0, W, H);
    drawSky(t, p); drawGround(); drawRoad(t); drawBank();
    for (const b of buildings) drawBuilding(b);
    drawGates(t); drawCoins(t); drawDust(t); drawSpeed(vel);
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- story panels ---------- */
  function setScene(i) {
    if (i === scene) return; scene = i;
    panels.forEach((el, k) => { el.classList.toggle('on', k === i); el.setAttribute('aria-hidden', k === i ? 'false' : 'true'); if ('inert' in el) el.inert = k !== i; });
    dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.setAttribute('aria-current', k === i ? 'true' : 'false'); });
    if (i === 3 && !scoreShown) countScore();
    if (i < 2) { scoreShown = false; if (scoreEl) scoreEl.textContent = '300'; barEls.forEach(b => b.style.width = '0%'); }
  }
  function countScore() {
    scoreShown = true; if (!scoreEl) return;
    const end = parseInt(scoreEl.getAttribute('data-j-score'), 10) || 712, t1 = performance.now();
    barEls.forEach(b => { b.style.width = b.getAttribute('data-j-bar') + '%'; });
    cancelAnimationFrame(scoreTimer);
    (function s(now) { const k = clamp((now - t1) / 1300, 0, 1), e = 1 - Math.pow(1 - k, 3); scoreEl.textContent = Math.round(300 + (end - 300) * e); if (k < 1) scoreTimer = requestAnimationFrame(s); })(t1);
  }
  function updateUi(p) {
    let s = 0; for (let i = 0; i < SCENES.length; i++) if (p >= SCENES[i] - 0.002) s = i;
    setScene(s);
    if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    root.classList.toggle('j-started', p > 0.025);
  }

  /* ---------- loop ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = now - lastNow; lastNow = now;
    if (!slow && dt > 0 && dt < 250) { ft.push(dt); if (ft.length === 50) { const avg = ft.reduce((a, b) => a + b, 0) / 50; if (avg > 30) { slow = true; resize(); } ft = []; } }
    readScroll();
    const prev = prog; prog += (target - prog) * 0.08; if (Math.abs(target - prog) < 0.0003) prog = target;
    vel = lerp(vel, (prog - prev) * 60, 0.2); mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    draw(prog, (now - t0) / 1000); updateUi(prog);
  }
  function start() { if (running) return; running = true; lastNow = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---------- boot ---------- */
  if (RM) {
    root.classList.add('j-static');
    resize(); prog = 0.62; vel = 0; draw(0.62, 2); panels.forEach(p => p.classList.add('on'));
    if (scoreEl) { scoreEl.textContent = scoreEl.getAttribute('data-j-score') || '712'; barEls.forEach(b => { b.style.width = b.getAttribute('data-j-bar') + '%'; }); }
    addEventListener('resize', () => { resize(); draw(0.62, 2); });
    return;
  }
  root.classList.add('j-live');
  resize(); readScroll(); prog = target; setScene(0);
  addEventListener('resize', resize);
  if (FINE) pin.addEventListener('pointermove', e => { const r = pin.getBoundingClientRect(); tmx = ((e.clientX - r.left) / r.width - 0.5) * 2; tmy = ((e.clientY - r.top) / r.height - 0.5) * 2; }, { passive: true });
  dots.forEach((d, i) => d.addEventListener('click', () => {
    const span = root.offsetHeight - innerHeight, top = root.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (SCENES[i] + (i ? 0.02 : 0)) * span, behavior: 'smooth' });
  }));
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { es[0].isIntersecting && !document.hidden ? start() : stop(); }, { threshold: 0 }).observe(root); else start();
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : (root.getBoundingClientRect().bottom > 0 && start()); });
})();
