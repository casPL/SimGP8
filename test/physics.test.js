// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Every coach run, and the coach's plan ridden by the planner, must finish with the recorded time.
// The times are compared bit for bit on the JavaScript engine that recorded them. Other engines
// differ in the last bits of some Math functions, which now and then tips one of the rider's
// decisions, so there the times only have to agree within 0.1 s. After a deliberate change to the
// physics, record the new times with
//   RECORD=1 node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCore } = require('../build.js');

const sim = loadCore(['BIKES', 'makeSetup', 'coachSetup', 'coachPlan', 'planOptions', 'simulateRun']);
const file = path.join(__dirname, 'runs.json');

const runs = {};
for (const bike of sim.BIKES)
  for (const pos of ['neg', 'neu', 'pos'])
    for (const seat of [-1, 0, 1]) {
      const S = sim.makeSetup(bike, pos, seat);
      const coach = sim.simulateRun(S, sim.coachSetup(S));
      const plan = sim.simulateRun(S, sim.planOptions(S, sim.coachPlan(S)));
      runs[`${bike.id} ${pos} ${seat}`] = { coach: coach.final, plan: plan.final };
    }

if (process.env.RECORD) fs.writeFileSync(file, JSON.stringify({ engine: process.versions.v8, runs }, null, 1) + '\n');
const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
const exact = recorded.engine === process.versions.v8;
const agree = (a, b) => (exact ? a === b : Math.abs(a - b) <= 0.1);

for (const rider of ['coach', 'plan'])
  test(`${rider === 'coach' ? 'coach runs' : "the coach's plan in the planner"} finish with the recorded times`, () => {
    for (const [setup, run] of Object.entries(recorded.runs)) {
      const time = runs[setup][rider];
      assert.ok(agree(time, run[rider]), `${setup}: ${time} s, recorded ${run[rider]} s`);
    }
  });
