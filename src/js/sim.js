// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Vehicle dynamics: the bike with its rider, advanced step by step under the rider's inputs.

// Drive from the engine: limited by torque in a low gear and by power above it (P in kW, 85% of it
// reaching the ground).
const engineAccel = (b, S, v, t) =>
  Math.min(
    b.aT * (b.b0 + (1 - b.b0) * Math.min(1, v / b.vb)),
    ((b.P2 && t != null && t > b.Pt ? b.P2 : b.P) * 850) / (S.mt * Math.max(v, 0.5)),
  );
const FLAG = { WHEELIE: 1, STOPPIE: 2, SLIDEF: 4, LOCKR: 8, SPIN: 16, FALL: 32, WIDE: 64, SCRAPE: 128, HOLD: 256 };
// The steady turn at lean p and speed v: its curvature k and the side force each tyre needs [N].
function tyreNeeds(S, D, g, p, v) {
  const k = Math.min(balanceCurvature(D, p, Math.max(v, 0.3)), tanGroundSteer(D.lockEff, bikeLean(D, p), g.eps) / g.L);
  const kv = v * v * k;
  const al = kv * (1 - S.b.h * k * Math.sin(p));
  return { k, f: S.mt * kv * D.fF * Math.sqrt(1 + (k * g.L) ** 2), r: S.mt * Math.abs(al - kv * D.fF) };
}
// The rider's body as a second mass: FA shift of its centre of mass along the bike at full reach [m],
// WN and ZB natural frequency [rad/s] and damping of the torso, VB its top speed [full reach/s].
const BODY_SHIFT = { FA: 0.15, WN: 9, ZB: 0.9, VB: 5 };
const FORK = { preload: 0.15 }; // spring preload as a share of the static load; below it the fork tops out
// Fork travel [m] under force Ff along the fork legs [N]: stiffness kF above sag (set by the dive under
// 1 g of braking), kF0 below it, down to the preload.
const forkTravel = (S, Ff) =>
  Ff >= S.F0 ? Math.min(S.ft, S.sagF + (Ff - S.F0) / S.kF) : Math.max(0, S.sagF - (S.F0 - Ff) / S.kF0);
// Quicker hands when braking: throttle closing (tc), front (tf) and rear (tr) brake times [s].
const FAST_HANDS = { tc: 0.05, tf: 0.08, tr: 0.1 };
// Countersteering: d the largest outward handlebar angle when leaning in [°], tr time to reach full
// roll rate at speed vr [m/s], lo and hi the share of that roll acceleration at low and high speed,
// amin the lowest roll acceleration [rad/s²].
const COUNTERSTEER = { d: 6, tr: 0.43, vr: 6, lo: 0.8, hi: 1.3, amin: 8 };
// Start at the back of the box near its right edge: front wheel run [m] behind the line, bike centre
// y [m] from the cone axis.
const START = { run: 1.0, y: -0.6 };
// The bike with its rider: position x, y [m], heading psi, speed v, combined lean phi, handlebar
// angle st, throttle and brake levels ut, uf, ur, fork and rear travel zf, zr, body shift bx.
class Sim {
  constructor(S) {
    this.S = S;
    const b = S.b;
    this.x = GATE_X - START.run - b.L;
    this.y = START.y;
    this.psi = 0;
    this.v = 0;
    this.phi = 0;
    this.cmd = 0;
    this.ut = 0;
    this.uf = 0;
    this.ur = 0;
    this.slideF = 0;
    this.slideR = 0;
    this.t = 0;
    this.k = 0;
    this.st = 0;
    this.rate = 0;
    this.ax = 0;
    this.axL = 0;
    this.al = 0;
    this.lock = false;
    this.fl = 0;
    this.crash = null;
    this.useF = 0;
    this.useR = 0;
    this.loadF = 1;
    this.loadR = 1;
    this.zf = forkTravel(S, S.mt * G * S.fF * S.cE);
    this.vf = 0;
    this.zr = clamp(S.sagR - (S.mt * G * (S.fF - b.ff)) / S.kR, 0, S.rt);
    this.vr = 0;
    this.dN = 0;
    this.dNv = 0;
    this.fxR = 0;
    this.g = liveGeometry(S, this.zf, this.zr);
    this.yr = 0;
    this.yd = 0;
    this.dY = 0;
    this.D = Object.create(S);
    this.bx = S.seat0;
    this.bxv = 0;
    this.rel = S.rel0;
  }
  front() {
    const L = this.S.b.L;
    return [this.x + L * Math.cos(this.psi), this.y + L * Math.sin(this.psi)];
  }
  mid() {
    const L = this.S.b.L * 0.5;
    return [this.x + L * Math.cos(this.psi), this.y + L * Math.sin(this.psi)];
  }
  fail(msg) {
    this.crash = msg;
  }
  body(inp, dt) {
    const S = this.S;
    const D = this.D;
    const b = S.b;
    const tx = S.seat0 + (1 - S.seat0) * clamp(inp.bf, 0, 1);
    const w = BODY_SHIFT.WN;
    const z = BODY_SHIFT.ZB;
    this.bxv = clamp(this.bxv + (w * w * (tx - this.bx) - 2 * z * w * this.bxv) * dt, -BODY_SHIFT.VB, BODY_SHIFT.VB);
    this.bx = clamp(this.bx + this.bxv * dt, -1, 1);
    const ar = S.ar + BODY_SHIFT.FA * S.rf * (this.bx - S.seat0);
    D.fF = ar / b.L;
    D.wheelie = (G * ar) / b.h;
    D.stoppie = (G * (b.L - ar)) / b.h;
  }
  // Advances by dt under the inputs: lean (−1…1 of the lean limit), thr, fb, rb (0…1).
  step(inp, dt) {
    const S = this.S;
    const b = S.b;
    let fl = 0;
    this.body(inp, dt);
    const D = this.D;
    const fq = inp.fast ? FAST_HANDS : null;
    this.ut = slew(this.ut, inp.thr, dt / 0.2, dt / (fq ? fq.tc : 0.1));
    this.uf = slew(this.uf, inp.fb, dt / (fq ? fq.tf : 0.15), dt / 0.1);
    this.ur = slew(this.ur, inp.rb, dt / (fq ? fq.tr : 0.15), dt / 0.1);
    this.cmd = clamp(inp.lean, -1, 1) * D.capC;
    const g = liveGeometry(D, this.zf, this.zr);
    this.g = g;
    const v0 = this.v;
    const eq = fullLockLean(D, v0, g.eps, g.L);
    const roll = D.roll * clamp(Math.sqrt(b.trail / Math.max(0.02, g.trail)), 0.85, 1.2);
    const rAcc =
      Math.max(roll / COUNTERSTEER.tr, COUNTERSTEER.amin) *
      clamp(v0 / COUNTERSTEER.vr, COUNTERSTEER.lo, COUNTERSTEER.hi);
    const e0 = this.cmd - this.phi;
    const w0 = this.rate || 0;
    const wD = Math.sign(e0) * Math.min(roll, Math.sqrt(2 * rAcc * Math.abs(e0)));
    let phi = this.phi + (w0 + clamp(wD - w0, -rAcc * dt, rAcc * dt)) * dt;
    if ((this.cmd - phi) * e0 < 0) phi = this.cmd;
    {
      const pc = Math.max(15 * RAD, S.clear - D.delta);
      if (Math.abs(phi) > pc) {
        phi = Math.sign(phi) * pc;
        fl |= FLAG.SCRAPE;
        if (Math.abs(this.rate || 0) > 0 && Math.sign(this.rate) === Math.sign(phi)) this.rate = 0;
      }
    }
    if (Math.abs(phi) > eq) {
      phi = Math.sign(phi) * eq;
      fl |= FLAG.FALL;
      this.eqC = true;
    }
    // A deeper lean needs a rear tyre that can carry the side force of that turn. Hard front braking
    // unloads the rear, so the bike leans in only as far as the rear allows until the brake eases.
    if (Math.abs(phi) > Math.abs(this.phi)) {
      const Nr0 = Math.max(0, S.mt * G * (1 - D.fF) - this.dN);
      const cR = Math.sqrt(Math.max(0, (D.mu * Nr0) ** 2 - this.fxR ** 2));
      if (tyreNeeds(S, D, g, Math.abs(phi), v0).r > cR) {
        let lo = Math.abs(this.phi);
        if (tyreNeeds(S, D, g, lo, v0).r <= cR) {
          let hi = Math.abs(phi);
          for (let i = 0; i < 10; i++) {
            const m = (lo + hi) / 2;
            if (tyreNeeds(S, D, g, m, v0).r <= cR) lo = m;
            else hi = m;
          }
        }
        phi = Math.sign(phi || this.phi) * lo;
        fl |= FLAG.HOLD;
      }
    }
    const w1 = this.eqC ? clamp((phi - this.phi) / dt, -Math.abs(w0), Math.abs(w0)) : (phi - this.phi) / dt;
    const racc = (w1 - w0) / dt;
    this.eqC = false;
    this.rate = w1;
    this.phi = phi;
    const a = Math.abs(phi);
    const side = Math.sign(phi);
    const ab = bikeLean(D, a);
    const kLock = tanGroundSteer(D.lockEff, ab, g.eps) / g.L;
    const vv = Math.max(v0, 0.3);
    const kBal = balanceCurvature(D, a, vv);
    let k = Math.min(kBal, kLock);
    this.lock = a > 0.5 * RAD && kBal >= kLock * 0.95;
    if (v0 < 0.02) k = 0;
    let kS = Math.min(kBal, kLock);
    this.racS = (this.racS || 0) + (racc - (this.racS || 0)) * Math.min(1, dt / 0.04);
    if (side && v0 > 1) {
      const dk = (-clamp(v0 - 1, 0, 1) * b.h * this.racS * side) / (vv * vv * Math.cos(a));
      if (Math.abs(dk) > 1e-6) {
        const kcs = tanGroundSteer(COUNTERSTEER.d * RAD, -ab, g.eps) / g.L;
        const kg = Math.max(kS, Math.sqrt(Math.max(0, (0.9 * D.mu * G) ** 2 - this.ax * this.ax)) / (vv * vv));
        kS = clamp(kS + dk, -kcs, Math.min(kLock, kg));
      }
    }
    const stSS = steerForCurvature(kS * g.L, ab, g.eps);
    const stT = clamp(side * stSS, -b.lock * RAD, b.lock * RAD);
    this.st += (stT - this.st) * Math.min(1, dt / 0.03);
    let aD = this.ut * engineAccel(b, S, v0, this.t);
    if (aD > D.wheelie) {
      aD = D.wheelie;
      fl |= FLAG.WHEELIE;
    }
    const aEB = b.eb * (1 - this.ut) * Math.min(1, v0 / 2);
    const aRes = v0 > 0.01 ? 0.1 + 0.00035 * v0 * v0 : 0;
    let aF = this.uf * b.bf;
    let aR = this.ur * b.br;
    let ax = aD - aF - aR - aEB - aRes;
    if (-ax > D.stoppie) {
      aF = Math.max(0, aF - (-ax - D.stoppie));
      ax = aD - aF - aR - aEB - aRes;
      fl |= FLAG.STOPPIE;
    }
    const axT = this.axL;
    const Nf = S.mt * G * D.fF + this.dN;
    const Nr = S.mt * G * (1 - D.fF) - this.dN;
    const yr = this.v * this.k;
    this.yd += ((yr - this.yr) / dt - this.yd) * Math.min(1, dt / 0.04);
    this.yr = yr;
    const dY = (S.Iz * this.yd) / g.L;
    // Side forces of the rigid bike turning about the rear axle line (see turnLoads): kv = v²·k is the rear
    // contact's side acceleration, al the centre of mass's; the front contact's wider circle adds sF.
    const kv = v0 * v0 * k;
    const al = kv * (1 - b.h * k * Math.sin(a));
    const sF = Math.sqrt(1 + (k * g.L) ** 2);
    const Fyf = Math.abs(side * S.mt * kv * D.fF + dY) * sF;
    const Fyr = Math.abs(side * S.mt * (al - kv * D.fF) - dY);
    this.dY = dY;
    const capF = D.mu * Math.max(Nf, 1);
    let uF = Math.hypot(S.mt * aF, Fyf) / capF;
    if (uF > 1) {
      if (aF > 0.3) {
        const av = Math.sqrt(Math.max(0, capF * capF - Fyf * Fyf)) / S.mt;
        if (aF > av) aF = av;
        this.slideF += (uF - 1) * 10 * dt;
        fl |= FLAG.SLIDEF;
      } else {
        // The front pushes: the bike stands up to the deepest lean whose steady turn the front holds.
        if (tyreNeeds(S, D, g, a, v0).f > capF) {
          let pm = 0;
          let hi = a;
          for (let i = 0; i < 12; i++) {
            const m = (pm + hi) / 2;
            if (tyreNeeds(S, D, g, m, v0).f <= capF) pm = m;
            else hi = m;
          }
          this.phi = side * pm;
          k = Math.min(k, tyreNeeds(S, D, g, pm, v0).k);
          fl |= FLAG.WIDE;
        }
        this.slideF = Math.max(0, this.slideF - 3 * dt);
      }
    } else this.slideF = Math.max(0, this.slideF - 3 * dt);
    const capR = D.mu * Math.max(Nr, 1);
    const FxR = S.mt * (aD - aR - aEB);
    this.fxR = FxR;
    const uR = Math.hypot(FxR, Fyr) / capR;
    if (uR > 1) {
      const av = Math.sqrt(Math.max(0, capR * capR - Fyr * Fyr)) / S.mt;
      if (FxR < 0) {
        const want = aR + aEB - aD;
        const got = Math.min(want, 0.85 * Math.max(av, (0.25 * capR) / S.mt));
        aR = Math.max(0, got - aEB + aD);
        fl |= FLAG.LOCKR;
      } else {
        aD = Math.min(aD, av + aR + aEB);
        fl |= FLAG.SPIN;
      }
      const air = a < 15 * RAD ? clamp(Nr / (0.25 * S.mt * G * (1 - D.fF)), 0, 1) : 1;
      const ex = uR - 1;
      this.slideR += Math.min(ex, 4) * 3.5 * Math.max(0.15, (a / D.capC) ** 2) * air * dt;
    } else this.slideR = Math.max(0, this.slideR - 2 * dt);
    ax = aD - aF - aR - aEB - aRes;
    const v = Math.max(0, v0 + ax * dt);
    this.useF = uF;
    this.useR = uR;
    this.loadF = Nf / (S.mt * G * D.fF);
    this.loadR = Nr / (S.mt * G * (1 - D.fF));
    if (this.slideF >= 1)
      return this.fail(
        ax - axT < -2
          ? i18n`Uślizg przodu. Przedni hamulec złapany gwałtownie w złożeniu: widelec nie zdążył się ugiąć i dociążyć koła. Dokładaj go płynnie, a oddawaj, gdy rośnie złożenie (A–C).`
          : i18n`Uślizg przodu. Przedni hamulec w złożeniu zabrał przyczepność potrzebną do skrętu: oddawaj go, gdy rośnie złożenie (A–C).`,
      );
    if (this.slideR >= 1 && a > 25 * RAD)
      return this.fail(
        FxR > 0 && this.ut > 0.2
          ? i18n`Uślizg tyłu na gazie w głębokim złożeniu: za dużo gazu, zanim motocykl zaczął się podnosić (E–F).`
          : this.ur >= 0.3
            ? i18n`Uślizg tyłu. Za długo za mocny tylny hamulec w głębokim złożeniu, tył uciekł. W pętli (D) tylnym hamulcem tylko domykaj łuk.`
            : this.uf >= 0.15
              ? i18n`Uślizg tyłu. Mocny przedni hamulec w złożeniu odciążył tylne koło i tył uciekł. Przedni oddawaj, gdy rośnie złożenie (A–C).`
              : FxR > 0
                ? i18n`Uślizg tyłu na gazie w głębokim złożeniu: za dużo gazu, zanim motocykl zaczął się podnosić (E–F).`
                : i18n`Uślizg tyłu. Gaz zamknięty gwałtownie w głębokim złożeniu: hamowanie silnikiem zerwało przyczepność tyłu.`,
      );
    if (ab > S.clear + 3 * RAD)
      return this.fail(
        i18n`Gleba. Za wolno na pełnym skręcie: motocykl wpadł do środka. Dodaj gazu albo puść tylny hamulec, zanim zabraknie prędkości.`,
      );
    const vm = (v0 + v) / 2;
    this.psi += side * vm * k * dt;
    this.x += vm * Math.cos(this.psi) * dt;
    this.y += vm * Math.sin(this.psi) * dt;
    // Load moved onto the front by braking and by the pull of a tight turn towards its centre (ω²·a_r).
    const dNt = (S.mt * (vm * vm * k * k * D.fF * b.L * Math.cos(a) - ax) * b.h) / b.L;
    const wn = S.wn;
    this.dNv += (wn * wn * (dNt - this.dN) - 2 * 0.55 * wn * this.dNv) * dt;
    this.dN += this.dNv * dt;
    const zfT = forkTravel(S, (S.mt * G * D.fF + dNt) * S.cE + S.mt * aF * S.sE);
    const zrT = clamp(
      S.sagR - (dNt + S.mt * (S.rKd * aD - S.rKb * aR - S.rKe * aEB) + S.mt * G * (D.fF - b.ff)) / S.kR,
      0,
      S.rt,
    );
    this.vf += (wn * wn * (zfT - this.zf) - 2 * (zfT > this.zf ? 0.5 : 0.8) * wn * this.vf) * dt;
    this.zf += this.vf * dt;
    if (this.zf < 0 || this.zf > S.ft) {
      this.zf = clamp(this.zf, 0, S.ft);
      this.vf = 0;
    }
    this.vr += (wn * wn * (zrT - this.zr) - 2 * (zrT > this.zr ? 0.5 : 0.8) * wn * this.vr) * dt;
    this.zr += this.vr * dt;
    if (this.zr < 0 || this.zr > S.rt) {
      this.zr = clamp(this.zr, 0, S.rt);
      this.vr = 0;
    }
    this.axL = -this.dN / ((S.mt * b.h) / b.L);
    this.v = v;
    this.k = side * k;
    this.ax = ax;
    this.al = side * al;
    this.fl = fl;
    this.t += dt;
  }
}
