# Ripasso SNA XII — preselettiva del 6 ottobre 2026

Piccola app di ripasso offline: un unico file HTML con dati, CSS e JS incorporati,
che si apre con un doppio clic su computer e telefono. Nessuna chiamata esterna.

- **Flashcard** dai ripassi di teoria (lacune su «In breve», «Da non confondere» e
  dettagli del vol. 5; domande/risposte dalle tabelle), con scatole di Leitner.
- **Quiz d'archivio** (compare solo se in `materiali/` ci sono `DOSSIER_*` / `ADDENDA*`).
- **Simulazione a tempo** (compare solo se ci sono `SIMULAZIONE_MISTA_*`).
- Progressi nel browser (localStorage), con «Esporta / Importa progressi» in JSON.

## Generare la pagina

```sh
python3 build.py            # report sintetico + dist/ripasso-sna12.html
python3 build.py --report   # report con esempi per tipo
python3 build.py --artifact # dist/ripasso-sna12-artifact.html, versione per pagina ospitata
```

Serve solo Python 3 (libreria standard). Lo script legge `materiali/*.md` senza
modificarli. Se aggiorni o aggiungi i materiali, rilancia lo stesso comando:
gli ID delle carte e dei quesiti sono stabili, quindi i progressi restano validi
per tutto ciò che non è cambiato.

`materiali/` e `dist/` sono esclusi da git perché il repository è pubblico.

## Test

```sh
tests/run_all.sh            # build + test dei parser + punteggio + browser headless
```

- `tests/test_parser.py`: ogni quesito ha testo, opzioni e una chiave fra le opzioni;
  ogni simulazione ha 60 quesiti e 60 chiavi; conteggi attesi sui dossier reali.
- `tests/test_scoring.cjs`: punteggio ufficiale su una consegna calcolata a mano.
- `tests/browser_test.cjs`: Playwright/Chromium in vista da telefono (390 px).
- `tests/fixtures/materiali/`: file **sintetici** con testo fittizio, scritti nel formato
  dei materiali solo per provare quiz e simulazione; non finiscono nella pagina reale.

## Struttura

- `build.py` — entrata: legge, stampa il report, scrive la pagina
- `sna12/ripassi.py`, `sna12/quesiti.py`, `sna12/simulazioni.py` — parser
- `src/app.html`, `src/app.css`, `src/app.js`, `src/scoring.js` — interfaccia
