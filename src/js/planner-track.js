// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The planner on the course: the B, T and G markers, dragging them, and drawing both riders.

function pointAhead(bt, q, d) {
  const i0 = q ? bt.iExit[q - 1] : 0;
  const i1 = bt.iApex[q];
  let a0 = bt.ahead(q, i0);
  if (d >= a0) return bt.mid(i0);
  for (let i = i0 + 1; i <= i1; i++) {
    const a = bt.ahead(q, i);
    if (a <= d) {
      const f = (a0 - d) / (a0 - a || 1);
      const p0 = bt.mid(i - 1);
      const p1 = bt.mid(i);
      return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
    }
    a0 = a;
  }
  return bt.mid(i1);
}
const toWorld = (sx, sy) =>
  view.rot
    ? [(view.oy - sy) / view.sc, (view.ox - sx) / view.sc]
    : [(sx - view.ox) / view.sc, (view.oy - sy) / view.sc];
const distToApproach = (bt, q, wx, wy) => {
  const p0 = bt.mid(bt.iTurn[q]);
  const u = approachDir(q);
  return Math.abs((wx - p0[0]) * u[1] - (wy - p0[1]) * u[0]);
};
function nearestOnLoop(bt, q, wx, wy) {
  let a = bt.iTurn[q];
  while (a < bt.iExit[q] && bt.rotLeft[a] > planner.lim.aMax * RAD) a++;
  let bi = a;
  let bd = 1e9;
  for (let i = a; i <= bt.iExit[q]; i++) {
    const p = bt.mid(i);
    const d = Math.hypot(p[0] - wx, p[1] - wy);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return { i: bi, d: bd };
}
const EDIT_TURN = 2;
function planMarks() {
  const out = [];
  if (!planner.on || !planner.A) return out;
  const r = view.rot ? 8.5 : 10;
  const bt = planPreview();
  if (!bt) return out;
  const pl = planner.A;
  const q = EDIT_TURN;
  const cn = CONES[1];
  const [c0x, c0y] = toScreen(cn[0], cn[1]);
  for (const kind of ['brake', 'turn', 'gas']) {
    const w =
      kind === 'gas'
        ? bt.mid(bt.gasIndex(q, pl.gas * RAD))
        : kind === 'turn'
          ? bt.turnInPoint(q)
          : pointAhead(bt, q, pl.brake);
    const [sx, sy] = toScreen(w[0], w[1]);
    let nx, ny;
    if (kind === 'gas') {
      nx = sx - c0x;
      ny = sy - c0y;
    } else {
      const u = approachDir(q);
      const [ex, ey] = toScreen(w[0] + u[0], w[1] + u[1]);
      nx = ey - sy;
      ny = sx - ex;
    }
    const nl = Math.hypot(nx, ny) || 1;
    out.push({ q, kind, sx, sy, nx: nx / nl, ny: ny / nl, bx: sx, by: sy, r });
  }
  for (let it = 0; it < 5; it++)
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dx = b.bx - a.bx;
        let dy = b.by - a.by;
        const d = Math.hypot(dx, dy);
        const need = a.r + b.r + 2;
        if (d >= need) continue;
        if (d < 0.5) {
          dx = -a.ny;
          dy = a.nx;
        } else {
          dx /= d;
          dy /= d;
        }
        const m = (need - d) / 2;
        a.bx -= dx * m;
        a.by -= dy * m;
        b.bx += dx * m;
        b.by += dy * m;
      }
  return out;
}
function drawPlanMarks() {
  const ms = planMarks();
  trackCtx.save();
  trackCtx.lineCap = 'round';
  for (const m of ms) {
    trackCtx.strokeStyle = COL.chalk;
    trackCtx.lineWidth = 2.5;
    trackCtx.globalAlpha = 0.95;
    trackCtx.beginPath();
    trackCtx.moveTo(m.sx - m.nx * 6, m.sy - m.ny * 6);
    trackCtx.lineTo(m.sx + m.nx * 6, m.sy + m.ny * 6);
    trackCtx.stroke();
    if (Math.hypot(m.bx - m.sx, m.by - m.sy) > m.r * 0.7) {
      trackCtx.lineWidth = 1;
      trackCtx.globalAlpha = 0.6;
      trackCtx.beginPath();
      trackCtx.moveTo(m.sx, m.sy);
      trackCtx.lineTo(m.bx, m.by);
      trackCtx.stroke();
    }
  }
  trackCtx.globalAlpha = 1;
  for (const m of ms) {
    const g = planner.drag;
    const act = g && g.kind === m.kind;
    trackCtx.fillStyle = COL.chalk;
    trackCtx.beginPath();
    trackCtx.arc(m.bx, m.by, m.r, 0, 7);
    trackCtx.fill();
    trackCtx.strokeStyle = COL.coneF;
    trackCtx.lineWidth = 2.2;
    trackCtx.stroke();
    if (act) {
      trackCtx.strokeStyle = COL.cone;
      trackCtx.lineWidth = 2;
      trackCtx.beginPath();
      trackCtx.arc(m.bx, m.by, m.r + 3.5, 0, 7);
      trackCtx.stroke();
    }
    trackCtx.fillStyle = '#111';
    trackCtx.font = '700 ' + (view.rot ? 10 : 12) + 'px ' + FONT_DISPLAY;
    trackCtx.textAlign = 'center';
    trackCtx.textBaseline = 'middle';
    trackCtx.fillText(MARK[m.kind], m.bx, m.by + 0.5);
  }
  trackCtx.restore();
}
function drawPlanPath() {
  const bt = planPreview();
  if (!bt) return;
  trackCtx.save();
  trackCtx.strokeStyle = COL.chalk;
  trackCtx.globalAlpha = 0.4;
  trackCtx.lineWidth = 1.5;
  trackCtx.setLineDash([5, 5]);
  trackCtx.beginPath();
  for (let i = 0; i < bt.n; i += 2) {
    const q = toScreen(bt.P[i][0], bt.P[i][1]);
    i ? trackCtx.lineTo(...q) : trackCtx.moveTo(...q);
  }
  trackCtx.stroke();
  trackCtx.restore();
}
const TRAIL_FADE = 2;
function drawFadingTrail(r, t, col) {
  const P = r && r.tr;
  if (!P || P.length < 2) return;
  let lo = 0;
  let hi = P.length - 1;
  if (P[0].rt > t) return;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (P[m].rt <= t) lo = m;
    else hi = m;
  }
  const i1 = P[hi].rt <= t ? hi : lo;
  const cur = interpAt(r, t);
  trackCtx.save();
  trackCtx.lineCap = 'round';
  trackCtx.strokeStyle = col;
  trackCtx.lineWidth = Math.max(2.5, view.sc * 0.09);
  let b = cur;
  for (let j = i1; j >= 0; j--) {
    const a = P[j];
    const age = t - a.rt;
    if (age > TRAIL_FADE) break;
    trackCtx.globalAlpha = 0.85 * (1 - age / TRAIL_FADE);
    trackCtx.beginPath();
    trackCtx.moveTo(...toScreen(a.x, a.y));
    trackCtx.lineTo(...toScreen(b.x, b.y));
    trackCtx.stroke();
    b = a;
  }
  trackCtx.restore();
}
function drawPlanScene() {
  const r = last && last.mode === 'plan' && last.B ? last : null;
  const t = r ? player.t : 0;
  if (r) {
    drawFadingTrail(r.B, t, riderColor('B'));
    drawFadingTrail(r, t, riderColor('A'));
  }
  if (planner.drag) drawPlanPath();
  drawCones([false, false]);
  drawPlanMarks();
  const at = (x, v) => (x && x.tr && x.tr.length ? interpAt(x, t) : poseOf(new Sim(planSetup(planner[v]))));
  drawBike(at(r && r.B, 'B'), riderColor('B'));
  drawBike(at(r, 'A'), riderColor('A'));
  drawPlanHud(r, t);
}
const REASON_SHORT = {
  gate: i18n`wjazd w bramkę`,
  out: i18n`wyjazd poza plac`,
  time: i18n`za długo`,
  missed: i18n`minął metę`,
  stop: i18n`nie stanął w boxie`,
};
const shortReason = (x) => (x.end === 'crash' ? i18n`gleba` : REASON_SHORT[x.cause] || '');
function drawPlanHud(r, t) {
  trackCtx.save();
  trackCtx.textBaseline = 'top';
  let L = [];
  if (r) {
    trackCtx.font = '12px ' + FONT_MONO;
    L = [
      ['A', r],
      ['B', r.B],
    ].map(([v, x]) => {
      const P = x.tr || [];
      const tE = P.length ? P[P.length - 1].rt : 0;
      const ws = x.final == null ? shortReason(x) : '';
      return [
        v,
        RIDER_NAME[v] +
          '  ' +
          (t >= tE - 1e-6
            ? x.final != null
              ? fmtNum(x.final, 2) + ' s'
              : i18n`nie ukończył` + (ws ? ': ' + ws : '')
            : '…'),
      ];
    });
  }
  const w = r ? Math.max(182, Math.ceil(Math.max(...L.map((q) => trackCtx.measureText(q[1]).width))) + 41) : 120;
  trackCtx.fillStyle = 'rgba(22,24,26,0.72)';
  trackCtx.fillRect(8, 8, w, r ? 84 : 46);
  trackCtx.fillStyle = COL.cone;
  trackCtx.font = '700 30px ' + FONT_DISPLAY;
  trackCtx.fillText(fmtNum(t, 2), 16, 12);
  if (r) {
    trackCtx.font = '12px ' + FONT_MONO;
    L.forEach(([v, s], i) => {
      const y = 50 + i * 17;
      trackCtx.fillStyle = riderColor(v);
      trackCtx.beginPath();
      trackCtx.arc(21, y + 6, 4.5, 0, 7);
      trackCtx.fill();
      trackCtx.fillText(s, 31, y);
    });
  }
  if (r) {
    const q = r.tr && r.tr.length ? interpAt(r, t) : null;
    if (q) inputBars(q, view.w - 102, view.rot ? 50 : view.h - 74, COL.chalk);
  }
  trackCtx.restore();
}
function markAt(sx, sy) {
  let best = null;
  let bd = 1e9;
  for (const m of planMarks()) {
    const d = Math.hypot(m.bx - sx, m.by - sy);
    if (d < m.r + 7 && d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}
function setMarkAt(sx, sy) {
  const bt = planPreview();
  if (!bt) return null;
  const [wx, wy] = toWorld(sx, sy);
  const pl = planner.A;
  const q = EDIT_TURN;
  let best = null;
  {
    const ln = nearestOnLoop(bt, q, wx, wy);
    if (ln.d < 0.9) best = { kind: 'gas', q, d: ln.d, val: bt.rotLeft[ln.i] * DEG };
  }
  if (!best) {
    const d = distToApproach(bt, q, wx, wy);
    const al = aheadOfCone(q, [wx, wy]);
    const sd = sideOfCone(q, [wx, wy]);
    const L = planner.lim;
    if (d < 1 && al > pl.turn + 0.4 && al < L.bMax + 1.5 && Math.abs(al - pl.brake) < Math.abs(al - pl.turn))
      best = { kind: 'brake', q, d, val: al };
    else if (al >= L.tMin - 0.5 && al <= L.tMax + 0.5 && sd >= L.sMin && sd <= L.sMax + 0.5)
      best = { kind: 'turn', q, d: 0, val: al, side: sd };
    else if (d < 1.2 && al > -2 && al < L.bMax + 1.5) best = { kind: 'brake', q, d, val: al };
  }
  if (best) planSet(best.kind === 'turn' ? { turn: best.val, side: best.side } : { [best.kind]: best.val });
  return best;
}
function planIsStale() {
  const R = planner.res;
  if (!R) return false;
  return !sameJson(R.plans.A, planner.A) || !sameJson(R.plans.B, planner.B);
}
function planSet(o) {
  planner.A = planClamp({ ...planner.A, ...o });
  syncPlanUI();
  drawTrack();
}
function planMessage(h) {
  const el = $('pMsg');
  el.innerHTML = h || '';
  el.hidden = !h;
  if (h && isDashboard()) {
    const pn = el.closest('.pSide');
    if (pn && pn.scrollHeight > pn.clientHeight) pn.scrollTop = pn.scrollHeight;
  }
}
function planCommit() {
  const p = planner.A;
  const g = planner.good || planClamp(planner.def);
  if (sameJson(p, g)) {
    planMessage('');
    return true;
  }
  const why = planProblem(p);
  if (!why) {
    planner.good = { ...p };
    planMessage('');
    savePlan();
    return true;
  }
  const ks = PLAN_FIELDS.map((f) => f.k).filter((x) => p[x] !== g[x]);
  let res = { ...g };
  if (ks.length) {
    const at = (lam) =>
      planClamp({
        pos: p.pos,
        seat: p.seat,
        ...Object.fromEntries(
          PLAN_FIELDS.map((f) => [f.k, ks.includes(f.k) ? g[f.k] + (p[f.k] - g[f.k]) * lam : g[f.k]]),
        ),
      });
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 7; it++) {
      const m = (lo + hi) / 2;
      if (planProblem(at(m))) hi = m;
      else lo = m;
    }
    res = at(lo);
    if (planProblem(res)) res = { ...g };
  }
  planner.A = res;
  planner.good = { ...res };
  savePlan();
  const w = why.charAt(0).toLowerCase() + why.slice(1);
  const ch = ks.filter((x) => res[x] !== g[x]);
  planMessage(
    i18n`<b>Planer nie przyjmie tego ustawienia:</b> ${w} ` +
      (ch.length
        ? i18n`Zostawiam najbliższe ustawienie, z którym zawodnik jedzie bezbłędnie i najwyżej ${PLAN_MAX_TIME} s: ` +
          ch
            .map(
              (x) =>
                PLAN_FIELDS.find((f) => f.k === x).lab.replace(/^. · /, '') +
                ' ' +
                fmtPlanValue(x, res[x], planSetup(res)),
            )
            .join(', ') +
          '.'
        : i18n`Wracam do ostatniego dobrego ustawienia.`),
  );
  return false;
}
