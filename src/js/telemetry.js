// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The run chart: speed, lean, steering, brakes and throttle, loop by loop, against the A–H pattern.

const teleCv = $('tele');
const teleCtx = teleCv.getContext('2d');
let TW = 800;
let TH = 380;
const TELE_ROWS = [
  { id: 'v', name: i18n`Prędkość`, short: i18n`Prędk.`, col: 'spd', unit: 'km/h', get: (p) => p.v * 3.6 },
  { id: 'lean', name: i18n`Złożenie`, short: i18n`Złoż.`, col: 'leanc', unit: '°', get: (p) => Math.abs(p.phb) * DEG },
  {
    id: 'st',
    name: i18n`Kierownica`,
    short: i18n`Kier.`,
    col: 'steer',
    unit: '°',
    get: (p) => p.st * (Math.sign(p.phb) || 1) * DEG,
  },
  { id: 'uf', name: i18n`Przedni ham.`, short: i18n`Przód`, col: 'brake', unit: '%', get: (p) => p.uf * 100 },
  { id: 'ur', name: i18n`Tylny ham.`, short: i18n`Tył`, col: 'rear', unit: '%', get: (p) => p.ur * 100 },
  { id: 'ut', name: i18n`Gaz`, short: i18n`Gaz`, col: 'gas', unit: '%', get: (p) => p.ut * 100 },
  { id: 'zf', name: i18n`Widelec`, short: i18n`Widel.`, col: 'fork', unit: '%', get: (p) => (p.zf || 0) * 100 },
  { id: 'body', name: i18n`Ciało`, short: i18n`Ciało`, col: 'body', unit: '', get: (p) => (p.bx || 0) * 100 },
];
const PHASE_START = { A: 0, B: 0.136, C: 0.217, D: 0.283, E: 0.498, F: 0.619, G: 0.762, H: 0.841 }; // A–H pattern: start of each phase as a share of the loop
const REF_CURVES = {
  v: [
    [0, 0.92],
    [0.136, 0.78],
    [0.217, 0.66],
    [0.283, 0.56],
    [0.33, 0.47],
    [0.45, 0.48],
    [0.498, 0.52],
    [0.56, 0.78],
    [0.62, 0.93],
    [0.7, 0.97],
    [0.762, 0.95],
    [0.841, 0.9],
    [1, 0.86],
  ],
  lean: [
    [0, 0.42],
    [0.136, 0.46],
    [0.217, 0.5],
    [0.25, 0.62],
    [0.283, 0.95],
    [0.498, 0.96],
    [0.55, 0.9],
    [0.62, 0.7],
    [0.762, 0.04],
    [0.841, 0.22],
    [1, 0.42],
  ],
  st: [
    [0, 0.12],
    [0.136, 0.32],
    [0.205, 0.42],
    [0.232, 0.3],
    [0.265, 0.6],
    [0.295, 1],
    [0.498, 1],
    [0.56, 0.55],
    [0.619, 0.12],
    [0.762, 0.06],
    [0.9, 0.06],
    [1, 0.12],
  ],
  uf: [
    [0, 1],
    [0.1, 0.95],
    [0.18, 0.6],
    [0.217, 0.3],
    [0.245, 0.03],
    [0.255, 0],
    [0.85, 0],
    [0.9, 0.3],
    [0.95, 0.78],
    [1, 1],
  ],
  ur: [
    [0, 0],
    [0.15, 0],
    [0.2, 0.15],
    [0.25, 0.4],
    [0.283, 0.36],
    [0.31, 0.2],
    [0.335, 0.36],
    [0.36, 0.18],
    [0.39, 0.36],
    [0.42, 0.18],
    [0.45, 0.32],
    [0.48, 0.14],
    [0.5, 0.04],
    [0.52, 0],
    [1, 0],
  ],
  ut: [
    [0, 0],
    [0.45, 0],
    [0.498, 0.08],
    [0.56, 0.5],
    [0.62, 0.8],
    [0.7, 0.9],
    [0.762, 0.95],
    [0.79, 0.9],
    [0.841, 0.4],
    [0.9, 0.12],
    [1, 0],
  ],
};
function refAt(id, u) {
  const P = REF_CURVES[id];
  if (u <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++)
    if (u <= P[i][0]) {
      const a = P[i - 1];
      const b = P[i];
      return a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0] || 1);
    }
  return P[P.length - 1][1];
}
// Segments Start, F1, N1 … F5, Finish, from one crossing of the figure eight to the next.
function segBounds(c, trace) {
  const mids = c.cross.filter((q) => q.reg === 'M').map((q) => q.t);
  if (c.cross.length && c.cross[0].reg === 'F') {
    const p = trace.find((q) => q.rt != null && q.rt >= 0 && q.x >= 0);
    mids.unshift(p ? p.rt : c.cross[0].t * 0.5);
  }
  return mids;
}
function buildSegments(r) {
  r.segs = [];
  const c = r.course;
  if (!c.started) return;
  const tr = r.trace.filter((p) => p.rt != null && p.rt >= -0.02);
  r.tr = tr;
  if (tr.length < 3) return;
  const mids = segBounds(c, tr);
  const tEnd = tr[tr.length - 1].rt;
  const bounds = [0, ...mids, tEnd];
  for (let i = 0; i < bounds.length - 1; i++) {
    const loop = i >= 1 && i < bounds.length - 1 && i < mids.length;
    const name =
      i === 0 ? i18n`Start` : loop ? (i % 2 === 1 ? 'F' : 'N') + Math.ceil(i / 2) : c.done ? i18n`Meta` : i18n`Koniec`;
    const sg = { name, t0: bounds[i], t1: bounds[i + 1], loop };
    if (loop) sg.ph = loopPhases(tr, sg.t0, sg.t1);
    r.segs.push(sg);
  }
  r.segs.forEach((sg) => (sg.dt = sg.t1 - sg.t0));
  // The finish segment runs on to the stop in the box; its time ends at the line.
  if (c.done) {
    const sg = r.segs[r.segs.length - 1];
    sg.dt = c.tEnd - sg.t0;
  }
}
function loopPhases(tr, t0, t1) {
  const P = tr.filter((p) => p.rt >= t0 && p.rt <= t1);
  if (P.length < 5) return null;
  let kmax = 0;
  let im = 0;
  P.forEach((p, i) => {
    const k = Math.abs(p.k);
    if (k > kmax) {
      kmax = k;
      im = i;
    }
  });
  const sideL = Math.sign(P[im].k) || 1;
  let a = -1;
  let bq = -1;
  let ba = -1;
  let bb = -1;
  for (let i = 0; i < P.length; i++) {
    if (P[i].lock && Math.sign(P[i].k) === sideL) {
      if (a < 0) a = i;
      bq = i;
      if (bq - a > bb - ba) {
        ba = a;
        bb = bq;
      }
    } else a = -1;
  }
  let full = ba >= 0 && P[bb].rt - P[ba].rt > 0.12;
  if (!full) {
    ba = im;
    bb = im;
    while (ba > 0 && Math.abs(P[ba - 1].k) >= 0.85 * kmax) ba--;
    while (bb < P.length - 1 && Math.abs(P[bb + 1].k) >= 0.85 * kmax) bb++;
  }
  let s1 = ba;
  while (s1 > 0 && Math.sign(P[s1 - 1].k) === sideL && Math.abs(P[s1 - 1].k) >= 0.25 * kmax) s1--;
  return { s1: P[s1].rt, s2: P[ba].rt, s3: P[bb].rt, full, side: sideL };
}
function segPhaseBounds(sg) {
  const ph = sg.ph;
  if (!ph) return null;
  return [
    [sg.t0, ph.s1, 'S3', 'G–H', PHASE_START.G, 1],
    [ph.s1, ph.s2, 'S1', 'A–C', 0, PHASE_START.D],
    [ph.s2, ph.s3, 'S2', 'D', PHASE_START.D, PHASE_START.E],
    [ph.s3, sg.t1, 'S3', 'E–F', PHASE_START.E, PHASE_START.G],
  ];
}
function renderSegButtons() {
  const box = $('segs');
  box.innerHTML = '';
  const r = last;
  if (!r) {
    box.innerHTML = SEGS_HINT;
    return;
  }
  if (!r.segs || !r.segs.length) {
    box.innerHTML = '<span class="note">' + i18n`Brak danych z przejazdu po starcie.` + '</span>';
    return;
  }
  const mk = (lab, val, d) => {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.setAttribute('aria-pressed', String(selSeg === val));
    b.innerHTML = lab + (d != null ? '<span class="d">' + (typeof d === 'string' ? d : fmtNum(d, 2)) + '</span>' : '');
    if (typeof d === 'string') b.title = DIFF_HINT;
    b.onclick = () => segPick(val);
    box.appendChild(b);
  };
  if (selSeg == null) {
    const f = r.segs.findIndex((s) => s.loop);
    selSeg = f >= 0 ? f : 'all';
  }
  mk(i18n`Całość`, 'all', null);
  r.segs.forEach((sg, i) => mk(sg.name, i, segBadge(r, i)));
}
function drawTele() {
  if (last && last.mode === 'plan' && last.B) {
    drawTelePlan();
    return;
  }
  teleCtx.clearRect(0, 0, TW, TH);
  const r = last;
  const narrow = TW < 560;
  const LWd = narrow ? 52 : 96;
  const l = LWd;
  const rr = TW - 8;
  const top = 24;
  const bot = TH - 18;
  const RR = teleRows();
  const rowH = (bot - top) / RR.length;
  teleCtx.font = '11px ' + FONT_MONO;
  if (!r || !r.tr || r.tr.length < 3) {
    teleCtx.fillStyle = COL.muted;
    teleCtx.fillText(i18n`Tu pojawi się wykres po przejeździe.`, l, top + 20);
    return;
  }
  let t0;
  let t1;
  let sg = null;
  if (selSeg === 'all' || selSeg == null) {
    t0 = 0;
    t1 = r.tr[r.tr.length - 1].rt;
  } else {
    sg = r.segs[selSeg];
    t0 = sg.t0;
    t1 = sg.t1;
  }
  const P = r.tr.filter((p) => p.rt >= t0 - 1e-6 && p.rt <= t1 + 1e-6);
  if (P.length < 2) return;
  const X = (t) => l + ((t - t0) / (t1 - t0 || 1)) * (rr - l);
  let vmax = 10;
  for (const p of P) vmax = Math.max(vmax, p.v * 3.6);
  vmax = Math.ceil(vmax / 10) * 10;
  const rng = {
    v: [0, vmax],
    lean: [0, 60],
    st: [-10, S.b.lock + 4],
    uf: [0, 100],
    ur: [0, 100],
    ut: [0, 100],
    zf: [0, 100],
    body: [-100, 100],
  };
  const bands = sg && sg.ph ? segPhaseBounds(sg) : null;
  if (bands) {
    const BC = { S1: 'rgba(239,83,80,0.07)', S2: 'rgba(180,140,240,0.10)', S3: 'rgba(242,193,78,0.06)' };
    for (const [a, b, nm, lt] of bands) {
      if (b - a <= 0) continue;
      teleCtx.fillStyle = BC[nm];
      teleCtx.fillRect(X(a), top, X(b) - X(a), bot - top);
      teleCtx.fillStyle = COL.muted;
      teleCtx.textAlign = 'center';
      const w = X(b) - X(a);
      if (w > 34) teleCtx.fillText(nm + (w > 70 ? ' · ' + lt : ''), (X(a) + X(b)) / 2, top - 8);
    }
    teleCtx.textAlign = 'left';
    if (!sg.ph.full) {
      teleCtx.fillStyle = COL.warn;
      teleCtx.fillText(i18n`bez pełnego skrętu`, X(sg.ph.s2) + 4, top + 12);
    }
  } else if (selSeg === 'all' && r.segs) {
    for (const s of r.segs) {
      const x = X(s.t0);
      teleCtx.strokeStyle = COL.dim;
      teleCtx.beginPath();
      teleCtx.moveTo(x, top);
      teleCtx.lineTo(x, bot);
      teleCtx.stroke();
      teleCtx.fillStyle = COL.muted;
      if (X(s.t1) - x > 24) teleCtx.fillText(s.name, x + 3, top - 8);
    }
  }
  RR.forEach((row, ri) => {
    const y0 = top + ri * rowH;
    const y1 = y0 + rowH - 6;
    const [mn, mx] = rng[row.id];
    const Y = (v) => y1 - ((clamp(v, mn, mx) - mn) / (mx - mn)) * (y1 - y0);
    teleCtx.strokeStyle = COL.rule;
    teleCtx.lineWidth = 1;
    teleCtx.beginPath();
    teleCtx.moveTo(l, y1 + 0.5);
    teleCtx.lineTo(rr, y1 + 0.5);
    teleCtx.stroke();
    teleCtx.fillStyle = COL[row.col];
    teleCtx.font = (narrow ? '10px ' : '11px ') + FONT_MONO;
    teleCtx.textAlign = 'left';
    teleCtx.fillText(narrow ? row.short : row.name, 4, y0 + 12);
    teleCtx.fillStyle = COL.dim;
    teleCtx.font = '10px ' + FONT_MONO;
    teleCtx.fillText(row.id === 'body' ? (narrow ? '± 100' : i18n`przód ↑ tył ↓`) : mx + ' ' + row.unit, 4, y0 + 25);
    if (row.id === 'body') {
      if (!narrow) {
        teleCtx.fillStyle = COL.leanc;
        teleCtx.fillText(i18n`··· do środka ↑`, 4, y0 + 38);
      }
      teleCtx.strokeStyle = COL.rule;
      teleCtx.beginPath();
      teleCtx.moveTo(l, Y(0));
      teleCtx.lineTo(rr, Y(0));
      teleCtx.stroke();
    }
    if (row.id === 'st') {
      teleCtx.strokeStyle = 'rgba(180,140,240,0.35)';
      teleCtx.setLineDash([3, 3]);
      teleCtx.beginPath();
      teleCtx.moveTo(l, Y(S.b.lock));
      teleCtx.lineTo(rr, Y(S.b.lock));
      teleCtx.stroke();
      teleCtx.setLineDash([]);
      if (!narrow) {
        teleCtx.fillStyle = COL.dim;
        teleCtx.fillText(i18n`pełny`, rr - 34, Y(S.b.lock) - 3);
      }
      teleCtx.strokeStyle = COL.rule;
      teleCtx.beginPath();
      teleCtx.moveTo(l, Y(0));
      teleCtx.lineTo(rr, Y(0));
      teleCtx.stroke();
    }
    if (row.id === 'zf') {
      teleCtx.strokeStyle = 'rgba(79,209,197,0.35)';
      teleCtx.setLineDash([3, 3]);
      teleCtx.beginPath();
      teleCtx.moveTo(l, Y(30));
      teleCtx.lineTo(rr, Y(30));
      teleCtx.stroke();
      teleCtx.setLineDash([]);
      if (!narrow) {
        teleCtx.fillStyle = COL.dim;
        teleCtx.fillText('sag', rr - 24, Y(30) - 3);
      }
    }
    if (bands && REF_CURVES[row.id]) {
      teleCtx.strokeStyle = COL[row.col];
      teleCtx.globalAlpha = 0.18;
      teleCtx.lineWidth = 7;
      teleCtx.lineJoin = 'round';
      teleCtx.beginPath();
      let first = true;
      let lo = mn;
      let hi = mx;
      if (row.id === 'v') {
        lo = 1e9;
        hi = 0;
        for (const p of P) {
          lo = Math.min(lo, p.v * 3.6);
          hi = Math.max(hi, p.v * 3.6);
        }
      }
      if (row.id === 'lean') {
        lo = 0;
        hi = S.capC * DEG + 6;
      }
      if (row.id === 'st') {
        lo = 0;
        hi = S.b.lock;
      }
      for (const [a, b, , , u0, u1] of bands) {
        if (b - a <= 0) continue;
        for (let q = 0; q <= 24; q++) {
          const tt = a + ((b - a) * q) / 24;
          const u = u0 + ((u1 - u0) * q) / 24;
          const val = lo + refAt(row.id, u) * (hi - lo);
          const pt = [X(tt), Y(val)];
          first ? teleCtx.moveTo(...pt) : teleCtx.lineTo(...pt);
          first = false;
        }
      }
      teleCtx.stroke();
      teleCtx.globalAlpha = 1;
      teleCtx.lineWidth = 1;
    }
    teleCtx.strokeStyle = COL[row.col];
    teleCtx.lineWidth = 1.8;
    teleCtx.beginPath();
    P.forEach((p, j) => {
      const q = [X(p.rt), Y(row.get(p))];
      j ? teleCtx.lineTo(...q) : teleCtx.moveTo(...q);
    });
    teleCtx.stroke();
    if (row.id === 'body') {
      teleCtx.strokeStyle = COL.leanc;
      teleCtx.globalAlpha = 0.85;
      teleCtx.setLineDash([1.5, 3]);
      teleCtx.lineWidth = 1.5;
      teleCtx.beginPath();
      P.forEach((p, j) => {
        const q = [X(p.rt), Y((p.rel || 0) * 100)];
        j ? teleCtx.lineTo(...q) : teleCtx.moveTo(...q);
      });
      teleCtx.stroke();
      teleCtx.setLineDash([]);
      teleCtx.globalAlpha = 1;
    }
    if (row.id === 'uf' || row.id === 'ur' || row.id === 'ut') {
      teleCtx.globalAlpha = 0.16;
      teleCtx.fillStyle = COL[row.col];
      teleCtx.lineTo(X(P[P.length - 1].rt), Y(0));
      teleCtx.lineTo(X(P[0].rt), Y(0));
      teleCtx.fill();
      teleCtx.globalAlpha = 1;
    }
  });
  teleCtx.fillStyle = COL.dim;
  teleCtx.font = '10px ' + FONT_MONO;
  teleCtx.textAlign = 'center';
  const span = t1 - t0;
  const step = span > 12 ? 5 : span > 5 ? 1 : 0.5;
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-6; t += step) {
    teleCtx.fillText(localNum(Math.round(t * 10) / 10) + ' s', X(t), TH - 4);
  }
  teleCtx.textAlign = 'left';
  if (hover && hover.t >= t0 && hover.t <= t1) {
    const x = X(hover.t);
    teleCtx.strokeStyle = COL.chalk;
    teleCtx.globalAlpha = 0.6;
    teleCtx.beginPath();
    teleCtx.moveTo(x, top);
    teleCtx.lineTo(x, bot);
    teleCtx.stroke();
    teleCtx.globalAlpha = 1;
    const p = hover.p;
    const body = (p.bx || 0) > 0.15 ? i18n`przód` : (p.bx || 0) < -0.15 ? i18n`tył` : i18n`środek`;
    const rel = Math.abs(p.rel || 0) > 0.15 ? (p.rel > 0 ? i18n`, do środka` : i18n`, na zewnątrz`) : '';
    const txt = [
      fmtNum(hover.t, 2) + ' s',
      (p.v * 3.6).toFixed(0) + ' km/h',
      i18n`złożenie ${Math.round(Math.abs(p.phb) * DEG)}°`,
      i18n`kier. ${Math.round(Math.abs(p.st) * DEG)}°` + (p.lock ? i18n` (pełny)` : ''),
      i18n`gaz ${Math.round(p.ut * 100)}%`,
      i18n`hamulce: przód ${Math.round(p.uf * 100)}%, tył ${Math.round(p.ur * 100)}%`,
      i18n`widelec ${Math.round((p.zf || 0) * S.ft * 1000)} mm`,
      i18n`ciało ${body}${rel}`,
    ].join(' · ');
    teleCtx.font = '11px ' + FONT_MONO;
    let lines = [txt];
    if (teleCtx.measureText(txt).width > rr - l - 10) {
      lines = [];
      let cur = '';
      for (const s of txt.split(' · ')) {
        const t = cur ? cur + ' · ' + s : s;
        if (cur && teleCtx.measureText(t).width > rr - l - 10) {
          lines.push(cur);
          cur = s;
        } else cur = t;
      }
      lines.push(cur);
    }
    const w = Math.max(...lines.map((s) => teleCtx.measureText(s).width));
    const bx = clamp(x + 8, l, Math.max(l, rr - w - 6));
    teleCtx.fillStyle = COL.panel2;
    teleCtx.fillRect(bx - 4, top + 2, w + 8, 4 + 13 * lines.length);
    teleCtx.fillStyle = COL.chalk;
    lines.forEach((s, i) => teleCtx.fillText(s, bx, top + 14 + 13 * i));
  }
}
function teleHover(e) {
  if (run || !last || !last.tr) return;
  const rc = teleCv.getBoundingClientRect();
  const narrow = TW < 560;
  const l = narrow ? 52 : 96;
  const rr = TW - 8;
  let t0, t1;
  if (last.mode === 'plan' && last.B) [t0, t1] = teleRangePlan();
  else if (selSeg === 'all' || selSeg == null) {
    t0 = 0;
    t1 = last.tr[last.tr.length - 1].rt;
  } else {
    const sg = last.segs[selSeg];
    t0 = sg.t0;
    t1 = sg.t1;
  }
  const f = (e.clientX - rc.left - l) / (rr - l);
  if (f < 0 || f > 1) return;
  if (player.on && e.type !== 'pointerdown') return;
  player.on = false;
  showReplayAt(t0 + f * (t1 - t0));
}
teleCv.addEventListener('pointermove', teleHover);
teleCv.addEventListener('pointerdown', teleHover);
teleCv.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'touch' || !$('player').hidden) return;
  hover = null;
  drawTele();
  drawTrack();
});
const refCv = $('refc');
const refCtx = refCv.getContext('2d');
let RW = 800;
let RH = 300;
function drawRef() {
  const dpr = window.devicePixelRatio || 1;
  RW = refCv.clientWidth || 800;
  RH = RW < 560 ? 300 : 320;
  refCv.style.height = RH + 'px';
  refCv.width = Math.round(RW * dpr);
  refCv.height = Math.round(RH * dpr);
  refCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  refCtx.clearRect(0, 0, RW, RH);
  const RR = TELE_ROWS.filter((r) => REF_CURVES[r.id]);
  const narrow = RW < 560;
  const l = narrow ? 52 : 110;
  const rr = RW - 8;
  const top = 40;
  const bot = RH - 6;
  const rowH = (bot - top) / RR.length;
  const X = (u) => l + u * (rr - l);
  refCtx.font = '11px ' + FONT_MONO;
  const sec = [
    ['S1', 0, PHASE_START.D],
    ['S2', PHASE_START.D, PHASE_START.E],
    ['S3', PHASE_START.E, 1],
  ];
  sec.forEach(([n, a, b], i) => {
    refCtx.fillStyle = i === 1 ? 'rgba(180,140,240,0.08)' : i === 0 ? 'rgba(239,83,80,0.06)' : 'rgba(242,193,78,0.05)';
    refCtx.fillRect(X(a), top - 30, X(b) - X(a), bot - top + 30);
    refCtx.fillStyle = COL.chalk;
    refCtx.textAlign = 'center';
    refCtx.font = '700 14px ' + FONT_DISPLAY;
    refCtx.fillText(n, (X(a) + X(b)) / 2, top - 16);
  });
  refCtx.font = '11px ' + FONT_MONO;
  refCtx.fillStyle = COL.muted;
  for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    const x = X(PHASE_START[k]);
    refCtx.strokeStyle = COL.rule;
    refCtx.setLineDash([3, 4]);
    refCtx.beginPath();
    refCtx.moveTo(x, top - 6);
    refCtx.lineTo(x, bot);
    refCtx.stroke();
    refCtx.setLineDash([]);
    refCtx.textAlign = 'left';
    refCtx.fillText(k, x + 4, top - 2);
  }
  RR.forEach((row, ri) => {
    const y0 = top + ri * rowH + 6;
    const y1 = y0 + rowH - 10;
    refCtx.fillStyle = COL[row.col];
    refCtx.textAlign = 'left';
    refCtx.fillText(narrow ? row.short : row.name, 4, y0 + (rowH - 10) / 2 + 4);
    refCtx.strokeStyle = COL[row.col];
    refCtx.lineWidth = 2;
    refCtx.beginPath();
    for (let q = 0; q <= 200; q++) {
      const u = q / 200;
      const pt = [X(u), y1 - refAt(row.id, u) * (y1 - y0)];
      q ? refCtx.lineTo(...pt) : refCtx.moveTo(...pt);
    }
    refCtx.stroke();
    refCtx.strokeStyle = COL.rule;
    refCtx.lineWidth = 1;
    refCtx.beginPath();
    refCtx.moveTo(l, y1 + 2.5);
    refCtx.lineTo(rr, y1 + 2.5);
    refCtx.stroke();
  });
  refCtx.textAlign = 'left';
}
