// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// A run without the screen, under the same rules, cones and timing as the game.

// The planner's rider on top of the coach: gN keeps the bike upright passing the blue cone after the
// start [m], gX full throttle on the exit when the cone gap drops below it [m], gpR rotation from which
// the exit is predicted [°], until gpCR [°] a predicted touch eases the lean by gpL [°] (from gpRL [°]
// on), finY a wider way to the finish [m], ebG rear grip use above which a leaned bike coasting with
// no brakes gets a whiff of throttle against engine braking.
const PLAN_MODE = {
  gN: 1,
  gX: 0.04,
  gpR: 45,
  gpCR: 90,
  gpL: 0.5,
  gpRL: 60,
  finY: 1.2,
  ebG: 0.85,
  fxY: null,
  finL: null,
};
// Options for the planner's rider: the coach's run shifted by the changes in the plan (B earlier by
// dH with the braking force scaled, T moved by dS along and dSd sideways, G earlier by dG).
function planOptions(S, plan) {
  const S2 = [];
  const brk = [];
  const sS = [];
  const gS = [];
  const pdq = [];
  const cr = coachRun(S);
  const cc = cr.c;
  const cp = coachPlan(S);
  const num = (x, d) => (x != null && isFinite(x) ? +x : d);
  const pB = num(plan.brake, cp.brake);
  const pT = num(plan.turn, cp.turn);
  const pS = num(plan.side, cp.side);
  const pG = num(plan.gas, cp.gas);
  const f = clamp(cp.force, 0.1, 1.25);
  const dH = pB - cp.brake;
  const dS = pT - cp.turn;
  const dSd = pS - cp.side;
  const dG = pG - cp.gas;
  for (let q = 0; q < TURNS; q++) {
    S2.push([cr.sA[q] + dS, Math.max(0.3, cr.sD[q] + dSd)]);
    brk.push({ fs: cp.force > 0 ? f / cp.force : 1, dT: cc.dT + dH });
    sS.push(dS);
    gS.push((cc.gS ? cc.gS[q] : 0) + dG * RAD);
    pdq.push(Math.max(0.3, cc.pd + dSd));
  }
  return { ...cc, S2, brk, sS, gS, pdq, plan: true, ...PLAN_MODE };
}
// keep: record the trace every 4 steps.
function simulateRun(S, opt, keep) {
  const sim = new Sim(S);
  const c = new Course();
  const bot = new AutoRider(S, opt);
  const trace = [];
  let n = 0;
  let end = null;
  let why = '';
  let cause = '';
  let qn = 0;
  let det = '';
  const rec = () => {
    const s = sim;
    trace.push({
      t: s.t,
      rt: c.started ? s.t - c.t0 : null,
      x: s.x,
      y: s.y,
      psi: s.psi,
      v: s.v,
      phi: s.phi,
      phb: Math.sign(s.phi) * bikeLean(s.D || s.S, Math.abs(s.phi)),
      st: s.st,
      k: s.k,
      ut: s.ut,
      uf: s.uf,
      ur: s.ur,
      ax: s.ax,
      al: s.al,
      lock: s.lock ? 1 : 0,
      fl: s.fl,
      useF: s.useF,
      useR: s.useR,
      zf: s.zf / s.S.ft,
      zr: s.zr / s.S.rt,
      bx: s.bx,
      rel: s.rel,
      off: s.D.off,
    });
  };
  if (keep) rec();
  for (;;) {
    const pf = sim.front();
    const pc = sim.mid();
    sim.step(bot.control(sim), DT);
    if (sim.crash) {
      end = 'crash';
      why = sim.crash;
      break;
    }
    c.update(pf, sim.front(), pc, sim.mid(), sim.t);
    checkCones(sim, c, sim.t);
    if (bot.W) {
      while (qn < bot.iExit.length - 1 && bot.i > bot.iExit[qn]) qn++;
      if (bot.i >= bot.iTurn[qn] && bot.i <= bot.iExit[qn]) {
        const C = qn % 2 ? CONES[0] : CONES[1];
        const d = Math.hypot(sim.x - C[0], sim.y - C[1]);
        const w = bot.W[qn];
        if (w && (w.dn == null || d < w.dn)) w.dn = d;
        const ci = qn % 2 ? 0 : 1;
        if (w && sim.cl && (w.cl == null || sim.cl[ci] < w.cl)) {
          w.cl = sim.cl[ci];
          w.cn = sim.cn[ci];
        }
      }
    }
    if (c.err) {
      end = 'err';
      why = c.err;
      break;
    }
    if (c.started && c.idx < AXIS_EVENTS) {
      const f = sim.front();
      const fx = f[0] + 0.3 * Math.cos(sim.psi);
      const fy = f[1] + 0.3 * Math.sin(sim.psi);
      if (fx <= GATE_X + 0.05 && Math.abs(fy) <= 1.6) {
        end = 'err';
        cause = 'gate';
        why = i18n`Wjazd w bramkę przy niebieskim pachołku.`;
        const w = bot.W && bot.q >= 0 && bot.q < bot.W.length ? bot.W[bot.q] : null;
        const vh = w && w.vT != null ? bot.v[w.iTurn] : 0;
        det =
          w && vh > 0 && w.vT > 1.1 * vh
            ? i18n`Wjazd w bramkę przy niebieskim pachołku. W S ma ok. ${Math.round(w.vT * 3.6)} km/h, a łuk za S pozwala na ok. ${Math.round(vh * 3.6)} km/h, więc hamuje za późno albo za słabo.`
            : i18n`Wjazd w bramkę przy niebieskim pachołku, bo pętla wychodzi za szeroko.`;
        break;
      }
    }
    if (c.done) {
      end = 'done';
      break;
    }
    const [qx, qy] = sim.mid();
    if (qx < WORLD_BOX.x0 + 0.75 || qx > WORLD_BOX.x1 - 0.75 || qy < WORLD_BOX.y0 + 0.75 || qy > WORLD_BOX.y1 - 0.75) {
      end = 'err';
      cause = 'out';
      why = i18n`Wyjazd poza plac.`;
      break;
    }
    if (sim.t > 90) {
      end = 'err';
      cause = 'time';
      why = i18n`Za długo.`;
      break;
    }
    if (bot.i >= bot.n - 3 && sim.v < 0.5) {
      end = 'err';
      cause = 'missed';
      why = i18n`Minął bramkę mety.`;
      break;
    }
    if (keep && ++n % 4 === 0) rec();
  }
  if (keep) rec();
  return { mode: 'plan', end, why, cause, det, course: c, bot, trace, final: end === 'done' ? c.tEnd : null };
}
