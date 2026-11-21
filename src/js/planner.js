// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Planner state: plans saved per bike and setup, their limits, and defaults from the coach.

const PLANS_KEY = 'simgp8.plans';
const SEGS_HINT = $('segs').innerHTML;
const planner = {
  on: false,
  key: null,
  A: null,
  B: null,
  good: null,
  def: null,
  lim: null,
  res: null,
  busy: false,
  prev: null,
  prevKey: null,
  lastRide: null,
  lastPlan: null,
  drag: null,
  fc: new Map(),
  reh: new Map(),
  sc: new Map(),
  defs: {},
};
const DIFF_HINT = i18n`zawodnik minus trener (plus: zawodnik wolniejszy)`;
const RIDER_NAME = { A: i18n`zawodnik`, B: i18n`trener` };
const RIDER_NAME_CAP = { A: i18n`Zawodnik`, B: i18n`Trener` };
const riderColor = (v) => (v === 'A' ? COL.chalk : COL.ok);
const riderCssVar = (v) => (v === 'A' ? '--chalk' : '--ok');
const MARK = { brake: i18n`H`, turn: i18n`S`, gas: i18n`G` };
const PLAN_FIELDS = [
  { k: 'brake', lab: i18n`H · hamowanie`, step: 0.1, main: 1 },
  { k: 'turn', lab: i18n`S · składanie`, step: 0.1, main: 1 },
  { k: 'side', lab: i18n`S · w bok`, step: 0.1, main: 1 },
  { k: 'gas', lab: i18n`G · gaz`, step: 5, main: 1 },
  { k: 'force', lab: i18n`Siła hamowania`, step: 0.05, hide: 1 },
  { k: 'open', lab: i18n`Odkręcenie gazu do pełna`, step: 0.05, hide: 1 },
  { k: 'gap', lab: i18n`Zapas od pachołka`, step: 0.005, hide: 1 },
];
const PLAN_INTRO =
  '<li class="info"><span>' +
  i18n`Wirtualny zawodnik i trener startują razem z bramki. Zawodnik jedzie według planu: do H gaz, od H przedni hamulec, w S zaczyna składać motocykl, w G gaz. Punkt S przesuwasz bliżej i dalej oraz szerzej i węziej. Trener jedzie tym samym motocyklem, w tej samej pozycji ciała i w tym samym miejscu na siedzeniu, tak jak w pokazie trenera. Zawodnik planera to prostszy kierowca niż trener: składa się i odkręca w punktach planu i jedzie na granicy złożenia, a trener zostawia sobie zapas. Dlatego nawet z punktami trenera zawodnik bywa od niego szybszy albo wolniejszy. Nitka wychodzi z fizyki: od S zawodnik składa się tak szybko i mocno, jak pozwala motocykl i prędkość, ale tak, żeby koła, kierownica, tył motocykla, podnóżek, kolano i łokieć minęły pachołek o zapas. Zawodnik i trener jadą bez błędów, więc ten sam plan daje zawsze ten sam wynik. Obaj hamują w złożeniu: składając się, oddają przód, a tył od razu przejmuje hamowanie, najpierw mocno, potem coraz mniej, i trzymają go jeszcze chwilę po wejściu na gaz. Siła hamowania, odkręcanie gazu i zapas od pachołka są ustalone dla motocykla, pozycji i miejsca na siedzeniu.` +
  '</span></li>';
const DEMO_INTRO =
  '<li class="info"><span>' +
  i18n`Obejrzyj pokaz trenera. Po przejeździe raport porówna jego pętle z wzorcem faz A–H.` +
  '</span></li>';
const PLAN_STATUS = i18n`<b>Planer.</b> Wybierz pozycję ciała i miejsce na siedzeniu zawodnika, przeciągnij przy czerwonym pachołku punkty <b>H</b> (hamowanie), <b>S</b> (początek składania, także w bok) i <b>G</b> (gaz), potem <b>▶ Porównaj</b> albo Enter: zawodnik pojedzie razem z trenerem.`;
const DEMO_STATUS = i18n`<b>Pokaz trenera.</b> Naciśnij <b>▶ Pokaz</b> albo Enter: automatyczny kierowca przejedzie GP8 według wzorca faz A–H.`;
const TELE_NOTE_PLAN = i18n`<b>Wykres.</b> Biała linia to zawodnik, zielona to trener: prędkość, złożenie i przeciążenie wzdłużne (w górę gaz, w dół hamowanie). Grubo na złożeniu: <b>przeciwskręt</b>, czyli chwila, w której kierownica jest skręcona na zewnątrz łuku, żeby motocykl zaczął się składać (w pętli najlepiej widać go po wybraniu pętli i w tempie ¼×). Grubo na przeciążeniu: hamowanie przodem w złożeniu, czyli <b>trail braking</b>. W wybranej pętli obaj są wyrównani do jej początku, a litery H, S i G pokazują, gdzie każdy zaczął hamować, skręcać i odkręcać gaz. Podczas odtwarzania wykres przechodzi do pętli, którą jedzie zawodnik. Nad wykresem przy każdej pętli różnica czasu: zawodnik minus trener (plus: zawodnik wolniejszy).`;
const TELE_NOTE_DEMO = i18n`<b>Wykres.</b> Tło dzieli pętlę na fazy: S1 wejście (A–C), S2 obrót na pełnym skręcie (D), S3 wyjście, przełożenie i dohamowanie (E–H). Szeroka blada linia to wzorzec. Najedź na wykres albo odtwórz przejazd pod placem, żeby zobaczyć to miejsce na placu.`;
const planKey = () => state.bike;
const SEATS = [-1, 0, 1];
const SEAT_SHORT = { '-1': i18n`z tyłu`, 0: i18n`na środku`, 1: i18n`z przodu` };
const SEAT_WHERE = { '-1': i18n`z tyłu siedzenia`, 0: i18n`na środku siedzenia`, 1: i18n`z przodu siedzenia` };
function planSetup(pl) {
  const pos = pl && STANCE[pl.pos] ? pl.pos : 'neu';
  const seat = pl && SEATS.includes(pl.seat) ? pl.seat : 0;
  const k = state.bike + '|' + pos + '|' + seat;
  let s = planner.sc.get(k);
  if (!s) {
    s = makeSetup(bikeById(state.bike), pos, seat);
    planner.sc.set(k, s);
  }
  return s;
}
function loadPlans() {
  try {
    const o = JSON.parse(localStorage.getItem(PLANS_KEY));
    if (o && typeof o === 'object') return o;
  } catch (e) {}
  return {};
}
function savePlan() {
  try {
    const o = loadPlans();
    o[planner.key] = { A: planner.good || planner.A };
    localStorage.setItem(PLANS_KEY, JSON.stringify(o));
  } catch (e) {}
}
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const roundGap = (x) => Math.round(x * 200) / 200;
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function planRange(k) {
  const L = planner.lim;
  return k === 'brake'
    ? [L.bMin, L.bMax]
    : k === 'force'
      ? [L.fMin, L.fMax]
      : k === 'gap'
        ? [L.gMin, L.gMax]
        : k === 'gas'
          ? [L.aMin, L.aMax]
          : k === 'open'
            ? [L.oMin, L.oMax]
            : k === 'side'
              ? [L.sMin, L.sMax]
              : [L.tMin, L.tMax];
}
function planClamp(p) {
  const L = planner.lim;
  const q = {};
  for (const f of PLAN_FIELDS) {
    const x = +p[f.k];
    q[f.k] = isFinite(x) ? x : planner.def[f.k];
  }
  q.pos = STANCE[p.pos] ? p.pos : (planner.def && planner.def.pos) || 'neu';
  q.seat = p.seat != null && SEATS.includes(+p.seat) ? +p.seat : 0;
  q.gap = roundGap(clamp(q.gap, L.gMin, L.gMax));
  q.force = round2(clamp(q.force, L.fMin, L.fMax));
  q.turn = round1(clamp(q.turn, L.tMin, L.tMax));
  q.side = round1(clamp(q.side, L.sMin, L.sMax));
  q.brake = round1(clamp(q.brake, L.bMin, L.bMax));
  q.gas = Math.round(clamp(q.gas, L.aMin, L.aMax) / 5) * 5;
  q.open = Math.round(clamp(q.open, L.oMin, L.oMax) * 20) / 20;
  return q;
}
const PLAN_MAX_TIME = 33;
// What the run of plan pl depends on: the bike, body position and seat, and the four points the way
// planOptions reads them (a missing point is the coach's).
function planRunKey(pl) {
  const s = planSetup(pl);
  const n = (x) => (x != null && isFinite(x) ? +x : 'c');
  return [s.b.id, stanceOf(s), s.seat0, n(pl.brake), n(pl.turn), n(pl.side), n(pl.gas)].join('|');
}
// The rehearsals of the last plans ridden, for the preview and the comparison.
function keepRehearsal(k, bot) {
  planner.reh.delete(k);
  planner.reh.set(k, bot.rehearsal());
  if (planner.reh.size > 8) planner.reh.delete(planner.reh.keys().next().value);
}
// A rider for plan pl with its run rehearsed.
function planRider(pl) {
  const s = planSetup(pl);
  const k = planRunKey(pl);
  const bt = new AutoRider(s, planOptions(s, pl), planner.reh.get(k));
  if (!planner.reh.has(k)) keepRehearsal(k, bt);
  return bt;
}
// Why plan pl does not work (null if it does).
function planProblem(pl) {
  const k = planRunKey(pl);
  if (planner.fc.has(k)) return planner.fc.get(k);
  const s = planSetup(pl);
  const r = simulateRun(s, planOptions(s, pl), false, planner.reh.get(k));
  keepRehearsal(k, r.bot);
  const nt = r.course && r.course.touches ? r.course.touches.length : 0;
  const why =
    r.end !== 'done'
      ? r.det || r.why || i18n`nie dojeżdża do mety.`
      : nt
        ? i18n`Zawodnik dotknąłby pachołka.`
        : !(r.final <= PLAN_MAX_TIME)
          ? i18n`Przejazd trwałby ${fmtNum(r.final, 2)} s, a planer przyjmuje najwyżej ${PLAN_MAX_TIME} s.`
          : null;
  if (planner.fc.size > 600) planner.fc.clear();
  planner.fc.set(k, why);
  return why;
}
function initPlanner() {
  const key = planKey();
  if (planner.key === key && planner.A) return;
  planner.key = key;
  planner.res = null;
  planner.prev = null;
  planner.prevKey = null;
  planner.defs = {};
  const raw = rawDefaultPlan('neu', 0);
  planner.def = raw;
  const bt = planRider(raw);
  planner.lim = {
    bMin: 0.5,
    bMax: Math.floor(bt.ahead(2, bt.iExit[1]) * 10) / 10,
    tMin: -1,
    tMax: 4,
    sMin: 0.3,
    sMax: 2.5,
    fMin: 0.3,
    fMax: 1,
    gMin: 0.005,
    gMax: 0.4,
    aMin: 0,
    aMax: Math.min(150, Math.floor((bt.rotLeft[bt.iTurn[2]] * DEG) / 5) * 5),
    oMin: 0.15,
    oMax: 1,
  };
  planner.def = planClamp(raw);
  planner.defs['neu@0'] = planner.def;
  const st = loadPlans();
  const sv = st[key];

  const pick = (...c) => {
    for (const p of c) if (p && !planProblem(p)) return p;
    return null;
  };
  planner.A = pick(sv && sv.A ? planClamp(sv.A) : null, planner.def) || planner.def;
  planner.B = coachPlanFor(planner.A);
  planner.good = { ...planner.A };
}
const DEFAULT_SHIFT = {
  sm: {
    'neg@-1': { dB: 0.4, dT: -0.1 },
    'pos@-1': { dB: 0.2, dT: 0.2 },
    'neg@0': { dB: 0.2, dT: 0.1 },
    'neu@0': { dB: 0.8, dT: -0.2 },
    'pos@0': { dB: 0.4 },
    'neg@1': { dB: 0.8, dT: -0.2 },
    'neu@1': { dB: 0, dT: 0.2 },
    'pos@1': { dB: 0.6, dT: -0.1 },
  },
  cbr: { 'pos@-1': { dB: 0.2, dT: 0.2 }, 'pos@0': { dB: -0.4, dT: 0.2 }, 'neu@1': { dB: 0, dT: -0.1 } },
  gsxr: {
    'pos@-1': { dB: 0, dT: 0.2 },
    'pos@0': { dB: -0.2, dT: 0.2 },
    'neu@1': { dB: 0, dT: 0.2 },
    'pos@1': { dB: -0.2, dT: 0.2 },
  },
};
function rawDefaultPlan(pos, seat) {
  seat = SEATS.includes(seat) ? seat : 0;
  const s = planSetup({ pos, seat });
  const c = { ...coachPlan(s), pos, seat };
  const t = (DEFAULT_SHIFT[state.bike] || {})[pos + '@' + seat];
  const d0 = t ? { ...c, brake: round1(c.brake + t.dB), turn: round1(c.turn + (t.dT || 0)) } : c;
  for (let j = 0; j <= 10; j++) {
    const d = { ...d0, brake: round1(d0.brake + 0.2 * j) };
    if (!planProblem(d)) return d;
  }
  return c;
}
function coachPlanFor(pl) {
  const s = planSetup(pl);
  const c = coachPlan(s);
  return { ...c, pos: pl.pos, seat: pl.seat };
}
function defaultPlan(pos, seat) {
  seat = SEATS.includes(seat) ? seat : 0;
  const k = pos + '@' + seat;
  return planner.defs[k] || (planner.defs[k] = planClamp(rawDefaultPlan(pos, seat)));
}
function planForSeat(pl, seat) {
  for (let j = 0; j <= 10; j++) {
    const d = planClamp({ ...pl, seat, brake: pl.brake + 0.2 * j });
    if (!planProblem(d)) return d;
  }
  return null;
}
function planForStance(pl, pos) {
  for (let j = 0; j <= 10; j++) {
    const d = planClamp({ ...pl, pos, brake: pl.brake + 0.2 * j });
    if (!planProblem(d)) return d;
  }
  return null;
}
function planPreview() {
  const pl = planner.A;
  if (!pl) return null;
  const k = planRunKey(pl);
  if (planner.prevKey !== k) {
    planner.prev = planRider(pl);
    planner.prevKey = k;
  }
  return planner.prev;
}
