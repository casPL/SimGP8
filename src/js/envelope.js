// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Tyre limits per kilogram of mass: the hardest braking and acceleration at a given lateral
// acceleration (the g-g envelope).

// Tyre limits per kilogram of mass, with load transfer and grip share eta. The hardest braking at
// lateral acceleration la: the front gains load as it brakes, while the rear loses load but must still
// carry its share of the side force, so in a lean it is usually the rear that limits braking. sh is
// side force moved onto the front by yaw inertia (see yawLoadShift).
function maxBrakeDecel(S, D, la, eta, sh) {
  const b = S.b;
  const fF = D.fF;
  const hL = b.h / b.L;
  const mu = eta * D.mu;
  const A = mu * hL;
  const B = mu * G * fF;
  const c = sh ? Math.abs(la * fF + sh) : la * fF;
  const disc = A * A * B * B - (1 - A * A) * (c * c - B * B);
  const aF = disc > 0 ? (A * B + Math.sqrt(disc)) / (1 - A * A) : 0;
  const aR = Math.max(0, (eta * G * (1 - fF) - (sh ? Math.abs(la * (1 - fF) - sh) : la * (1 - fF)) / mu) / hL);
  return Math.max(0, Math.min(aF, aR, b.bf));
}
// The hardest acceleration at la: the front, unloaded by drive, must still carry its share of the side
// force; a wheelie and the engine set the other limits.
function maxDriveAccel(S, D, la, eta, v, t, sh) {
  const b = S.b;
  const fF = D.fF;
  const hL = b.h / b.L;
  const mu = eta * D.mu;
  const aF = Math.max(0, (G * fF - (sh ? Math.abs(la * fF + sh) : la * fF) / mu) / hL);
  const A = mu * hL;
  const B = mu * G * (1 - fF);
  const c = sh ? Math.abs(la * (1 - fF) - sh) : la * (1 - fF);
  const disc = A * A * B * B - (1 - A * A) * (c * c - B * B);
  const aR = disc > 0 ? (A * B + Math.sqrt(disc)) / (1 - A * A) : 0;
  return Math.max(0, Math.min(aF, aR, 0.97 * D.wheelie, engineAccel(b, S, v, t)));
}
// Side force moved onto the front by yaw inertia while the lean changes at roll rate om [rad/s], which
// rises from zero and falls back to zero at full lean: ṙ = la′/v + la·a/v², la′ = ω·(g + la²/g),
// sh = Iz·ṙ/(L·m). Leaning in, the front takes more side force, so harder braking is possible.
function yawLoadShift(S, la, v, a, om) {
  const phi = Math.atan(la / G);
  const al = rollAccelOf(S, v);
  const w = Math.min(om, Math.sqrt(Math.max(0, 2 * al * (S.capC - phi))), Math.sqrt(Math.max(0, 2 * al * phi)));
  const vv = Math.max(v, 0.5);
  return (S.Iz * ((w * (G + (la * la) / G)) / vv + (la * Math.abs(a)) / (vv * vv))) / (S.b.L * S.mt);
}
// The g-g envelope with yaw inertia: the hardest braking (brake) or acceleration at la. The shift
// depends on a itself, so the edge is searched from a = 0 upwards.
function gripEnvelope(S, la, v, om, brake, t) {
  const f = (a) =>
    brake
      ? maxBrakeDecel(S, S, la, 1, yawLoadShift(S, la, v, a, om))
      : maxDriveAccel(S, S, la, 1, v, t || 0, -yawLoadShift(S, la, v, a, om));
  const top = brake ? S.b.bf : 0.97 * S.wheelie;
  let lo = 0;
  let hi = null;
  if (f(0) <= 0) return 0;
  for (let a = 1; a <= top + 1; a += 1) {
    if (f(a) < a) {
      hi = a;
      break;
    }
    lo = a;
  }
  if (hi == null) return Math.min(top, f(lo));
  for (let i = 0; i < 8; i++) {
    const m = (lo + hi) / 2;
    if (f(m) >= m) lo = m;
    else hi = m;
  }
  return lo;
}
