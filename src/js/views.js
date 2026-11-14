// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Layout of the panels, the rear view, the g-g diagram and the live readouts.

const layout = {
  mq: window.matchMedia ? window.matchMedia('(min-width:1180px) and (min-height:620px)') : null,
  sz: '',
};
const isDashboard = () => !!(layout.mq && layout.mq.matches);
const BOXES = ['trackBox', 'teleBox', 'leanBox', 'sideBox', 'ggBox'];
const layoutSignature = () =>
  BOXES.map((id) => {
    const b = $(id);
    return b.clientWidth + 'x' + b.clientHeight;
  }).join(',') + (isDashboard() ? 'D' : 'S');
const ggCv = $('gg');
const ggCtx = ggCv.getContext('2d');
let GW = 200;
let GH = 200;
function fitCanvas(c, ctx, id) {
  const dpr = window.devicePixelRatio || 1;
  const b = $(id);
  const w = Math.max(60, b.clientWidth || 200);
  const h = Math.max(60, b.clientHeight || 170);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [w, h];
}
function sizeLean() {
  [LW, LH] = fitCanvas(leanCv, leanCtx, 'leanBox');
  sizeSide();
  sizeGG();
}
function sizeSide() {
  [SW, SH] = fitCanvas(sideCv, sideCtx, 'sideBox');
}
function sizeGG() {
  [GW, GH] = fitCanvas(ggCv, ggCtx, 'ggBox');
}
function sizeTrack() {
  const dpr = window.devicePixelRatio || 1;
  const box = $('trackBox');
  const dash = isDashboard();
  const w = box.clientWidth || 700;
  const rot = !dash && w < 560;
  const ww = WORLD_BOX.x1 - WORLD_BOX.x0;
  const hh = WORLD_BOX.y1 - WORLD_BOX.y0;
  let h;
  if (dash) {
    box.style.height = '';
    h = Math.max(160, box.clientHeight || 300);
  } else {
    h = rot
      ? Math.round(Math.min((w * ww) / hh, Math.max(420, window.innerHeight * 0.78), 760))
      : Math.round(Math.max(300, (w * hh) / ww));
    box.style.height = h + 'px';
  }
  trackCv.width = Math.round(w * dpr);
  trackCv.height = Math.round(h * dpr);
  trackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sc = rot ? Math.min(w / hh, h / ww) : Math.min(w / ww, h / hh);
  const mx = (WORLD_BOX.x0 + WORLD_BOX.x1) / 2;
  const my = (WORLD_BOX.y0 + WORLD_BOX.y1) / 2;
  view = rot
    ? { sc, ox: w / 2 + my * sc, oy: h / 2 + mx * sc, w, h, rot }
    : { sc, ox: w / 2 - mx * sc, oy: h / 2 + my * sc, w, h, rot };
}
function sizeTele() {
  const dpr = window.devicePixelRatio || 1;
  const box = $('teleBox');
  TW = box.clientWidth || 800;
  if (isDashboard()) {
    box.style.height = '';
    TH = Math.max(120, box.clientHeight || 240);
  } else {
    TH = planner.on ? (TW < 560 ? 260 : 300) : TW < 560 ? 410 : 460;
    box.style.height = TH + 'px';
  }
  teleCv.width = Math.round(TW * dpr);
  teleCv.height = Math.round(TH * dpr);
  teleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function drawRearView(q, gx, gy, u, col) {
  const phb = q.phb || 0;
  const phc = q.phi != null ? q.phi : phb;
  const b = S.b;
  const dir = (a) => [-Math.sin(a), -Math.cos(a)];
  const [bx, by] = dir(phb);
  leanCtx.save();
  leanCtx.lineCap = 'round';
  if (!col) {
    const [c1, c2] = dir(phc);
    leanCtx.save();
    leanCtx.setLineDash([4, 4]);
    leanCtx.strokeStyle = COL.ghost;
    leanCtx.lineWidth = 1.5;
    leanCtx.beginPath();
    leanCtx.moveTo(gx, gy);
    leanCtx.lineTo(gx + c1 * u * 1.3, gy + c2 * u * 1.3);
    leanCtx.stroke();
    leanCtx.restore();
  }
  if (col) {
    leanCtx.strokeStyle = col;
    leanCtx.globalAlpha = 0.55;
    leanCtx.lineWidth = Math.max(7, u * 0.17) + 3;
    leanCtx.beginPath();
    leanCtx.moveTo(gx, gy);
    leanCtx.lineTo(gx + bx * u * 0.62, gy + by * u * 0.62);
    leanCtx.stroke();
    leanCtx.globalAlpha = 1;
  }
  leanCtx.strokeStyle = '#59616a';
  leanCtx.lineWidth = Math.max(7, u * 0.17);
  leanCtx.beginPath();
  leanCtx.moveTo(gx, gy);
  leanCtx.lineTo(gx + bx * u * 0.62, gy + by * u * 0.62);
  leanCtx.stroke();
  leanCtx.strokeStyle = '#0b0b0b';
  leanCtx.lineWidth = Math.max(5, u * 0.13);
  leanCtx.beginPath();
  leanCtx.moveTo(gx, gy);
  leanCtx.lineTo(gx + bx * u * 0.2, gy + by * u * 0.2);
  leanCtx.stroke();
  const mt = b.m + RIDER_MASS;
  let phr = (mt * phc - b.m * phb) / RIDER_MASS;
  phr = clamp(phr, -1.3, 1.3);
  const seat = [gx + bx * u * 0.62, gy + by * u * 0.62];
  const [rx, ry] = dir(phr);
  const rc = col || (inputColor(q) === COL.dim ? COL.chalk : inputColor(q));
  leanCtx.strokeStyle = rc;
  leanCtx.lineWidth = Math.max(6, u * 0.15);
  leanCtx.beginPath();
  leanCtx.moveTo(...seat);
  leanCtx.lineTo(seat[0] + rx * u * 0.45, seat[1] + ry * u * 0.45);
  leanCtx.stroke();
  leanCtx.fillStyle = rc;
  leanCtx.beginPath();
  leanCtx.arc(seat[0] + rx * u * 0.58, seat[1] + ry * u * 0.58, Math.max(5, u * 0.11), 0, 7);
  leanCtx.fill();
  leanCtx.restore();
}
let sideWho = null;
function drawLean(p, pb) {
  leanCtx.clearRect(0, 0, LW, LH);
  const v = pb ? 'A' : null;
  const q = v === 'B' ? pb : p;
  leanCtx.font = '11px ' + FONT_MONO;
  leanCtx.textAlign = 'left';
  leanCtx.fillStyle = COL.muted;
  leanCtx.fillText(i18n`WIDOK Z TYŁU`, 8, 15);
  if (v) {
    const nm = RIDER_NAME[v].toUpperCase();
    const x0 = 8 + leanCtx.measureText(i18n`WIDOK Z TYŁU` + '  ').width;
    if (x0 + leanCtx.measureText(nm).width <= LW - 6) {
      leanCtx.fillStyle = riderColor(v);
      leanCtx.fillText(nm, x0, 15);
    }
  }
  const gy = LH - 36;
  const hu = (gy - 26) / 1.3;
  const u = Math.max(18, Math.min(hu, (LW / 2 - 8) / 1.2));
  const cxm = LW / 2;
  leanCtx.strokeStyle = COL.rule;
  leanCtx.lineWidth = 1;
  leanCtx.beginPath();
  leanCtx.moveTo(8, gy + 0.5);
  leanCtx.lineTo(LW - 8, gy + 0.5);
  leanCtx.stroke();
  drawRearView(q, cxm, gy, u, null);
  const phc = q.phi != null ? q.phi : q.phb || 0;
  leanCtx.font = '12px ' + FONT_MONO;
  leanCtx.fillStyle = COL.chalk;
  leanCtx.fillText(i18n`moto ${Math.round(Math.abs(q.phb || 0) * DEG)}°`, 8, LH - 22);
  leanCtx.fillStyle = COL.ghost;
  leanCtx.fillText(i18n`wypadkowa ${Math.round(Math.abs(phc) * DEG)}°`, 8, LH - 7);
  sideWho = v ? { name: RIDER_NAME[v].toUpperCase(), col: riderColor(v) } : null;
  if (v && planner.on && planner[v]) {
    const S0 = S;
    S = planSetup(planner[v]);
    try {
      drawSide(q);
      drawGG(q, null, v);
    } finally {
      S = S0;
    }
  } else {
    drawSide(q);
    drawGG(q, null, v);
  }
}
function ggSample(p, pb, who) {
  if (run && !run.end) return [{ tr: run.trace, key: 't', t: run.sim.t, p, col: null }];
  if (who) {
    const x = last && last.mode === 'plan' && last.B ? (who === 'B' ? last.B : last) : null;
    const t = hover ? hover.t : player.t;
    return [{ tr: x ? x.tr : null, key: 'rt', t, p, col: riderColor(who) }];
  }
  if (pb && last && last.mode === 'plan' && last.B) {
    const t = hover ? hover.t : player.t;
    return [
      { tr: last.tr, key: 'rt', t, p, col: COL.chalk },
      { tr: last.B.tr, key: 'rt', t, p: pb, col: COL.ok },
    ];
  }
  if (!pb && last && last.mode !== 'plan' && last.tr && last.tr.length) {
    const t = hover ? hover.t : last.tr[last.tr.length - 1].rt;
    return [{ tr: last.tr, key: 'rt', t, p, col: null }];
  }
  return pb
    ? [
        { tr: null, p, col: COL.chalk },
        { tr: null, p: pb, col: COL.ok },
      ]
    : [{ tr: null, p, col: null }];
}
const GG_T = 1.5;
// A tyre passes on at most its grip: asked for more, it slides. A wheel left with almost no load (the
// rear just after hard front braking, the front at a wheelie) slides at the slightest force, so its
// share says nothing and the other wheel's is shown.
const LIGHT_WHEEL = 0.25;
function gripState(p) {
  let f = p.useF || 0;
  let r = p.useR || 0;
  let note = '';
  if (r > 1 && r >= f && (p.loadR ?? 1) < LIGHT_WHEEL) {
    r = 0;
    note = i18n`tył odciążony`;
  } else if (f > 1 && f > r && (p.loadF ?? 1) < LIGHT_WHEEL) {
    f = 0;
    note = i18n`przód odciążony`;
  }
  const slide = Math.max(f, r) > 1;
  if (slide) note = r >= f ? i18n`tył się ślizga` : i18n`przód się ślizga`;
  return { use: Math.min(1, Math.max(f, r)), note, slide };
}
function drawGG(p, pb, who) {
  const q = ggCtx;
  const W = GW;
  const H = GH;
  q.clearRect(0, 0, W, H);
  q.font = '11px ' + FONT_MONO;
  q.textAlign = 'left';
  q.fillStyle = COL.muted;
  q.fillText(i18n`PRZECIĄŻENIA (G)`, 8, 15);
  if (who) {
    const nm = RIDER_NAME[who].toUpperCase();
    const x0 = 8 + q.measureText(i18n`PRZECIĄŻENIA (G)` + '  ').width;
    if (x0 + q.measureText(nm).width <= W - 6) {
      q.fillStyle = riderColor(who);
      q.fillText(nm, x0, 15);
    }
  }
  const src = ggSample(p, pb, who);
  const gm = Math.max(S.mu, 1) * 1.06;
  const top = 24;
  const bot = H - (src.length > 1 ? 24 : 36);
  const c0 = W / 2;
  const c1 = (top + bot) / 2;
  const R = Math.max(14, Math.min(W / 2 - 12, (bot - top) / 2));
  const k = R / gm;
  const P = (ax, al) => [c0 - (al / G) * k, c1 - (ax / G) * k];
  q.strokeStyle = COL.rule;
  q.lineWidth = 1;
  q.beginPath();
  q.moveTo(c0 - R, c1);
  q.lineTo(c0 + R, c1);
  q.moveTo(c0, c1 - R);
  q.lineTo(c0, c1 + R);
  q.stroke();
  q.setLineDash([3, 4]);
  for (const g of [0.5, 1]) {
    q.beginPath();
    q.arc(c0, c1, g * k, 0, 7);
    q.stroke();
  }
  q.setLineDash([]);
  {
    const sp = src[0] && src[0].p;
    const vv = Math.max(1, (sp && sp.v) || 1);
    const laM = S.mu * G;
    const n = 40;
    const E = [];
    const F = [];
    const om = COACH_BASE.om * RAD;
    const bD = (la) => gripEnvelope(S, la, vv, om, true);
    const dD = (la) => gripEnvelope(S, la, vv, om, false);
    for (let i = -n; i <= n; i++) {
      const la = (laM * i) / n;
      E.push(P(-maxBrakeDecel(S, S, Math.abs(la), 1), la));
      F.push(P(-bD(Math.abs(la)), la));
    }
    for (let i = n; i >= -n; i--) {
      const la = (laM * i) / n;
      E.push(P(maxDriveAccel(S, S, Math.abs(la), 1, vv, 0), la));
      F.push(P(dD(Math.abs(la)), la));
    }
    q.strokeStyle = COL.dim;
    q.lineWidth = 1;
    q.setLineDash([2, 3]);
    q.beginPath();
    q.moveTo(...E[0]);
    for (const e of E) q.lineTo(...e);
    q.closePath();
    q.stroke();
    q.setLineDash([]);
    q.strokeStyle = COL.muted;
    q.lineWidth = 1.3;
    q.beginPath();
    q.moveTo(...F[0]);
    for (const e of F) q.lineTo(...e);
    q.closePath();
    q.stroke();
  }
  q.font = '10px ' + FONT_MONO;
  const muText = localNum(S.mu) + ' g';
  const muX = c0 + S.mu * k;
  q.fillStyle = COL.muted;
  if (muX + 4 + q.measureText(muText).width <= W - 4) q.fillText(muText, muX + 4, c1 + 3);
  else {
    q.textAlign = 'right';
    q.fillText(muText, muX - 6, c1 - 4);
  }
  q.fillStyle = COL.dim;
  q.textAlign = 'left';
  q.fillText('1 g', c0 + k * 0.71 + 3, c1 - k * 0.71 - 2);
  q.textAlign = 'center';
  q.fillText(i18n`gaz`, c0, c1 - R + 11);
  q.fillText(i18n`hamowanie`, c0, c1 + R - 4);
  q.textAlign = 'left';
  for (const s of src) {
    if (s.tr && s.tr.length) {
      const T = s.tr;
      const key = s.key;
      let lo = 0;
      let hi = T.length - 1;
      if (T[0][key] != null && T[0][key] <= s.t) {
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1;
          const tv = T[m][key];
          if (tv != null && tv <= s.t) lo = m;
          else hi = m;
        }
        const i1 = T[hi][key] != null && T[hi][key] <= s.t ? hi : lo;
        q.strokeStyle = s.col || COL.ghost;
        q.lineWidth = 1.6;
        q.lineCap = 'round';
        let prev = null;
        for (let j = i1; j >= 0; j--) {
          const a = T[j];
          const age = s.t - a[key];
          if (a[key] == null || age > GG_T) break;
          const pt = P(a.ax || 0, a.al || 0);
          if (prev) {
            q.globalAlpha = 0.7 * (1 - age / GG_T);
            q.beginPath();
            q.moveTo(...prev);
            q.lineTo(...pt);
            q.stroke();
          }
          prev = pt;
        }
        q.globalAlpha = 1;
      }
    }
    const ax = s.p.ax || 0;
    const al = s.p.al || 0;
    const [px, py] = P(ax, al);
    const grip = gripState(s.p);
    q.fillStyle = s.col || COL.chalk;
    q.beginPath();
    q.arc(px, py, 5, 0, 7);
    q.fill();
    if (grip.slide || grip.use > 0.9) {
      q.strokeStyle = grip.slide ? COL.brake : COL.warn;
      q.lineWidth = 2;
      q.beginPath();
      q.arc(px, py, 8, 0, 7);
      q.stroke();
    }
  }
  q.font = '12px ' + FONT_MONO;
  const gT = (s) => fmtNum(Math.hypot(s.p.ax || 0, s.p.al || 0) / G, 2) + ' g';
  if (src.length > 1) {
    q.fillStyle = COL.chalk;
    q.textAlign = 'left';
    q.fillText(gT(src[0]), 8, H - 8);
    q.fillStyle = COL.ok;
    q.textAlign = 'right';
    q.fillText(gT(src[1]), W - 8, H - 8);
    q.textAlign = 'left';
  } else {
    const s = src[0];
    const grip = gripState(s.p);
    q.fillStyle = s.col || COL.chalk;
    q.fillText(gT(s), 8, H - 22);
    if (grip.note) {
      const w0 = q.measureText(gT(s)).width;
      q.font = '10px ' + FONT_MONO;
      q.fillStyle = grip.slide ? COL.brake : COL.muted;
      q.fillText(' · ' + grip.note, 8 + w0, H - 22);
      q.font = '12px ' + FONT_MONO;
    }
    q.fillStyle = COL.muted;
    q.fillText(i18n`przyczepność ${Math.round(grip.use * 100)}%`, 8, H - 7);
  }
}
function setHud(p, pb) {
  const L = pb
    ? [
        [i18n`Zawodnik`, 'A', p],
        [i18n`Trener`, 'B', pb],
      ]
    : [[planner.on ? i18n`Zawodnik` : i18n`Trener`, '', p]];
  const inp = (q) =>
    [
      [i18n`gaz`, q.ut],
      [i18n`przód`, q.uf],
      [i18n`tył`, q.ur],
    ]
      .filter((a) => (a[1] || 0) > 0.04)
      .map((a) => a[0] + ' ' + Math.round(a[1] * 100) + '%')
      .join(' · ') || '–';
  let h =
    '<tr>' +
    [i18n`Teraz`, 'km/h', i18n`złożenie`, i18n`kierownica`, i18n`promień`, i18n`przyczepność`, i18n`gaz i hamulce`]
      .map((c) => '<th>' + c + '</th>')
      .join('') +
    '</tr>';
  for (const [nm, v, q] of L) {
    const kk = Math.abs(q.k || 0);
    const grip = gripState(q);
    h +=
      '<tr><td class="' +
      v +
      '">' +
      nm +
      '</td><td>' +
      Math.round(q.v * 3.6) +
      '</td><td>' +
      Math.round(Math.abs(q.phb || 0) * DEG) +
      '°</td><td' +
      (q.v > 1 && Math.abs(q.phb || 0) > RAD && (q.st || 0) * Math.sign(q.phb) < -1.5 * RAD
        ? ' class="up">' + Math.round(Math.abs(q.st) * DEG) + '° ' + i18n`przeciwskręt`
        : '>' + Math.round(Math.abs(q.st || 0) * DEG) + '°' + (q.lock ? ' ' + i18n`pełny` : '')) +
      '</td><td>' +
      (kk > 0.02 ? fmtNum(1 / kk, 1) + ' m' : i18n`prosto`) +
      '</td><td' +
      (grip.slide ? ' class="up"' : '') +
      '>' +
      Math.round(grip.use * 100) +
      '%' +
      (grip.note ? ' · ' + grip.note : '') +
      '</td><td>' +
      inp(q) +
      '</td></tr>';
  }
  $('nowTbl').innerHTML = h;
}
function viewsNow() {
  if (run && !run.end) return null;
  if (last && last.mode === 'plan' && last.B) {
    const t = hover ? hover.t : player.t;
    return [interpAt(last, t), interpAt(last.B, t)];
  }
  if (last && last.trace && last.trace.length && last.mode !== 'plan')
    return [hover ? hover.p : last.trace[last.trace.length - 1], null];
  if (planner.on && planner.A)
    return ['A', 'B'].map((v) => ({ ...poseOf(new Sim(planSetup(planner[v]))), lock: false, k: 0 }));
  const p0 = { ...poseOf(new Sim(S)), lock: false, k: 0 };
  return [p0, null];
}
function drawViews() {
  const v = viewsNow();
  if (!v || !v[0]) return;
  drawLean(v[0], v[1]);
  setHud(v[0], v[1]);
}
function resizeAll() {
  sizeTrack();
  sizeLean();
  sizeTele();
  layout.sz = layoutSignature();
  if (!asphalt) makeAsphalt();
  drawTrack();
  drawTele();
  drawRef();
  if (!run) drawViews();
}
function renderBikes() {
  const box = $('bikes');
  box.innerHTML = '';
  for (const b of BIKES) {
    const el = document.createElement('button');
    el.dataset.v = b.id;
    el.setAttribute('aria-pressed', String(b.id === state.bike));
    el.textContent = b.name;
    el.title = i18n`${b.sub} · ${b.m} kg · ${localNum(b.P)} kW · rozstaw ${fmtNum(b.L, 2)} m · skręt ${b.lock}°`;
    el.onclick = () => {
      if (run && !run.end) return;
      if (state.bike === b.id) return;
      state.bike = b.id;
      settingsChanged();
    };
    box.appendChild(el);
  }
}
