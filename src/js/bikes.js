// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The bikes, and the rider's body positions and seat positions.

// Bike data (the rider, 80 kg, is added in makeSetup):
//   m        mass [kg]
//   P        power [kW]; P2 after the first Pt seconds (the Ultra Bee gives 21 kW for 10 s, then 18 kW)
//   aT       acceleration limited by torque in a low gear [m/s²]
//   b0, vb   share of aT available from a standstill, rising to all of it at vb [m/s]
//   eb       engine braking [m/s²]
//   L        wheelbase [m]; lock: steering lock [°]; rake: steering head angle [°]
//   h        height of the centre of mass with the rider [m]; ff: share of the weight on the front wheel
//   clear    lean at which the bike touches down [°]; mu: tyre grip (friction coefficient)
//   bf, br   the hardest deceleration from the front and the rear brake [m/s²]
//   roll     the highest roll rate [°/s]
//   ft, fd   fork travel, and fork dive under 1 g of front braking [mm]; fz: dive frequency [Hz]
//   rw       front wheel radius [m]; trail [m]
//   rt, rd   rear wheel travel, and rear extension at 1 g [mm]
//   rr, hp   loaded rear tyre radius, and swingarm pivot height at static sag [m]; ls: swingarm length [m]
//   rf, rs   front and rear sprocket pitch radius [m]; xf, yf: front sprocket ahead of and above the pivot [m]
// prettier-ignore
const BIKES = [
  {
    id: 'ebike', name: 'Sur-Ron SM 17"', sub: 'Ultra Bee, 21/18 kW', tyre: 'supermoto 17"',
    m: 85,  P: 21,  P2: 18, Pt: 10, aT: 8.4, b0: 1.0,  vb: 1, eb: 0.3,
    L: 1.38,  lock: 45, rake: 26, h: 0.72, ff: 0.48, clear: 58, mu: 1.18,
    bf: 10,  br: 3.0, roll: 300,
    ft: 240, fd: 120, fz: 1.8, rw: 0.296, trail: 0.1,
    rt: 240, rd: 50, rr: 0.3,   hp: 0.42, ls: 0.57,  rf: 0.0285, rs: 0.115,  xf: 0.06, yf: 0.01,
  },
  {
    id: 'pit', name: 'Pitbike SM 12"', sub: i18n`ok. 150–190 cm³`, tyre: 'supermoto 12"',
    m: 72,  P: 11,                  aT: 7.5, b0: 0.75, vb: 4, eb: 0.8,
    L: 1.17,  lock: 45, rake: 26, h: 0.72, ff: 0.47, clear: 62, mu: 1.4,
    bf: 8.5, br: 2.8, roll: 330,
    ft: 130, fd: 75,  fz: 2.2, rw: 0.242, trail: 0.07,
    rt: 120, rd: 35, rr: 0.243, hp: 0.33, ls: 0.46,  rf: 0.0285, rs: 0.079,  xf: 0.07, yf: 0,
  },
  {
    id: 'sm', name: 'Supermoto 450', sub: i18n`klasa Honda CRF450 z kołami SM`, tyre: i18n`supermoto, miękkie`,
    m: 118, P: 40,                  aT: 8.5, b0: 0.8,  vb: 4, eb: 1.2,
    L: 1.49,  lock: 38, rake: 26, h: 0.95, ff: 0.46, clear: 59, mu: 1.35,
    bf: 10,  br: 3.0, roll: 170,
    ft: 270, fd: 135, fz: 1.8, rw: 0.3,   trail: 0.11,
    rt: 290, rd: 55, rr: 0.3,   hp: 0.45, ls: 0.585, rf: 0.0357, rs: 0.121,  xf: 0.05, yf: 0,
  },
  {
    id: 'cbr', name: 'CBR600', sub: i18n`sport 600, słaby dół, szlifowane odboje`, tyre: i18n`sportowe`,
    m: 195, P: 85,                  aT: 8.0, b0: 0.4,  vb: 8, eb: 0.8,
    L: 1.375, lock: 35, rake: 24, h: 0.76, ff: 0.52, clear: 50, mu: 1.2,
    bf: 10,  br: 2.8, roll: 130,
    ft: 120, fd: 65,  fz: 2.4, rw: 0.3,   trail: 0.098,
    rt: 130, rd: 30, rr: 0.308, hp: 0.44, ls: 0.58,  rf: 0.0407, rs: 0.106,  xf: 0.08, yf: -0.01,
  },
  {
    id: 'gsxr', name: 'GSX-R 1000', sub: i18n`sport 1000, mocny dół, szlifowane odboje`, tyre: i18n`sportowe`,
    m: 203, P: 140,                 aT: 8.5, b0: 0.7,  vb: 6, eb: 1.0,
    L: 1.42,  lock: 35, rake: 24, h: 0.78, ff: 0.51, clear: 50, mu: 1.2,
    bf: 10,  br: 2.8, roll: 120,
    ft: 120, fd: 62,  fz: 2.4, rw: 0.3,   trail: 0.099,
    rt: 130, rd: 30, rr: 0.304, hp: 0.43, ls: 0.58,  rf: 0.0432, rs: 0.1087, xf: 0.08, yf: -0.01,
  },
];
// Body positions. delta: the rider's lean relative to the bike [°] (negative: body inside the
// turn, bike more upright); roll scales the roll rate; off: sideways shift of the rider's body [m].
const STANCE = {
  pos: { name: i18n`pozytywna`, loc: i18n`pozytywnej`, delta: -7, roll: 0.75, off: 0.3 },
  neu: { name: i18n`neutralna`, loc: i18n`neutralnej`, delta: 0, roll: 1, off: 0.06 },
  neg: { name: i18n`negatywna`, loc: i18n`negatywnej`, delta: 10, roll: 1.25, off: -0.18 },
};
const STANCE_NOTE = {
  pos: i18n`Ciało do środka łuku. Motocykl bardziej wyprostowany: więcej prześwitu, ale szerszy pełny skręt i wolniejsze przekładanie.`,
  neu: i18n`Ciało w osi motocykla, zalecane na GP8. Punkt odniesienia.`,
  neg: i18n`Ciało nad motocyklem, motocykl złożony pod Tobą (styl enduro). Ciaśniejszy pełny skręt i szybkie przekładanie, ale wcześniej kończy się prześwit.`,
};
const SEAT_NOTE = {
  '-1': i18n`Z tyłu: później podnosi się tylne koło przy hamowaniu, ale łatwiej o wheelie na gazie i lżejszy przód w skręcie.`,
  0: i18n`Środek siedzenia. Punkt odniesienia.`,
  1: i18n`Z przodu: dociążony przód lepiej skręca i trzyma, później wheelie, ale wcześniej stoppie.`,
};
