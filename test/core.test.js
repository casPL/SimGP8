// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The fast paths of the simulation core give exactly what the plain formulas give.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('../build.js');

const core = loadCore([
  'G',
  'TAN_MAX',
  'BIKES',
  'makeSetup',
  'liveGeometry',
  'bikeLean',
  'lockTan',
  'steerForCurvature',
  'fullLockLimit',
  'hypot2',
  'outlinePoints',
  'outlineClearance',
]);
const { G, TAN_MAX } = core;

// A seeded generator, so that every run of the tests checks the same cases.
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const setups = [];
for (const bike of core.BIKES)
  for (const pos of ['neg', 'neu', 'pos']) for (const seat of [-1, 0, 1]) setups.push(core.makeSetup(bike, pos, seat));
// A live geometry anywhere in the suspension travel.
const geometryOf = (S, r) => core.liveGeometry(S, r() * S.ft, r() * S.rt);

test('hypot2 is Math.hypot to the last bit', () => {
  const r = random(1);
  const x = () => (r() < 0.05 ? 0 : (r() - 0.5) * 10 ** (r() * 12 - 6));
  const off = [];
  for (let i = 0; i < 1e6; i++) {
    const a = x();
    const b = x();
    if (!Object.is(core.hypot2(a, b), Math.hypot(a, b))) off.push([a, b]);
  }
  assert.deepEqual(off.slice(0, 5), []);
});

test('steering with worked-out sines and cosines follows the formula', () => {
  // tan Δ = cos e·sin d / (cos d·cos p − sin e·sin d·sin p), capped at 80°
  const tanDelta = (d, p, e) => {
    const n = Math.cos(e) * Math.sin(d);
    const q = Math.cos(d) * Math.cos(p) - Math.sin(e) * Math.sin(d) * Math.sin(p);
    return q > Math.abs(n) / TAN_MAX ? n / q : Math.sign(n) * TAN_MAX;
  };
  const steer = (T, p, e) => Math.atan((T * Math.cos(p)) / (Math.cos(e) + T * Math.sin(e) * Math.sin(p)));
  const r = random(2);
  for (const S of setups)
    for (let i = 0; i < 2000; i++) {
      const g = geometryOf(S, r);
      const p = (r() - 0.3) * 1.6;
      const T = r() * 3;
      assert.equal(core.lockTan(S, p, g), tanDelta(S.lockEff, p, g.eps));
      assert.equal(core.lockTan(S, p, S), tanDelta(S.lockEff, p, S.eps0));
      assert.equal(core.steerForCurvature(T, p, g), steer(T, p, g.eps));
      assert.equal(core.steerForCurvature(T, p, S), steer(T, p, S.eps0));
    }
});

test('the full-lock limit is the one a full search finds', () => {
  // The search in full: every step of 0.02 rad up to the first lean at which balance needs full lock,
  // then bisection.
  const fullSearch = (S, v, g) => {
    const f = (p) => {
      const kL = Math.min(core.lockTan(S, core.bikeLean(S, p), g) / g.L, 0.5 / Math.max(1e-6, S.b.h * Math.sin(p)));
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
  };
  const r = random(3);
  for (const S of setups)
    for (let i = 0; i < 300; i++) {
      const v = r() < 0.05 ? 0 : r() * 16;
      const g = geometryOf(S, r);
      const lim = fullSearch(S, v, g);
      for (const a of [r() * 1.5, lim, lim * (1 + 1e-12), lim - 1e-9, 0.02 * Math.floor(r() * 70)])
        assert.equal(core.fullLockLimit(S, v, g, a), a > lim ? lim : null, `${S.b.id} v ${v} a ${a}`);
    }
});

test('a cone under the bike is a touch of the wheels', () => {
  for (const S of setups) {
    const q = core.outlineClearance(core.outlinePoints(S, 0, 0), 0, 0, 0, [S.b.L / 2, 0]);
    assert.ok(q.c < 0, S.b.id);
    assert.equal(q.n, 'koła');
  }
});
