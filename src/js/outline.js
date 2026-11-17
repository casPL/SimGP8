// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The outline of the bike with its rider, used to measure the gap to a cone.

const CONE_SHAPE = { H: 0.4, r0: 0.09, r1: 0.012 }; // height H, radius r0 at the ground and r1 at the top [m]
// Outline of each bike with its rider [m]: hb handlebar height, hw half the handlebar width with the
// levers, db handlebar behind the front axle, hs seat height, wr half the width of the tail, z0–z1 the
// tail from the rear axle, zp/yp/wp the footpeg with the boot (along, height, sideways); ta: in the
// lean-out position the tail reaches out as if leaned ta [°] less.
const OUTLINE = {
  ebike: { hb: 1.08, hw: 0.39, db: 0.28, hs: 0.88, wr: 0.11, z0: -0.25, z1: 0.45, zp: 0.45, yp: 0.4, wp: 0.21, ta: 10 },
  pit: { hb: 0.92, hw: 0.36, db: 0.24, hs: 0.8, wr: 0.11, z0: -0.2, z1: 0.4, zp: 0.4, yp: 0.33, wp: 0.19, ta: 10 },
  sm: { hb: 1.1, hw: 0.4, db: 0.3, hs: 0.94, wr: 0.11, z0: -0.25, z1: 0.5, zp: 0.5, yp: 0.42, wp: 0.21, ta: 10 },
  cbr: { hb: 0.86, hw: 0.34, db: 0.35, hs: 0.82, wr: 0.12, z0: -0.3, z1: 0.45, zp: 0.5, yp: 0.4, wp: 0.18 },
  gsxr: { hb: 0.85, hw: 0.34, db: 0.36, hs: 0.81, wr: 0.12, z0: -0.3, z1: 0.45, zp: 0.52, yp: 0.4, wp: 0.18 },
};
// The knee on the inside of the turn: kx sideways, ky height (share of hs); the elbow: ex beyond the
// handlebar end (null: it does not stick out).
const OUTLINE_STANCE = {
  pos: { kx: 0.42, ky: 0.66, ex: 0.1 },
  neu: { kx: 0.22, ky: 0.76, ex: 0.03 },
  neg: { kx: 0.14, ky: 0.78, ex: null },
};
const coneRadius = (z) =>
  z <= 0
    ? CONE_SHAPE.r0
    : z >= CONE_SHAPE.H
      ? CONE_SHAPE.r1
      : CONE_SHAPE.r0 + ((CONE_SHAPE.r1 - CONE_SHAPE.r0) * z) / CONE_SHAPE.H;
const stanceOf = (S) => (S.rel0 > 0 ? 'pos' : S.rel0 < 0 ? 'neg' : 'neu');
// Outline at bike lean phb and steer angle d in the ground plane (both + to the left): each part has
// z (or a span z0–z1) along the bike from the rear contact patch, lat sideways (+ left), Z height and
// r radius [m]. The handlebar ends count at any height, since they cannot pass over a cone; the other
// parts only below the tip of the cone.
function outlinePoints(S, phb, d) {
  const b = S.b;
  const o = OUTLINE[b.id] || OUTLINE.ebike;
  const P = OUTLINE_STANCE[stanceOf(S)];
  const zb = b.L - o.db;
  const sg = Math.sign(phb) || 1;
  const a = Math.abs(phb);
  const sp = Math.sin(phb);
  const cp = Math.cos(phb);
  const out = [];
  const pt = (n, z, xb, y, r, all) =>
    out.push({ n, z0: z, z1: z, lat: y * sp + xb * cp, Z: y * cp - xb * sp, r, all: !!all });
  for (const s of [1, -1]) {
    const inner = s === sg || a < 2 * RAD;
    pt(i18n`kierownica`, zb - s * o.hw * Math.sin(d), s * o.hw * Math.cos(d), o.hb, 0.035, true);
    if (inner) {
      const at = o.ta && S.rel0 < 0 ? Math.max(0, a - o.ta * RAD) : a;
      const Zs = clamp(o.hs * Math.cos(at) - o.wr * Math.sin(at), 0, CONE_SHAPE.H);
      out.push({
        n: i18n`tył motocykla`,
        z0: o.z0,
        z1: o.z1,
        lat: s * (Zs * Math.tan(at) + o.wr / Math.cos(at)),
        Z: Zs,
        r: 0.02,
        all: false,
      });
    } else
      out.push({
        n: i18n`tył motocykla`,
        z0: o.z0,
        z1: o.z1,
        lat: 0.3 * sp + s * o.wr * cp,
        Z: 0.3 * cp - s * o.wr * sp,
        r: 0.02,
        all: false,
      });
    pt(i18n`podnóżek`, o.zp, s * o.wp, o.yp, 0.04);
    pt(i18n`kolano`, 0.6 * b.L, s * (inner ? P.kx : 0.14), P.ky * o.hs, 0.06);
    if (inner && P.ex != null)
      pt(i18n`łokieć`, zb - s * o.hw * Math.sin(d) - 0.22, s * (o.hw * Math.cos(d) + P.ex), o.hb - 0.06, 0.05);
  }
  return out;
}
const canTouchCone = (p) => p.all || p.Z <= CONE_SHAPE.H;
const touchRadius = (p) => p.r + coneRadius(Math.min(p.Z, CONE_SHAPE.H));
// Gap between the outline (points pts, rear contact at x, y, heading psi) and cone C [m], negative for
// a touch, and the closest part.
function outlineClearance(pts, x, y, psi, C) {
  const ux = Math.cos(psi);
  const uy = Math.sin(psi);
  const rx = C[0] - x;
  const ry = C[1] - y;
  const al = rx * ux + ry * uy;
  const la = -rx * uy + ry * ux;
  let c = 9;
  let n = '';
  for (const p of pts) {
    if (!canTouchCone(p)) continue;
    const dz = Math.max(p.z0 - al, 0, al - p.z1);
    const q = Math.hypot(dz, la - p.lat) - touchRadius(p);
    if (q < c) {
      c = q;
      n = p.n;
    }
  }
  return { c, n };
}
