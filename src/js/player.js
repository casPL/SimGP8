// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Replay of a finished run.

const player = { t: 0, spd: 1, on: false, lt: 0 };
const INTERP_KEYS = [
  'x',
  'y',
  'v',
  'phi',
  'phb',
  'st',
  'k',
  'ut',
  'uf',
  'ur',
  'ax',
  'al',
  'useF',
  'useR',
  'loadF',
  'loadR',
  'zf',
  'zr',
  'bx',
  'by',
  'rel',
];
function interpAt(r, t) {
  const P = r && r.tr;
  if (!P || !P.length) return null;
  const n = P.length;
  if (t <= P[0].rt) return P[0];
  if (t >= P[n - 1].rt) return P[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (P[m].rt < t) lo = m;
    else hi = m;
  }
  const a = P[lo];
  const b = P[hi];
  const u = (t - a.rt) / (b.rt - a.rt || 1);
  const o = { ...(u < 0.5 ? a : b) };
  for (const k of INTERP_KEYS) if (a[k] != null && b[k] != null) o[k] = a[k] + (b[k] - a[k]) * u;
  let dp = b.psi - a.psi;
  while (dp > Math.PI) dp -= 2 * Math.PI;
  while (dp < -Math.PI) dp += 2 * Math.PI;
  o.psi = a.psi + dp * u;
  o.rt = t;
  return o;
}
function replayEnd() {
  const r = last;
  if (!r || !r.tr || !r.tr.length) return 0;
  let e = r.tr[r.tr.length - 1].rt;
  if (r.mode === 'plan' && r.B && r.B.tr && r.B.tr.length) e = Math.max(e, r.B.tr[r.B.tr.length - 1].rt);
  return e;
}
function syncPlayer() {
  const b = replayEnd();
  const sl = $('plT');
  const t = clamp(player.t, 0, b);
  sl.min = '0';
  sl.max = b.toFixed(2);
  sl.value = t.toFixed(2);
  $('plTime').textContent = fmtNum(t, 2) + ' s';
  $('plPlay').textContent = player.on ? '⏸' : '▶';
  $('plPlay').setAttribute('aria-label', player.on ? i18n`Pauza` : i18n`Odtwórz`);
  syncSeg('plSpd', String(player.spd));
}
function playerInit(auto) {
  const r = last;
  const el = $('player');
  player.on = false;
  if (!r || run || !r.tr || r.tr.length < 3) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  player.t = 0;
  if (r.mode === 'plan') {
    showReplayAt(0);
    if (auto) toggleReplay();
  } else {
    player.t = replayEnd();
    syncPlayer();
  }
}
function showReplayAt(t) {
  if (!last) return;
  player.t = t;
  const p = interpAt(last, t);
  hover = p ? { t, p } : null;
  if (typeof selSeg === 'number' && last.segs && last.segs.length) {
    const cur = last.segs[selSeg];
    if (!cur || t < cur.t0 - 1e-6 || t > cur.t1 + 1e-6) {
      let k = last.segs.findIndex((s) => t >= s.t0 - 1e-6 && t < s.t1);
      if (k < 0) k = t < last.segs[0].t0 ? 0 : last.segs.length - 1;
      if (k !== selSeg) {
        selSeg = k;
        renderSegButtons();
      }
    }
  }
  drawTele();
  drawTrack();
  if (p) {
    const pb = last.mode === 'plan' && last.B ? interpAt(last.B, t) : null;
    drawLean(p, pb);
    setHud(p, pb);
  }
  syncPlayer();
}
function replayTick(now) {
  if (!player.on) return;
  const dt = clamp((now - player.lt) / 1000, 0, 0.05);
  player.lt = now;
  const b = replayEnd();
  let t = player.t + dt * player.spd;
  if (t >= b) {
    t = b;
    player.on = false;
  }
  showReplayAt(t);
  if (player.on) requestAnimationFrame(replayTick);
}
function toggleReplay() {
  if (!last || run) return;
  if (player.on) {
    player.on = false;
    syncPlayer();
    return;
  }
  if (player.t >= replayEnd() - 1e-3) player.t = 0;
  player.on = true;
  player.lt = performance.now();
  showReplayAt(player.t);
  requestAnimationFrame(replayTick);
}
