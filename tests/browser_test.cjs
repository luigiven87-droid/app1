/* Test nel browser headless (Playwright, Chromium) con vista da telefono.
   Uso:  node tests/browser_test.cjs [cartella-screenshot]
   Richiede dist/ripasso-sna12.html e dist/ripasso-sna12-artifact.html
   (python3 build.py && python3 build.py --artifact). */
'use strict';
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
const LOCAL = path.join(ROOT, 'dist', 'ripasso-sna12.html');
const HOSTED = path.join(ROOT, 'dist', 'ripasso-sna12-artifact.html');

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
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('sna12-rilettura-v1') || '{}'));
const shot = (page, name, full) => page.screenshot({ path: path.join(SHOTS, name), fullPage: !!full });

(async () => {
  for (const f of [LOCAL, HOSTED]) if (!fs.existsSync(f)) { console.error('Manca ' + f + ': esegui la build'); process.exit(2); }
  const browser = await chromium.launch();

  /* ---------------- lettura e segni (file locale) */
  console.log('Lettura e segni');
  const page = await phone(browser);
  await page.goto('file://' + LOCAL);
  const tabs = await page.$$eval('.tab', b => b.map(x => x.textContent));
  check(tabs.join('|') === 'Indice|Da ripassare|Cerca|Progressi', 'schede: ' + tabs.join(', '));
  check(await noHScroll(page), 'indice: nessuno scroll orizzontale a 390 px');
  const vols = await page.$$eval('.vol-t', v => v.length);
  check(vols === 4, '4 volumi, senza i dettagli di nicchia');
  await shot(page, '01-indice.png', true);

  await page.click('.srow[data-k="1:D4"]');
  check((await page.textContent('h1')).includes('Il procedimento amministrativo'), 'apre la scheda D4');
  const nPts = await page.$$eval('.rd .it', e => e.length);
  check(nPts > 80, 'tutti i punti visibili, niente lacune (' + nPts + ' punti)');
  check(!(await page.$('.lac')), 'nessun testo nascosto');
  await shot(page, '02-scheda.png');

  const first = await page.getAttribute('.rd .it >> nth=0', 'data-id');
  await page.click('.rd .it >> nth=0');
  check(await page.isVisible('#bar'), 'tocco un punto: compare la barra «Da ripassare / Lo so»');
  const barH = await page.$eval('#bar [data-mark="1"]', el => el.getBoundingClientRect().height);
  check(barH >= 48, 'tasti della barra alti almeno 48 px (' + Math.round(barH) + ')');
  await shot(page, '03-punto-selezionato.png');
  await page.click('#bar [data-mark="1"]');
  check((await page.getAttribute('.it[data-id="' + first + '"]', 'data-s')) === '1', '«Da ripassare» segnato');
  const second = await page.getAttribute('.it.focus', 'data-id');
  check(second && second !== first, 'la selezione passa da sola al punto successivo');
  await page.click('#bar [data-mark="2"]');
  check((await page.getAttribute('.it[data-id="' + second + '"]', 'data-s')) === '2', '«Lo so» segnato');
  await page.click('#bar [data-mark="2"]'); // terzo punto: lo so
  const third = await page.$$eval('.it[data-s="2"]', e => e.length);
  check(third === 2, 'due punti «lo so»');
  // toccare di nuovo lo stesso segno lo toglie
  await page.click('.it[data-id="' + second + '"]');
  await page.click('#bar [data-mark="2"]');
  check((await page.getAttribute('.it[data-id="' + second + '"]', 'data-s')) === '0', 'ritoccare «Lo so» toglie il segno');
  await page.click('#bar .close');
  check(!(await page.isVisible('#bar')), '✕ chiude la barra');
  let S = await state(page);
  const vals = Object.values(S.marks);
  check(vals.filter(v => v[0] === 1).length === 1 && vals.filter(v => v[0] === 2).length === 1, 'segni salvati nel browser');

  // viste filtrate della scheda
  await page.click('[data-act=seg][data-name=mode][data-val=rip]');
  check((await page.$$eval('.rd .it', e => e.length)) === 1, 'Mostra «Da ripassare»: 1 punto');
  await page.click('[data-act=seg][data-name=mode][data-val=ess]');
  const ess = await page.$$eval('.rd .it', e => e.length);
  check(ess === 12, 'Mostra «Essenziale»: In breve + Da non confondere (' + ess + ')');
  await shot(page, '04-essenziale.png', true);
  await page.click('[data-act=seg][data-name=mode][data-val=all]');

  // giro di ripasso
  await page.click('[data-tab=rip]');
  check((await page.textContent('#rv-count')).trim() === '1 punto', '«Da ripassare»: 1 punto');
  await shot(page, '05-da-ripassare.png', true);
  await page.click('.rd .it >> nth=0');
  await page.click('#bar [data-mark="2"]');
  S = await state(page);
  check(S.marks[first][0] === 2, 'nel giro di ripasso lo segno «lo so»');

  // cerca
  await page.click('[data-tab=find]');
  await page.fill('#q', 'silenzio assenso');
  await page.waitForTimeout(300);
  const res = await page.$$eval('#results .it', e => e.length);
  check(res > 5, 'cerca «silenzio assenso»: ' + res + ' risultati');
  await page.fill('#q', '21-nonies');
  await page.waitForTimeout(300);
  check((await page.$$eval('#results .it', e => e.length)) > 0, 'cerca «21-nonies»');
  await shot(page, '06-cerca.png', true);

  // segna il resto «lo so» (conferma nella pagina) e riprendi
  await page.click('[data-tab=idx]');
  await page.click('[data-act=open][data-resume]');
  check((await page.textContent('h1')).includes('D4'), '«Riprendi» riapre D4');
  await page.click('[data-act=restOk]');
  check(await page.isVisible('#modal-yes'), 'conferma dentro la pagina');
  await page.click('#modal-yes');
  const none = await page.$$eval('.rd .it[data-s="0"]', e => e.length);
  check(none === 0, 'tutti i punti di D4 segnati');
  await page.reload();
  S = await state(page);
  check(Object.keys(S.marks).length >= nPts, 'dopo il ricaricamento i segni restano (' + Object.keys(S.marks).length + ')');

  // tema e progressi
  await page.emulateMedia({ colorScheme: 'dark' });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === 'rgb(20, 22, 26)', 'tema scuro automatico');
  await shot(page, '07-scuro.png');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('[data-tab=prog]');
  await page.click('[data-act=exportCopy]');
  check(/"marks":\{"[0-9a-f]{10}/.test(await page.inputValue('#exp-text')), 'esporta i segni come testo');
  await page.click('[data-act=resetAll]');
  await page.click('#modal-no');
  check(Object.keys((await state(page)).marks).length > 0, '«Annulla» non cancella');
  await shot(page, '08-progressi.png', true);
  check(await noHScroll(page), 'progressi: nessuno scroll orizzontale');
  check(page.errors.length === 0, 'nessun errore JavaScript (' + page.errors.join('; ') + ')');
  await page.close();

  /* ---------------- salvataggio nell'account (capacità db simulata) */
  console.log('Salvataggio nell\'account (db simulato)');
  const p2 = await phone(browser);
  await p2.addInitScript(() => {
    const log = window.__dbLog = [];
    let listener = null;
    const docs = {};
    const remoteId = 'REMOTE';
    window.__dbPush = (snapDocs) => listener && listener({ docs: snapDocs.map(d => ({ id: d.id, exists: true, data: () => d.data })) });
    const coll = {
      onSnapshot(next) { listener = next; setTimeout(() => window.__dbPush(window.__remoteDocs || []), 50); return () => {}; },
      doc(id) {
        return {
          update(data) { log.push(['update', id, data]); return docs[id] ? Promise.resolve() : Promise.reject({ code: 'invalid_argument' }); },
          set(data) { log.push(['set', id, data]); docs[id] = data; return Promise.resolve(); }
        };
      }
    };
    window.claude = { use: (name) => Promise.resolve(name === 'user' ? { id: () => Promise.resolve('u_test') } : name === 'db' ? { collection: (p) => { log.push(['collection', p]); return coll; } } : null) };
  });
  await p2.goto('file://' + HOSTED);
  // un segno «da ripassare» arrivato da un altro dispositivo
  const anyId = await p2.evaluate(() => JSON.parse(document.getElementById('data').textContent).volumes[0].schede[0].b.find(b => b.t === 'box').b[0].id);
  await p2.evaluate((id) => { window.__dbPush([{ id: 'v1', data: { m: { [id]: [1, Date.now()] } } }]); }, anyId);
  await p2.waitForTimeout(150);
  check((await p2.textContent('[data-sync]')).includes('account Claude'), 'stato: «salvati nel tuo account Claude»');
  check((await p2.textContent('[data-prog="all"]')).includes('1 da ripassare'), 'il segno arrivato dall\'account compare');
  const coll = await p2.evaluate(() => window.__dbLog[0]);
  check(coll[1] === 'data/users/u_test', 'area privata dell\'utente: ' + coll[1]);
  await p2.click('.srow[data-k="1:D1"]');
  await p2.click('.rd .it >> nth=1');
  await p2.click('#bar [data-mark="2"]');
  await p2.waitForTimeout(1000);
  const log = await p2.evaluate(() => window.__dbLog.slice(1));
  check(log.length === 2 && log[0][0] === 'update' && log[1][0] === 'set', 'primo salvataggio: crea il documento del volume');
  const setDoc = log[1] && log[1][2].m;
  check(setDoc && Object.keys(setDoc).length === 2, 'il documento contiene il segno nuovo e quello arrivato dall\'account');
  await shot(p2, '09-account.png');
  check(p2.errors.length === 0, 'nessun errore JavaScript (' + p2.errors.join('; ') + ')');

  await browser.close();
  console.log('\nScreenshot in ' + SHOTS);
  console.log(failures ? failures + ' controlli FALLITI' : 'Tutti i controlli superati');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
