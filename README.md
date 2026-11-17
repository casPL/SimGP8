# SimGP8

A browser simulator of the GP8 motogymkhana layout: two cones 12 m apart, a start and finish box behind
the near cone (the bike has to stop in it at the end), five figure eights. Watch the coach ride it, or
plan your own run by setting the braking, turn-in and throttle points, and compare it with the coach
loop by loop.

[Opis po polsku](#po-polsku) jest niżej.

## Playing

The simulator is a single HTML file and needs nothing but a browser. Download one of these and open it:

- [dist/simgp8-en.html](dist/simgp8-en.html), English
- [dist/simgp8-pl.html](dist/simgp8-pl.html), Polish

The fonts come from Google Fonts; offline, the browser falls back to its own.

## What it models

- Five bikes, from a 12" pit bike to a GSX-R 1000, each with its power, brakes, steering lock, rake,
  suspension and rear linkage; three body positions (lean in, neutral, lean out) and three seat positions.
- Tyre limits as friction circles with load transfer, including the side force that yaw inertia moves
  between the wheels while the bike leans in or is picked up. The g-g envelope of a motorcycle is not
  a circle. A rear tyre unloaded by braking cannot hold a deeper lean, and an overloaded front stands
  the bike up onto a wider line.
- Exact steering kinematics in a lean (Cossalter, *Motorcycle Dynamics*): at full lock a leaned bike
  turns much tighter than an upright one.
- Roll dynamics with countersteering, fork dive and rear squat, and the rider's body as a second mass.
- The outline of the bike with its rider (handlebar ends, tail, footpeg, knee, elbow) against the
  shape of a real cone, so the gap to a cone is measured rather than assumed.
- An automatic rider that does not follow a drawn line. It rides by the plan points and a few rules:
  brake mostly with the front, lean in as the brakes fade, open the throttle as far as the lean
  allows. The line comes out of the physics.

## Building

Node.js 18 or newer, no dependencies:

```sh
node build.js     # writes dist/simgp8-pl.html and dist/simgp8-en.html
npm test          # physics regression and translation checks
npm run format    # Prettier, the only development dependency
```

## Source layout

```text
src/js/           the simulator; build.js joins the files in order, and they share one scope
  i18n … simulate   the simulation core, which also runs without a browser (see test/)
  app … main        the interface
src/page.*.html   the markup of each edition
src/style.css     styles
src/shell.html    the document the build fills in
src/en.json       the English dictionary
test/             tests, with the recorded run times
```

## Translations

Polish is the source language. Interface strings stay in the code as templates tagged with
`i18n`, and every other edition has a dictionary that maps each Polish template (with `{}` for each
placeholder) to its translation. To add a language, copy `src/en.json` to `src/<lang>.json` and
translate the values, translate `src/page.en.html` into `src/page.<lang>.html`, and add the edition
to `EDITIONS` in `build.js`. The build stops with a list of missing or unused entries, and the tests
check that every page has the same markup.

## Licence

SimGP8 is free software: you can redistribute it and/or modify it under the terms of the GNU General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at
your option) any later version. It comes with no warranty. See [LICENSE](LICENSE).

## Author

Maciej Kasprzyk, Instagram [@cas8pl](https://www.instagram.com/cas8pl/)

## Po polsku

SimGP8 to symulator przejazdu GP8 w motogymkhanie: dwa pachołki 12 m od siebie, box startu i mety za
bliższym pachołkiem (na koniec trzeba się w nim zatrzymać), pięć ósemek. Można obejrzeć przejazd
trenera albo zaplanować własny, ustawiając punkty hamowania, składania i gazu, i porównać go
z trenerem pętla po pętli.

Symulator to jeden plik HTML, wystarczy przeglądarka: pobierz
[dist/simgp8-pl.html](dist/simgp8-pl.html) (albo angielski [dist/simgp8-en.html](dist/simgp8-en.html))
i otwórz go.

Model obejmuje pięć motocykli (od pitbike'a 12" po GSX-R 1000), trzy pozycje ciała i trzy pozycje na
siedzeniu, koła przyczepności z przenoszeniem masy i bezwładnością odchylenia, dokładną kinematykę
skrętu w złożeniu (Cossalter, *Motorcycle Dynamics*), przeciwskręt, pracę zawieszenia i obrys
motocykla z kierowcą przy pachołku. Automatyczny kierowca nie śledzi narysowanej nitki: jedzie według
punktów planu i kilku zasad, a nitka wynika z fizyki.

Budowanie: `node build.js` (Node.js 18 lub nowszy, bez zależności), testy: `npm test`. Teksty
interfejsu są w kodzie po polsku jako szablony `i18n`, a słownik `src/en.json` tłumaczy je na
angielski; nowy język dodaje się tak, jak opisano w sekcji Translations.

Licencja: GNU GPL w wersji 3 lub nowszej (plik [LICENSE](LICENSE)). Autor: Maciej Kasprzyk,
Instagram [@cas8pl](https://www.instagram.com/cas8pl/).
