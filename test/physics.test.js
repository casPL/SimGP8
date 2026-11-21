// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Every coach run, and the coach's plan ridden by the planner, must finish with the recorded time
// without touching a cone.
// On the JavaScript engine that recorded them, the times are compared bit for bit, and so is a hash of
// each whole run (every recorded step and the rider's marks), which also catches a change that leaves
// the time alone. Other engines differ in the last bits of some Math functions, which now and then
// tips one of the rider's decisions, so there the times only have to agree within 0.1 s. After a
// deliberate change to the physics, record the new runs with
//   RECORD=1 node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { loadCore } = require('../build.js');

const sim = loadCore(['BIKES', 'makeSetup', 'coachSetup', 'coachRun', 'coachPlan', 'planOptions', 'simulateRun']);
const file = path.join(__dirname, 'runs.json');

// Hash of a recorded run: every value of every step of the trace, the rider's marks, the touches and
// the split times.
function runHash(r) {
  const h = crypto.createHash('sha256');
  const keys = Object.keys(r.trace[0]);
  const row = new Float64Array(keys.length);
  for (const p of r.trace) {
    keys.forEach((k, i) => (row[i] = p[k] == null ? NaN : +p[k]));
    h.update(row);
  }
  h.update(JSON.stringify([r.bot.W, r.course.touches, r.course.splits]));
  return h.digest('hex').slice(0, 16);
}

const runs = {};
const touches = [];
const unlike = [];
for (const bike of sim.BIKES)
  for (const pos of ['neg', 'neu', 'pos'])
    for (const seat of [-1, 0, 1]) {
      const S = sim.makeSetup(bike, pos, seat);
      const setup = `${bike.id} ${pos} ${seat}`;
      const opt = sim.planOptions(S, sim.coachPlan(S));
      const coach = sim.simulateRun(S, sim.coachSetup(S), true);
      const plan = sim.simulateRun(S, opt, true);
      runs[setup] = { coach: coach.final, plan: plan.final, coachHash: runHash(coach), planHash: runHash(plan) };
      if (coach.course.touches.length) touches.push(`${setup} coach`);
      if (plan.course.touches.length) touches.push(`${setup} plan`);
      // The planner and the demo start riders from an earlier rehearsal of the same run.
      if (seat === 0) {
        const coach2 = sim.simulateRun(S, sim.coachSetup(S), true, sim.coachRun(S).bt);
        const plan2 = sim.simulateRun(S, opt, true, plan.bot.rehearsal());
        if (runHash(coach2) !== runs[setup].coachHash) unlike.push(`${setup} coach`);
        if (runHash(plan2) !== runs[setup].planHash) unlike.push(`${setup} plan`);
      }
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

test('every run goes exactly as recorded', { skip: !exact && 'recorded on another engine' }, () => {
  for (const [setup, run] of Object.entries(recorded.runs))
    for (const rider of ['coach', 'plan']) assert.equal(runs[setup][rider + 'Hash'], run[rider + 'Hash'], setup);
});

test('coach runs and their plans touch no cone', () => {
  assert.deepEqual(touches, []);
});

test('a rider that starts from an earlier rehearsal rides the same run', () => {
  assert.deepEqual(unlike, []);
});
