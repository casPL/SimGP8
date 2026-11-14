// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Interface state, colours and fonts taken from the stylesheet, and the run loop of the demo.

const $ = (id) => document.getElementById(id);
const fmtNum = (x, d) => (+x).toFixed(d).replace('.', DECIMAL);
const localNum = (x) => String(x).replace('.', DECIMAL);
const state = { bike: 'ebike', pos: 'neu', seat: 0 };
try {
  const s = JSON.parse(localStorage.getItem('simgp8.settings') || '{}') || {};
  for (const k in state) if (s[k] != null) state[k] = s[k];
} catch (e) {}
function saveSettings() {
  try {
    localStorage.setItem('simgp8.settings', JSON.stringify(state));
  } catch (e) {}
}
const bikeById = (id) => BIKES.find((b) => b.id === id) || BIKES[0];
const rootStyle = getComputedStyle(document.documentElement);
const cssVar = (n) => rootStyle.getPropertyValue('--' + n).trim();
const COL = {};
[
  'chalk',
  'muted',
  'dim',
  'cone',
  'coneN',
  'coneF',
  'body',
  'brake',
  'rear',
  'gas',
  'spd',
  'leanc',
  'steer',
  'fork',
  'ghost',
  'ok',
  'warn',
  'rule',
  'panel',
  'panel2',
  'asphalt',
].forEach((k) => (COL[k] = cssVar(k)));
const FONT_MONO = cssVar('f-mono');
const FONT_DISPLAY = cssVar('f-display');
let S = makeSetup(bikeById(state.bike), state.pos, state.seat);
let run = null;
let last = null;
let hover = null;
let selSeg = null;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && run && !run.end) {
    stopRun(i18n`Przejazd przerwany.`);
    return;
  }
  const tag = (e.target && e.target.tagName) || '';
  if (
    e.code === 'Space' &&
    !(run && !run.end) &&
    !$('player').hidden &&
    last &&
    !planner.busy &&
    !['TEXTAREA', 'SELECT', 'SUMMARY', 'A'].includes(tag) &&
    !(tag === 'INPUT' && e.target.type !== 'range')
  ) {
    e.preventDefault();
    toggleReplay();
    return;
  }
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (planner.on) {
    if (e.code === 'Escape' && planner.busy) comparePlans();
    else if (e.code === 'Enter' && !planner.busy && tag !== 'BUTTON') {
      e.preventDefault();
      comparePlans();
    }
    return;
  }
  if (e.code === 'Enter' && !(run && !run.end) && tag !== 'BUTTON') {
    e.preventDefault();
    startDemo();
  }
});
function startDemo() {
  if (planner.on) setMode(false);
  player.on = false;
  $('player').hidden = true;
  if (run && !run.end) run.end = 'abort';
  S = makeSetup(bikeById(state.bike), state.pos, state.seat);
  run = {
    mode: 'demo',
    sim: new Sim(S),
    course: new Course(),
    bot: new AutoRider(S, coachSetup(S)),
    trace: [],
    phase: 'count',
    tc: 0,
    acc: 0,
    lastT: performance.now(),
    n: 0,
    end: null,
    why: '',
  };
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  try {
    $('track').focus({ preventScroll: true });
  } catch (e) {}
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) {
    const r = $('track').getBoundingClientRect();
    if (r.top < 0 || r.top > 60) window.scrollTo({ top: window.scrollY + r.top - 8, behavior: 'smooth' });
  }
  $('stopBtn').hidden = false;
  setStatus(
    i18n`<b>Pokaz trenera.</b> Automatyczny kierowca jedzie nitką według wzorca A–H, blisko granic motocykla, ale z zapasem. Patrz na wykres po przejeździe.`,
  );
  record(true);
  requestAnimationFrame(tick);
}
function stopRun(msg) {
  if (!run || run.end) return;
  run.end = 'abort';
  run.why = msg;
  finishRun();
}
function tick(now) {
  if (!run || run.end) return;
  const dt = Math.min(0.05, (now - run.lastT) / 1000);
  run.lastT = now;
  if (run.phase === 'count') {
    run.tc += dt;
    const n = 3 - Math.floor(run.tc / 0.55);
    showOverlay(n > 0 ? String(n) : i18n`JEDŹ!`);
    if (run.tc >= 1.65) {
      run.phase = 'go';
      setTimeout(() => {
        if (run && run.phase === 'go' && !run.end) hideOverlay();
      }, 450);
    }
    drawTrack();
    drawLiveHud();
    requestAnimationFrame(tick);
    return;
  }
  run.acc += dt;
  while (run.acc >= DT && !run.end) {
    run.acc -= DT;
    stepRun();
  }
  drawTrack();
  drawLiveHud();
  if (run.end) finishRun();
  else requestAnimationFrame(tick);
}
function stepRun() {
  const sim = run.sim;
  const c = run.course;
  const pf = sim.front();
  const pc = sim.mid();
  sim.step(run.bot.control(sim), DT);
  if (sim.crash) {
    run.end = 'crash';
    run.why = sim.crash;
    record(true);
    return;
  }
  c.update(pf, sim.front(), pc, sim.mid(), sim.t);
  checkCones(sim, c, sim.t);
  if (c.err) {
    run.end = 'err';
    run.why = c.err;
    record(true);
    return;
  }
  if (c.done) {
    run.end = 'done';
    record(true);
    return;
  }
  const [qx, qy] = sim.mid();
  if (qx < WORLD_BOX.x0 - 0.5 || qx > WORLD_BOX.x1 + 0.5 || qy < WORLD_BOX.y0 - 0.5 || qy > WORLD_BOX.y1 + 0.5) {
    run.end = 'err';
    run.why = i18n`Wyjazd poza plac (poza widoczny obszar).`;
    return;
  }
  if (sim.t > 150) {
    run.end = 'err';
    run.why = i18n`Za długo: przejazd przerwany po 150 s.`;
    return;
  }
  if (++run.n % 4 === 0) record(false);
}
function record(force) {
  const s = run.sim;
  const c = run.course;
  if (!force && run.trace.length && s.t - run.trace[run.trace.length - 1].t < 0.012) return;
  run.trace.push({
    t: s.t,
    rt: c.started ? s.t - c.t0 : null,
    x: s.x,
    y: s.y,
    psi: s.psi,
    v: s.v,
    phi: s.phi,
    phb: Math.sign(s.phi) * bikeLean(s.D || s.S, Math.abs(s.phi)),
    st: s.st,
    k: s.k,
    ut: s.ut,
    uf: s.uf,
    ur: s.ur,
    ax: s.ax,
    al: s.al,
    lock: s.lock ? 1 : 0,
    fl: s.fl,
    useF: s.useF,
    useR: s.useR,
    zf: s.zf / s.S.ft,
    zr: s.zr / s.S.rt,
    bx: s.bx,
    rel: s.rel,
    off: s.D.off,
  });
}
function finishRun() {
  const r = run;
  const c = r.course;
  $('stopBtn').hidden = true;
  if (r.end === 'done') {
    r.final = c.tEnd;
    showOverlay(fmtTime(r.final), i18n`pokaz trenera`, 2800);
    setStatus(i18n`<b>Meta: ${fmtTime(r.final)}</b>. Odtwórz go pod placem, raport niżej na stronie.`, false, 'good');
  } else if (r.end === 'abort') {
    hideOverlay();
    setStatus(r.why || i18n`Przejazd przerwany.`);
  } else {
    const dq = r.end === 'err' && c.dsq;
    showOverlay(r.end === 'crash' ? i18n`GLEBA` : dq ? i18n`DYSKWALIFIKACJA` : i18n`BŁĄD TRASY`, r.why, 4500);
    setStatus(
      '<b>' + (r.end === 'crash' ? i18n`Gleba.` : dq ? i18n`Dyskwalifikacja.` : i18n`Błąd trasy.`) + '</b> ' + r.why,
      true,
    );
  }
  last = r;
  run = null;
  selSeg = null;
  buildSegments(last);
  renderSegButtons();
  drawTele();
  report(last);
  renderSplits(last);
  renderBikes();
  drawTrack();
  drawViews();
  renderResults();
  playerInit(false);
}
