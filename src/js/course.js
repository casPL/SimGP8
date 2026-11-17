// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Course rules and timing: start through the gate, the cone axis crossed in order and on the
// right side, five figure eights, finish through the gate and a stop in the box behind it.

const CONE_NAME = { N: i18n`Niebieski pachołek (bliższy)`, F: i18n`Czerwony pachołek (dalszy)` };
class Course {
  constructor() {
    this.started = false;
    this.t0 = 0;
    this.idx = 0;
    this.cross = [];
    this.splits = [];
    this.touches = [];
    this.near = [false, false];
    this.passedN = false;
    this.done = false;
    this.stopped = false;
    this.err = null;
    this.dsq = false;
    this.tEnd = null;
  }
  exp(i) {
    const r = i % 4;
    return r === 0 || r === 2 ? ['M', 1] : r === 1 ? ['F', -1] : ['N', -1];
  }
  rt(t) {
    return this.started ? t - this.t0 : 0;
  }
  update(pf, f, pc, c, t) {
    if (!this.started) {
      if (pf[0] < GATE_X && f[0] >= GATE_X) {
        const u = (GATE_X - pf[0]) / (f[0] - pf[0]);
        const y = pf[1] + (f[1] - pf[1]) * u;
        if (Math.abs(y) > 1.08) {
          this.err = i18n`Start obok bramki. Ruszaj z boxu prosto przez bramkę.`;
          return;
        }
        this.started = true;
        this.t0 = t - DT * (1 - u);
      }
      return;
    }
    if (this.done) return;
    if (!this.passedN && pc[0] < -CONE_X && c[0] >= -CONE_X) {
      const u = (-CONE_X - pc[0]) / (c[0] - pc[0]);
      const y = pc[1] + (c[1] - pc[1]) * u;
      this.passedN = true;
      if (y > 0) {
        this.dsq = true;
        this.err = i18n`Niebieski pachołek minięty po złej stronie. Ze startu masz go mieć po lewej ręce, a czerwony po prawej.`;
        return;
      }
    }
    if (pc[1] < 0 !== c[1] < 0) {
      const u = pc[1] / (pc[1] - c[1]);
      const xx = pc[0] + (c[0] - pc[0]) * u;
      const dir = c[1] > pc[1] ? 1 : -1;
      const reg = xx < -CONE_X ? 'N' : xx > CONE_X ? 'F' : 'M';
      const tt = t - DT * (1 - u) - this.t0;
      if (this.idx >= AXIS_EVENTS) {
        if (reg !== 'N') {
          this.err = i18n`Błąd trasy przed metą: po piątej ósemce jedź prosto do bramki.`;
          return;
        }
      } else {
        if (this.idx === 0) {
          if (reg === 'N' || (reg === 'M' && dir !== 1)) return;
          if (reg === 'F') this.idx = 1;
        } else if (this.idx === 1 && reg === 'M') {
          if (dir === 1) this.cross[0].t = tt;
          return;
        }
        const [er, ed] = this.exp(this.idx);
        if (reg !== er) {
          this.err =
            er === 'M'
              ? i18n`Druga pętla wokół tego samego pachołka zamiast przejazdu do drugiego.`
              : i18n`${CONE_NAME[er]} ominięty: ósemkę przeciąłeś, zanim go objechałeś.`;
          return;
        }
        if (dir !== ed) {
          if (er !== 'M') this.dsq = true;
          this.err =
            er === 'M'
              ? i18n`Ósemka przecięta w złą stronę.`
              : i18n`${CONE_NAME[er]} objechany w złą stronę. Niebieski masz zawsze po lewej ręce, czerwony po prawej.`;
          return;
        }
        this.cross.push({ t: tt, reg });
        if (reg === 'N') this.splits.push(tt);
        this.idx++;
      }
    }
    if (this.idx >= AXIS_EVENTS && pf[0] > GATE_X && f[0] <= GATE_X) {
      const u = (pf[0] - GATE_X) / (pf[0] - f[0]);
      const y = pf[1] + (f[1] - pf[1]) * u;
      if (Math.abs(y) > 1.15) return;
      this.tEnd = t - DT * (1 - u) - this.t0;
      this.splits.push(this.tEnd);
      this.done = true;
    }
  }
  // The time is taken at the line, but the run is complete only once the bike stands with the front
  // wheel f still inside the box (sideways with the same tolerance as at the line).
  stopIn(f, v) {
    if (f[0] < GATE_X - BOX_LEN || Math.abs(f[1]) > 1.15) {
      this.err = i18n`Nie zatrzymał się w boxie za metą: przednie koło wyjechało z boxu, zanim motocykl stanął.`;
      this.done = false;
      this.tEnd = null;
      this.splits.pop();
    } else if (v < 0.01) this.stopped = true;
  }
}
// Gap from the outline to each cone (sim.cl, closest part sim.cn) and touches.
function checkCones(sim, course, t) {
  if (!course.started) return null;
  const S = sim.S;
  const ux = Math.cos(sim.psi);
  const uy = Math.sin(sim.psi);
  let hit = null;
  let pts = null;
  if (!sim.cl) {
    sim.cl = [9, 9];
    sim.cn = ['', ''];
  }
  for (let c = 0; c < 2; c++) {
    const rx = CONES[c][0] - sim.x;
    const ry = CONES[c][1] - sim.y;
    const along = rx * ux + ry * uy;
    const lat = -rx * uy + ry * ux;
    let h = false;
    if (along > -1.2 && along < S.b.L + 1.2 && Math.abs(lat) < 1.8) {
      pts =
        pts || outlinePoints(S, Math.sign(sim.phi) * bikeLean(sim.D || S, Math.abs(sim.phi)), (sim.st || 0) * S.cosR);
      const q = outlineClearance(pts, sim.x, sim.y, sim.psi, CONES[c]);
      sim.cl[c] = q.c;
      sim.cn[c] = q.n;
      h = q.c < 0;
    } else sim.cl[c] = 9;
    if (h && !course.near[c]) {
      course.near[c] = true;
      course.touches.push({ t: course.rt(t), c });
      hit = c;
    }
    if (Math.hypot(rx, ry) > 2.6) course.near[c] = false;
  }
  return hit;
}
