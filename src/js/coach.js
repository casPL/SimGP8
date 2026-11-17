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
const COACH_COLUMNS = ['cm', 'lr', 'vT', 'dT', 'pd', 'lf', 'rA', 'kA', 'rK', 'vF', 'wy', 'finL', 'finY', 'fxY', 'gS'];
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
// prettier-ignore
const COACH = {
  ebike: {
    //           cm    lr    vT  dT   pd    lf    rA    kA    rK vF   wy     finL  finY  fxY   gS
    'neg@-1':  [0.12, 1.15, 30, 3.4, 0.85, 0.95, 0.75, 0.89, 5, 0.4, -0.66, 1,    0.85, 0,    allButLast(0.2)],
    'neg@0':   [0.15, 1.3,  26, 2.6, 0.85, 0.95, 0.75, 0.81, 3, 0.4, -0.66, 1,    0.85, null, allButLast(0.2)],
    'neg@1':   [0.12, 1.3,  26, 3,   0.85, 0.95, 0.68, 0.88, 5, 0.4, -0.66, 1,    0.85, null, allButLast(0.2)],
    'neu@-1':  [0.12, 1.3,  30, 3.4, 1.15, 0.95, 1,    0.82, 3, 0.4, -0.85, 1.5,  0.85, null, 0.16],
    'neu@0':   [0.12, 1.3,  28, 3.4, 0.85, 0.95, 1,    0.81, 5, 0.4, -0.85, 1.5,  0.85, 0,    0.2],
    'neu@1':   [0.12, 1.15, 26, 3,   1.15, 0.95, 1,    0.87, 5, 0.6, -0.75, 1.25, 1.05, null, 0.2],
    'pos@-1':  [0.12, 1.3,  26, 2.6, 1,    0.95, 1.4,  0.77, 5, 0.4, -0.66, 1.5,  0.85, -0.4, 0.12],
    'pos@0':   [0.12, 1.3,  26, 3,   1.15, 0.95, 1.2,  0.84, 5, 0.6, -0.66, 1.5,  1.05, 0.4,  0.12],
    'pos@1':   [0.12, 1.3,  26, 3.4, 1.15, 0.95, 1.2,  0.79, 5, 0.4, -0.66, 1.5,  0.85, 0,    0.12],
  },
  pit: {
    //           cm    lr    vT  dT   pd    lf    rA    kA    rK vF   wy     finL  finY  fxY   gS
    'neg@-1':  [0.14, 1.3,  30, 2.6, 0.85, 0.95, 0.95, 0.77, 5, 0.4, -0.85, 1.5,  0.85, 0.4,  0.2],
    'neg@0':   [0.12, 1.3,  30, 3,   0.85, 0.95, 0.95, 0.78, 5, 0.4, -0.85, 1.5,  0.85, 0.2,  0.2],
    'neg@1':   [0.12, 1.3,  30, 3.4, 0.85, 0.95, 0.85, 0.91, 5, 0.4, -0.85, 1.5,  0.85, -0.2, 0.2],
    'neu@-1':  [0.12, 1.3,  30, 2.6, 0.85, 0.95, 1.05, 0.79, 5, 0.4, -0.66, 0.7,  0.85, null, 0.2],
    'neu@0':   [0.14, 1.3,  30, 3,   0.85, 0.95, 1.05, 0.79, 3, 0.4, -0.66, 1.25, 1.05, 0.4,  0.2],
    'neu@1':   [0.12, 1.3,  30, 3.4, 0.85, 0.95, 0.85, 0.87, 5, 0.6, -0.66, 1.25, 1.05, null, 0.2],
    'pos@-1':  [0.12, 1.3,  28, 3,   1.15, 0.95, 1.8,  0.75, 5, 1.2, -0.85, 1.5,  0.85, -0.2, 0.2],
    'pos@0':   [0.12, 1.3,  26, 2.6, 1.15, 0.95, 1.8,  0.74, 3, 0.4, -0.66, 1.5,  0.85, -0.2, 0.2],
    'pos@1':   [0.12, 1.3,  26, 3,   1.15, 0.95, 1.5,  0.76, 5, 0.4, -0.66, 1.5,  0.85, -0.4, 0.2],
  },
  sm: {
    //           cm    lr    vT  dT   pd    lf    rA    kA    rK vF   wy     finL  finY  fxY   gS
    'neg@-1':  [0.14, 1.9,  29, 3.4, 1,    0.95, 1.55, 0.66, 5, 0.4, -0.85, 1.5,  0.85, 0.2,  0.2],
    'neg@0':   [0.18, 1.45, 28, 3.2, 1,    0.95, 1.55, 0.67, 3, 0.4, -0.85, 1.5,  0.85, 0.2,  0.2],
    'neg@1':   [0.12, 1.9,  28, 3.4, 1.1,  0.95, 1.65, 0.7,  5, 0.4, -0.85, 1.5,  0.85, 0.4,  0.2],
    'neu@-1':  [0.12, 1.6,  26, 3.2, 1.1,  0.95, 2.1,  0.67, 3, 0.4, -0.85, 1.5,  0.85, 0.4,  0.2],
    'neu@0':   [0.12, 1.3,  28, 3,   0.85, 0.92, 2.1,  0.67, 5, 0.4, -0.66, 1.25, 0.85, -0.4, 0.2],
    'neu@1':   [0.13, 1.3,  26, 3,   0.85, 0.95, 1.8,  0.71, 5, 1.2, -0.66, 1.25, 0.85, 0,    0.2],
    'pos@-1':  [0.12, 1.3,  27, 3.4, 1.15, 0.95, 2.4,  0.66, 5, 0.4, -0.85, 1.5,  0.85, -0.4, 0.2],
    'pos@0':   [0.12, 1.3,  26, 2.6, 1.15, 0.95, 2.4,  0.68, 5, 0.4, -0.66, 1.5,  1.05, -0.4, 0.2],
    'pos@1':   [0.12, 1.3,  26, 3,   1.15, 0.95, 2.4,  0.69, 5, 0.4, -0.66, 1.5,  0.85, 0,    0.2],
  },
  cbr: {
    //           cm    lr    vT  dT   pd    lf    rA    kA    rK vF   wy     finL  finY  fxY   gS
    'neg@-1':  [0.12, 1.6,  28, 3,   0.85, 0.92, 1,    1,    5, 0.4, -0.85, 1.25, 1.05, -0.4],
    'neg@0':   [0.14, 1.6,  26, 2.6, 0.85, 0.92, 1,    1,    5, 0.4, -0.85, 1.5,  0.85, 0.4],
    'neg@1':   [0.14, 1.6,  28, 3.4, 0.85, 0.92, 1,    1,    5, 0.6, -0.66, 1.25, 0.85, 0.4],
    'neu@-1':  [0.12, 1.6,  26, 2.6, 1.15, 0.97, 1.3,  1.03, 5, 0.6, -0.66, 1.25, 0.85, -0.4],
    'neu@0':   [0.12, 1.6,  26, 2.6, 1.15, 0.97, 0,    0.91, 5, 0.4, -0.85, 1.5,  0.85, 0.2],
    'neu@1':   [0.12, 1.6,  26, 3,   1.3,  0.97, 0,    0.97, 5, 0.6, -0.85, 1.5,  0.85, 0.2],
    'pos@-1':  [0.12, 1.6,  28, 3.4, 1,    0.97, 0,    0.97, 5, 0.4, -0.85, 1.25, 1.05, -0.4],
    'pos@0':   [0.15, 1.6,  26, 3,   1,    0.97, 0,    0.97, 5, 0.4, -0.66, 1.5,  0.85, 0.2],
    'pos@1':   [0.12, 1.6,  24, 2.6, 1,    0.97, 1.3,  0.97, 5, 0.9, -0.66, 1.25, 0.85, -0.2],
  },
  gsxr: {
    //           cm    lr    vT  dT   pd    lf    rA    kA    rK vF   wy     finL  finY  fxY   gS
    'neg@-1':  [0.14, 1.6,  28, 3,   0.85, 0.92, 0,    1.03, 5, 0.4, -0.85, 1.5,  0.85, 0.4],
    'neg@0':   [0.12, 1.6,  28, 3.4, 1.3,  0.92, 1.3,  1,    5, 0.9, -0.85, 1.25, 1.05, 0],
    'neg@1':   [0.12, 1.6,  28, 3.4, 1.15, 0.92, 0,    1.03, 5, 0.9, -0.66, 1.25, 0.85, 0.4],
    'neu@-1':  [0.12, 1.6,  28, 3,   0.85, 0.97, 0,    1.03, 5, 0.4, -0.85, 1.25, 0.85, 0.4],
    'neu@0':   [0.12, 1.6,  28, 3,   1.15, 0.97, 0,    0.97, 5, 0.6, -0.85, 1.5,  0.85, 0],
    'neu@1':   [0.12, 1.6,  28, 3.4, 1.15, 0.95, 0,    0.97, 5, 0.4, -0.85, 1.5,  0.85, -0.4],
    'pos@-1':  [0.12, 1.6,  28, 3.4, 1,    0.97, 0,    0.97, 5, 0.6, -0.85, 1.5,  1.2,  0.2],
    'pos@0':   [0.16, 1.6,  28, 3.4, 1,    0.97, 0,    0.91, 5, 0.9, -0.85, 1.5,  0.85, -0.4],
    'pos@1':   [0.12, 1.6,  26, 3,   1,    0.97, 0,    0.91, 3, 0.9, -0.66, 1.5,  0.85, -0.4],
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
    force: Math.round(Math.min(1, maxBrakeDecel(S, S, 0, r.c.eta) / aM) * 100) / 100,
    turn: rd(r.s2[0]),
    side: rd(r.s2[1]),
    gap: r.c.cm,
    gas: Math.max(0, Math.round(r.gas / 5) * 5),
    open: r.c.op,
  };
}
