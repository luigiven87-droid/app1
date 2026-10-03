/* Test nel browser headless (Playwright, Chromium) con vista da telefono.
   Uso:  node tests/browser_test.cjs [cartella-screenshot]
   Richiede: dist/ripasso-sna12.html (python3 build.py) e la build delle fixture
   (la crea da sé in una cartella temporanea). */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Playwright non trovato: installalo (npm i -g playwright) o imposta NODE_PATH.');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'sna12-shots-'));
fs.mkdirSync(SHOTS, { recursive: true });
const REAL = path.join(ROOT, 'dist', 'ripasso-sna12.html');
const FIXTURE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sna12-fx-')), 'fixture.html');
execFileSync('python3', [path.join(ROOT, 'build.py'), '--materiali', path.join(ROOT, 'tests', 'fixtures', 'materiali'), '--out', FIXTURE], { stdio: 'ignore' });

let failures = 0;
function check(cond, msg) {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  if (!cond) failures++;
}

async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'it-IT' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', d => { page.errors.push('dialogo nativo: ' + d.message()); d.dismiss(); });
  return page;
}
async function noHScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

(async () => {
  const browser = await chromium.launch();

  /* ---------------- flashcard sui materiali reali */
  if (fs.existsSync(REAL)) {
    console.log('Flashcard (materiali reali)');
    const page = await phone(browser);
    await page.goto('file://' + REAL);
    await page.screenshot({ path: path.join(SHOTS, '01-flash-home.png'), fullPage: true });
    check(await noHScroll(page), 'nessuno scroll orizzontale a 390 px');
    const tabs = await page.$$eval('.tab', b => b.map(x => x.textContent));
    check(tabs.join('|') === 'Flashcard|Progressi', 'quiz e simulazione nascosti senza i loro file (' + tabs.join(', ') + ')');
    // filtro: un volume e una scheda, così la prima carta è una carta a lacune nota
    await page.selectOption('#fc-vol', '1');
    await page.selectOption('#fc-sch', '1:D4');
    await page.click('[data-act=seg][data-name=fcSize][data-val="10"]');
    await page.click('[data-act=fcStart]');
    const lac = await page.$('.card .lac');
    check(!!lac, 'la prima carta di D4 è a lacune');
    const hidden = await page.$eval('.card .lac', el => getComputedStyle(el).color);
    check(/rgba\(0, 0, 0, 0\)|transparent/.test(hidden), 'le lacune sono nascoste prima di «Mostra risposta»');
    await page.screenshot({ path: path.join(SHOTS, '02-flash-cloze.png') });
    const btnH = await page.$eval('[data-act=fcShow]', el => el.getBoundingClientRect().height);
    check(btnH >= 48, 'tasto «Mostra risposta» alto almeno 48 px (' + Math.round(btnH) + ')');
    await page.click('[data-act=fcShow]');
    const shown = await page.$eval('.card .lac', el => getComputedStyle(el).color);
    check(!/rgba\(0, 0, 0, 0\)/.test(shown), 'le lacune compaiono dopo «Mostra risposta»');
    await page.screenshot({ path: path.join(SHOTS, '03-flash-revealed.png') });
    await page.click('[data-act=fcRate][data-r=ko]');
    await page.click('[data-act=fcShow]');
    await page.click('[data-act=fcRate][data-r=ok]');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('sna12-ripasso-v1')));
    const vals = Object.values(st.cards);
    check(vals.length === 2, 'due carte salvate in localStorage');
    check(vals.some(v => v.b === 1 && v.w === true), '«Non sapevo» → scatola 1 e segnata sbagliata');
    check(vals.some(v => v.b === 2 && !v.w), '«Sapevo» → sale alla scatola 2');
    // termina e torna ai filtri: «solo sbagliate» deve contare 1 carta
    await page.click('[data-act=fcQuit]');
    await page.click('[data-act=fcHome]');
    await page.check('[data-change=fcWrong]');
    const lbl = await page.textContent('#fc-count');
    check(/1 carta/.test(lbl), 'filtro «solo carte sbagliate» → 1 carta (' + lbl.trim() + ')');
    await page.uncheck('[data-change=fcWrong]');
    // tabella dei numeri
    await page.selectOption('#fc-vol', '');
    await page.check('[data-change=fcNum]');
    await page.click('[data-act=fcStart]');
    check(!!(await page.$('.tq')), 'filtro numeri → carta-tabella');
    await page.click('[data-act=fcShow]');
    await page.screenshot({ path: path.join(SHOTS, '04-flash-table.png') });
    // tema scuro
    await page.emulateMedia({ colorScheme: 'dark' });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(bg === 'rgb(20, 22, 26)', 'tema scuro automatico (' + bg + ')');
    await page.screenshot({ path: path.join(SHOTS, '05-flash-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.click('#theme-btn'); // auto → chiaro
    await page.click('#theme-btn'); // chiaro → scuro
    const forced = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check(forced === 'dark', 'il pulsante forza il tema scuro');
    // progressi: export
    await page.click('[data-tab=prog]');
    await page.click('[data-act=exportCopy]');
    const exported = await page.inputValue('#exp-text');
    check(/"cards":\{"[0-9a-f]{10}/.test(exported), 'esporta progressi: testo JSON con le carte');
    await page.click('[data-act=resetAll]');
    await page.click('#modal-no');
    check(Object.keys(JSON.parse(await page.evaluate(() => localStorage.getItem('sna12-ripasso-v1'))).cards).length === 2, '«Annulla» non azzera');
    await page.screenshot({ path: path.join(SHOTS, '06-progressi.png'), fullPage: true });
    check(await noHScroll(page), 'Progressi: nessuno scroll orizzontale');
    check(page.errors.length === 0, 'nessun errore JavaScript (' + page.errors.join('; ') + ')');
    await page.close();
  } else {
    console.log('dist/ripasso-sna12.html assente: esegui prima python3 build.py');
    failures++;
  }

  /* ---------------- quiz e simulazione sulle fixture */
  console.log('Quiz e simulazione (fixture sintetiche)');
  const page = await phone(browser);
  await page.goto('file://' + FIXTURE);
  const tabs = await page.$$eval('.tab', b => b.map(x => x.textContent));
  check(tabs.join('|') === 'Flashcard|Quiz|Simulazione|Progressi', 'con i file, compaiono Quiz e Simulazione');
  await page.click('[data-tab=quiz]');
  await page.uncheck('[data-change=qzRandom]');
  await page.click('[data-act=seg][data-name=qzSize][data-val=all]');
  await page.screenshot({ path: path.join(SHOTS, '07-quiz-home.png'), fullPage: true });
  await page.click('[data-act=qzStart]');
  // D1-M1 (situazionale, solo la migliore: C)
  check((await page.textContent('.qid')) === 'D1-M1', 'primo quesito D1-M1');
  await page.click('[data-act=qzAns][data-k=C]');
  check(/migliore · \+1/.test(await page.textContent('.verdict')), 'situazionale: migliore +1');
  await page.click('[data-act=qzNext]');
  // D1-M2: rispondo B (non migliore; neutra/peggiore non indicate) → 0
  await page.click('[data-act=qzAns][data-k=B]');
  check(/Non è la migliore · 0/.test(await page.textContent('.verdict')), 'situazionale senza neutra indicata: 0');
  await page.click('[data-act=qzNext]');
  // D5-11 chiave A: rispondo B → errata −0,53; segno «indovinata a caso»
  check((await page.textContent('.qid')) === 'D5-11', 'terzo quesito D5-11');
  await page.check('[data-change=qzGuess]');
  await page.click('[data-act=qzAns][data-k=B]');
  check(/Errata · −0,53/.test(await page.textContent('.verdict')), 'errata −0,53');
  check(/Secondo paragrafo/.test(await page.textContent('.expl')), 'spiegazione integrale (anche il secondo paragrafo)');
  check(/UFFICIALE SNA-11 \| busta 3, 2025, Q37/.test(await page.textContent('.panel')), 'etichetta della fonte');
  await page.screenshot({ path: path.join(SHOTS, '08-quiz-answer.png'), fullPage: true });
  await page.click('[data-act=qzNext]');
  // D5-13: avviso affidabilità media; salto (omessa)
  check(!!(await page.$('.note')), 'avviso «affidabilità media»');
  await page.click('[data-act=qzSkip]');
  check(/Omessa · 0/.test(await page.textContent('.verdict')), 'omessa 0');
  await page.click('[data-act=qzNext]');
  // D6-1 con brano: chiave D → esatta
  check(!!(await page.$('details.brano[open]')), 'brano mostrato con la domanda');
  await page.click('[data-act=qzAns][data-k=D]');
  check(/Esatta · \+1/.test(await page.textContent('.verdict')), 'esatta +1');
  await page.click('[data-act=qzNext]');
  await page.click('[data-act=qzAns][data-k=C]'); // D6-2 esatta
  await page.click('[data-act=qzNext]');
  await page.click('[data-act=qzAns][data-k=A]'); // D6-3 esatta
  await page.click('[data-act=qzNext]');
  // AD2-C.12: situazionale con neutra B
  await page.click('[data-act=qzAns][data-k=B]');
  check(/neutra · \+0,50/.test(await page.textContent('.verdict')), 'situazionale: neutra +0,50');
  const tags = await page.$$eval('.opt .tag', t => t.map(x => x.textContent).join(','));
  check(/migliore/.test(tags) && /neutra/.test(tags) && /peggiore/.test(tags), 'etichette migliore / neutra / peggiore');
  await page.screenshot({ path: path.join(SHOTS, '09-quiz-sit.png'), fullPage: true });
  await page.click('[data-act=qzNext]');
  // risultato: 1 + 0 − 0,53 + 0 + 1 + 1 + 1 + 0,50 = 3,97
  const score = await page.textContent('.score');
  check(score.startsWith('3,97'), 'punteggio quiz = 3,97 calcolato a mano (' + score + ')');
  const codes = await page.textContent('#codes-sess');
  check(codes === 'D1-M2, D5-11, AD2-C.12', 'codici esportati = sbagliati o a caso (' + codes + ')');
  await page.screenshot({ path: path.join(SHOTS, '10-quiz-result.png'), fullPage: true });

  // simulazione
  await page.click('[data-tab=sim]');
  await page.click('[data-act=simStart]');
  await page.click('#modal-yes');
  check(!!(await page.$('#sim-timer')), 'timer visibile');
  const t0 = await page.textContent('#sim-timer');
  check(/^(90:00|89:5\d)$/.test(t0), 'timer parte da 90:00 (' + t0 + ')');
  await page.screenshot({ path: path.join(SHOTS, '11-sim-q1.png'), fullPage: true });
  async function answer(n, k) {
    await page.click('[data-act=simGrid]');
    await page.click('.grid [data-n="' + n + '"]');
    await page.click('[data-act=simAns][data-k=' + k + ']');
  }
  // Consegna di prova (chiavi della fixture):
  //  1  A>C>B, risposta A → 1        2  B>A>C, risposta A → 0,50     3  C>B>A, risposta A → 0
  // 13  E, risposta E → +1          14  C, risposta A → −0,53        15  A, risposta B → −0,53
  // 20  (Formez) A, risposta A → +1  il resto omesso → 0
  // Totale a mano: 1 + 0,5 + 0 + 1 − 0,53 − 0,53 + 1 = 2,44
  // Parte I: 1,50 · Parte II: −0,06 · Parte III: 1,00 · Archivio 1,44 · Formez 1,00
  await answer(1, 'A'); await answer(2, 'A'); await answer(3, 'A');
  await answer(13, 'E');
  check(/figura: vedi il PDF della simulazione/.test(await page.textContent('.fig')), 'figurale: nota «vedi il PDF»');
  await answer(14, 'B'); await answer(14, 'A'); // risposta modificata
  await answer(15, 'B'); await answer(20, 'A');
  await page.check('[data-change=simRev]');
  await page.click('[data-act=simGrid]');
  const revMarked = await page.$('.grid button.rev');
  check(!!revMarked, 'quesito segnato «da rivedere» nell\'indice');
  await page.screenshot({ path: path.join(SHOTS, '12-sim-grid.png'), fullPage: true });
  await page.click('[data-act=simSubmitAsk]');
  check(!!(await page.$('#modal-yes')), 'consegna: conferma dentro la pagina');
  await page.click('#modal-yes');
  const simScore = await page.textContent('.score');
  check(simScore.startsWith('2,44'), 'punteggio simulazione = 2,44 calcolato a mano (' + simScore + ')');
  const partRows = await page.$$eval('table tbody tr', rs => rs.map(r => r.textContent));
  check(partRows.length === 11 + 2, '11 righe per le parti + 2 (archivio/Formez)');
  const pts = await page.$$eval('table tbody tr', rs => rs.map(r => r.querySelectorAll('td')[2].querySelector('b').textContent));
  check(pts[0] === '1,50' && pts[1] === '−0,06' && pts[2] === '1,00', 'punti per parte I, II, III = 1,50 / −0,06 / 1,00 (' + pts.slice(0, 3).join(' / ') + ')');
  check(pts[11] === '1,44' && pts[12] === '1,00', 'archivio 1,44 e Formez 1,00 (' + pts.slice(11).join(' / ') + ')');
  const simCodes = await page.textContent('#codes-sim');
  check(simCodes === 'COD-02, COD-03, COD-14, COD-15', 'codici sbagliati della simulazione (' + simCodes + ')');
  await page.screenshot({ path: path.join(SHOTS, '13-sim-result.png'), fullPage: true });
  check(await noHScroll(page), 'esito: nessuno scroll orizzontale');
  check(page.errors.length === 0, 'nessun errore JavaScript (' + page.errors.join('; ') + ')');

  await browser.close();
  console.log('\nScreenshot in ' + SHOTS);
  console.log(failures ? failures + ' controlli FALLITI' : 'Tutti i controlli superati');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
