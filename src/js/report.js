// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Maciej Kasprzyk
//
// Status line, overlays, the run report and the table of bike parameters.

const fmtTime = (t) => (t == null || !isFinite(t) ? '–' : fmtNum(t, 2) + ' s');
function report(r) {
  if (r && r.mode === 'plan') {
    planReport(r);
    return;
  }
  const ul = $('tips');
  ul.innerHTML = '';
  const add = (cls, html) => {
    const li = document.createElement('li');
    li.className = cls;
    li.innerHTML = '<span>' + html + '</span>';
    ul.appendChild(li);
  };
  const b = S.b;
  const c = r.course;
  if (r.end === 'abort') {
    add('info', i18n`Pokaz przerwany. Naciśnij ▶ Pokaz albo Enter, żeby obejrzeć go od początku.`);
    return;
  }
  if (r.end === 'crash') add('bad', '<b>' + i18n`Gleba.` + '</b> ' + r.why);
  if (r.end === 'err') add('bad', '<b>' + (c.dsq ? i18n`Dyskwalifikacja.` : i18n`Błąd trasy.`) + '</b> ' + r.why);
  if (r.end === 'done')
    add(
      'good',
      i18n`<b>${fmtTime(r.final)}</b>. To pokaz trenera: szybka i czysta jazda, ale z zapasem w złożeniu, na hamulcach i przy pachołkach. Własny plan porównasz z nim w planerze.`,
    );
  if (!r.segs || !r.segs.length) return;
  const loops = r.segs.filter((s) => s.loop && s.ph);
  if (!loops.length) {
    add('info', i18n`Za mało danych, żeby ocenić pętle.`);
    return;
  }
  const stat = (sg) => {
    const P = r.tr.filter((p) => p.rt >= sg.t0 && p.rt <= sg.t1);
    const ph = sg.ph;
    const inR = (a, bb) => P.filter((p) => p.rt >= a && p.rt <= bb);
    const avg = (A, f) => (A.length ? A.reduce((s, p) => s + f(p), 0) / A.length : 0);
    const s2 = inR(ph.s2, ph.s3);
    const s1 = inR(ph.s1, ph.s2);
    let vmin = 1e9;
    for (const p of s2.length ? s2 : P) vmin = Math.min(vmin, p.v);
    return { full: ph.full, vmin, dt: sg.dt, zS1: avg(s1, (p) => p.zf || 0), zrS1: avg(s1, (p) => p.zr || 0) };
  };
  const st = loops.map(stat);
  const zS1 = st.reduce((s, q) => s + q.zS1, 0) / st.length;
  const zrS1 = st.reduce((s, q) => s + q.zrS1, 0) / st.length;
  const gS1 = liveGeometry(S, zS1 * S.ft, zrS1 * S.rt);
  const zTxt = i18n`główka o ${fmtNum((S.eps0 - gS1.eps) * DEG, 1)}° bardziej stroma, wyprzedzenie krótsze o ${Math.max(0, Math.round((b.trail - gS1.trail) * 1000))} mm`;
  const nFull = st.filter((s) => s.full).length;
  const bt = r.bot;
  const T = r.tr.filter((p) => p.rt != null);
  const onLock = nFull * 2 >= st.length;
  let fMax = 0;
  let rMax = 0;
  let fSum = 0;
  let rSum = 0;
  let pbM = 0;
  let stM = 0;
  for (const p of T) {
    const f = (p.uf || 0) * b.bf;
    const rr = (p.ur || 0) * b.br;
    fSum += f;
    rSum += rr;
    fMax = Math.max(fMax, f);
    rMax = Math.max(rMax, rr);
    pbM = Math.max(pbM, Math.abs(p.phb || 0));
    stM = Math.max(stM, Math.abs(p.st || 0));
  }
  const fSh = fSum + rSum > 0 ? fSum / (fSum + rSum) : 1;
  const vmA = st.reduce((s0, q) => s0 + q.vmin, 0) / st.length;
  let rv = 0;
  {
    let ex = T.length ? T[0].st || 0 : 0;
    let dir = 0;
    for (const p of T) {
      const s0 = p.st || 0;
      if (dir >= 0) {
        if (s0 > ex) ex = s0;
        else if (ex - s0 > 3 * RAD) {
          rv++;
          dir = -1;
          ex = s0;
        }
      }
      if (dir <= 0) {
        if (s0 < ex) ex = s0;
        else if (s0 - ex > 3 * RAD) {
          rv++;
          dir = 1;
          ex = s0;
        }
      }
    }
  }
  add(
    'info',
    i18n`Jak jechał trener: rusza z tyłu boxu przy prawym skraju i na pełnym gazie mija niebieski pachołek, mając go po lewej ręce. Przed każdą pętlą hamuje mocno przodem: najmocniej ${fmtNum(fMax / G, 2)} g. Składając się, oddaje przód razem ze złożeniem, a tył od razu przejmuje hamowanie: najmocniej ${fmtNum(rMax, 1)} m/s² (${Math.round((rMax / b.br) * 100)}% dźwigni), potem coraz mniej, aż do gazu, i puszcza go dopiero chwilę po wejściu na gaz; przód to ${Math.round(fSh * 100)}% całego hamowania. Przeciążenia idą po obwiedni wykresu g-g dla łuku o stałym promieniu (przerywana linia). Obwiednia motocykla nie jest okręgiem: w takim łuku tył musi utrzymać ok. połowę siły bocznej, a hamowanie przodem go odciąża. Kiedy motocykl się składa, obrót przyspiesza i większą część siły bocznej bierze przód, więc w złożeniu da się hamować mocniej; przy podnoszeniu odwrotnie, co pozwala na więcej gazu (ciągła linia, bliżej okręgu, dla obecnej prędkości: im wolniej, tym szybciej rośnie obrót). Tego zapasu trener jeszcze nie wykorzystuje. Używa ${Math.round((bt.eta || 1) * 100)}% przyczepności opon.`,
  );
  add(
    'info',
    i18n`Pętla: w najciaśniejszym miejscu średnio ${Math.round(vmA * 3.6)} km/h, motocykl złożony do ${Math.round(pbM * DEG)}°. Kierownica: krótki przeciwskręt na wejściu, dokręcenie do ${Math.round(stM * DEG)}° (pełny skręt ${S.b.lock}°) i płynne odkręcanie na wyjściu, gdy gaz narasta w ok. ${fmtNum(bt.op || 0.35, 2)} s do granicy opon. W całym przejeździe kierownica zmienia kierunek o więcej niż 3° ${rv} razy, ok. ${Math.round(rv / st.length)} na pętlę.` +
      (onLock ? i18n` Na odbojach w ${nFull} z ${st.length} pętli: tu pętlę ogranicza skręt kierownicy.` : ''),
  );
  add(
    'info',
    i18n`Wierzchołek: w złożeniu trener bierze ok. ${Math.round(bt.opt.lf * 100)}% przyczepności. Tył hamuje do prędkości wierzchołka (ok. ${Math.round(bt.vTurn * 3.6)} km/h) i coraz słabiej, bo w pełnym złożeniu tylnej oponie zostaje mało przyczepności na hamowanie; zwolniony motocykl jedzie ciaśniej. Wtedy trener uchyla gaz (prędkość stoi), a tył puszcza dopiero po ok. 0,2 s: hamulec i gaz na tym samym kole prawie się znoszą, więc ta zakładka nie zabiera przyczepności, a nie ma chwili bez hamulca i bez gazu. W G stawia motocykl: krótki ruch kierownicą w stronę zakrętu zwiększa siłę odśrodkową, a gaz narasta do granicy opon.`,
  );
  add(
    'info',
    i18n`Zawieszenie: na wejściu (S1, A–C) trener jeszcze trzyma przód, więc widelec ma średnio ${Math.round(zS1 * 100)}% skoku (bez hamowania 30%): ${zTxt}. Motocykl łatwiej się wtedy składa i ciaśniej domyka łuk. Porównaj wiersze „Przedni ham.” i „Widelec” na wykresie pętli.`,
  );
  if (st.length >= 3) {
    const sorted = st.slice().sort((a, b2) => a.dt - b2.dt);
    add(
      'info',
      i18n`Kliknij pętlę nad wykresem (np. F2), żeby zobaczyć jej przebieg na tle wzorca A–H. Pętle trenera trwają od ${fmtNum(sorted[0].dt, 2)} do ${fmtNum(sorted[sorted.length - 1].dt, 2)} s.`,
    );
  }
}
function setStatus(html, bad, cls) {
  const el = $('status');
  el.innerHTML = html;
  el.classList.toggle('bad', !!bad);
  el.classList.toggle('good', cls === 'good');
}
let overlayToken = 0;
function showOverlay(big, small, ms) {
  const o = $('overlay');
  o.innerHTML = big + (small ? '<small>' + small + '</small>' : '');
  o.hidden = false;
  const tk = ++overlayToken;
  if (ms)
    setTimeout(() => {
      if (tk === overlayToken) o.hidden = true;
    }, ms);
}
function hideOverlay() {
  overlayToken++;
  $('overlay').hidden = true;
}
function syncSeg(id, val) {
  document
    .querySelectorAll('#' + id + ' button')
    .forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(val))));
}
function settingsChanged() {
  if (planner.busy) {
    compareToken++;
    planner.busy = false;
    planBusyUI();
  }
  player.on = false;
  saveSettings();
  S = makeSetup(bikeById(state.bike), state.pos, state.seat);
  syncSeg('posSeg', state.pos);
  syncSeg('seatSeg', state.seat);
  $('posNote').textContent = STANCE_NOTE[state.pos];
  $('seatNote').textContent = SEAT_NOTE[String(state.seat)];
  last = null;
  hover = null;
  selSeg = null;
  planner.res = null;
  planner.lastRide = planner.lastPlan = null;
  $('player').hidden = true;
  if (planner.on) {
    initPlanner();
    syncPlanUI();
  } else planner.key = null;
  renderSegButtons();
  drawTele();
  $('tips').innerHTML = planner.on ? PLAN_INTRO : DEMO_INTRO;
  renderSplits({ course: { splits: [] }, mode: planner.on ? 'plan' : 'demo' });
  renderBikes();
  drawTrack();
  drawViews();
  renderResults();
  renderParams();
}
document.querySelectorAll('#posSeg button').forEach(
  (x) =>
    (x.onclick = () => {
      if (run && !run.end) return;
      state.pos = x.dataset.v;
      settingsChanged();
    }),
);
document.querySelectorAll('#seatSeg button').forEach(
  (x) =>
    (x.onclick = () => {
      if (run && !run.end) return;
      state.seat = +x.dataset.v;
      settingsChanged();
    }),
);
$('demoBtn').onclick = startDemo;
$('stopBtn').onclick = () => stopRun(i18n`Przejazd przerwany.`);
function renderParams() {
  $('params').innerHTML =
    '<tr>' +
    [
      i18n`Motocykl`,
      i18n`Masa`,
      i18n`Moc`,
      i18n`Dół`,
      i18n`Rozstaw`,
      i18n`Skręt kier.`,
      i18n`Kąt główki`,
      i18n`CoG`,
      i18n`Przód`,
      i18n`Złożenie max`,
      i18n`Opony (μ)`,
      i18n`Przód / tył ham.`,
      i18n`Przekładanie`,
      i18n`Pełny skręt przy 45°`,
      i18n`Skok przód / tył`,
      i18n`Ugięcie przodu przy 1 g`,
      i18n`Tył: hamulec / zakładka / gaz`,
      i18n`Wyprzedzenie`,
    ]
      .map((h) => '<th>' + h + '</th>')
      .join('') +
    '</tr>' +
    BIKES.map((b) => {
      const s = makeSetup(b, 'neu', 0);
      return `<tr><td>${b.name}<br><span class="note">${b.sub}</span></td><td class="t">${b.m} kg</td><td class="t">${localNum(b.P)} kW</td><td class="t">${Math.round(b.b0 * 100)}%</td><td class="t">${fmtNum(b.L, 2)} m</td><td class="t">${b.lock}°</td><td class="t">${b.rake}°</td><td class="t">${fmtNum(b.h, 2)} m</td><td class="t">${Math.round(b.ff * 100)}%</td><td class="t">${b.clear}°</td><td class="t">${localNum(b.mu)} · ${b.tyre}</td><td class="t">${localNum(b.bf)} / ${localNum(b.br)} m/s²</td><td class="t">${b.roll}°/s</td><td class="t">${fmtNum(lockRadius(s, 45 * RAD), 1)} m</td><td class="t">${b.ft} / ${b.rt} mm</td><td class="t">${b.fd} mm</td><td class="t">${[
        rearTravelShift(s, 0, b.br),
        rearTravelShift(s, b.br, b.br),
        rearTravelShift(s, b.br, 0),
      ]
        .map((z) => {
          const r = Math.round(z * 1000);
          return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r);
        })
        .join(' / ')} mm</td><td class="t">${Math.round(b.trail * 1000)} mm</td></tr>`;
    }).join('');
}
