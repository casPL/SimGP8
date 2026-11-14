// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Constants shared by the whole simulator. SI units (m, s, kg, rad) unless a name says otherwise.
// Course frame: x runs along the line through the cones, from the start box towards the far cone,
// and y points to the rider's left at the start.

const G = 9.81;
const RIDER_MASS = 80;
const DT = 1 / 240; // simulation step [s]
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Moves c towards t by at most up (when rising) or dn (when falling).
const slew = (c, t, up, dn) => (t > c ? Math.min(t, c + up) : Math.max(t, c - dn));
const CONE_X = 6; // the cones stand at x = ∓CONE_X: blue (near) and red (far) [m]
const CONES = [
  [-CONE_X, 0],
  [CONE_X, 0],
];
const GATE_X = -CONE_X - 3; // start and finish line, 3 m behind the near cone [m]
const BOX_LEN = 3;
const EIGHTS = 5; // figure eights in a run
const AXIS_EVENTS = EIGHTS * 4 - 1; // crossings of the cone axis before the finish
const WORLD_BOX = { x0: -13, x1: 10.6, y0: -5.6, y1: 5.6 }; // the course [m]; leaving it ends the run
