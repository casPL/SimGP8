#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Times the simulation core: a coach run, and the coach's plan ridden by the planner (its rider
// rehearses the run first, as in the planner), best of a few rounds. One setup per bike, or every
// setup with --all.
// Usage: node bench.js [--all] [rounds]

const { loadCore } = require('./build.js');

const sim = loadCore(['BIKES', 'makeSetup', 'coachSetup', 'coachPlan', 'planOptions', 'simulateRun']);
const args = process.argv.slice(2);
const rounds = +args.find((a) => /^\d+$/.test(a)) || 3;
const setups = [];
for (const bike of sim.BIKES)
  for (const pos of ['neg', 'neu', 'pos'])
    for (const seat of [-1, 0, 1])
      if (args.includes('--all') || (pos === 'neu' && seat === 0)) setups.push(sim.makeSetup(bike, pos, seat));
const plans = setups.map((S) => sim.planOptions(S, sim.coachPlan(S)));

const best = { coach: Infinity, plan: Infinity };
for (let i = 0; i < rounds; i++) {
  let t = performance.now();
  for (const S of setups) sim.simulateRun(S, sim.coachSetup(S));
  best.coach = Math.min(best.coach, performance.now() - t);
  t = performance.now();
  setups.forEach((S, j) => sim.simulateRun(S, plans[j]));
  best.plan = Math.min(best.plan, performance.now() - t);
}
for (const [k, ms] of Object.entries(best))
  console.log(`${k === 'coach' ? 'coach run  ' : 'planner run'}  ${(ms / setups.length).toFixed(0)} ms`);
