// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// The rider against the coach: results table, splits, report and chart.

const fmtGap = (x) =>
  x < 0.0195
    ? Math.round(x * 1000) + ' mm'
    : (Math.round(x * 1000) % 10 ? fmtNum(x * 100, 1) : String(Math.round(x * 100))) + ' cm';
function fmtPlanValue(k, x, s) {
  if (k === 'brake') return i18n`${fmtNum(x, 1)} m przed`;
  if (k === 'force')
    return Math.round(x * 100) + '% · ' + fmtNum((x * peakBrakeDecel(s || planSetup(planner.A))) / G, 2) + ' g';
  if (k === 'turn') return x >= 0 ? i18n`${fmtNum(x, 1)} m przed` : i18n`${fmtNum(-x, 1)} m za`;
  if (k === 'side') return i18n`${fmtNum(x, 1)} m od pachołka`;
  if (k === 'gas') return x > 0 ? i18n`${x}° przed wyjściem` : i18n`na wyjściu`;
  if (k === 'open') return fmtNum(x, 2) + ' s';
  return fmtGap(x);
}
function syncPlanUI() {
  if (!planner.A) return;
  planner.B = coachPlanFor(planner.A);
  const pl = planner.A;
  for (const f of PLAN_FIELDS) {
    if (f.hide) continue;
    const el = $('iP_' + f.k);
    const o = $('oP_' + f.k);
    const [mn, mx] = planRange(f.k);
    el.min = mn;
    el.max = mx;
    el.step = f.step;
    el.value = pl[f.k];
    o.textContent = f.k === 'side' ? i18n`${fmtNum(pl.side, 1)} m w bok` : fmtPlanValue(f.k, pl[f.k], planSetup(pl));
    el.setAttribute(
      'aria-label',
      f.k === 'turn'
        ? i18n`S · składanie bliżej albo dalej`
        : f.k === 'side'
          ? i18n`S · składanie szerzej albo węziej`
          : f.lab,
    );
  }
  syncSeg('pPos', pl.pos);
  syncSeg('pSeat', pl.seat);
  $('seatNote').textContent = SEAT_NOTE[String(pl.seat)];
  $('posNote').textContent = STANCE_NOTE[pl.pos];
  renderPlanResults();
}
let compareToken = 0;
function planBusyUI() {
  const b = $('cmpBtn');
  b.textContent = planner.busy ? i18n`■ Przerwij` : i18n`▶ Porównaj`;
  b.classList.toggle('go', !planner.busy);
  if (planner.busy) {
    const busy = '<b>' + i18n`Porównanie…` + '</b>';
    setStatus(busy);
    $('planRes').innerHTML = '<p class="verdict">' + busy + '</p>';
  }
}
function runSummary(r) {
  return { final: r.final, end: r.end, why: r.why, cause: r.cause, det: r.det };
}
function comparePlans() {
  if (planner.busy) {
    compareToken++;
    planner.busy = false;
    planBusyUI();
    setStatus(i18n`Porównanie przerwane.`);
    renderPlanResults();
    return;
  }
  if (!planner.on || !planner.A || (run && !run.end)) return;
  player.on = false;
  if (!sameJson(planner.A, planner.good)) planCommit();
  planner.B = coachPlanFor(planner.A);
  const plans = { A: { ...planner.A }, B: { ...planner.B } };
  const SS = { A: planSetup(plans.A), B: planSetup(plans.B) };
  const R = { plans, SS };
  const tok = ++compareToken;
  planner.busy = true;
  planBusyUI();
  const runB = () => {
    if (tok !== compareToken) return;
    R.B = runSummary(simulateRun(SS.B, coachSetup(SS.B), false));
    planner.busy = false;
    planBusyUI();
    planner.res = R;
    showComparison(true);
    setStatus(i18n`<b>${planVerdict(R)}.</b> Odtwarzam ten przejazd od startu z bramki. Spacja: pauza.`, false, 'good');
  };
  setTimeout(() => {
    if (tok !== compareToken) return;
    R.A = runSummary(simulateRun(SS.A, planOptions(SS.A, plans.A), false));
    setTimeout(runB, 0);
  }, 30);
}
function planVerdict(R) {
  const a = R.A.final;
  const b = R.B.final;
  if (a == null || b == null)
    return a == null && b == null
      ? i18n`Obaj nie ukończyli`
      : i18n`${RIDER_NAME_CAP[a == null ? 'A' : 'B']} nie ukończył`;
  return Math.abs(b - a) < 0.005
    ? i18n`Bez różnicy`
    : i18n`${RIDER_NAME_CAP[b < a ? 'B' : 'A']} szybszy o ${fmtNum(Math.abs(b - a), 2)} s`;
}
function runEvents(x) {
  const c = x.course;
  const ev = [];
  if (!c.started || !x.bot.W) return ev;
  for (const w of x.bot.W) {
    if (w.tB != null) ev.push({ k: MARK.brake, rt: w.tB - c.t0 });
    if (w.tT != null) ev.push({ k: MARK.turn, rt: w.tT - c.t0 });
    if (w.tG != null) ev.push({ k: MARK.gas, rt: w.tG - c.t0 });
  }
  return ev;
}
function showComparison(auto) {
  const R = planner.res;
  if (!R) return;
  player.on = false;
  const rA = simulateRun(R.SS.A, planOptions(R.SS.A, R.plans.A), true);
  const rB = simulateRun(R.SS.B, coachSetup(R.SS.B), true);
  for (const x of [rA, rB]) {
    buildSegments(x);
    x.ev = runEvents(x);
  }
  rA.B = rB;
  last = rA;
  hover = null;
  if (selSeg !== 'all') selSeg = null;
  renderSegButtons();
  report(last);
  renderSplits(last);
  renderBikes();
  renderPlanResults();
  playerInit(auto);
}
function turnAverages(x) {
  const W = x && x.bot && x.bot.W ? x.bot.W.filter((w) => w.q > 0 && w.tG != null) : [];
  if (!W.length) return null;
  const avg = (fn) => {
    const v = W.map(fn).filter((z) => z != null && isFinite(z));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const cn = {};
  for (const w of W) if (w.cn) cn[w.cn] = (cn[w.cn] || 0) + 1;
  const cp = Object.keys(cn).sort((a, b) => cn[b] - cn[a])[0] || '';
  return {
    vB: avg((w) => w.vB),
    vT: avg((w) => w.vT),
    vG: avg((w) => w.vG),
    ln: avg((w) => w.phG * DEG),
    wd: avg((w) => Math.max(0, w.wd)),
    dn: avg((w) => w.dn),
    cl: avg((w) => (w.cl != null && w.cl < 5 ? w.cl : null)),
    cn: cp,
  };
}
const fmtClearance = (c) =>
  c == null ? '–' : c < 0 ? '0 mm' : c < 0.0195 ? Math.round(c * 1000) + ' mm' : fmtNum(c * 100, 1) + ' cm';
const turnPointText = (p) =>
  (p.turn >= 0 ? fmtNum(p.turn, 1) : i18n`${fmtNum(-p.turn, 1)} za`) + '·' + fmtNum(p.side, 1) + ' m';
const signedSeconds = (d) => (d > 0.005 ? '+' : d < -0.005 ? '−' : '±') + fmtNum(Math.abs(d), 2) + ' s';
function renderPlanResults() {
  const box = $('planRes');
  if (planner.busy || !planner.A) return;
  const R = planner.res;
  const A = planner.A;
  const B = planner.B;
  const r = last && last.mode === 'plan' && last.B ? last : null;
  const row = (k, a, b) => '<tr><td>' + k + '</td><td class="t A">' + a + '</td><td class="t B">' + b + '</td></tr>';
  const sec = (t) => '<tr class="sec"><td colspan="3">' + t + '</td></tr>';
  let h = '';
  if (R) {
    h +=
      (planIsStale()
        ? '<p class="note stale">' + i18n`Plan zmieniony od porównania. Naciśnij Porównaj jeszcze raz.` + '</p>'
        : '') +
      '<p class="verdict"><b>' +
      planVerdict(R) +
      '</b></p>';
  } else
    h +=
      '<p class="note">' + i18n`Naciśnij <b>▶ Porównaj</b> albo Enter, a zobaczysz czas zawodnika i trenera.` + '</p>';
  h +=
    '<table class="cmp mini"><tr><th>' +
    i18n`Plan` +
    '</th><th class="t A">' +
    RIDER_NAME_CAP.A +
    '</th><th class="t B">' +
    RIDER_NAME_CAP.B +
    '</th></tr>';
  h +=
    row(i18n`Pozycja`, STANCE[A.pos].name, STANCE[B.pos].name) +
    row(i18n`Siedzi`, SEAT_SHORT[String(A.seat)], SEAT_SHORT[String(B.seat)]) +
    row(i18n`H hamowanie`, fmtNum(A.brake, 1) + ' m', fmtNum(B.brake, 1) + ' m') +
    row(
      '<span title="' +
        i18n`S: metry przed linią pachołka (za: po niej) · metry w bok od pachołka` +
        '">' +
        i18n`S składanie · bok` +
        '</span>',
      turnPointText(A),
      turnPointText(B),
    ) +
    row(i18n`G gaz`, A.gas + '°', B.gas + '°');
  if (R) {
    const a = R.A;
    const b = R.B;
    const fr = (x) => (x.final != null ? fmtNum(x.final, 2) + ' s' : i18n`nie ukończył`);
    const ws = (x) => (x.final != null ? '–' : shortReason(x) || i18n`błąd trasy`);
    h += sec(i18n`Wynik`) + row(i18n`Czas`, fr(a), fr(b));
    if (a.final == null || b.final == null) h += row(i18n`Powód`, ws(a), ws(b));
  }
  if (r) {
    const a = turnAverages(r);
    const b = turnAverages(r.B);
    const kmh = (v) => (v == null ? '–' : String(Math.round(v * 3.6)));
    const v3 = (w) => (w ? kmh(w.vB) + '·' + kmh(w.vT) + '·' + kmh(w.vG) : '–');
    h += sec(i18n`Średnio w pętli`);
    h +=
      row(i18n`km/h w H·S·G`, v3(a), v3(b)) +
      row(i18n`Złożenie w G`, a ? Math.round(a.ln) + '°' : '–', b ? Math.round(b.ln) + '°' : '–') +
      row(
        '<span title="' +
          i18n`najmniejszy odstęp obrysu motocykla z kierowcą (kierownica, tył motocykla, podnóżek, kolano, łokieć) od pachołka; ślad tylnej opony: zawodnik ${a && a.dn != null ? fmtNum(a.dn, 2) : '–'} m, trener ${b && b.dn != null ? fmtNum(b.dn, 2) : '–'} m od środka pachołka` +
          '">' +
          i18n`Do pachołka` +
          '</span>',
        a ? fmtClearance(a.cl) : '–',
        b ? fmtClearance(b.cl) : '–',
      ) +
      row(i18n`Najbliżej`, a && a.cn ? a.cn : '–', b && b.cn ? b.cn : '–');
  }
  box.innerHTML = h + '</table>';
}
function renderDemoResults() {
  const box = $('planRes');
  const r = last && last.mode !== 'plan' ? last : null;
  if (!r) {
    box.innerHTML =
      '<p class="note">' + i18n`Naciśnij <b>▶ Pokaz</b> albo Enter. Tu pojawi się wynik trenera.` + '</p>';
    return;
  }
  const c = r.course;
  const ok = r.end === 'done';
  const P = r.tr || [];
  const vm = P.reduce((m, p) => Math.max(m, p.v), 0);
  const lm = P.reduce((m, p) => Math.max(m, Math.abs(p.phb)), 0);
  const L = (r.segs || []).filter((s) => s.loop).map((s) => s.dt);
  const row = (k, a) => '<tr><td>' + k + '</td><td class="t">' + a + '</td></tr>';
  let h =
    '<p class="verdict"><b>' +
    (ok ? i18n`Trener: ${fmtTime(r.final)}` : r.end === 'abort' ? i18n`Pokaz przerwany` : i18n`Trener nie ukończył`) +
    '</b>' +
    (!ok && r.why ? '<br><span class="note">' + r.why + '</span>' : '') +
    '</p>';
  h += '<table class="cmp mini"><tr><th>' + S.b.name + '</th><th class="t">' + RIDER_NAME_CAP.B + '</th></tr>';
  h +=
    row(i18n`Czas`, fmtTime(c.tEnd)) +
    row(i18n`Najwyższa prędkość`, Math.round(vm * 3.6) + ' km/h') +
    row(i18n`Największe złożenie`, Math.round(lm * DEG) + '°');
  if (L.length)
    h += row(
      i18n`Pętla najszybsza – najwolniejsza`,
      fmtNum(Math.min(...L), 2) + ' – ' + fmtNum(Math.max(...L), 2) + ' s',
    );
  box.innerHTML = h + '</table>';
}
function renderResults() {
  if (planner.on) renderPlanResults();
  else renderDemoResults();
}
const fmtSplit = (t) => (t == null || !isFinite(t) ? '–' : fmtNum(t, 2));
const EIGHT_INDEX = Array.from({ length: EIGHTS }, (_, i) => i);
const splitTime = (s, i) => (s[i] != null ? s[i] - (i ? s[i - 1] : 0) : null);
function renderPlanSplits(r) {
  const B = r.B;
  const sa = r.course.splits || [];
  const sb = B ? B.course.splits || [] : [];
  let h =
    '<tr><th>' +
    i18n`Ósemka` +
    '</th>' +
    EIGHT_INDEX.map((i) => '<th class="t">' + (i + 1) + '</th>').join('') +
    '</tr>';
  h +=
    '<tr><td class="A">' +
    RIDER_NAME_CAP.A +
    '</td>' +
    EIGHT_INDEX.map((i) => '<td class="t A">' + fmtSplit(splitTime(sa, i)) + '</td>').join('') +
    '</tr>';
  h +=
    '<tr><td class="B">' +
    RIDER_NAME_CAP.B +
    '</td>' +
    EIGHT_INDEX.map((i) => '<td class="t B">' + fmtSplit(splitTime(sb, i)) + '</td>').join('') +
    '</tr>';
  h +=
    '<tr><td title="' +
    DIFF_HINT +
    '">' +
    i18n`Różnica` +
    '</td>' +
    EIGHT_INDEX.map((i) => {
      const a = splitTime(sa, i);
      const b = splitTime(sb, i);
      const d = a != null && b != null ? a - b : null;
      return (
        '<td class="t ' +
        (d == null ? '' : d > 0.005 ? 'up' : d < -0.005 ? 'down' : '') +
        '">' +
        (d == null ? '–' : (d > 0.005 ? '+' : d < -0.005 ? '−' : '±') + fmtNum(Math.abs(d), 2)) +
        '</td>'
      );
    }).join('') +
    '</tr>';
  $('splits').innerHTML = h;
}
function renderSplits(r) {
  if (r && r.mode === 'plan') {
    renderPlanSplits(r);
    return;
  }
  const sp = (r && r.course && r.course.splits) || [];
  $('splits').innerHTML =
    '<tr><th>' +
    i18n`Ósemka` +
    '</th>' +
    EIGHT_INDEX.map((i) => '<th class="t">' + (i + 1) + '</th>').join('') +
    '</tr><tr><td>' +
    RIDER_NAME_CAP.B +
    '</td>' +
    EIGHT_INDEX.map((i) => '<td class="t">' + fmtSplit(splitTime(sp, i)) + '</td>').join('') +
    '</tr>';
}
function planReport(r) {
  const ul = $('tips');
  ul.innerHTML = '';
  const add = (cls, html) => {
    const li = document.createElement('li');
    li.className = cls;
    li.innerHTML = '<span>' + html + '</span>';
    ul.appendChild(li);
  };
  const R = planner.res;
  const B = r.B;
  if (!R || !B) {
    ul.innerHTML = PLAN_INTRO;
    return;
  }
  const f = (t) => (t == null || !isFinite(t) ? i18n`nie ukończył` : fmtNum(t, 2) + ' s');
  const kmh = (v) => (v == null ? '–' : Math.round(v * 3.6) + ' km/h');
  const nm = (v) => '<b style="color:var(' + riderCssVar(v) + ')">' + RIDER_NAME_CAP[v] + '</b>';
  const pn = (v) => i18n` (pozycja ${STANCE[R.plans[v].pos].name}, ${SEAT_WHERE[String(R.plans[v].seat || 0)]})`;
  add('good', i18n`<b>${planVerdict(R)}</b>: zawodnik ${f(r.final)}, trener ${f(B.final)}.`);
  for (const [v, x] of [
    ['A', r],
    ['B', B],
  ]) {
    const w = turnAverages(x);
    if (!w) continue;
    add(
      'info',
      i18n`${nm(v) + pn(v)}: w S ma ok. ${kmh(w.vT)}. Obrys mija pachołek średnio o ${fmtClearance(w.cl)}` +
        (w.cn ? i18n` (najbliżej: ${w.cn})` : '') +
        i18n`, ślad tylnej opony ok. ${w.dn != null ? fmtNum(w.dn, 2) : '–'} m od jego środka. W G ma ok. ${kmh(w.vG)} i złożenie ok. ${Math.round(w.ln)}°, wyjście wychodzi szersze od nitki o ok. ${Math.round(w.wd * 100)} cm.`,
    );
  }
  for (const v of ['A', 'B']) {
    if (R[v].final != null) continue;
    const w = R[v].det || R[v].why || i18n`błąd trasy.`;
    add('bad', i18n`${nm(v)} nie ukończył: ${w.charAt(0).toLowerCase() + w.slice(1)}`);
  }
  if (r.segs && B.segs) {
    let bi = -1;
    let bd = 0;
    r.segs.forEach((s, i) => {
      const t = B.segs[i];
      if (s.loop && t && t.loop) {
        const d = t.dt - s.dt;
        if (Math.abs(d) > Math.abs(bd)) {
          bd = d;
          bi = i;
        }
      }
    });
    if (bi >= 0 && Math.abs(bd) > 0.02)
      add(
        'info',
        i18n`Największa różnica w pętli ${r.segs[bi].name}: zawodnik ${signedSeconds(-bd)} względem trenera. Kliknij ją nad wykresem i odtwórz w tempie ¼× albo ⅒×.`,
      );
  }
  add(
    'info',
    i18n`Wirtualny zawodnik: do H gaz, od H przedni hamulec z zadaną siłą (pełna siła po ok. 0,2 s), najdłużej do S, aż do prędkości, z jaką zmieści się w łuku za S. W S składa się <b>przeciwskrętem</b>: kierownica na ułamek sekundy idzie na zewnątrz łuku, motocykl zaczyna się przechylać, a dopiero potem kierownica idzie do środka (na wykresie grubo na złożeniu, w tabeli „Teraz” przy kierownicy: „przeciwskręt”). Przy większej prędkości przechył rusza szybciej. Tak samo, tylko odwrotnie, podnosi motocykl przy wyjściu: kierownica mocniej do środka. Hamuje też w złożeniu (trail braking): po S oddaje przedni hamulec w miarę składania, bo w złożeniu opona ma mniej przyczepności na hamowanie, a jak tylko puszcza przód, dokłada tyłu: najpierw mocno (do ok. 80% tego, na co tylnej oponie zostaje przyczepności w złożeniu), potem coraz mniej, aż zwolni do prędkości wierzchołka albo tył nie ma już czym hamować; wtedy uchyla gaz, a tył puszcza dopiero po ok. 0,2 s (zakładka), więc nie ma chwili bez hamulca i bez gazu; ugięty widelec zmniejsza wyprzedzenie, więc motocykl składa się szybciej. Od S składa się tak szybko i mocno, jak pozwala motocykl, ale tak, żeby obrys (kierownica, tył motocykla, podnóżek, kolano i łokieć) minął pachołek o zapas, i jedzie na granicy złożenia (trener w pokazie zostawia sobie zapas). Późny albo wąski S to ciasny łuk zaraz za S, więc przed nim trzeba mocniej wyhamować. Kto hamuje za późno, w złożeniu już tak nie wyhamuje i wynosi go szeroko. Potem trzyma prędkość wierzchołka uchylonym gazem aż do G. Od G odkręca do pełna, przesuwa ciało do przodu (przednie koło później się podnosi) i podnosi motocykl na tyle, żeby opony przeniosły przyspieszanie, więc gaz w głębszym złożeniu to szersze wyjście. W pierwszej pętli (prawej, zaraz po starcie) hamuje i składa się jak trener, wcześniej niż w H i w S, bo z bramki jest szybszy i dojeżdża z innej strony; od pierwszej lewej hamuje w H. Bramka 3 m za niebieskim pachołkiem to przeszkoda: przejazd, w którym zawodnik w nią wjeżdża, jest nieukończony. Złożenie od pionu do 45° trwa na Ultra Bee ok. 0,35 s, tak jak na nagraniu przejazdu.`,
  );
}
function teleRangePlan() {
  const r = last;
  const B = r.B;
  const eA = r.tr[r.tr.length - 1].rt;
  const eB = B.tr && B.tr.length ? B.tr[B.tr.length - 1].rt : 0;
  if (selSeg === 'all' || selSeg == null || !r.segs || !r.segs[selSeg]) return [0, Math.max(eA, eB), 0, null];
  const sg = r.segs[selSeg];
  const sb = B.segs && B.segs[selSeg];
  return [sg.t0, sg.t0 + Math.max(sg.dt, sb ? sb.dt : 0), sb ? sg.t0 - sb.t0 : null, sg];
}
function drawTelePlan() {
  teleCtx.clearRect(0, 0, TW, TH);
  const r = last;
  const B = r.B;
  const narrow = TW < 560;
  const l = narrow ? 52 : 96;
  const rr = TW - 8;
  const bot = TH - 18;
  teleCtx.font = '11px ' + FONT_MONO;
  teleCtx.textAlign = 'left';
  if (!r.tr || r.tr.length < 3 || !B || !B.tr || !B.tr.length) {
    teleCtx.fillStyle = COL.muted;
    teleCtx.fillText(i18n`Brak danych z przejazdu.`, l, 54);
    return;
  }
  const [t0, t1, offB, sg] = teleRangePlan();
  const top = sg ? 44 : 34;
  const X = (t) => l + ((t - t0) / (t1 - t0 || 1)) * (rr - l);
  const PA = r.tr.filter((p) => p.rt >= t0 - 1e-6 && p.rt <= t1 + 1e-6);
  const PB = offB == null ? [] : B.tr.filter((p) => p.rt + offB >= t0 - 1e-6 && p.rt + offB <= t1 + 1e-6);
  let vmax = 10;
  for (const p of PA) vmax = Math.max(vmax, p.v * 3.6);
  for (const p of PB) vmax = Math.max(vmax, p.v * 3.6);
  vmax = Math.ceil(vmax / 10) * 10;
  const csM = (p) => p.v > 1 && Math.abs(p.phb || 0) > RAD && (p.st || 0) * Math.sign(p.phb) < -1.5 * RAD;
  const tbM = (p) => (p.uf || 0) > 0.05 && Math.abs(p.phb || 0) > 5 * RAD;
  const rows = [
    { name: i18n`Prędkość`, short: i18n`Prędk.`, lab: vmax + ' km/h', mn: 0, mx: vmax, get: (p) => p.v * 3.6 },
    {
      name: i18n`Złożenie`,
      short: i18n`Złoż.`,
      lab: '60°',
      sub: i18n`▬ przeciwskręt`,
      mn: 0,
      mx: 60,
      mark: csM,
      get: (p) => Math.abs(p.phb) * DEG,
    },
    {
      name: i18n`Przeciążenie`,
      short: i18n`g wzdł.`,
      lab: i18n`± 1,2 g`,
      sub: i18n`▬ trail braking`,
      mn: -1.2,
      mx: 1.2,
      mark: tbM,
      get: (p) => (p.ax || 0) / G,
    },
  ];
  const rowH = (bot - top) / rows.length;
  if (!sg && r.segs) {
    for (const s of r.segs) {
      const x = X(s.t0);
      teleCtx.strokeStyle = COL.dim;
      teleCtx.lineWidth = 1;
      teleCtx.beginPath();
      teleCtx.moveTo(x, top);
      teleCtx.lineTo(x, bot);
      teleCtx.stroke();
      teleCtx.fillStyle = COL.muted;
      if (X(s.t1) - x > 24) teleCtx.fillText(s.name, x + 3, top - 6);
    }
  }
  rows.forEach((row, ri) => {
    const y0 = top + ri * rowH;
    const y1 = y0 + rowH - 8;
    const Y = (v) => y1 - ((clamp(v, row.mn, row.mx) - row.mn) / (row.mx - row.mn)) * (y1 - y0);
    teleCtx.strokeStyle = COL.rule;
    teleCtx.lineWidth = 1;
    teleCtx.beginPath();
    teleCtx.moveTo(l, y1 + 0.5);
    teleCtx.lineTo(rr, y1 + 0.5);
    teleCtx.stroke();
    if (row.mn < 0) {
      teleCtx.strokeStyle = COL.dim;
      teleCtx.setLineDash([3, 3]);
      teleCtx.beginPath();
      teleCtx.moveTo(l, Math.round(Y(0)) + 0.5);
      teleCtx.lineTo(rr, Math.round(Y(0)) + 0.5);
      teleCtx.stroke();
      teleCtx.setLineDash([]);
    }
    teleCtx.fillStyle = COL.muted;
    teleCtx.font = (narrow ? '10px ' : '11px ') + FONT_MONO;
    teleCtx.fillText(narrow ? row.short : row.name, 4, y0 + 12);
    teleCtx.fillStyle = COL.dim;
    teleCtx.font = '10px ' + FONT_MONO;
    teleCtx.fillText(row.lab, 4, y0 + 25);
    if (row.sub && !narrow && rowH >= 34) teleCtx.fillText(row.sub, 4, y0 + 38);
    for (const [P, col, off] of [
      [PB, COL.ok, offB || 0],
      [PA, COL.chalk, 0],
    ]) {
      if (P.length < 2) continue;
      teleCtx.strokeStyle = col;
      teleCtx.lineWidth = 1.8;
      teleCtx.beginPath();
      P.forEach((p, j) => {
        const q = [X(p.rt + off), Y(row.get(p))];
        j ? teleCtx.lineTo(...q) : teleCtx.moveTo(...q);
      });
      teleCtx.stroke();
      if (row.mark) {
        teleCtx.lineWidth = 5;
        teleCtx.globalAlpha = 0.6;
        teleCtx.lineCap = 'round';
        teleCtx.beginPath();
        let on = false;
        P.forEach((p) => {
          const q = [X(p.rt + off), Y(row.get(p))];
          if (row.mark(p)) {
            on ? teleCtx.lineTo(...q) : teleCtx.moveTo(...q);
            if (!on) teleCtx.lineTo(q[0] + 0.1, q[1]);
            on = true;
          } else on = false;
        });
        teleCtx.stroke();
        teleCtx.globalAlpha = 1;
        teleCtx.lineCap = 'butt';
      }
    }
  });
  if (sg) {
    for (const [x, v, off, yl] of [
      [r, 'A', 0, top - 24],
      [B, 'B', offB, top - 12],
    ]) {
      if (off == null) continue;
      for (const e of x.ev || []) {
        const t = e.rt + off;
        if (t < t0 || t > t1) continue;
        const xx = X(t);
        teleCtx.strokeStyle = riderColor(v);
        teleCtx.globalAlpha = 0.55;
        teleCtx.setLineDash([3, 3]);
        teleCtx.lineWidth = 1;
        teleCtx.beginPath();
        teleCtx.moveTo(xx, yl + 10);
        teleCtx.lineTo(xx, bot);
        teleCtx.stroke();
        teleCtx.setLineDash([]);
        teleCtx.globalAlpha = 1;
        teleCtx.fillStyle = riderColor(v);
        teleCtx.font = '700 10px ' + FONT_MONO;
        teleCtx.textAlign = 'center';
        teleCtx.fillText(e.k, xx, yl + 8);
        teleCtx.textAlign = 'left';
      }
    }
  }
  teleCtx.fillStyle = COL.dim;
  teleCtx.font = '10px ' + FONT_MONO;
  teleCtx.textAlign = 'center';
  const span = t1 - t0;
  const step = span > 12 ? 5 : span > 5 ? 1 : 0.5;
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-6; t += step)
    teleCtx.fillText(localNum(Math.round(t * 10) / 10) + ' s', X(t), TH - 4);
  teleCtx.textAlign = 'left';
  if (hover) {
    for (const [v, off] of [
      ['B', offB],
      ['A', 0],
    ]) {
      if (off == null) continue;
      const t = hover.t + off;
      if (t < t0 || t > t1) continue;
      const xx = X(t);
      teleCtx.strokeStyle = riderColor(v);
      teleCtx.globalAlpha = 0.8;
      teleCtx.lineWidth = 1.5;
      teleCtx.beginPath();
      teleCtx.moveTo(xx, top);
      teleCtx.lineTo(xx, bot);
      teleCtx.stroke();
      teleCtx.globalAlpha = 1;
    }
    const pa = interpAt(r, hover.t);
    const pb = interpAt(B, hover.t);
    const fm = (p) =>
      p
        ? Math.round(p.v * 3.6) +
          ' km/h, ' +
          Math.round(Math.abs(p.phb) * DEG) +
          '°, ' +
          fmtNum((p.ax || 0) / G, 1).replace('-', '−') +
          ' g'
        : '–';
    teleCtx.font = '11px ' + FONT_MONO;
    teleCtx.fillStyle = COL.muted;
    teleCtx.fillText(fmtNum(hover.t, 2) + ' s', l, 12);
    const s1 = (narrow ? '' : RIDER_NAME.A + ' ') + fm(pa);
    const s2 = (narrow ? '' : RIDER_NAME.B + ' ') + fm(pb);
    const gap = narrow ? '  ' : '   ';
    const x1 = Math.max(l + 64, rr - teleCtx.measureText(s1 + gap + s2).width);
    teleCtx.fillStyle = COL.chalk;
    teleCtx.fillText(s1, x1, 12);
    teleCtx.fillStyle = COL.ok;
    teleCtx.fillText(s2, x1 + teleCtx.measureText(s1 + gap).width, 12);
  }
}
function segBadge(r, i) {
  const sg = r.segs[i];
  if (r.mode === 'plan' && r.B && r.B.segs && r.B.segs[i]) {
    const d = sg.dt - r.B.segs[i].dt;
    return (d > 0.005 ? '+' : d < -0.005 ? '−' : '±') + fmtNum(Math.abs(d), 2);
  }
  return sg.dt;
}
function segPick(val) {
  selSeg = val;
  renderSegButtons();
  if (!$('player').hidden && last && last.segs) {
    player.on = false;
    showReplayAt(val === 'all' ? player.t : last.segs[val].t0);
  } else {
    hover = null;
    drawTele();
    drawTrack();
  }
}
function teleRows() {
  return isDashboard() ? TELE_ROWS.filter((r) => r.id !== 'zf' && r.id !== 'body') : TELE_ROWS;
}
