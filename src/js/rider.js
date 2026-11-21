// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The automatic rider of the coach demo and the planner. It does not track a drawn line: it rides by
// the plan points and a few rules, and the line comes out of the physics. Between the loops it heads
// for the next approach point; from B it brakes as hard as the tyres allow, mostly with the front, the
// rear adding gently without locking; from T it leans in smoothly while the brakes fade with the lean
// it is about to take (the g-g envelope), so the rear always has the grip to carry that lean; from G
// it opens the throttle as far as the lean allows and picks the bike up.
// Entry and exit are planned with short look-ahead simulations (predictEntry, predictExit).

// LIM share of the lean limit used, rG share of the rear tyre's spare grip used for braking, rMin
// least rear braking (share of br), fK front brake release gain [1/s], gRot rotation [°] after which
// the coach may open the throttle at full lean, pB lean [°] ahead of the present one that the
// braking in a turn-in leaves grip for.
const AUTO = { LIM: 0.98, rG: 0.8, rMin: 0.15, fK: 8, gRot: 75, pB: 10 };
// The diagonals cross the cone axis at this angle. Even turns go round the far cone to the right, odd
// ones round the near cone to the left.
const APPROACH_ANGLE = 10 * RAD;
const turnCone = (q) => (q % 2 === 0 ? CONES[1] : CONES[0]);
const turnSign = (q) => (q % 2 === 0 ? -1 : 1);
const approachDir = (q) =>
  q % 2 === 0
    ? [Math.cos(APPROACH_ANGLE), Math.sin(APPROACH_ANGLE)]
    : [-Math.cos(APPROACH_ANGLE), Math.sin(APPROACH_ANGLE)];
const outwardDir = (q) => {
  const u = approachDir(q);
  return q % 2 === 0 ? [-u[1], u[0]] : [u[1], -u[0]];
};
// A point in the frame of turn q: s2[0] metres before the cone along the approach, s2[1] outwards.
const turnFramePoint = (q, s2) => {
  const c = turnCone(q);
  const u = approachDir(q);
  const o = outwardDir(q);
  return [c[0] - s2[0] * u[0] + s2[1] * o[0], c[1] - s2[0] * u[1] + s2[1] * o[1]];
};
// Where point p is in that frame: metres before the cone, and outwards from it.
const aheadOfCone = (q, p) => {
  const c = turnCone(q);
  const u = approachDir(q);
  return (c[0] - p[0]) * u[0] + (c[1] - p[1]) * u[1];
};
const sideOfCone = (q, p) => {
  const c = turnCone(q);
  const o = outwardDir(q);
  return (p[0] - c[0]) * o[0] + (p[1] - c[1]) * o[1];
};
const FINISH_GATE = [GATE_X, 0.9];
// The bike has to stop in the box behind the finish line. The rider brakes at share of the upright
// braking limit from the point where a ride ahead shows the front wheel stopping gap metres short of
// the far end of the box (the brake takes full force only once the front has loaded up), and harder
// if the bike would still overrun that point.
const STOP = { share: 0.95, gap: 0.3 };
// A copy of the simulation to ride ahead in.
const cloneSim = (s) => {
  const c = Object.assign(Object.create(Object.getPrototypeOf(s)), s);
  c.D = Object.assign(Object.create(Object.getPrototypeOf(s.D)), s.D);
  return c;
};
// Rotation from heading h to heading d in direction sg, in [0, 2π); signedRotation: in (−π/2, 3π/2].
const rotationTo = (h, d, sg) => {
  let a = sg * (d - h);
  a %= 2 * Math.PI;
  if (a < 0) a += 2 * Math.PI;
  return a;
};
const signedRotation = (h, d, sg) => {
  const a = rotationTo(h, d, sg);
  return a > 1.5 * Math.PI ? a - 2 * Math.PI : a;
};
// Roll acceleration as in the simulation: countersteering builds the roll rate faster at speed.
const rollAccelOf = (S, v) =>
  Math.max(S.roll / COUNTERSTEER.tr, COUNTERSTEER.amin) * clamp(v / COUNTERSTEER.vr, COUNTERSTEER.lo, COUNTERSTEER.hi);
// Throttle for acceleration a at speed v, and the inverse; drag and engine braking included.
function throttleFor(S, a, v, t) {
  const b = S.b;
  const aEB = b.eb * Math.min(1, v / 2);
  const aE = Math.max(0.5, engineAccel(b, S, v, t) + aEB);
  return clamp((a + 0.1 + 0.00035 * v * v + aEB) / aE, 0, 1);
}
function accelAtThrottle(S, ut, v, t) {
  const b = S.b;
  const aEB = b.eb * Math.min(1, v / 2);
  return ut * (engineAccel(b, S, v, t) + aEB) - aEB - (0.1 + 0.00035 * v * v);
}
// Roll servo as in the simulation: p (rate w) moves to tgt with acceleration at most al and rate at
// most wm, without overshoot.
function servo(p, w, tgt, al, wm, dt) {
  const e = tgt - p;
  const wD = Math.sign(e) * Math.min(wm, Math.sqrt(2 * al * Math.abs(e)));
  w += clamp(wD - w, -al * dt, al * dt);
  let p2 = p + w * dt;
  if ((tgt - p2) * e <= 0) {
    p2 = tgt;
    w = 0;
  }
  return [p2, w];
}
// Pure pursuit: the point Ld further along polyline pts (its last segment unbounded) than the point
// of pts nearest to p.
function aimOnPolyline(pts, p, Ld) {
  let bi = 0;
  let bt = 0;
  let bd = 1e18;
  const n = pts.length;
  for (let i = 0; i + 1 < n; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = i + 2 === n ? Math.max(0, t) : clamp(t, 0, 1);
    const ex = a[0] + t * dx - p[0];
    const ey = a[1] + t * dy - p[1];
    const d = ex * ex + ey * ey;
    if (d < bd) {
      bd = d;
      bi = i;
      bt = t;
    }
  }
  let i = bi;
  let t = bt;
  let rem = Ld;
  for (;;) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const left = Math.max(0, (1 - t) * l);
    if (i + 2 === n || rem <= left) {
      const tt = t + rem / l;
      return [a[0] + tt * (b[0] - a[0]), a[1] + tt * (b[1] - a[1])];
    }
    rem -= left;
    i++;
    t = 0;
  }
}
// Side acceleration la and rear track curvature k of the steady turn at lean p and speed v.
function steadyTurn(S, D, p, v) {
  const k = Math.min(balanceCurvature(D, p, Math.max(v, 0.3)), lockTan(D, bikeLean(D, p), S) / S.b.L);
  return { la: v * v * k * (1 - S.b.h * k * Math.sin(p)), k };
}
// The hardest braking in a turn-in at lean p heading for lean tc: it leaves the grip that the lean
// pB further on needs.
function turnInBrake(S, D, eta, la, k, p, tc, v) {
  const pT = Math.min(tc, p + AUTO.pB * RAD);
  if (pT <= p + 1e-4) return maxBrakeDecel(S, D, la, eta, 0, k);
  const s = steadyTurn(S, D, pT, v);
  return maxBrakeDecel(S, D, Math.max(la, s.la), eta, 0, Math.max(k, s.k));
}
// What the rehearsal of a run finds. A rider with the same setup and options can start from it
// instead of rehearsing again.
const REHEARSAL = ['P', 'v', 'n', 'iTurn', 'iApex', 'iExit', 'iGas', 'iBrake', 'rotLeft', 'turnAhead'];
class AutoRider {
  // rehearsal: the rehearsal of this run, if one has been ridden (see REHEARSAL).
  constructor(S, opt, rehearsal) {
    this.S = S;
    this.opt = opt;
    const b = S.b;
    this.cm = opt.cm;
    this.eta = opt.eta;
    this.lr = opt.lr;
    this.op = opt.op;
    this.ld = opt.ld;
    this.kcs = opt.kcs;
    this.leanMax = Math.min(AUTO.LIM * S.capC, Math.atan(opt.lf * this.eta * S.mu));
    // Grip the rider allows for the turn, and the apex it permits: at full lock (k null), or on the rear
    // track radius 1/k, the deepest lean both tyres hold and its balance speed (see turnLoads).
    this.muR = opt.lf * this.eta * S.mu;
    this.caps = new Map();
    const apexAt = (k) => {
      let best = null;
      for (let p = 3 * RAD; p <= this.leanMax + 1e-9; p += 0.25 * RAD) {
        const kL = lockTan(S, bikeLean(S, p), S) / b.L;
        const kk = k || kL;
        if (kL < kk) continue;
        const q = 1 - b.h * kk * Math.sin(p);
        if (q <= 0.05 || !turnHolds(S, S, G * Math.tan(p), kk, p, this.muR)) break;
        best = { p, v: Math.sqrt((G * Math.tan(p)) / (kk * q)), r: 1 / kk };
      }
      return best;
    };
    const a0 = apexAt(null);
    this.r = Math.max(a0.r * 1.03, opt.rA || 0.45 * b.L);
    const aA = apexAt(1 / this.r) || a0;
    this.leanApex = aA.p;
    this.om = opt.om * RAD;
    this.vApex = aA.v;
    this.vTurn = Math.max(opt.kA * this.vApex, 1.02 * a0.v);
    const FW = [-CONE_X, opt.finY];
    this.finishAim = FW;
    this.aim = (q) => (q >= TURNS ? FW : turnFramePoint(q, [0, opt.pdq ? opt.pdq[q] : opt.pd]));
    this.turnInPoint = (q) => turnFramePoint(q, opt.S2[Math.min(q, opt.S2.length - 1)]);
    this.outlineCache = new Map();
    this.pl = [];
    this.approach = [];
    for (let q = 0; q < TURNS; q++) {
      const Sp = this.aim(q);
      let u = approachDir(q);
      let pts;
      if (q === 0) {
        const W = [-CONE_X + 0.8, opt.wy];
        const s0 = [GATE_X - START.run - b.L / 2, START.y];
        const dx = Sp[0] - W[0];
        const dy = Sp[1] - W[1];
        const l = Math.hypot(dx, dy) || 1;
        u = [dx / l, dy / l];
        pts = [[s0[0] - 5, s0[1]], s0, [W[0], W[1]], Sp, [Sp[0] + 20 * u[0], Sp[1] + 20 * u[1]]];
      } else pts = [[Sp[0] - 20 * u[0], Sp[1] - 20 * u[1]], Sp, [Sp[0] + 20 * u[0], Sp[1] + 20 * u[1]]];
      this.pl.push(pts);
      this.approach.push(u);
    }
    if (rehearsal) for (const k of REHEARSAL) this[k] = rehearsal[k];
    else this.rehearse();
    if (opt.fxY != null) {
      const a0 = this.aim;
      const FX = [this.finishAim[0], opt.fxY];
      this.aim = (q) => (q >= TURNS ? FX : a0(q));
    }
    this.st = this.newState();
    this.i = 0;
    this.q = -1;
    this.W = this.iTurn.map((_, q) => ({
      q,
      iTurn: this.iTurn[q],
      iApex: this.iApex[q],
      iExit: this.iExit[q],
      iGas: this.iGas[q],
    }));
  }
  newState() {
    return {
      q: 0,
      ph: 'go',
      brk: false,
      tx: 0,
      tc: 0,
      w: 0,
      n: 0,
      vp: 0,
      vw: 0,
      lam: 0,
      ap: false,
      tG: 0,
      pl: null,
      approach: null,
      o: { thr: 0, fb: 0, rb: 0, lean: 0 },
      stop: false,
      chk: Infinity,
      done: false,
    };
  }
  rollAccel(S, v, p) {
    return Math.min(rollAccelOf(S, v), (this.kcs * Math.max(v, 1) ** 2 * Math.cos(p)) / S.b.h);
  }

  // After the last loop: the way over the near cone to the gate with the best predicted time.
  pickFinishPath(sim, st, mk) {
    const C = CONES[0];
    let best = null;
    let bs = -1e9;
    let bt = 1e9;
    const ys = [0.85, 1, 1.15, 1.3];
    const gs = [0.6, 0.75, 0.9];
    for (const fy of ys)
      for (const gy of gs) {
        const pl = mk([-CONE_X, fy], [GATE_X, gy]);
        const s2 = cloneSim(sim);
        const st2 = Object.assign({}, st, { fpl: pl, o: Object.assign({}, st.o), fsim: true, done: false });
        let m = 9;
        let yG = null;
        const t0 = s2.t;
        for (let j = 0; j < 900; j++) {
          const pf = s2.front();
          s2.step(this.decide(s2, st2, null), DT);
          if (s2.crash) break;
          if (j % 3 === 0 && s2.x < C[0] + 3 && s2.x > C[0] - 3) {
            const c = this.clearance(s2.D || this.S, s2.phi, s2.k || 0, s2.x, s2.y, s2.psi, C);
            if (c < m) m = c;
          }
          const f = s2.front();
          if (pf[0] > GATE_X && f[0] <= GATE_X) {
            const u = (pf[0] - GATE_X) / (pf[0] - f[0]);
            yG = pf[1] + (f[1] - pf[1]) * u;
            break;
          }
        }
        const sc = yG == null || s2.crash ? -9 : Math.min(m - this.cm, 1 - Math.abs(yG));
        const t = s2.t - t0;
        if (sc >= 0 ? bs < 0 || t < bt : sc > bs) {
          if (sc >= 0 || bs < 0) {
            best = pl;
            bs = sc;
            bt = t;
          }
        }
      }
    return best || mk(this.finishAim, FINISH_GATE);
  }
  // Where the front wheel comes to rest if braking for the box starts now.
  predictStop(sim, st) {
    const s2 = cloneSim(sim);
    const st2 = Object.assign({}, st, { o: Object.assign({}, st.o), stop: true, fix: true, fsim: true });
    for (let j = 0; j < 720 && s2.v > 0.01 && !s2.crash; j++) s2.step(this.decide(s2, st2, null), DT);
    return s2.front()[0];
  }
  // Lean that steers for the point ld seconds ahead on path pts.
  leanToward(sim, pts, ld) {
    const p = sim.mid();
    const v = Math.max(sim.v, 1);
    const T = aimOnPolyline(pts, p, Math.max(2.5, (ld || this.ld) * v));
    const dx = T[0] - p[0];
    const dy = T[1] - p[1];
    const D = Math.hypot(dx, dy) || 1;
    let a = Math.atan2(dy, dx) - sim.psi;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    return clamp(Math.atan((((2 * Math.sin(a)) / D) * v * v) / G), -this.leanMax, this.leanMax);
  }
  // Gap to cone C at lean ph and curvature k; outlines are cached per degree of lean and steer.
  clearance(D, ph, k, x, y, h, C) {
    const S = this.S;
    const a = bikeLean(D, Math.abs(ph));
    const pb = Math.round(Math.sign(ph) * a * DEG);
    const d = Math.round(
      Math.sign(k) * Math.min(S.lockEff, steerForCurvature(S.b.L * Math.abs(k), a, S)) * S.cosR * DEG,
    );
    const key = pb * 1000 + d;
    let pts = this.outlineCache.get(key);
    if (!pts) {
      pts = outlinePoints(S, pb * RAD, d * RAD);
      this.outlineCache.set(key, pts);
    }
    return outlineClearance(pts, x, y, h, C).c;
  }
  // The deepest lean the tyres hold at speed v (memoised in steps of 0.05 m/s).
  capAt(v) {
    const key = Math.round(Math.max(v, 0.3) * 20);
    let c = this.caps.get(key);
    if (c == null) {
      c = gripLean(this.S, this.S, key / 20, this.muR, this.leanMax);
      this.caps.set(key, c);
    }
    return c;
  }
  // Lean while slowing for the apex: from pS towards the lean limit as the speed drops.
  scheduledLean(sch, v) {
    return Math.min(
      this.capAt(v),
      sch.pS + (this.leanMax - sch.pS) * clamp((sch.vS - v) / Math.max(0.3, sch.vS - this.vApex), 0, 1) * sch.k,
    );
  }
  // Looks ahead through the turn-in with lean schedule sch: the smaller of the margin to the cone over
  // the first 150° of rotation and how far past the cone the bike is after 90° [m]. Negative: the
  // schedule fails.
  predictEntry(sim, st, q, sch, cs) {
    const S = this.S;
    const D = sim.D || S;
    const b = S.b;
    const sg = turnSign(q);
    const u = st.approach || this.approach[q];
    const hu = Math.atan2(u[1], u[0]);
    const bq = this.opt.plan ? this.opt.brk[q] : null;
    const C0 = turnCone(q);
    const C = cs ? [C0[0] - cs * u[0], C0[1] - cs * u[1]] : C0;
    const aBr = bq
      ? bq.fs * maxBrakeDecel(S, D, 0, this.eta)
      : this.opt.bC > 0 && this.opt.bC < 1
        ? this.opt.bC * maxBrakeDecel(S, D, 0, this.eta)
        : 1e9;
    const dt = 0.02;
    const fF = D.fF;
    const mu = this.eta * D.mu;
    let x = sim.x;
    let y = sim.y;
    let h = sim.psi;
    let v = Math.max(sim.v, 0.5);
    let p = sg * sim.phi;
    let w = sg * (sim.rate || 0);
    let vp = sg * st.vp;
    let vw = sg * st.vw;
    let m = 9;
    let ab = false;
    let t = 0;
    let pa = null;
    const hL = b.h / b.L;
    const aW0 = Math.max(0.3, Math.min(aBr, maxBrakeDecel(S, D, 0, this.eta)));
    const vA = this.vTurn;
    const vFr = Math.max(this.vApex, vA + this.opt.vF);
    const kp = this.opt.rK;
    const rL = AUTO.rMin * b.br;
    let mt = st.ph === 'turn' && st.tM != null;
    let aP = 0;
    let aPk = st.ph === 'turn' ? (st.rPk || 0) * b.br : 0;
    if (sch.dl) sch = { vS: sch.vS, pS: sch.pS, k: sch.k, dl: sch.dl, w: sch.w };

    for (let j = 0; j < 160; j++) {
      t += dt;
      if (sch.dl && t <= sch.dl) sch.vS = Math.max(v, this.vApex + 0.3);
      const tc =
        sch.w != null
          ? Math.min(this.leanMax, sch.pS + sch.w * Math.max(0, t - (sch.dl || 0)))
          : sch.dl && t <= sch.dl
            ? sch.pS
            : this.scheduledLean(sch, v);
      const cap = this.capAt(v);
      [vp, vw] = servo(vp, vw, Math.min(tc, cap), this.rollAccel(S, v, vp), S.roll, dt);
      [p, w] = servo(p, w, vp, rollAccelOf(S, v), S.roll, dt);
      if (Math.abs(p) > cap) p = Math.sign(p) * cap;
      const ap = Math.abs(p);
      const kb = balanceCurvature(D, ap, v);
      const kl = lockTan(D, bikeLean(D, ap), S) / b.L;
      const k = Math.sign(p) * Math.min(kb, kl);
      const ka = Math.abs(k);
      const la = v * v * ka * (1 - b.h * ka * Math.sin(ap));
      const aW =
        v > vFr && !mt
          ? Math.min(aBr, turnInBrake(S, D, this.eta, la, ka, ap, Math.min(tc, cap), v), AUTO.fK * (v - vFr))
          : 0;
      const wR = clamp(1 - aW / aW0, 0, 1);
      let aR = 0;
      if (!mt) {
        const tq = turnLoads(S, D, la, ka, ap);
        const Nr = Math.max(0, G * (1 - fF) - tq.tr - aP * hL);
        const cR = Math.sqrt(Math.max(0, (mu * Nr) ** 2 - tq.cr ** 2));
        const aU = Math.min(kp * (v - vA), AUTO.rG * cR, b.br);
        aR = wR * Math.max(rL, aU);
        aPk = Math.max(aPk, aR);
        if (aW === 0 && aPk >= 2 * rL && aU < rL) mt = true;
      }
      aP = aW + aR;
      if (aW > 0) v = Math.max(vFr, v - aP * dt);
      else if (!mt) {
        v -= (aR + 0.1 + 0.00035 * v * v + b.eb * Math.min(1, v / 2)) * dt;
        if (v <= vA) {
          v = vA;
          mt = true;
        }
      }
      const d = v * dt;
      h += sg * k * d;
      x += d * Math.cos(h);
      y += d * Math.sin(h);
      const ch = Math.cos(h);
      const sh = Math.sin(h);
      const rx = C[0] - x;
      const ry = C[1] - y;
      const al2 = rx * ch + ry * sh;
      if (!ab && al2 < 0) {
        ab = true;
        if (sg * (-rx * sh + ry * ch) < 0) {
          this.predMargin = -10;
          this.predAhead = -10;
          return -10;
        }
      }
      if (rx * rx + ry * ry < 6.8 || j % 4 === 3) {
        const c = this.clearance(D, sg * p, sg * k, x, y, h, C);
        if (c < m) m = c;
      }
      const turned = signedRotation(hu, h, sg);
      if (pa == null && turned >= Math.PI / 2) pa = (x - C[0]) * u[0] + (y - C[1]) * u[1];
      if (pa != null && turned >= 2.6) {
        this.predMargin = m - this.cm;
        this.predAhead = pa;
        return Math.min(this.predMargin, this.predAhead);
      }
    }
    this.predMargin = m - this.cm;
    this.predAhead = 9;
    return m - this.cm;
  }

  // The fastest lean-in rate (up to w0), or the largest lean gain (up to k0), with which the entry works.
  solveLeanRate(sim, st, q, pS, w0) {
    const f = (w) => this.predictEntry(sim, st, q, { pS, w });
    if (f(w0) >= 0) return w0;
    if (f(0) < 0) return 0;
    let lo = 0;
    let hi = w0;
    for (let i = 0; i < 6; i++) {
      const m = (lo + hi) / 2;
      if (f(m) >= 0) lo = m;
      else hi = m;
    }
    return lo;
  }
  solveLeanGain(sim, st, q, sch, k0) {
    const f = (k) => this.predictEntry(sim, st, q, { vS: sch.vS, pS: sch.pS, k });
    if (f(k0) >= 0) return k0;
    if (f(0) < 0) {
      // No schedule works from here: hold the lean that keeps the bike furthest from the cone.
      const p0 = Math.abs(sim.phi);
      let bv = -1e9;
      for (const z of [1, 0.85, 0.7, 0.5]) {
        const m = this.predictEntry(sim, st, q, { vS: sch.vS, pS: z * p0, k: 0 });
        if (m > bv + 0.01) {
          bv = m;
          sch.pS = Math.max(sch.pS, z * p0);
        }
      }
      return 0;
    }
    let lo = 0;
    let hi = k0;
    for (let i = 0; i < 5; i++) {
      const m = (lo + hi) / 2;
      if (f(m) >= 0) lo = m;
      else hi = m;
    }
    return lo;
  }

  // Looks ahead through the exit with the bike picked up at rate lam: the rotation still needed to
  // face target T (negative: turned past it). Sets predClear, the cone margin on the way.
  predictExit(sim, st, T, sg, C, lam, tx0) {
    lam = lam || this.lr;
    const S = this.S;
    const D = sim.D || S;
    let x = sim.x;
    let y = sim.y;
    let h = sim.psi;
    let v = Math.max(sim.v, 0.5);
    let p = sg * sim.phi;
    let w = sg * (sim.rate || 0);
    let vp = sg * st.vp;
    let vw = sg * st.vw;
    let tx = tx0 != null ? tx0 : Math.max(0, vp);
    let t = 0;
    let mc = 9;
    const dt = 0.02;
    const t0 = st.ph === 'exit' ? sim.t - st.tG : 0;
    const ov = this.opt.ov;
    const rb0 = st.ph === 'exit' ? st.rbG || 0 : st.o ? st.o.rb : 0;
    const plan = this.opt.plan;
    const kU = 1 - Math.pow(0.9, dt / DT);
    const kD = 1 - Math.pow(0.75, dt / DT);
    let ut = sim.ut || 0;
    let oT = st.o ? st.o.thr : ut;
    for (let j = 0; j < 200 && (p > 1e-3 || vp > 1e-3 || tx > 0); j++) {
      tx = Math.max(0, tx - lam * dt);
      [vp, vw] = servo(vp, vw, tx, this.rollAccel(S, v, vp), S.roll, dt);
      if (plan && vp > this.leanMax) {
        vp = this.leanMax;
        if (vw > 0) vw = 0;
      }
      [p, w] = servo(p, w, vp, rollAccelOf(S, v), S.roll, dt);
      p = Math.min(Math.max(0, p), this.capAt(v));
      const la = G * Math.tan(p);
      const k = balanceCurvature(D, p, v);
      const uc = Math.min(
        clamp((t + t0) / this.op, 0.15, 1),
        throttleFor(S, maxDriveAccel(S, D, la, this.eta, v, sim.t + t, 0, k), v, sim.t + t),
      );
      if (plan) {
        oT += (uc - oT) * (uc < oT ? kD : kU);
        ut += clamp(oT - ut, -dt / 0.1, dt / 0.2);
      } else ut += clamp(uc - ut, -dt / 0.1, dt / 0.25);
      const a =
        accelAtThrottle(S, ut, v, sim.t + t) - (rb0 > 0 && t + t0 < ov ? rb0 * (1 - (t + t0) / ov) * S.b.br : 0);
      const d = v * dt;
      const hm = h + (sg * k * d) / 2;
      x += d * Math.cos(hm);
      y += d * Math.sin(hm);
      h += sg * k * d;
      v = Math.max(0.5, v + a * dt);
      t += dt;
      if (C && j % 2 === 1 && t < 1.2) {
        const c = this.clearance(D, sg * p, sg * k, x, y, h, C);
        if (c < mc) mc = c;
      }
    }
    this.predClear = mc - this.cm;
    const L2 = S.b.L / 2;
    let r = rotationTo(h, Math.atan2(T[1] - y - L2 * Math.sin(h), T[0] - x - L2 * Math.cos(h)), sg);
    if (r > Math.PI) r -= 2 * Math.PI;
    return r;
  }

  // One decision per step. Phases: go (to the next loop), turn (braking and leaning in), exit
  // (throttle and pick-up), fin (to the finish).
  decide(sim, st, ev) {
    const S = this.S;
    const b = S.b;
    const D = sim.D || S;
    const opt = this.opt;
    const v = sim.v;
    const eta = this.eta;
    const la = Math.abs(sim.al || 0);
    const mid = sim.mid();
    let lean = 0;
    let thr = 0;
    let fb = 0;
    let rb = 0;
    let bf = 0;
    let brake = 0;
    const hL = b.h / b.L;
    const fF = D.fF;
    const mu = eta * D.mu;
    const dN = (sim.dN || 0) / S.mt;
    const kNow = Math.abs(sim.k || 0);
    const tq = turnLoads(S, D, la, kNow, Math.abs(sim.phi));
    const brk = (aW) => {
      const Nf = G * fF + dN;
      const Nr = Math.max(0, G * (1 - fF) - dN);
      const cF = Math.sqrt(Math.max(0, (mu * Nf) ** 2 - tq.cf ** 2));
      const cR = Math.sqrt(Math.max(0, (mu * Nr) ** 2 - tq.cr ** 2));
      const aR = Math.min(0.5 * aW * Math.max(0, 1 - fF - (aW * hL) / G), 0.5 * cR, b.br);
      const aF = Math.min(Math.max(0, aW - aR), cF, b.bf);
      return [aF / b.bf, aR / b.br];
    };
    const drag = 0.1 + 0.00035 * v * v;
    const aEB = b.eb * Math.min(1, v / 2);
    const aE = Math.max(0.5, engineAccel(b, S, v, sim.t) + aEB);
    const gas = (a) => clamp((a + drag + aEB) / aE, 0, 1);
    const q = st.q;
    const upd = st.n++ % 3 === 0;
    if (st.ph === 'fin') {
      const mk = (FW, FG) =>
        mid[0] > FW[0] + 0.3
          ? [[mid[0] + 5, mid[1]], [mid[0], mid[1]], FW, FG, [FG[0] - 20, FG[1]]]
          : [[mid[0] + 5, mid[1]], [mid[0], mid[1]], FG, [FG[0] - 20, FG[1]]];
      if (!st.fpl) st.fpl = opt.plan && !st.fsim ? this.pickFinishPath(sim, st, mk) : mk(this.finishAim, FINISH_GATE);
      lean = this.leanToward(sim, st.fpl, opt.finL);
      thr = gas(maxDriveAccel(S, D, G * Math.tan(Math.abs(lean)), eta, v, sim.t));
      bf = 1;
      const f = sim.front();
      const aM = maxBrakeDecel(S, D, 0, eta);
      const aS = STOP.share * aM;
      const xS = GATE_X - BOX_LEN + STOP.gap;
      const dS = Math.max(0.05, f[0] - xS);
      if (!st.stop) {
        if (st.fsim) st.stop = v * v >= 2 * aS * dS;
        else if (f[0] <= st.chk) {
          const e = this.predictStop(sim, st) - xS;
          if (e <= 2 * v * DT) st.stop = true;
          else st.chk = f[0] - e / 3;
        }
      }
      if (st.stop) {
        thr = 0;
        bf = 0;
        [fb, rb] = brk(st.fix ? aS : clamp((v * v) / (2 * dS), aS, aM));
      }
      if (f[0] < GATE_X && (v < 0.01 || f[0] < GATE_X - BOX_LEN - 2)) st.done = true;
    } else {
      const bq = opt.plan ? opt.brk[q] : null;
      const C = turnCone(q);
      const sg = turnSign(q);
      const T = this.aim(q + 1);
      const ah = aheadOfCone(q, mid);
      const aBr = (bq ? bq.fs : opt.bC || 1) * maxBrakeDecel(S, D, 0, eta);
      const vT = opt.vT / 3.6;
      const aP = 0.85 * aBr;
      const dd = ah - (bq ? bq.dT : opt.dT);
      if (
        !st.brk &&
        st.ph === 'go' &&
        v >= Math.sqrt(Math.max(0, vT * vT + 2 * aP * (opt.plan ? dd : Math.max(0, dd))))
      ) {
        st.brk = true;
        ev && ev('H', q);
      }
      if (st.ph === 'go') {
        let sNow = opt.plan && ah <= opt.S2[q][0];

        const sS = opt.sS ? opt.sS[q] : 0;
        if (!opt.plan && st.brk) {
          if (ah < 0.5 + sS) sNow = true;
          else if (upd) {
            const p0 = Math.max(0, sg * st.vp);
            const r = this.predictEntry(sim, st, q, { vS: Math.max(v, this.vApex + 0.3), pS: p0, k: 1 }, sS);
            st.nF = r >= 0 ? (st.nF || 0) + 1 : 0;
            sNow =
              r >= 0 &&
              (this.predAhead <= (opt.tA != null ? opt.tA : 0.2) ||
                (st.nF > 3 && st.pAp != null && this.predAhead > st.pAp + 0.01));
            st.pAp = r >= 0 ? Math.min(this.predAhead, st.pAp != null ? st.pAp : 9) : null;
          }
        }
        if (sNow) {
          if (!st.brk) {
            st.brk = true;
            ev && ev('H', q);
          }
          st.ph = 'turn';
          st.ap = false;
          st.cap = null;
          st.vS = v;
          st.sch = { vS: Math.max(v, this.vApex + 0.3), pS: Math.max(0, sg * st.vp), k: 1 };
          if (opt.plan) {
            st.tc = Math.max(0, sg * st.vp);
            st.w = this.solveLeanRate(sim, st, q, st.tc, 2 * this.om);
          } else {
            st.sch.k = this.solveLeanGain(sim, st, q, st.sch, 1);
          }
          ev && ev('S', q);
        }
      }
      if (st.ph === 'go') {
        lean = sim.v < 4 && q === 0 ? 0 : this.leanToward(sim, st.pl || this.pl[q]);
        let ctW = false;
        if (opt.plan && !st.brk && !(sim.v < 4 && q === 0)) {
          const pp = sim.mid();
          const Tq = aimOnPolyline(st.pl || this.pl[q], pp, Math.max(2.5, this.ld * Math.max(sim.v, 1)));
          const ea0 = Math.atan2(Tq[1] - pp[1], Tq[0] - pp[0]) - sim.psi;
          const ea = Math.abs(Math.atan2(Math.sin(ea0), Math.cos(ea0)));
          if (ea > 30 * RAD) {
            ctW = true;
            const vt = Math.max(this.vApex + 1, Math.sqrt(G * Math.tan(0.8 * this.leanMax) * 1.5));
            st.ctV = vt;
          }
        }
        if (st.brk) {
          const aq = dd > 0.05 ? (v * v - vT * vT) / (2 * dd) : 1e9;
          if (v > this.vApex + 0.05) {
            if (aq > 0) brake = Math.min(aBr, aq, maxBrakeDecel(S, D, la, eta, 0, kNow));
          } else thr = gas(Math.max(-1, Math.min(2, 4 * (this.vApex - v))));
        } else if (ctW) {
          const vt = st.ctV;
          if (v > vt + 0.3) brake = Math.min(0.5 * maxBrakeDecel(S, D, la, eta, 0, kNow), 2 * (v - vt));
          else thr = gas(Math.max(-1, Math.min(2, 3 * (vt - v))));
        } else {
          thr = gas(maxDriveAccel(S, D, G * Math.tan(Math.abs(lean)), eta, v, sim.t));
          bf = 1;
        }
      } else if (st.ph === 'turn') {
        const u = st.approach || this.approach[q];
        const rot = signedRotation(Math.atan2(u[1], u[0]), sim.psi, sg);
        if (!st.ap && rot >= Math.PI / 2) st.ap = true;

        if (!st.ap && opt.plan) {
          if (upd) {
            st.w = this.solveLeanRate(sim, st, q, st.tc, 2 * this.om);
            if (st.w === 0) {
              this.predictEntry(sim, st, q, { pS: st.tc, w: 0 });
              if (this.predMargin < 0) {
                let bl = st.tc;
                let bv = this.predMargin;
                for (const z of [0.85, 0.7, 0.5]) {
                  const l = z * st.tc;
                  this.predictEntry(sim, st, q, { pS: l, w: 0 });
                  if (this.predMargin > bv + 0.01) {
                    bv = this.predMargin;
                    bl = l;
                  }
                }
                st.tc = bl;
              }
            }
          }
          st.tc = Math.min(this.leanMax, st.tc + st.w * DT);
        } else if (!st.ap) {
          if (upd) st.sch.k = this.solveLeanGain(sim, st, q, st.sch, Math.min(1, st.sch.k + 0.5 * 3 * DT));
          const tc = this.scheduledLean(st.sch, v);
          st.tc = tc;
        }
        st.tc = Math.min(st.tc, this.capAt(v));

        if (st.cap != null) st.tc = Math.min(st.tc, st.cap);
        lean = sg * st.tc;
        let go = false;
        const gS = opt.gS ? opt.gS[q] : 0;
        if (opt.plan) {
          if (upd && rot >= opt.gpR * RAD) {
            const rr = this.predictExit(sim, st, T, sg, C, this.lr);
            const early = rot < opt.gpCR * RAD;
            if (early && this.predClear < 0 && rot >= opt.gpRL * RAD)
              st.cap = Math.max(0, Math.min(st.cap != null ? st.cap : st.tc, st.tc) - opt.gpL * RAD);
            go = rr <= 0.03 + gS || (this.predClear < 0 && !early) || rot >= Math.PI * 1.4;
          }
        } else {
          go = gS ? rot >= Math.PI / 2 - gS : st.ap;

          if (!go && opt.gS && rot >= AUTO.gRot * RAD && st.tc >= this.leanMax - 0.01 && sg * st.vp >= st.tc - 0.003)
            go = true;

          if (go) {
            if (upd) {
              const rr = this.predictExit(sim, st, T, sg, C, this.lr);
              go = rr <= 0.03 + gS || this.predClear < 0 || rot >= Math.PI * 1.4;
            } else go = false;
          }
        }
        if (go) {
          st.ph = 'exit';
          st.tx = Math.max(0, sg * st.vp);
          st.tG = sim.t;
          st.lam = 0;
          st.n = 0;
          st.rbG = st.o.rb;
          ev && ev('G', q);
        } else if (st.brk) {
          const vA = this.vTurn;
          const vFr = Math.max(this.vApex + 0.05, vA + opt.vF);
          const aW =
            v > vFr && st.tM == null
              ? Math.min(aBr, turnInBrake(S, D, eta, la, kNow, Math.abs(sim.phi), st.tc, v), AUTO.fK * (v - vFr))
              : 0;
          const fr = aW > 0 ? brk(aW) : [0, 0];
          const aW0 = Math.max(0.3, Math.min(aBr, maxBrakeDecel(S, D, 0, eta)));
          const wR = clamp(1 - aW / aW0, 0, 1);
          let r = 0;
          if (st.tM == null) {
            const yR = (Math.sign(sim.phi || 0) * (sim.dY || 0)) / S.mt;
            const Nr = Math.max(0, G * (1 - fF) - dN);
            const cR = Math.sqrt(Math.max(0, (mu * Nr) ** 2 - (la - tq.kv * fF - yR) ** 2));
            const rU = Math.min(opt.rK * (v - vA), AUTO.rG * cR, b.br);
            const rF = AUTO.rMin * b.br;
            r = (wR * Math.max(rF, rU)) / b.br;
            st.rPk = Math.max(st.rPk || 0, r);
            if (aW === 0 && (v <= vA || (st.rPk >= (2 * rF) / b.br && rU < rF))) {
              st.tM = sim.t;
              st.rbM = st.o.rb;
            }
          }
          if (st.tM != null) {
            const u = (sim.t - st.tM) / opt.ov;
            r = u < 1 ? st.rbM * (1 - u) : 0;
            thr = gas(Math.max(-0.5 * (drag + aEB), Math.min(2, 4 * (vA - v))));
          }
          fb = fr[0];
          rb = Math.max(fr[1], r);
        } else thr = gas(maxDriveAccel(S, D, la, eta, v, sim.t, 0, kNow));
      }
      if (st.ph === 'exit') {
        if (upd || !st.lam) {
          const f = (l) => this.predictExit(sim, st, T, sg, C, l, st.tx);
          let lo = 0.15 * this.lr;
          let hi = 3 * this.lr;
          let lt;
          if (f(hi) < 0) lt = hi;
          else if (f(lo) > 0) lt = lo;
          else {
            for (let i = 0; i < 6; i++) {
              const m = (lo + hi) / 2;
              if (f(m) < 0) lo = m;
              else hi = m;
            }
            lt = (lo + hi) / 2;
          }
          if (st.tx > 0.05) {
            f(lt);
            if (this.predClear < 0) {
              let a = lt;
              let c = 3 * this.lr;
              f(c);
              if (this.predClear < 0) {
                lt = c;
              } else {
                for (let i = 0; i < 5; i++) {
                  const m = (a + c) / 2;
                  f(m);
                  if (this.predClear < 0) a = m;
                  else c = m;
                }
                lt = c;
              }
            }
          }
          st.lam = Math.max(st.lam || 0, lt);
        }
        st.tx = Math.max(0, st.tx - st.lam * DT);

        lean = sg * Math.min(st.tx, this.capAt(v));
        const ramp = clamp((sim.t - st.tG) / this.op, 0.15, 1);
        thr = Math.min(ramp, gas(maxDriveAccel(S, D, G * Math.tan(Math.abs(sim.phi)), eta, v, sim.t, 0, kNow)));
        bf = 1;
        if (opt.plan && sim.cl && sim.cl[C[0] < 0 ? 0 : 1] < opt.gX) {
          thr = gas(maxDriveAccel(S, D, G * Math.tan(Math.abs(sim.phi)), eta, v, sim.t, 0, kNow));
        }
        const q1 = q + 1;
        const ah1 = q1 < TURNS ? aheadOfCone(q1, mid) : 1e9;
        const b1 = q1 < TURNS && opt.plan ? opt.brk[q1] : null;
        const aP1 = b1 ? 0.85 * b1.fs * maxBrakeDecel(S, D, 0, eta) : aP;
        const late = q1 < TURNS && v >= Math.sqrt(vT * vT + 2 * aP1 * Math.max(0, ah1 - (b1 ? b1.dT : opt.dT)));
        if (late || (st.tx <= 0 && Math.abs(st.vp) < 3 * RAD && Math.abs(sim.phi) < 3 * RAD)) {
          ev && ev('X', q);
          st.q++;
          st.tM = null;
          st.rPk = 0;
          st.brk = false;
          st.ap = false;
          st.lam = 0;
          st.pAp = null;
          st.nF = 0;
          st.tc = 0;
          st.w = 0;
          st.n = 0;
          st.ph = st.q >= TURNS ? 'fin' : 'go';
          if (st.q < TURNS) {
            const Sp = this.aim(st.q);
            const dx = Sp[0] - mid[0];
            const dy = Sp[1] - mid[1];
            const l = Math.hypot(dx, dy) || 1;
            st.approach = [dx / l, dy / l];
            st.pl = [
              [mid[0] - 5 * st.approach[0], mid[1] - 5 * st.approach[1]],
              [mid[0], mid[1]],
              Sp,
              [Sp[0] + 20 * st.approach[0], Sp[1] + 20 * st.approach[1]],
            ];
          }
        }
      }
      if (brake > 0) {
        const [f, r] = brk(brake);
        fb = f;
        rb = r;
      }
      if (st.ph === 'exit' && st.rbG > 0) {
        const u = (sim.t - st.tG) / opt.ov;
        if (u < 1) rb = Math.max(rb, st.rbG * (1 - u));
      }
    }
    if (
      opt.plan &&
      st.ph !== 'go' &&
      thr < 0.02 &&
      fb < 0.01 &&
      rb < 0.01 &&
      Math.abs(sim.phi) > 25 * RAD &&
      (sim.useR || 0) > opt.ebG
    )
      thr = Math.max(thr, gas(-drag));

    if (st.ph === 'go' || st.ph === 'fin') {
      st.pT = (st.pT || 0) + (lean - (st.pT || 0)) * Math.min(1, DT / 0.1);
      lean = st.pT;
    } else st.pT = lean;
    if (opt.plan && st.ph === 'go' && st.q === 0) {
      const ux = Math.cos(sim.psi);
      const uy = Math.sin(sim.psi);
      const C = CONES[0];
      const rx = C[0] - sim.x;
      const ry = C[1] - sim.y;
      const al = rx * ux + ry * uy;
      const la = -rx * uy + ry * ux;
      if (al > -0.3 && al < S.b.L + 0.6 && Math.abs(la) < 1.2 && la * lean > 0 && sim.cl && sim.cl[0] < opt.gN) {
        lean = 0;
        st.pT = 0;
      }
    }
    [st.vp, st.vw] = servo(
      st.vp,
      st.vw,
      clamp(lean, -S.capC, S.capC),
      this.rollAccel(S, v, Math.abs(st.vp)),
      S.roll,
      DT,
    );
    const o = st.o;
    o.lean = st.vp / S.capC;
    o.thr += (thr - o.thr) * (thr < o.thr ? 0.25 : 0.1);
    o.fb += (fb - o.fb) * 0.12;
    o.rb += (rb - o.rb) * 0.08;
    return { lean: o.lean, thr: o.thr, fb: o.fb, rb: o.rb, fast: fb > 0.02, bf };
  }
  // Rides the run once in advance to find where each phase begins.
  rehearse() {
    const S = this.S;
    const sim = new Sim(S);
    const st = this.newState();
    const P = [];
    const V = [];
    const iL = [];
    const iX = [];
    const iG = [];
    const iH = [];
    let n = 0;
    let acc = 0;
    let lx = sim.x;
    let ly = sim.y;
    const push = () => {
      P.push([sim.x, sim.y]);
      V.push(sim.v);
    };
    push();
    const sAh = [];
    this.turnAhead = sAh;
    const ev = (k, q) => {
      const i = P.length - 1;
      if (k === 'S') {
        iL[q] = i;
        sAh[q] = aheadOfCone(q, sim.mid());
      } else if (k === 'G') iG[q] = i;
      else if (k === 'X') iX[q] = i;
      else if (k === 'H') iH[q] = i;
    };
    while (n++ < 240 * 70 && !st.done) {
      const u = this.decide(sim, st, ev);
      sim.step(u, DT);
      if (sim.crash) break;
      acc += Math.hypot(sim.x - lx, sim.y - ly);
      lx = sim.x;
      ly = sim.y;
      if (acc >= 0.05) {
        acc = 0;
        push();
      }
    }
    push();
    const N = P.length;
    for (let q = 0; q < TURNS; q++) {
      if (iL[q] == null) iL[q] = q ? (iX[q - 1] != null ? iX[q - 1] : N - 1) : 0;
      if (iG[q] == null) iG[q] = iL[q];
      if (iX[q] == null) iX[q] = N - 1;
    }
    const iA = iL.map((a, q) => {
      let bi = a;
      let bv = 1e9;
      for (let i = a; i <= iX[q]; i++)
        if (V[i] < bv) {
          bv = V[i];
          bi = i;
        }
      return bi;
    });
    const rem = new Float32Array(N);
    for (let q = 0; q < TURNS; q++) {
      const sg = turnSign(q);
      const T = this.aim(q + 1);
      for (let i = iL[q]; i <= iX[q] && i < N; i++) {
        const j = Math.min(N - 1, i + 1);
        const j0 = Math.max(0, j - 2);
        const h = Math.atan2(P[j][1] - P[j0][1], P[j][0] - P[j0][0]);
        const m = this.mid(i, P);
        let r = rotationTo(h, Math.atan2(T[1] - m[1], T[0] - m[0]), sg);
        if (r > 2 * Math.PI - 0.3) r = 0;
        rem[i] = r;
      }
    }
    this.P = P;
    this.v = V;
    this.n = N;
    this.iTurn = iL;
    this.iApex = iA;
    this.iExit = iX;
    this.iGas = iG;
    this.iBrake = iH;
    this.rotLeft = rem;
  }
  rehearsal() {
    return Object.fromEntries(REHEARSAL.map((k) => [k, this[k]]));
  }
  mid(i, P) {
    P = P || this.P;
    const n = P.length;
    i = clamp(i, 0, n - 1);
    const j = Math.min(n - 1, Math.max(1, i + 1));
    const hx = P[j][0] - P[j - 1][0];
    const hy = P[j][1] - P[j - 1][1];
    const hl = Math.hypot(hx, hy) || 1;
    const Lh = this.S.b.L / 2;
    return [P[i][0] + (Lh * hx) / hl, P[i][1] + (Lh * hy) / hl];
  }
  ahead(q, i) {
    return aheadOfCone(q, this.mid(i));
  }
  gasIndex(q, g) {
    let i = this.iTurn[q];
    while (i < this.iExit[q] && this.rotLeft[i] > g) i++;
    return i;
  }

  control(sim) {
    const P = this.P;
    const n = this.n;
    let bi = this.i;
    let bd = 1e9;
    for (let j = this.i; j < Math.min(n, this.i + 40); j++) {
      const d = (P[j][0] - sim.x) ** 2 + (P[j][1] - sim.y) ** 2;
      if (d < bd) {
        bd = d;
        bi = j;
      }
    }
    this.i = bi;
    const st = this.st;
    const u = this.decide(sim, st, (k, q) => {
      const w = this.W[q];
      if (!w) return;
      if (k === 'H') {
        w.tB = sim.t;
        w.vB = sim.v;
      } else if (k === 'S') {
        w.tT = sim.t;
        w.vT = sim.v;
      } else if (k === 'G') {
        w.tG = sim.t;
        w.vG = sim.v;
        w.phG = bikeLean(sim.D || this.S, Math.abs(sim.phi));
        w.wd = 0;
      }
    });
    this.q = st.q;
    this.ph = st.ph;
    return u;
  }
}
