// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Chassis geometry: the setup of a bike with its rider, suspension and rear linkage, and steering
// kinematics in a lean.

// Rear spring load from the swingarm and the chain, on top of load transfer:
// −kd·F_drive + kb·F_brake + ke·F_engine (forces at the ground). The rear caliper is mounted on the
// swingarm, and the chain runs on the outer tangents of the two sprockets.
function rearLinkGains(b) {
  const Lx = Math.sqrt(b.ls * b.ls - (b.hp - b.rr) ** 2);
  const c1 = [b.xf, b.yf];
  const c2 = [-Lx, b.rr - b.hp];
  const dx = c1[0] - c2[0];
  const dy = c1[1] - c2[1];
  const D = Math.hypot(dx, dy);
  const u = [dx / D, dy / D];
  const w = [-u[1], u[0]];
  const sb = (b.rs - b.rf) / D;
  const cb = Math.sqrt(1 - sb * sb);
  const nU = [w[0] * cb + u[0] * sb, w[1] * cb + u[1] * sb];
  const nL = [-w[0] * cb + u[0] * sb, -w[1] * cb + u[1] * sb];
  const cU = nU[0] * c1[0] + nU[1] * c1[1] + b.rf;
  const cL = nL[0] * c1[0] + nL[1] * c1[1] + b.rf;
  const q = b.rr / b.rs;
  const kb = b.hp / Lx;
  const kd = (b.hp - cU * q) / Lx;
  const ke = (b.hp - cL * q) / Lx;
  return { kb, kd, ke };
}
// Steady rear travel [m, from static sag; negative: extended] under drive aD and rear braking aR
// [m/s²].
function rearTravelShift(S, aD, aR) {
  const b = S.b;
  const dNt = (-S.mt * (aD - aR) * b.h) / b.L;
  return -(dNt + S.mt * (S.rKd * aD - S.rKb * aR)) / S.kR;
}
// A bike with its rider in body position posId and seat position seat (−1 back, 0 middle, 1 front):
// everything a run needs that does not change on the move.
function makeSetup(b, posId, seat) {
  const P = STANCE[posId];
  const mt = b.m + RIDER_MASS;
  const rf = RIDER_MASS / mt;
  const ar = b.ff * b.L + 0.12 * rf * seat;
  const delta = P.delta * 2 * rf * RAD;
  const lockEff = b.lock * RAD;
  const eps0 = b.rake * RAD;
  const clear = b.clear * RAD;
  const mu = b.mu;
  const capC = Math.min(Math.atan(0.95 * mu), clear - delta);
  const hL = b.h / b.L;
  const cE = Math.cos(eps0);
  const sE = Math.sin(eps0);
  const susp = {
    eps0,
    cE,
    sE,
    lockEff,
    ft: b.ft / 1000,
    rt: b.rt / 1000,
    sagF: (0.3 * b.ft) / 1000,
    sagR: (0.3 * b.rt) / 1000,
    kF: (mt * G * (hL * cE + sE)) / (b.fd / 1000),
    kR: (mt * G * hL) / (b.rd / 1000),
    off: b.rw * sE - b.trail * cE,
    wn: 2 * Math.PI * b.fz,
    F0: mt * G * b.ff * cE,
  };
  susp.kF0 = ((1 - FORK.preload) * susp.F0) / susp.sagF;
  const rg = rearLinkGains(b);
  return {
    b,
    P,
    mt,
    rf,
    ar,
    seat0: seat,
    rKb: rg.kb,
    rKd: rg.kd,
    rKe: rg.ke,
    rel0: posId === 'pos' ? 1 : posId === 'neg' ? -1 : 0,
    fF: ar / b.L,
    delta,
    clear,
    mu,
    capC,
    cosR: Math.cos(b.rake * RAD),
    ...susp,
    wheelie: (G * ar) / b.h,
    stoppie: (G * (b.L - ar)) / b.h,
    roll: b.roll * P.roll * RAD,
    Iz: mt * (0.3 * b.L) ** 2,
  };
}
// Steering head angle, wheelbase and trail at fork travel zf and rear travel zr.
function liveGeometry(S, zf, zr) {
  const b = S.b;
  const pitch = ((zf - S.sagF) * S.cE + (S.sagR - zr)) / b.L;
  const eps = S.eps0 - pitch;
  const L = b.L - (zf - S.sagF) * S.sE;
  return { eps, L, trail: (b.rw * Math.sin(eps) - S.off) / Math.cos(eps) };
}
// Bike lean at a combined lean a of bike and rider (the body position phases in up to 15°).
const bikeLean = (S, a) => Math.max(0, a + S.delta * Math.min(1, a / (15 * RAD)));
// Exact steering kinematics in a lean (Cossalter, Motorcycle Dynamics). Handlebar angle d about the
// steering axis, lean p and head angle e give the front wheel's steer angle Δ in the ground plane:
// tan Δ = cos e·sin d / (cos d·cos p − sin e·sin d·sin p), so a leaned bike turns much tighter than an
// upright one with the same handlebar angle. Δ is capped at 80°.
const TAN_MAX = Math.tan(80 * RAD);
const tanGroundSteer = (d, p, e) => {
  const n = Math.cos(e) * Math.sin(d);
  const q = Math.cos(d) * Math.cos(p) - Math.sin(e) * Math.sin(d) * Math.sin(p);
  return q > Math.abs(n) / TAN_MAX ? n / q : Math.sign(n) * TAN_MAX;
};
// The inverse: the handlebar angle that gives tan Δ = T at lean p.
const steerForCurvature = (T, p, e) => Math.atan((T * Math.cos(p)) / (Math.cos(e) + T * Math.sin(e) * Math.sin(p)));
// Radius of the rear wheel track at full lock and combined lean a.
const lockRadius = (S, a) => S.b.L / tanGroundSteer(S.lockEff, bikeLean(S, a), S.eps0);
// A steady turn of the rigid bike: with both wheels rolling it turns about a point on the line of the rear
// axle, so the centre of mass, h·sin p inside the tyre line, runs on the radius 1/k − h·sin p, where k is
// the curvature of the rear track. Balance at combined lean p and rear wheel speed v:
// g·tan p = v²·k·(1 − h·k·sin p). Returns k (for a lean too deep for the speed, the tightest k).
function balanceCurvature(S, p, v) {
  const k0 = (G * Math.tan(p)) / Math.max(v * v, 0.09);
  const c = S.b.h * Math.sin(p);
  if (c < 1e-6) return k0;
  const d = 1 - 4 * c * k0;
  return d > 0 ? (1 - Math.sqrt(d)) / (2 * c) : 1 / (2 * c);
}
// Tyre loads per kilogram in that turn at side acceleration la = g·tan p and rear track curvature k. The
// front contact runs on a wider circle than the rear one (√(1 + (kL)²) times its side share) and pulls the
// centre of mass back towards the turn centre by ω²·a_r, which loads the front like braking does; the rear
// carries the rest of the side force, outwards in the tightest turns. cf, cr: side forces on the front and
// rear; tr: load moved forward; kv: side acceleration of the rear contact (p: the lean, if the turn is not
// balanced).
function turnLoads(S, D, la, k, p) {
  if (!k) return { cf: la * D.fF, cr: la * (1 - D.fF), tr: 0, kv: la };
  const b = S.b;
  if (p == null) p = Math.atan(la / G);
  const kv = la / Math.max(0.05, 1 - b.h * k * Math.sin(p));
  return {
    cf: kv * D.fF * Math.sqrt(1 + (k * b.L) ** 2),
    cr: Math.abs(la - kv * D.fF),
    tr: kv * k * D.fF * b.h * Math.cos(p),
    kv,
  };
}
// Whether both tyres hold that turn within grip mu.
function turnHolds(S, D, la, k, p, mu) {
  const q = turnLoads(S, D, la, k, p);
  return q.cf <= mu * (G * D.fF + q.tr) && q.cr <= mu * (G * (1 - D.fF) - q.tr);
}
// The deepest lean (up to top) whose steady turn at speed v, free or at full lock, both tyres hold.
function gripLean(S, D, v, mu, top) {
  const ok = (p) => {
    const c = S.b.h * Math.sin(p);
    const k0 = (G * Math.tan(p)) / Math.max(v * v, 0.09);
    const d = 1 - 4 * c * k0;
    if (d < 0) return false;
    const k = c < 1e-6 ? k0 : (1 - Math.sqrt(d)) / (2 * c);
    if (k > tanGroundSteer(S.lockEff, bikeLean(S, p), S.eps0) / S.b.L) return false;
    return turnHolds(S, D, G * Math.tan(p), k, p, mu);
  };
  if (ok(top)) return top;
  let lo = 0;
  let hi = top;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) lo = m;
    else hi = m;
  }
  return lo;
}
// The largest lean full lock can hold at speed v: the first lean at which balance needs the full-lock
// curvature (head angle e and wheelbase L default to static).
function fullLockLean(S, v, e, L) {
  e = e != null ? e : S.eps0;
  L = L || S.b.L;
  const f = (p) => {
    const kL = Math.min(tanGroundSteer(S.lockEff, bikeLean(S, p), e) / L, 0.5 / Math.max(1e-6, S.b.h * Math.sin(p)));
    return G * Math.tan(p) - v * v * kL * (1 - S.b.h * kL * Math.sin(p));
  };
  const hi = Math.min(1.4, S.capC + 0.3);
  let lo = 0;
  let p = 0;
  for (; p < hi; p += 0.02) {
    if (f(p) >= 0) break;
    lo = p;
  }
  if (p >= hi) return hi;
  let h2 = p;
  for (let i = 0; i < 20; i++) {
    const m = (lo + h2) / 2;
    if (f(m) < 0) lo = m;
    else h2 = m;
  }
  return lo;
}
