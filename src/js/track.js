// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The course view: cones, the line coloured by throttle and brakes, and the bike with its rider.

const trackCv = $('track');
const trackCtx = trackCv.getContext('2d');
let view = { sc: 1, ox: 0, oy: 0, w: 0, h: 0, rot: false };
let asphalt = null;
function makeAsphalt() {
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = COL.asphalt;
  g.fillRect(0, 0, 192, 192);
  let seed = 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle =
      v > 0.5 ? 'rgba(255,255,255,' + (0.015 + r() * 0.04) + ')' : 'rgba(0,0,0,' + (0.08 + r() * 0.12) + ')';
    g.fillRect(r() * 192, r() * 192, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  asphalt = trackCtx.createPattern(c, 'repeat');
}
// On a phone the course is turned by 90° (far cone at the top), not mirrored, so a right turn stays a
// right turn.
const toScreen = (x, y) =>
  view.rot ? [view.ox - y * view.sc, view.oy - x * view.sc] : [view.ox + x * view.sc, view.oy - y * view.sc];
function drawTrack() {
  const { w, h } = view;
  trackCtx.clearRect(0, 0, w, h);
  trackCtx.fillStyle = asphalt || COL.asphalt;
  trackCtx.fillRect(0, 0, w, h);
  trackCtx.strokeStyle = 'rgba(236,232,221,0.045)';
  trackCtx.lineWidth = 1;
  trackCtx.beginPath();
  for (let g = Math.ceil(WORLD_BOX.x0 - 3); g <= WORLD_BOX.x1 + 3; g++) {
    trackCtx.moveTo(...toScreen(g, WORLD_BOX.y0 - 3));
    trackCtx.lineTo(...toScreen(g, WORLD_BOX.y1 + 3));
  }
  for (let g = Math.ceil(WORLD_BOX.y0 - 3); g <= WORLD_BOX.y1 + 3; g++) {
    trackCtx.moveTo(...toScreen(WORLD_BOX.x0 - 3, g));
    trackCtx.lineTo(...toScreen(WORLD_BOX.x1 + 3, g));
  }
  trackCtx.stroke();
  drawLayout();
  if (planner.on && !run) {
    drawPlanScene();
    return;
  }
  const tr = run ? run.trace : last ? last.trace : null;
  if (tr && tr.length > 1) drawTrail(tr);
  drawCones([false, false]);
  let cur = null;
  if (run) cur = poseOf(run.sim);
  else if (hover && last) {
    cur = hover.p;
  } else if (last && last.trace.length) cur = last.trace[last.trace.length - 1];
  else cur = poseOf(new Sim(S));
  drawBike(cur);
  if (!run && hover && last) {
    const [px, py] = toScreen(hover.p.x, hover.p.y);
    trackCtx.strokeStyle = COL.ghost;
    trackCtx.lineWidth = 2;
    trackCtx.beginPath();
    trackCtx.arc(px, py, 14, 0, 7);
    trackCtx.stroke();
  }
  drawCanvasHud();
}
function drawCones(tc) {
  const sc = view.sc;
  for (let c = 0; c < 2; c++) {
    const [px, py] = toScreen(CONES[c][0], CONES[c][1]);
    const r = Math.max(6, sc * 0.16);
    trackCtx.fillStyle = 'rgba(0,0,0,0.35)';
    trackCtx.beginPath();
    trackCtx.arc(px + 2, py + 2, r, 0, 7);
    trackCtx.fill();
    const cc = c ? COL.coneF : COL.coneN;
    trackCtx.fillStyle = cc;
    trackCtx.beginPath();
    trackCtx.arc(px, py, r, 0, 7);
    trackCtx.fill();
    trackCtx.fillStyle = COL.chalk;
    trackCtx.beginPath();
    trackCtx.arc(px, py, r * 0.55, 0, 7);
    trackCtx.fill();
    trackCtx.fillStyle = cc;
    trackCtx.beginPath();
    trackCtx.arc(px, py, r * 0.3, 0, 7);
    trackCtx.fill();
    if (tc && tc[c]) {
      trackCtx.strokeStyle = COL.warn;
      trackCtx.lineWidth = 3;
      trackCtx.beginPath();
      trackCtx.arc(px, py, r + 4, 0, 7);
      trackCtx.stroke();
    }
  }
}
function drawLayout() {
  const sc = view.sc;
  trackCtx.save();
  trackCtx.strokeStyle = 'rgba(236,232,221,0.8)';
  trackCtx.lineWidth = 2;
  const rect = (x0, y0, x1, y1) => {
    const a = toScreen(x0, y0);
    const b = toScreen(x1, y0);
    const c2 = toScreen(x1, y1);
    const d = toScreen(x0, y1);
    trackCtx.beginPath();
    trackCtx.moveTo(...a);
    trackCtx.lineTo(...b);
    trackCtx.lineTo(...c2);
    trackCtx.lineTo(...d);
    trackCtx.closePath();
    trackCtx.stroke();
  };
  rect(GATE_X - BOX_LEN, -1, GATE_X, 1);
  trackCtx.strokeStyle = COL.cone;
  trackCtx.lineWidth = 3;
  trackCtx.setLineDash([6, 4]);
  trackCtx.beginPath();
  trackCtx.moveTo(...toScreen(GATE_X, -1.25));
  trackCtx.lineTo(...toScreen(GATE_X, 1.25));
  trackCtx.stroke();
  trackCtx.setLineDash([]);
  for (const yy of [-1.35, 1.35]) {
    const [px, py] = toScreen(GATE_X, yy);
    trackCtx.fillStyle = COL.chalk;
    trackCtx.fillRect(px - 4, py - 4, 8, 8);
  }
  for (const xx of [GATE_X - BOX_LEN, GATE_X])
    for (const yy of [-1, 1]) {
      const [px, py] = toScreen(xx, yy);
      trackCtx.fillStyle = COL.brake;
      trackCtx.beginPath();
      trackCtx.arc(px, py, Math.max(2.5, sc * 0.07), 0, 7);
      trackCtx.fill();
    }
  {
    const fs = view.rot ? clamp(Math.round(sc * 0.36), 7, 12) : clamp(Math.round(sc * 0.3), 9, 14);
    const [bx, by] = toScreen(GATE_X - BOX_LEN / 2, 0.5);
    trackCtx.save();
    trackCtx.translate(bx, by);
    if (view.rot) trackCtx.rotate(-Math.PI / 2);
    trackCtx.font = '700 ' + fs + 'px ' + FONT_DISPLAY;
    trackCtx.textAlign = 'center';
    trackCtx.textBaseline = 'middle';
    trackCtx.fillStyle = 'rgba(236,232,221,0.7)';
    trackCtx.fillText(i18n`START`, 0, -fs * 0.6);
    trackCtx.fillText(i18n`META`, 0, fs * 0.6);
    trackCtx.restore();
  }
  trackCtx.font = '10px ' + FONT_MONO;
  trackCtx.fillStyle = COL.muted;
  const [lx, ly] = toScreen(GATE_X, -1.35);
  trackCtx.fillText('LAPTIMER', lx + (view.rot ? 0 : 0), ly + (view.rot ? 0 : 14) + (view.rot ? -14 : 0));
  trackCtx.textAlign = 'left';
  trackCtx.textBaseline = 'alphabetic';
  trackCtx.strokeStyle = 'rgba(236,232,221,0.18)';
  trackCtx.lineWidth = 1;
  trackCtx.setLineDash([2, 4]);
  trackCtx.beginPath();
  trackCtx.moveTo(...toScreen(-CONE_X, 0));
  trackCtx.lineTo(...toScreen(CONE_X, 0));
  trackCtx.moveTo(...toScreen(GATE_X, 0));
  trackCtx.lineTo(...toScreen(-CONE_X, 0));
  trackCtx.stroke();
  trackCtx.setLineDash([]);
  trackCtx.font = '10px ' + FONT_MONO;
  trackCtx.fillStyle = 'rgba(236,232,221,0.35)';
  trackCtx.textAlign = 'center';
  {
    const [a, b] = toScreen(-CONE_X / 2, 0);
    trackCtx.fillText('12 m', a + (view.rot ? 12 : 0), b + (view.rot ? 0 : -6));
    const [c2, d] = toScreen((GATE_X - CONE_X) / 2, 0);
    trackCtx.fillText('3 m', c2 + (view.rot ? 10 : 0), d + (view.rot ? 0 : -6));
  }
  const arrow = (cx0, dir) => {
    const R = 4.2;
    trackCtx.strokeStyle = 'rgba(236,232,221,0.16)';
    trackCtx.lineWidth = 2;
    trackCtx.beginPath();
    const a0 = cx0 > 0 ? -0.5 : Math.PI - 0.5;
    const a1 = a0 + 1.0;
    for (let i = 0; i <= 20; i++) {
      const t = a0 + ((a1 - a0) * i) / 20;
      const q = toScreen(cx0 + R * Math.cos(t), R * Math.sin(t) * 1);
      i ? trackCtx.lineTo(...q) : trackCtx.moveTo(...q);
    }
    trackCtx.stroke();
    const te = dir > 0 ? a1 : a0;
    const tp = te + (dir > 0 ? -0.12 : 0.12);
    const e = toScreen(cx0 + R * Math.cos(te), R * Math.sin(te));
    const q = toScreen(cx0 + R * Math.cos(tp) * 1.06, R * Math.sin(tp) * 1.06);
    const q2 = toScreen(cx0 + R * Math.cos(tp) * 0.94, R * Math.sin(tp) * 0.94);
    trackCtx.fillStyle = 'rgba(236,232,221,0.22)';
    trackCtx.beginPath();
    trackCtx.moveTo(...e);
    trackCtx.lineTo(...q);
    trackCtx.lineTo(...q2);
    trackCtx.fill();
  };
  arrow(CONE_X, -1);
  arrow(-CONE_X, 1);
  trackCtx.restore();
}
function inputColor(p) {
  return p.uf > 0.08 ? COL.brake : p.ur > 0.08 ? COL.rear : p.ut > 0.12 ? COL.gas : COL.dim;
}
// The line takes the colour of the strongest input: front brake red, rear pink, throttle yellow,
// fading to grey when nothing is applied.
const hexRGB = (h) => {
  h = String(h || '#888')
    .trim()
    .replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
let trailRgb = null;
function trailColor(p) {
  if (!trailRgb)
    trailRgb = { dim: hexRGB(COL.dim), brake: hexRGB(COL.brake), rear: hexRGB(COL.rear), gas: hexRGB(COL.gas) };
  const uf = p.uf || 0;
  const ur = p.ur || 0;
  const ut = p.ut || 0;
  let c, k;
  if (uf >= 0.01 || ur >= 0.01) {
    if (uf >= ur) {
      c = trailRgb.brake;
      k = uf / 0.9;
    } else {
      c = trailRgb.rear;
      k = ur / 0.6;
    }
  } else if (ut >= 0.01) {
    c = trailRgb.gas;
    k = ut / 0.9;
  } else return COL.dim;
  k = 0.4 + 0.6 * Math.pow(clamp(k, 0, 1), 0.7);
  const d = trailRgb.dim;
  return (
    'rgb(' +
    Math.round(d[0] + (c[0] - d[0]) * k) +
    ',' +
    Math.round(d[1] + (c[1] - d[1]) * k) +
    ',' +
    Math.round(d[2] + (c[2] - d[2]) * k) +
    ')'
  );
}
function drawTrail(tr) {
  trackCtx.save();
  trackCtx.lineCap = 'round';
  trackCtx.lineWidth = Math.max(2.5, view.sc * 0.09);
  for (let j = 1; j < tr.length; j++) {
    const a = tr[j - 1];
    const b = tr[j];
    trackCtx.strokeStyle = trailColor(b);
    trackCtx.beginPath();
    trackCtx.moveTo(...toScreen(a.x, a.y));
    trackCtx.lineTo(...toScreen(b.x, b.y));
    trackCtx.stroke();
  }
  trackCtx.restore();
}
function poseOf(s) {
  return {
    x: s.x,
    y: s.y,
    psi: s.psi,
    phb: Math.sign(s.phi) * bikeLean(s.D || s.S, Math.abs(s.phi)),
    phi: s.phi,
    st: s.st,
    ut: s.ut,
    uf: s.uf,
    ur: s.ur,
    v: s.v,
    zf: s.zf / s.S.ft,
    zr: s.zr / s.S.rt,
    bx: s.bx,
    rel: s.rel,
    off: (s.D || s.S).off,
  };
}
function drawBike(p, tint) {
  const b = S.b;
  const sc = view.sc;
  const ux = Math.cos(p.psi);
  const uy = Math.sin(p.psi);
  const nx = -uy;
  const ny = ux;
  const side = Math.sign(p.phb) || 1;
  const lb = Math.abs(p.phb);
  const sn = Math.sin(lb);
  const W = (l, w) => toScreen(p.x + ux * l + nx * w, p.y + uy * l + ny * w);
  const off = p.off != null ? p.off : STANCE[state.pos].off;
  const seg = (a, bq, wd, col) => {
    trackCtx.strokeStyle = col;
    trackCtx.lineWidth = wd;
    trackCtx.lineCap = 'round';
    trackCtx.beginPath();
    trackCtx.moveTo(...W(...a));
    trackCtx.lineTo(...W(...bq));
    trackCtx.stroke();
  };
  trackCtx.save();
  if (tint) {
    trackCtx.strokeStyle = tint;
    trackCtx.globalAlpha = 0.75;
    trackCtx.lineWidth = 1.6;
    trackCtx.beginPath();
    for (let j = 0; j <= 24; j++) {
      const a = (j / 24) * 2 * Math.PI;
      const q = W(b.L / 2 + Math.cos(a) * b.L * 0.64, Math.sin(a) * 0.4);
      j ? trackCtx.lineTo(...q) : trackCtx.moveTo(...q);
    }
    trackCtx.stroke();
    trackCtx.globalAlpha = 1;
  }
  trackCtx.fillStyle = 'rgba(0,0,0,0.38)';
  trackCtx.beginPath();
  for (let j = 0; j <= 16; j++) {
    const a = (j / 16) * 2 * Math.PI;
    const q = W(b.L / 2 + Math.cos(a) * b.L * 0.62, -side * sn * 0.35 + Math.sin(a) * 0.3);
    j ? trackCtx.lineTo(...q) : trackCtx.moveTo(...q);
  }
  trackCtx.fill();
  const tyre = '#0b0b0b';
  const d = p.st * Math.cos(b.rake * RAD);
  seg([-0.27, 0], [0.27, 0], Math.max(3, 0.12 * sc), tyre);
  seg(
    [b.L - 0.27 * Math.cos(d), -0.27 * Math.sin(d)],
    [b.L + 0.27 * Math.cos(d), 0.27 * Math.sin(d)],
    Math.max(3, 0.11 * sc),
    tyre,
  );
  seg([0.12, side * 0.45 * sn], [b.L - 0.18, side * 0.6 * sn], Math.max(5, 0.24 * sc), '#4a525b');
  const bc = [b.L - 0.14, side * 0.95 * sn];
  const hw = 0.36;
  seg(
    [bc[0] + hw * Math.sin(d), bc[1] - hw * Math.cos(d)],
    [bc[0] - hw * Math.sin(d), bc[1] + hw * Math.cos(d)],
    Math.max(2, 0.05 * sc),
    COL.chalk,
  );
  const mt = b.m + RIDER_MASS;
  const phc = Math.abs(p.phi != null ? p.phi : p.phb);
  let phr = (mt * phc - b.m * lb) / RIDER_MASS;
  phr = clamp(phr, -1.2, 1.3);
  const hip = [0.45 * b.L, side * (0.85 * sn + off * 0.6)];
  const head = [0.6 * b.L, side * (1.45 * Math.sin(phr) + off)];
  seg(hip, head, Math.max(5, 0.2 * sc), '#2b3036');
  const hc = tint || (inputColor(p) === COL.dim ? COL.chalk : inputColor(p));
  trackCtx.fillStyle = hc;
  trackCtx.beginPath();
  trackCtx.arc(...W(...head), Math.max(5, 0.17 * sc), 0, 7);
  trackCtx.fill();
  trackCtx.strokeStyle = '#111';
  trackCtx.lineWidth = 1.5;
  trackCtx.stroke();
  trackCtx.restore();
}
function inputBars(p, x0, by, dot) {
  trackCtx.fillStyle = 'rgba(22,24,26,0.72)';
  trackCtx.fillRect(x0 - 10, by - 42, 104, 106);
  trackCtx.font = '10px ' + FONT_MONO;
  trackCtx.textAlign = 'left';
  if (dot) {
    trackCtx.fillStyle = dot;
    trackCtx.beginPath();
    trackCtx.arc(x0 - 1, by - 32, 4, 0, 7);
    trackCtx.fill();
  }
  trackCtx.fillStyle = COL.muted;
  trackCtx.fillText(i18n`gaz i hamulce`, x0 + (dot ? 7 : -4), by - 37);
  [
    [i18n`gaz`, p.ut, COL.gas],
    [i18n`przód`, p.uf, COL.brake],
    [i18n`tył`, p.ur, COL.rear],
  ].forEach(([l, v, col], i) => {
    const x = x0 + i * 32;
    v = clamp(v || 0, 0, 1);
    trackCtx.fillStyle = COL.rule;
    trackCtx.fillRect(x, by, 14, 46);
    trackCtx.fillStyle = col;
    trackCtx.fillRect(x, by + 46 * (1 - v), 14, 46 * v);
    trackCtx.textAlign = 'center';
    trackCtx.fillStyle = v > 0.005 ? col : COL.dim;
    trackCtx.fillText(String(Math.round(v * 100)), x + 7, by - 17);
    trackCtx.fillStyle = COL.muted;
    trackCtx.fillText(l, x + 7, by + 50);
  });
  trackCtx.textAlign = 'left';
}
function drawCanvasHud() {
  const r = run;
  const c = r ? r.course : last ? last.course : null;
  trackCtx.save();
  trackCtx.textBaseline = 'top';
  const hv = !r && hover && last ? hover.t : null;
  const t = r
    ? c.started
      ? r.sim.t - c.t0
      : 0
    : hv != null
      ? hv
      : last && last.course.tEnd != null
        ? last.course.tEnd
        : null;
  trackCtx.fillStyle = 'rgba(22,24,26,0.72)';
  trackCtx.fillRect(8, 8, 154, 62);
  trackCtx.fillStyle = COL.cone;
  trackCtx.font = '700 30px ' + FONT_DISPLAY;
  trackCtx.fillText(t == null ? '–' : fmtNum(t, 2), 16, 12);
  trackCtx.font = '11px ' + FONT_MONO;
  trackCtx.fillStyle = COL.muted;
  const lap = c
    ? hv != null
      ? Math.min(EIGHTS, 1 + (c.splits || []).filter((s) => s <= hv).length)
      : Math.min(EIGHTS, Math.floor(c.idx / 4) + 1)
    : 1;
  trackCtx.fillText(c && c.started ? i18n`ÓSEMKA ${lap}/${EIGHTS}` : i18n`START Z BOXU`, 16, 48);
  const p = r ? r.sim : hover && last ? hover.p : null;
  if (p) inputBars(p, view.w - 102, view.rot ? 50 : view.h - 74, null);
  trackCtx.restore();
}
