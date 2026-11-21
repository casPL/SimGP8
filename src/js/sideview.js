// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The side view: suspension travel and steering geometry.

const leanCv = $('lean');
const leanCtx = leanCv.getContext('2d');
let LW = 320;
let LH = 170;
const sideCv = $('side');
const sideCtx = sideCv.getContext('2d');
let SW = 320;
let SH = 170;
let sideExt = null;
// Front end in side view [m]: origin at the rear contact patch, x forwards, y up.
function sideFront(S, zf, zr) {
  const b = S.b;
  const g = liveGeometry(S, zf, zr);
  const e = g.eps;
  const u = [-Math.sin(e), Math.cos(e)];
  const n = [Math.cos(e), Math.sin(e)];
  const mv = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const F = [g.L, b.rw];
  const C = mv(F, u, 0.36 + S.ft - zf);
  const H = mv(C, n, -S.off);
  return { g, u, n, F, C, H, Ht: mv(H, u, 0.14), Ct: mv(C, u, 0.14), sl: mv(F, u, 0.3) };
}
// The frame is rigid: a template from static sag, moved with the steering head and the rear (the
// rear wheel moves vertically relative to the frame).
function sideTpl(S) {
  if (S._side) return S._side;
  const b = S.b;
  const st = sideFront(S, S.sagF, S.sagR);
  const sw = 0.42 * b.L;
  const P = [sw * Math.cos(0.21), b.rw + sw * Math.sin(0.21)];
  return (S._side = {
    st,
    A: [0, b.rw + 0.3],
    P,
    sF: [0.5 * b.L, st.Ht[1] - 0.07],
    sR: [0.08 * b.L, st.Ht[1] - 0.03],
    kT: [P[0] - 0.04, P[1] + 0.24],
  });
}
function sideGeo(S, zf, zr) {
  const T = sideTpl(S);
  const f = sideFront(S, zf, zr);
  const A = [0, T.A[1] - (zr - S.sagR)];
  const H0 = T.st.H;
  const a = Math.atan2(f.H[1] - A[1], f.H[0] - A[0]) - Math.atan2(H0[1] - T.A[1], H0[0] - T.A[0]);
  const k = Math.hypot(f.H[0] - A[0], f.H[1] - A[1]) / Math.hypot(H0[0] - T.A[0], H0[1] - T.A[1]);
  const c = Math.cos(a) * k;
  const s = Math.sin(a) * k;
  const tf = (q) => {
    const dx = q[0] - T.A[0];
    const dy = q[1] - T.A[1];
    return [A[0] + c * dx - s * dy, A[1] + s * dx + c * dy];
  };
  return { ...f, R: [0, S.b.rw], P: tf(T.P), sF: tf(T.sF), sR: tf(T.sR), kT: tf(T.kT) };
}
function sideExtent() {
  if (sideExt) return sideExt;
  let w = 0;
  let h = 0;
  for (const b of BIKES) {
    const T = sideTpl(makeSetup(b, 'neu', 0));
    w = Math.max(w, b.L + 2 * b.rw + 0.12);
    h = Math.max(h, T.st.Ht[1] + 0.12, T.sF[1] + 0.52);
  }
  return (sideExt = { w, h });
}
function drawSide(p) {
  const q = sideCtx;
  const W = SW;
  const Hc = SH;
  const b = S.b;
  q.clearRect(0, 0, W, Hc);
  const zfr = p.zf != null ? p.zf : S.sagF / S.ft;
  const zrr = p.zr != null ? p.zr : S.sagR / S.rt;
  const cur = sideGeo(S, zfr * S.ft, zrr * S.rt);
  const st = sideGeo(S, S.sagF, S.sagR);
  const ext = sideExtent();
  const gW = 66;
  const gy = Hc - 14;
  const yTop = 54;
  const aW = W - gW - 18;
  const sc = Math.min(aW / ext.w, (gy - yTop) / ext.h);
  const ox = 10 + (aW - (b.L + 2 * b.rw) * sc) / 2 + b.rw * sc;
  const X = (m) => [ox + m[0] * sc, gy - m[1] * sc];
  const ln = (pts, col, wd, dash) => {
    q.strokeStyle = col;
    q.lineWidth = wd;
    q.lineCap = 'round';
    q.lineJoin = 'round';
    q.setLineDash(dash || []);
    q.beginPath();
    pts.forEach((m, i) => {
      const [x, y] = X(m);
      i ? q.lineTo(x, y) : q.moveTo(x, y);
    });
    q.stroke();
    q.setLineDash([]);
  };
  q.font = '11px ' + FONT_MONO;
  q.fillStyle = COL.muted;
  q.fillText(i18n`WIDOK Z BOKU`, 10, 15);
  if (sideWho) {
    q.fillStyle = sideWho.col;
    q.fillText(sideWho.name, 10 + q.measureText(i18n`WIDOK Z BOKU` + '  ').width, 15);
  }
  q.strokeStyle = COL.rule;
  q.lineWidth = 1;
  q.beginPath();
  q.moveTo(8, gy + 0.5);
  q.lineTo(10 + aW + 4, gy + 0.5);
  q.stroke();
  q.globalAlpha = 0.5;
  ln([st.F, st.Ct], COL.dim, 1.5);
  ln([st.R, st.P, st.H, st.Ht, st.sF, st.sR], COL.dim, 1.5);
  q.globalAlpha = 1;
  for (const w of [cur.R, cur.F]) {
    const [x, y] = X(w);
    q.fillStyle = '#0b0b0b';
    q.beginPath();
    q.arc(x, y, b.rw * sc, 0, 7);
    q.fill();
    q.strokeStyle = '#59616a';
    q.lineWidth = 1.5;
    q.beginPath();
    q.arc(x, y, Math.max(2, (b.rw - 0.075) * sc), 0, 7);
    q.stroke();
    q.fillStyle = '#59616a';
    q.beginPath();
    q.arc(x, y, 2.5, 0, 7);
    q.fill();
  }
  const sb = [cur.P[0] + 0.4 * (cur.R[0] - cur.P[0]), cur.P[1] + 0.4 * (cur.R[1] - cur.P[1])];
  ln([cur.R, cur.P], '#59616a', Math.max(3, 0.045 * sc));
  ln([cur.kT, sb], COL.fork, Math.max(2, 0.03 * sc));
  ln([cur.H, cur.P], '#4a525b', Math.max(4, 0.07 * sc));
  ln([cur.Ht, cur.sF, cur.sR], '#59616a', Math.max(3, 0.06 * sc));
  {
    const bq = clamp(p.bx != null ? p.bx : S.seat0, -1, 1);
    const f = 0.5 + 0.32 * bq;
    const hip = [cur.sR[0] + (cur.sF[0] - cur.sR[0]) * f, cur.sR[1] + (cur.sF[1] - cur.sR[1]) * f + 0.05];
    const ang = (18 + 16 * bq) * RAD;
    const sh = [hip[0] + 0.3 * Math.sin(ang), hip[1] + 0.3 * Math.cos(ang)];
    const hd = [sh[0] + 0.05 * Math.sin(ang), sh[1] + 0.05 * Math.cos(ang) + 0.06];
    const bar = [cur.Ct[0] - cur.n[0] * 0.08, cur.Ct[1] - cur.n[1] * 0.08];
    const rc = inputColor(p) === COL.dim ? COL.chalk : inputColor(p);
    ln([sh, bar], '#59616a', Math.max(2, 0.025 * sc));
    ln([hip, sh], rc, Math.max(4, 0.08 * sc));
    const [hx, hy] = X(hd);
    q.fillStyle = rc;
    q.beginPath();
    q.arc(hx, hy, Math.max(4, 0.065 * sc), 0, 7);
    q.fill();
  }
  const axG = [cur.F[0] + cur.g.trail, 0];
  const axT = [cur.Ht[0] + cur.u[0] * 0.1, cur.Ht[1] + cur.u[1] * 0.1];
  ln([axG, axT], COL.muted, 1, [4, 3]);
  const [sx] = X([b.L + b.trail, 0]);
  q.strokeStyle = COL.dim;
  q.lineWidth = 1.5;
  q.beginPath();
  q.moveTo(sx, gy - 5);
  q.lineTo(sx, gy + 5);
  q.stroke();
  ln([[cur.F[0], 0], axG], COL.fork, 3);
  ln([cur.F, cur.sl], '#59616a', Math.max(4, 0.055 * sc));
  ln([cur.sl, cur.C], COL.fork, Math.max(2.5, 0.035 * sc));
  ln([cur.C, cur.Ct], '#59616a', Math.max(2.5, 0.035 * sc));
  ln([cur.C, cur.H], '#59616a', 3);
  ln([cur.Ct, cur.Ht], '#59616a', 3);
  ln(
    [cur.Ct, [cur.Ct[0] + cur.u[0] * 0.05 - cur.n[0] * 0.1, cur.Ct[1] + cur.u[1] * 0.05 - cur.n[1] * 0.1]],
    COL.chalk,
    2.5,
  );
  for (const w of [cur.R, cur.F]) {
    const [x] = X([w[0], 0]);
    q.fillStyle = COL.chalk;
    q.beginPath();
    q.arc(x, gy, 2.5, 0, 7);
    q.fill();
  }
  const lb = Math.abs(p.phb || 0);
  const Rc = cur.g.L / lockTan(S, lb, cur.g);
  const R0 = b.L / lockTan(S, lb, S);
  const it = [
    [
      i18n`główka`,
      i18n`główka`,
      fmtNum(cur.g.eps * DEG, 1) + '°',
      fmtNum(b.rake, 1) + '°',
      Math.abs(cur.g.eps * DEG - b.rake) > 0.3,
    ],
    [
      i18n`wyprzedzenie`,
      i18n`wypr.`,
      Math.round(cur.g.trail * 1000) + ' mm',
      String(Math.round(b.trail * 1000)),
      Math.abs(cur.g.trail - b.trail) > 0.003,
    ],
    [i18n`rozstaw`, i18n`rozst.`, fmtNum(cur.g.L, 2) + ' m', fmtNum(b.L, 2), Math.abs(cur.g.L - b.L) > 0.005],
    [i18n`R pełny skręt`, i18n`R pełny`, fmtNum(Rc, 2) + ' m', fmtNum(R0, 2), Math.abs(Rc / R0 - 1) > 0.01],
  ];
  q.font = '10px ' + FONT_MONO;
  const row = (A, y) => {
    let segs = (k) => {
      const o = [];
      A.forEach((a, i) => {
        if (i) o.push([' · ', COL.dim]);
        o.push([a[k] + ' ', COL.muted], [a[2], a[4] ? COL.fork : COL.chalk], [' (' + a[3] + ')', COL.dim]);
      });
      return o;
    };
    const wd = (A) => A.reduce((s, g) => s + q.measureText(g[0]).width, 0);
    let S1 = segs(0);
    if (wd(S1) > W - 16) S1 = segs(1);
    if (wd(S1) > W - 16) S1 = S1.filter((g) => g[1] !== COL.dim || g[0] === ' · ');
    let x = 10;
    for (const [t, col] of S1) {
      q.fillStyle = col;
      q.fillText(t, x, y);
      x += q.measureText(t).width;
    }
  };
  row(it.slice(0, 2), 31);
  row(it.slice(2), 45);
  const gx0 = W - gW - 4;
  const bt = yTop + 22;
  const bb = gy;
  q.textAlign = 'center';
  q.fillStyle = COL.muted;
  q.fillText(i18n`ugięcie, mm`, gx0 + 30, bt - 16);
  [
    [i18n`przód`, zfr, S.ft],
    [i18n`tył`, zrr, S.rt],
  ].forEach(([l, v, tr], i) => {
    const x = gx0 + 4 + i * 26;
    const hh = bb - bt;
    const vv = clamp(v, 0, 1);
    q.fillStyle = COL.rule;
    q.fillRect(x, bt, 13, hh);
    q.fillStyle = COL.fork;
    q.fillRect(x, bb - hh * vv, 13, hh * vv);
    const ys = Math.round(bb - hh * 0.3) + 0.5;
    q.strokeStyle = COL.chalk;
    q.lineWidth = 1;
    q.beginPath();
    q.moveTo(x - 3, ys);
    q.lineTo(x + 16, ys);
    q.stroke();
    q.fillStyle = COL.fork;
    q.fillText(String(Math.round(vv * tr * 1000)), x + 6.5, bt - 4);
    q.fillStyle = COL.muted;
    q.font = '9px ' + FONT_MONO;
    q.fillText(l, x + 6.5, gy + 11);
    q.font = '10px ' + FONT_MONO;
  });
  q.textAlign = 'left';
  q.fillStyle = COL.dim;
  q.font = '9px ' + FONT_MONO;
  q.fillText('sag', gx0 + 48, Math.round(bb - (bb - bt) * 0.3) + 3);
}
let hudTick = 0;
function drawLiveHud() {
  if (!run) return;
  const s = run.sim;
  const p = {
    ...poseOf(s),
    lock: s.lock,
    k: s.k,
    al: s.al,
    ax: s.ax,
    useF: s.useF,
    useR: s.useR,
    loadF: s.loadF,
    loadR: s.loadR,
  };
  drawLean(p);
  if (++hudTick % 3 === 0) setHud(p);
}
