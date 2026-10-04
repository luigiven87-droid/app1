# Ripasso SNA XII — rilettura e simulazioni

Un ambiente per rileggere i ripassi di teoria della preselettiva SNA XII
(6 ottobre 2026) e, in una sezione a parte, fare le simulazioni della prova.
Nella rilettura si apre una scheda, si legge, e ogni punto si può segnare
**«Lo so»** o **«Da ripassare»**; nei giri successivi si rilegge solo quello che manca.

- **Indice**: volumi e schede, con l'avanzamento di ciascuna.
- **Scheda**: testo integrale (In breve, sezioni, tabelle, Da non confondere),
  con le viste *Tutto · Essenziale · Da ripassare · Non segnati*.
- **Da ripassare**: tutti i punti segnati, raggruppati per scheda; filtri per
  volume, novità, pagine dei numeri.
- **Cerca**: parole, articoli e numeri in tutti i volumi.
- **Grafici e schemi** (22, in `sna12/figure.py`): i grafici di economia che il vol. 4
  cita (prezzo massimo, curve di costo, IS-LM) più casi limite IS-LM, AD-AS,
  Phillips, Laffer, ottimo del consumatore, monopolio; schemi per procedimento
  (D4), termini processuali in scala (D10), fonti (C1), revisione costituzionale
  (C3), Mintzberg, Maslow, Kingdon, catena del valore, matrici 2×2 (Wilson,
  Thompson-Tuden, Matland, beni), fasi di entrata e spesa. Ogni figura è
  agganciata a un punto della scheda: se il testo cambia e l'aggancio non si
  trova più, la build si ferma e lo dice.
- Volumi letti: `RIPASSO_1` … `RIPASSO_4`. Il vol. 5 (dettagli di nicchia) è
  escluso di proposito (`ESCLUSI` in `build.py`).
- **Progressi** (dall'Indice): stato del salvataggio, copia di sicurezza, azzeramento.

## Simulazioni

Le sei prove del piano dell'analisi (`materiali/analisi/*analisi_sna12.json`),
più la ripresa degli errori:

| | Prova | Quesiti | Minuti |
|---|---|---|---|
| H1 | Prova generale nel formato XII | 60 | 90 |
| H2 | Materie ad alta resa | 36 | 54 |
| H3 | Situazionali e ragionamento a tempo | 24 | 36 |
| H4 | Spazio adiacente: domande mai viste (Formez) | 30 | 45 |
| H5 | Fascia media: buchi da chiudere | 30 | 45 |
| H6 | Riserva di formato (logica deduttiva e verbale, inglese) | 18 | 27 |

Nella stessa sezione, oltre alle **Prove**:

- **Materie** (blocco): una o più materie a scelta (nessuna = tutte); con una
  sola materia anche le singole schede (D1…D10, M1…M7…) o i tipi di quesito
  (brani, serie figurali, lessico…). Banche SNA e Formez, riserva a richiesta,
  5-30 quesiti, con o senza tempo (1,5′ a quesito), correzione subito o alla fine.
  Escono prima i quesiti mai visti; un brano entra con le sue domande.
- **Errori**: solo i quesiti sbagliati (situazionali: non la migliore) e non
  ancora risolti dopo, filtrabili per materia; escono quando li fai giusti.
  Priorità: non rivisti da almeno 12 ore, poi i più sbagliati, poi i più vecchi.
  Gli omessi solo a richiesta.
- **Storico**: andamento per materia su tutte le risposte e prove consegnate.

- **Quesiti**: quelli dei Dossier 1-6 (preselettive SNA 8-11) e delle Addenda
  Formez, letti dai PDF in `materiali/pdf/` (`sna12/quesiti.py`): testo, opzioni,
  chiave e commento alla lettera, brani interi, figure dei 54 figurali. La
  classificazione (area, scheda o tipo, fascia, includi) viene da
  `*quesiti_sna12.csv`: i quesiti con includi = «no» (nicchia) non entrano,
  quelli in «riserva» solo in H6 o quando mancano alternative.
- **Sorteggio**: le quote per scheda e per tipo di ogni prova; prima i quesiti
  mai visti, niente doppioni nella stessa prova, brani da tre domande come nelle
  buste, ordine della busta SNA 11.
- **Punteggio del bando**: esatta +1, errata −0,53, omessa 0; situazionali 1 /
  0,50 / 0. Per i dodici modelli SNA 9 la Scuola ha pubblicato solo la migliore:
  il risultato indica anche il punteggio se le altre scelte fossero le neutre.
- **Prova**: un quesito alla volta, griglia per saltare, «dubbio», consegna;
  cronometro nella testata (conta solo mentre la prova è aperta; a tempo
  scaduto la prova si consegna). In alternativa «Correzione subito», senza tempo.
- **Correzione**: punteggio per area, schede da rileggere, ogni quesito con
  chiave, commento, fonte e il collegamento alla scheda del ripasso.
- Non entrano i quesiti del Dossier 1 di cui il PDF dà solo un riassunto
  (situazionali SNA 10-11) o la sola lettera (buste 1 e 2 di SNA 9).

## Dove si salvano i progressi

- **Pagina su claude.ai** (`python3 build.py --artifact`, pubblicata come pagina
  privata): si entra con il proprio account Claude e segni e prove stanno
  nell'area privata dell'utente (capacità `db` + `user`, documenti `v1`…`v4`,
  `meta` e `sim`), quindi si ritrovano su ogni dispositivo.
- **File locale** (`dist/ripasso-sna12.html`, doppio clic): i segni restano nel
  browser; «Progressi → Esporta / Importa» li sposta come testo.

## Generare la pagina

```sh
python3 build.py             # dist/ripasso-sna12.html (file unico, offline)
python3 build.py --artifact  # dist/ripasso-sna12-artifact.html (pagina su claude.ai)
```

Serve Python 3 (libreria standard); per le simulazioni anche `pdftotext` e
`pdftohtml` (poppler) e, per comprimere le figure, ImageMagick. Senza PDF o
senza analisi la sezione Simulazioni non compare. Lo script legge `materiali/`
senza modificarlo. Gli ID dei punti dipendono dal loro testo: se aggiorni i
materiali, i segni restano validi per tutti i punti che non cambiano.

`materiali/` e `dist/` sono esclusi da git.

## Test

```sh
tests/run_all.sh   # build + test del parser + browser headless in vista telefono
```

- `tests/test_parser.py`: schede attese, ID univoci, nessun markup residuo,
  testo integrale, riquadri, novità, tabelle; quesiti dei PDF (conteggi contro il
  CSV, chiavi fra le opzioni, testo alla lettera, brani, figure, nicchia esclusa).
- `tests/browser_test.cjs`: Playwright/Chromium a 390 px: lettura, segni,
  viste, giro di ripasso, ricerca, persistenza, tema scuro, salvataggio
  nell'account con la capacità `db` simulata; simulazioni (quote di H1-H6,
  ordine della busta, punteggio, ripresa dopo ricarica, tempo scaduto, ripresa
  degli errori, storico nell'account).

## Struttura

- `build.py` — legge i materiali, stampa il riepilogo, scrive la pagina
- `sna12/ripassi.py` — parser: schede, sezioni, riquadri, tabelle, punti
- `sna12/figure.py` — grafici e schemi in SVG, con i loro agganci
- `sna12/quesiti.py` — quesiti, brani e figure dai PDF dei dossier
- `sna12/simulazioni.py` — unione con l'analisi (CSV e piano delle prove)
- `src/app.html`, `src/app.css`, `src/app.js` — interfaccia
- `src/sim.js` — sezione Simulazioni (inserita in `app.js` dalla build)
