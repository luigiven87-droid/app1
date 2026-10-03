# Ripasso SNA XII — rilettura dei ripassi

Un ambiente per rileggere i ripassi di teoria della preselettiva SNA XII
(6 ottobre 2026): niente quiz né simulazioni. Si apre una scheda, si legge, e
ogni punto si può segnare **«Lo so»** o **«Da ripassare»**; nei giri successivi
si rilegge solo quello che manca.

- **Indice**: volumi e schede, con l'avanzamento di ciascuna.
- **Scheda**: testo integrale (In breve, sezioni, tabelle, Da non confondere),
  con le viste *Tutto · Essenziale · Da ripassare · Non segnati*.
- **Da ripassare**: tutti i punti segnati, raggruppati per scheda; filtri per
  volume, novità, pagine dei numeri.
- **Cerca**: parole, articoli e numeri in tutti i volumi.
- Volumi letti: `RIPASSO_1` … `RIPASSO_4`. Il vol. 5 (dettagli di nicchia) è
  escluso di proposito (`ESCLUSI` in `build.py`).

## Dove si salvano i progressi

- **Pagina su claude.ai** (`python3 build.py --artifact`, pubblicata come pagina
  privata): si entra con il proprio account Claude e i segni stanno nell'area
  privata dell'utente (capacità `db` + `user`), quindi si ritrovano su ogni
  dispositivo.
- **File locale** (`dist/ripasso-sna12.html`, doppio clic): i segni restano nel
  browser; «Progressi → Esporta / Importa» li sposta come testo.

## Generare la pagina

```sh
python3 build.py             # dist/ripasso-sna12.html (file unico, offline)
python3 build.py --artifact  # dist/ripasso-sna12-artifact.html (pagina su claude.ai)
```

Serve solo Python 3 (libreria standard). Lo script legge `materiali/*.md` senza
modificarli. Gli ID dei punti dipendono dal loro testo: se aggiorni i
materiali, i segni restano validi per tutti i punti che non cambiano.

`materiali/` e `dist/` sono esclusi da git.

## Test

```sh
tests/run_all.sh   # build + test del parser + browser headless in vista telefono
```

- `tests/test_parser.py`: schede attese, ID univoci, nessun markup residuo,
  testo integrale, riquadri, novità, tabelle.
- `tests/browser_test.cjs`: Playwright/Chromium a 390 px: lettura, segni,
  viste, giro di ripasso, ricerca, persistenza, tema scuro, salvataggio
  nell'account con la capacità `db` simulata.

## Struttura

- `build.py` — legge i materiali, stampa il riepilogo, scrive la pagina
- `sna12/ripassi.py` — parser: schede, sezioni, riquadri, tabelle, punti
- `src/app.html`, `src/app.css`, `src/app.js` — interfaccia
