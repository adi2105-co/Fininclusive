```css
/* FinInclusive · depth + dashboard upgrades. Load after style.css and pro.css. */

/* ---------- 3D scroll journey (landing) ---------- */
.journey {
  position: relative;
  background: linear-gradient(160deg, #08182e, #0b2a4a 60%, #0f4a52);
  color: #fff;
}

.j-pin {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

/* Keep the canvas hidden until the journey is active */
.j-canvas {
  display: none;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

/* Put journey content above the moving background */
.j-live .j-canvas {
  display: block;
}

.j-scrim,
.j-hint,
.j-skip,
.j-progress {
  display: none;
}

.j-panel {
  padding: 60px 5vw;
  max-width: 760px;
  margin: auto;
}

.j-panel h1 {
  font-size: clamp(34px, 5vw, 58px);
  font-weight: 800;
  line-height: 1.08;
}

.j-panel h1 span {
  background: linear-gradient(90deg, #5eead4, #7dd3fc);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.j-panel h2 {
  font-size: clamp(28px, 4vw, 44px);
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 6px;
}

.j-panel .lead {
  font-size: clamp(15px, 1.5vw, 18px);
  color: #c5d4e8;
  margin: 16px 0 22px;
  max-width: 540px;
  line-height: 1.6;
}

.j-panel .cta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.j-step {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(20, 184, 166, .2);
  border: 1px solid #2dd4bf;
  color: #5eead4;
  font-weight: 800;
  margin-bottom: 14px;
}

.j-facts,
.j-chips {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0;
  margin: 0 0 6px;
}

.j-facts li,
.j-chips span {
  background: rgba(255, 255, 255, .08);
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 99px;
  padding: 7px 14px;
  font-size: 13.5px;
  font-weight: 600;
  color: #d9e6f5;
  backdrop-filter: blur(6px);
}

.j-chips b {
  color: #5eead4;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.j-tip {
  margin-top: 26px;
  font-size: 13px;
  color: #8fb2c9;
}

.j-card {
  background: rgba(11, 31, 58, .72);
  border: 1px solid rgba(94, 234, 212, .28);
  border-radius: 20px;
  padding: 20px;
  max-width: 420px;
  backdrop-filter: blur(12px);
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, .6);
  position: relative;
}

.j-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.j-card small {
  color: #9fb6cf;
  font-size: 12px;
}

.j-score {
  font-size: 54px;
  font-weight: 800;
  line-height: 1;
  color: #5eead4;
}

.j-rows {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: #cfdcec;
}

.j-rows .bar {
  height: 7px;
  background: rgba(255, 255, 255, .12);
  border-radius: 9px;
  overflow: hidden;
}

.j-rows .bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #14b8a6, #7dd3fc);
  border-radius: 9px;
  transition: width 1.1s cubic-bezier(.2, .8, .2, 1);
}

.j-limit {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, .12);
  font-size: 13px;
  color: #cfdcec;
}

.j-limit b {
  font-size: 19px;
  color: #fff;
}

.journey .btn.light {
  background: #fff;
  color: #0b1f3a;
}

.journey .btn.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, .4);
  color: #fff;
}

/* Static fallback: stacked panels */
.j-static .j-panel {
  border-bottom: 1px solid rgba(255, 255, 255, .08);
}

.j-static .j-panel:last-child {
  border: 0;
}

/* Live: pinned canvas */
.j-live {
  height: 700vh;
}

.j-live .j-pin {
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100svh;
}

.j-live .j-canvas {
  display: block;
}

.j-live .j-scrim {
  display: block;
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    rgba(6, 16, 30, .82) 0,
    rgba(6, 16, 30, .55) 38%,
    rgba(6, 16, 30, 0) 70%
  );
}

.j-live .j-panels {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.j-live .j-panel {
  position: absolute;
  left: 5vw;
  top: 50%;
  width: min(560px, 90vw);
  max-width: none;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-46%) translateZ(0);
  transition:
    opacity .6s ease,
    transform .8s cubic-bezier(.2, .8, .2, 1),
    visibility 0s .6s;
}

.j-live .j-panel.on {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%);
  pointer-events: auto;
  transition-delay: .12s, .12s, 0s;
}

.j-live .j-card {
  margin-top: 4px;
}

.j-live .j-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: absolute;
  z-index: 3;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #a9c3d8;
  transition: opacity .4s;
}

.j-hint i {
  width: 1.5px;
  height: 30px;
  background: linear-gradient(#5eead4, transparent);
  animation: fxdrip 1.6s ease-in-out infinite;
}

@keyframes fxdrip {
  0% {
    transform: scaleY(0);
    transform-origin: top;
  }
  50% {
    transform: scaleY(1);
    transform-origin: top;
  }
  51% {
    transform-origin: bottom;
  }
  100% {
    transform: scaleY(0);
    transform-origin: bottom;
  }
}

.j-live.j-started .j-hint {
  opacity: 0;
}

.j-live .j-skip {
  display: block;
  position: absolute;
  z-index: 3;
  right: 22px;
  bottom: 22px;
  font-size: 12.5px;
  font-weight: 600;
  color: #cfe4f2;
  background: rgba(255, 255, 255, .1);
  border: 1px solid rgba(255, 255, 255, .2);
  padding: 7px 13px;
  border-radius: 99px;
  backdrop-filter: blur(6px);
}

.j-live .j-progress {
  display: block;
  position: absolute;
  z-index: 3;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: rgba(255, 255, 255, .08);
}

.j-progress i {
  display: block;
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #14b8a6, #7dd3fc);
}

@media (max-width: 760px) {
  .j-live .j-scrim {
    background: linear-gradient(
      0deg,
      rgba(6, 16, 30, .92) 0,
      rgba(6, 16, 30, .7) 50%,
      rgba(6, 16, 30, .1) 85%
    );
  }

  .j-live .j-panel {
    top: auto;
    bottom: 70px;
    left: 5vw;
    transform: translateY(24px);
  }

  .j-live .j-panel.on {
    transform: none;
  }

  .j-live .j-hint {
    display: none;
  }

  .j-score {
    font-size: 42px;
  }

  .j-panel .lead {
    margin: 10px 0 16px;
  }
}
```
