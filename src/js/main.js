// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Switching between the coach demo and the planner, controls and start-up.

function setMode(on, force) {
  if (run && !run.end) return;
  if (planner.busy) {
    compareToken++;
    planner.busy = false;
    planBusyUI();
  }
  syncSeg('modeSeg', on ? 'plan' : 'demo');
  if (on === planner.on && !force) return;
  player.on = false;
  planner.drag = null;
  if (on !== planner.on) {
    if (on) {
      planner.lastRide = last;
      last = planner.lastPlan;
    } else {
      planner.lastPlan = last;
      last = planner.lastRide;
    }
  }
  planner.on = on;
  try {
    localStorage.setItem('simgp8.mode', on ? 'plan' : 'demo');
  } catch (e) {}
  $('cmpBtn').hidden = !on;
  $('demoBtn').hidden = on;
  $('planner').hidden = !on;
  $('demoInfo').hidden = on;
  $('track').style.cursor = on ? 'crosshair' : '';
  $('posSeg').parentElement.hidden = on;
  $('posNote').textContent = STANCE_NOTE[state.pos];
  $('seatSeg').parentElement.hidden = on;
  $('seatNote').textContent = SEAT_NOTE[String(state.seat)];
  if (on) {
    initPlanner();
    syncPlanUI();
  }
  $('teleNote').innerHTML = on ? TELE_NOTE_PLAN : TELE_NOTE_DEMO;
  $('repH').textContent = on ? i18n`Raport planera` : i18n`Raport z pokazu`;
  hover = null;
  selSeg = null;
  renderSegButtons();
  if (last) {
    report(last);
    renderSplits(last);
  } else {
    $('tips').innerHTML = on ? PLAN_INTRO : DEMO_INTRO;
    renderSplits({ course: { splits: [] }, mode: on ? 'plan' : 'demo' });
  }
  renderResults();
  renderBikes();
  resizeAll();
  playerInit(false);
  setStatus(on ? PLAN_STATUS : DEMO_STATUS);
}
{
  const mk = (f) =>
    f.k === 'side'
      ? ''
      : f.k === 'turn'
        ? '<div class="sl s2"><span class="slr"><span>' +
          f.lab +
          '</span><span class="s2o"><output id="oP_turn"></output>, <output id="oP_side"></output></span></span><span class="s2i"><input type="range" id="iP_turn"><input type="range" id="iP_side"></span></div>'
        : '<label class="sl"><span class="slr"><span>' +
          f.lab +
          '</span><output id="oP_' +
          f.k +
          '"></output></span><input type="range" id="iP_' +
          f.k +
          '"></label>';
  $('slMain').innerHTML = PLAN_FIELDS.filter((f) => f.main)
    .map(mk)
    .join('');
}
for (const f of PLAN_FIELDS) {
  if (f.hide) continue;
  const el = $('iP_' + f.k);
  el.addEventListener('input', () => {
    player.on = false;
    planSet({ [f.k]: +el.value });
  });
  el.addEventListener('change', () => {
    planCommit();
    syncPlanUI();
    drawTrack();
  });
}
document.querySelectorAll('#modeSeg button').forEach(
  (x) =>
    (x.onclick = () => {
      setMode(x.dataset.v === 'plan');
      x.blur();
    }),
);
$('planner').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pact]');
  if (!b) return;
  planner.A = defaultPlan(planner.A.pos, planner.A.seat);
  planCommit();
  syncPlanUI();
  drawTrack();
  if (!run) drawViews();
});
function setPlanStance(pos) {
  if (!planner.A || planner.busy || !STANCE[pos] || planner.A.pos === pos) return;
  player.on = false;
  const p = planner.A;
  const d = planForStance(p, pos);
  const q = d || defaultPlan(pos, p.seat);
  const ch = PLAN_FIELDS.filter((f) => q[f.k] !== p[f.k]);
  planner.A = q;
  planner.good = { ...q };
  savePlan();
  planMessage(
    !d
      ? i18n`<b>${RIDER_NAME_CAP.A} w pozycji ${STANCE[pos].loc}</b> z tym planem nie przejedzie bezbłędnie w czasie do ${PLAN_MAX_TIME} s, więc ma plan wyjściowy dla tej pozycji.`
      : ch.length
        ? i18n`<b>${RIDER_NAME_CAP.A} w pozycji ${STANCE[pos].loc}</b> z tymi punktami nie przejedzie bezbłędnie w czasie do ${PLAN_MAX_TIME} s, więc zmieniam: ` +
          ch.map((f) => f.lab.replace(/^. · /, '') + ' ' + fmtPlanValue(f.k, q[f.k], planSetup(q))).join(', ') +
          '.'
        : '',
  );
  syncPlanUI();
  drawTrack();
  if (!run) drawViews();
}
document.querySelectorAll('#pPos button').forEach((x) => (x.onclick = () => setPlanStance(x.dataset.v)));
function setPlanSeat(seat) {
  seat = +seat;
  if (!planner.A || planner.busy || !SEATS.includes(seat) || planner.A.seat === seat) return;
  player.on = false;
  const p = planner.A;
  const d = planForSeat(p, seat);
  const q = d || defaultPlan(p.pos, seat);
  const ch = PLAN_FIELDS.filter((f) => q[f.k] !== p[f.k]);
  const nm = '<b>' + RIDER_NAME_CAP.A + ' ' + SEAT_WHERE[String(seat)] + '</b>';
  planner.A = q;
  planner.good = { ...q };
  savePlan();
  planMessage(
    !d
      ? i18n`${nm} z tym planem nie przejedzie bezbłędnie w czasie do ${PLAN_MAX_TIME} s, więc ma plan wyjściowy dla tej pozycji i miejsca.`
      : ch.length
        ? i18n`${nm} z tymi punktami nie przejedzie bezbłędnie w czasie do ${PLAN_MAX_TIME} s, więc zmieniam: ` +
          ch.map((f) => f.lab.replace(/^. · /, '') + ' ' + fmtPlanValue(f.k, q[f.k], planSetup(q))).join(', ') +
          '.'
        : '',
  );
  syncPlanUI();
  drawTrack();
  if (!run) drawViews();
}
document.querySelectorAll('#pSeat button').forEach((x) => (x.onclick = () => setPlanSeat(x.dataset.v)));
$('cmpBtn').onclick = comparePlans;
$('plPlay').onclick = toggleReplay;
document.querySelectorAll('#plSpd button').forEach(
  (x) =>
    (x.onclick = () => {
      player.spd = +x.dataset.v;
      syncPlayer();
    }),
);
$('plT').addEventListener('input', (e) => {
  player.on = false;
  showReplayAt(+e.target.value);
});
{
  const tr = $('track');
  const pos = (e) => {
    const r = tr.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  tr.addEventListener('pointerdown', (e) => {
    if (!planner.on || run || !planner.A || planner.busy) return;
    const [sx, sy] = pos(e);
    let m = markAt(sx, sy);
    if (!m) {
      const c = setMarkAt(sx, sy);
      if (!c) {
        setStatus(
          i18n`Przeciągnij kółko <b>H</b>, <b>S</b> albo <b>G</b> albo kliknij przy czerwonym pachołku: na prostej dojazdu (H), obok niej (S, także w bok) albo na pętli (G).`,
        );
        return;
      }
      m = { kind: c.kind, q: c.q };
    }
    player.on = false;
    const [wx, wy] = toWorld(sx, sy);
    planner.drag = {
      kind: m.kind,
      q: m.q,
      id: e.pointerId,
      val0: planner.A[m.kind],
      pr0: m.kind === 'gas' ? 0 : aheadOfCone(m.q, [wx, wy]),
      sd0: planner.A.side,
      ps0: sideOfCone(m.q, [wx, wy]),
    };
    syncPlanUI();
    drawTrack();
    tr.style.cursor = 'grabbing';
    try {
      tr.setPointerCapture(e.pointerId);
    } catch (_) {}
    e.preventDefault();
  });
  tr.addEventListener('pointermove', (e) => {
    if (!planner.on || !planner.A) return;
    const [sx, sy] = pos(e);
    const g = planner.drag;
    if (g && e.pointerId === g.id) {
      const bt = planPreview();
      const [wx, wy] = toWorld(sx, sy);
      if (g.kind === 'gas') planSet({ gas: bt.rotLeft[nearestOnLoop(bt, g.q, wx, wy).i] * DEG });
      else if (g.kind === 'turn')
        planSet({ turn: g.val0 + aheadOfCone(g.q, [wx, wy]) - g.pr0, side: g.sd0 + sideOfCone(g.q, [wx, wy]) - g.ps0 });
      else planSet({ [g.kind]: g.val0 + aheadOfCone(g.q, [wx, wy]) - g.pr0 });
      return;
    }
    if (e.pointerType === 'mouse' && !run) tr.style.cursor = markAt(sx, sy) ? 'grab' : 'crosshair';
  });
  const end = (e) => {
    const g = planner.drag;
    if (g && e.pointerId === g.id) {
      planner.drag = null;
      tr.style.cursor = planner.on ? 'crosshair' : '';
      planCommit();
      syncPlanUI();
      drawTrack();
    }
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) tr.addEventListener(ev, end);
}
window.addEventListener('resize', () => {
  clearTimeout(resizeAll.t);
  resizeAll.t = setTimeout(resizeAll, 80);
});
sizeTrack();
sizeLean();
sizeTele();
makeAsphalt();
settingsChanged();
drawRef();
{
  let md = 'demo';
  try {
    if (localStorage.getItem('simgp8.mode') === 'plan') md = 'plan';
  } catch (e) {}
  if (/^#(pokaz|demo)$/.test(location.hash)) md = 'demo';
  else if (/^#(planer|planner)$/.test(location.hash)) md = 'plan';
  setMode(md === 'plan', true);
}
if (window.ResizeObserver) {
  let rq = 0;
  const ro = new ResizeObserver(() => {
    if (rq) return;
    rq = requestAnimationFrame(() => {
      rq = 0;
      if (!run && layoutSignature() !== layout.sz) resizeAll();
    });
  });
  BOXES.forEach((id) => ro.observe($(id)));
}
if (document.fonts && document.fonts.ready)
  document.fonts.ready.then(() => {
    if (!run) {
      drawTrack();
      drawTele();
      drawRef();
      drawViews();
    }
  });
