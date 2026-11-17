// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The coach: the automatic rider tuned for every bike and setup. Its run is the starting plan of
// the planner.

const TURNS = EIGHTS * 2 - 1;
const peakBrakeDecel = (S) => Math.min(S.b.bf, S.stoppie);
// Settings shared by every setup: eta share of the tyre grip used, op time from G to full throttle
// [s], om peak roll rate when leaning in [°/s], ld look-ahead time [s], kcs countersteer authority at
// low speed, ov time for the rear brake to fade out after G [s].
const COACH_BASE = { eta: 0.93, op: 0.35, om: 90, ld: 0.7, kcs: 0.5, ov: 0.2 };
// prettier-ignore
const COACH_COLUMNS = ['cm', 'lr', 'vT', 'dT', 'pd', 'lf', 'rA', 'kA', 'rK', 'vF', 'wy', 'finL', 'finY', 'fxY', 'gS', 'bC', 'tA'];
const allButLast = (x) => [...Array(TURNS - 1).fill(x), 0];
// Coach settings for every bike and setup, '<body position>@<seat>' (seat −1 back, 0 middle, 1 front):
//   cm       gap kept between the outline and the cone [m]
//   lr       pick-up rate on the exit [rad/s]
//   vT, dT   braking aims for vT [km/h] at dT [m] before the cone
//   pd       the approach line passes pd [m] outside the cone
//   lf       share of the grip used for lean
//   rA       turn radius at the apex [m], never tighter than full lock (0: full lock)
//   kA       speed the rear brake slows the bike to, as a share of the apex speed
//   rK, vF   rear brake gain [1/s]; the front brake is released vF [m/s] above that speed
//   wy       sideways position of the first waypoint after the start [m]
//   finL     look-ahead time on the way to the finish [s]
//   finY     the way to the finish passes finY [m] beside the near cone; fxY replaces it after the rehearsal
//   gS       the throttle opens gS [rad] of rotation earlier (one value, or one per turn)
//   bC       braking before the turn-in as a share of the hardest braking upright
//   tA       the bike turns in once the look-ahead puts it no more than tA [m] past the cone after 90°
// prettier-ignore
const COACH = {
  ebike: {
    //          cm    lr    vT  dT   pd    lf rA   kA    rK vF   wy     finL  finY  fxY   gS                bC    tA
    'neg@-1':  [0.12, 1.3,  24, 2.2, 1.3,  1, 1.2, 0.9,  3, 0.6, -0.66, 1,    0.85, -0.4, allButLast(0.25), 0.8,  1],
    'neg@0':   [0.08, 1,    26, 3.4, 1.3,  1, 1.6, 0.85, 8, 0.6, -0.66, 1.5,  1.05, -0.2, allButLast(0.16), 0.85, 1],
    'neg@1':   [0.06, 1,    22, 2.6, 1.3,  1, 1.6, 0.85, 5, 0.2, -0.66, 1,    0.85, -0.4, allButLast(0.25), 0.85, 1],
    'neu@-1':  [0.08, 1,    24, 2.2, 1.5,  1, 1.2, 0.95, 8, 0.9, -0.66, 1,    0.85, -0.4, 0.25,             0.7,  1],
    'neu@0':   [0.04, 1,    22, 2.2, 1.3,  1, 0,   1.05, 8, 0.6, -0.66, 1,    0.85, -0.4, 0.25,             0.85, 0.6],
    'neu@1':   [0.06, 1,    22, 2.6, 1.3,  1, 1.6, 0.85, 8, 0.2, -0.66, 1,    0.85, -0.4, 0.2,              0.85, 1],
    'pos@-1':  [0.15, 1.9,  24, 2.2, 1.5,  1, 1.4, 0.9,  8, 0.6, -0.66, 1,    0.85, -0.4, 0.2,              0.8,  1],
    'pos@0':   [0.06, 1.3,  24, 2.6, 1.5,  1, 0,   0.7,  8, 0.6, -0.66, 1,    0.85, -0.4, 0.25,             0.65, 1],
    'pos@1':   [0.15, 1,    22, 2.6, 1.5,  1, 1.2, 1,    5, 0.2, -0.66, 1,    0.85, -0.4, 0.25,             0.85, 1],
  },
  pit: {
    //          cm    lr    vT  dT   pd    lf rA   kA    rK vF   wy     finL  finY  fxY   gS                bC    tA
    'neg@-1':  [0.04, 1.9,  24, 2.2, 1.3,  1, 1.2, 0.9,  3, 0.9, -0.85, 1,    0.85, -0.4, 0.25,             0.75, 1],
    'neg@0':   [0.04, 1.45, 26, 3.8, 1.8,  1, 1.4, 1,    3, 1.2, -0.85, 1.5,  0.85, -0.4, 0,                0.75, 1],
    'neg@1':   [0.04, 1.15, 24, 3,   1.5,  1, 1.6, 0.85, 3, 0.9, -0.85, 1.5,  1.2,  -0.2, 0.12,             0.9,  0.2],
    'neu@-1':  [0.04, 1,    24, 2.2, 1.3,  1, 1.2, 0.9,  3, 0.9, -0.66, 1,    0.85, -0.4, 0.25,             0.65, 0.6],
    'neu@0':   [0.04, 1.45, 26, 3.8, 1.8,  1, 1.4, 1,    3, 1.2, -0.75, 1.5,  0.85, -0.4, 0,                0.75, 1],
    'neu@1':   [0.04, 1.15, 24, 3,   1.3,  1, 1.6, 0.85, 5, 0.9, -0.66, 1.5,  1.2,  -0.2, 0.2,              0.85, 0.2],
    'pos@-1':  [0.04, 1.45, 22, 2.2, 1.15, 1, 2.1, 0.75, 3, 1.2, -0.85, 1.5,  0.85, -0.4, 0,                0.85, 1],
    'pos@0':   [0.04, 1,    24, 2.6, 1.3,  1, 0,   1.05, 5, 0.6, -0.66, 1,    0.85, -0.4, 0.25,             0.7,  0.6],
    'pos@1':   [0.06, 1.3,  22, 3.4, 1.8,  1, 1.6, 0.95, 3, 1.2, -0.66, 1,    0.85, -0.4, 0.12,             1,    1],
  },
  sm: {
    //          cm    lr    vT  dT   pd    lf rA   kA    rK vF   wy     finL  finY  fxY   gS                bC    tA
    'neg@-1':  [0.04, 1.3,  26, 3.8, 1.8,  1, 1.4, 1,    3, 1.2, -0.75, 1.5,  0.85, -0.4, 0,                0.9,  1],
    'neg@0':   [0.04, 1.15, 26, 3.8, 1.8,  1, 1.4, 1,    3, 1.2, -0.66, 1.5,  0.85, -0.4, 0,                0.85, 1],
    'neg@1':   [0.04, 1.45, 24, 3.8, 1.8,  1, 1.4, 0.95, 3, 1.2, -0.75, 1.5,  0.85, 0,    0.2,              1,    1],
    'neu@-1':  [0.04, 1.3,  26, 3.8, 1.8,  1, 0,   1,    3, 1.2, -0.66, 1.5,  0.85, -0.4, 0,                0.9,  1],
    'neu@0':   [0.04, 1.9,  24, 3.4, 1.8,  1, 1.6, 0.95, 3, 1.2, -0.85, 1.5,  0.85, 0,    0.12,             0.8,  1],
    'neu@1':   [0.04, 1,    24, 3.8, 1.8,  1, 2.4, 0.75, 3, 1.2, -0.66, 1.25, 0.85, -0.2, 0.25,             0.75, 1],
    'pos@-1':  [0.04, 1.3,  26, 3.4, 1.8,  1, 1.4, 1,    3, 1.2, -0.75, 1.5,  0.85, -0.4, 0,                0.65, 1.4],
    'pos@0':   [0.04, 1.9,  24, 3.4, 1.8,  1, 1.6, 0.95, 3, 1.2, -0.75, 1.5,  0.85, 0,    0.12,             0.7,  1],
    'pos@1':   [0.06, 1,    22, 3.4, 1.8,  1, 1.8, 0.95, 3, 1.2, -0.66, 1,    0.85, -0.4, 0.12,             1,    0.6],
  },
  cbr: {
    //          cm    lr    vT  dT   pd    lf rA   kA    rK vF   wy     finL  finY  fxY   gS                bC    tA
    'neg@-1':  [0.04, 1.6,  24, 2.6, 1.8,  1, 0,   0.7,  3, 0.9, -0.75, 1,    0.85, -0.4, 0.25,             0.85, 1],
    'neg@0':   [0.04, 1.6,  26, 3.8, 1.8,  1, 1.4, 1,    3, 1.2, -0.66, 1.5,  0.85, -0.4, 0,                0.75, 1],
    'neg@1':   [0.04, 1,    22, 2.6, 1.8,  1, 2.1, 0.85, 3, 1.2, -0.66, 1,    0.85, -0.2, 0.25,             0.8,  1],
    'neu@-1':  [0.04, 1,    26, 3.4, 1.8,  1, 1.4, 0.95, 5, 0.4, -0.66, 1.5,  0.85, 0.2,  0.12,             0.85, 1],
    'neu@0':   [0.04, 1,    22, 3,   1.8,  1, 1.6, 0.95, 3, 1.2, -0.85, 1.5,  0.85, 0.2,  0.25,             0.9,  1],
    'neu@1':   [0.04, 1.15, 24, 3.8, 1.8,  1, 2.4, 0.7,  3, 1.2, -0.66, 1.25, 0.85, 0.2,  0.25,             0.9,  1],
    'pos@-1':  [0.08, 1.15, 22, 2.2, 1.8,  1, 1.6, 0.95, 3, 1.2, -0.75, 1.5,  0.85, 0.2,  0.25,             0.85, 1],
    'pos@0':   [0.04, 1.45, 24, 3.8, 1.8,  1, 1.6, 0.95, 3, 1.2, -0.85, 1.5,  0.85, 0.2,  0.25,             1,    1],
    'pos@1':   [0.08, 1.45, 24, 3.4, 1.8,  1, 1.6, 0.95, 8, 0.6, -0.75, 1.25, 0.85, 0,    0.25,             0.7,  1],
  },
  gsxr: {
    //          cm    lr    vT  dT   pd    lf rA   kA    rK vF   wy     finL  finY  fxY   gS                bC    tA
    'neg@-1':  [0.1,  1.15, 26, 3.4, 1.5,  1, 0,   0.85, 8, 0.6, -0.66, 1,    0.85, -0.4, 0.12,             0.65, 1],
    'neg@0':   [0.04, 1,    22, 2.6, 1.5,  1, 1.8, 0.85, 3, 0.9, -0.66, 1,    0.85, -0.4, 0.12,             0.75, 1],
    'neg@1':   [0.04, 1,    24, 3,   1.5,  1, 0,   0.85, 8, 0.6, -0.75, 1,    0.85, -0.4, 0.2,              0.65, 1],
    'neu@-1':  [0.06, 1.45, 22, 2.6, 1.8,  1, 0,   0.85, 8, 0.9, -0.85, 1,    0.85, -0.4, 0,                0.9,  1],
    'neu@0':   [0.04, 1.9,  24, 3,   1.8,  1, 1.6, 0.7,  3, 1.2, -0.75, 1.5,  0.85, 0,    0.08,             0.65, 1],
    'neu@1':   [0.06, 1,    22, 3,   1.8,  1, 1.6, 1,    3, 1.2, -0.66, 1.5,  0.85, -0.4, 0.08,             0.9,  1],
    'pos@-1':  [0.04, 1,    22, 2.6, 1.8,  1, 1.6, 0.85, 3, 1.2, -0.75, 1,    0.85, -0.4, 0,                0.9,  1],
    'pos@0':   [0.04, 1,    20, 2.6, 1.8,  1, 1.8, 0.7,  8, 0.9, -0.85, 1.5,  0.85, -0.4, 0,                0.9,  1],
    'pos@1':   [0.06, 1,    22, 3.4, 1.8,  1, 0,   0.95, 3, 1.2, -0.66, 1.5,  0.85, 0,    0,                1,    1],
  },
};
function coachSetup(S) {
  const row = COACH[S.b.id][stanceOf(S) + '@' + S.seat0];
  const c = { ...COACH_BASE };
  COACH_COLUMNS.forEach((key, i) => (c[key] = row[i]));
  if (typeof c.gS === 'number') c.gS = Array(TURNS).fill(c.gS);
  return c;
}
const coachRuns = new Map();
// The coach's run for setup S (cached): its rider and the points it used, the turn-in in every loop,
// braking and throttle in the third.
function coachRun(S) {
  const k = S.b.id + '|' + stanceOf(S) + '|' + S.seat0;
  let r = coachRuns.get(k);
  if (r) return r;
  const c = coachSetup(S);
  const bt = new AutoRider(S, c);
  const sv = (q) => {
    const m = bt.mid(bt.iTurn[q]);
    return [aheadOfCone(q, m), sideOfCone(q, m)];
  };
  const q = 2;
  const iH = bt.iBrake[q] != null ? bt.iBrake[q] : bt.iTurn[q];
  const iG = bt.iGas[q] != null ? bt.iGas[q] : bt.iApex[q];
  const sA = [];
  const sD = [];
  for (let j = 0; j < TURNS; j++) {
    const s = sv(j);
    sA.push(bt.turnAhead[j] != null ? bt.turnAhead[j] : s[0]);
    sD.push(s[1]);
  }
  r = { c, bt, s2: sv(q), brake: bt.ahead(q, iH), gas: bt.rotLeft[iG] * DEG, sA, sD };
  coachRuns.set(k, r);
  if (coachRuns.size > 60) coachRuns.delete(coachRuns.keys().next().value);
  return r;
}
// The coach's run as a plan: B and T in metres before the cone, T sideways, G as rotation left [°] in
// steps of 5°, braking force as a share of the strongest possible.
function coachPlan(S) {
  const r = coachRun(S);
  const aM = peakBrakeDecel(S);
  const rd = (x) => Math.round(x * 10) / 10;
  return {
    brake: rd(r.brake),
    force: Math.round(Math.min(1, ((r.c.bC || 1) * maxBrakeDecel(S, S, 0, r.c.eta)) / aM) * 100) / 100,
    turn: rd(r.s2[0]),
    side: rd(r.s2[1]),
    gap: r.c.cm,
    gas: Math.max(0, Math.round(r.gas / 5) * 5),
    open: r.c.op,
  };
}
