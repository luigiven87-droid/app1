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
  check(tabs.join('|') === 'Indice|Da ripassare|Cerca|Simulazioni', 'schede: ' + tabs.join(', '));
  check(await page.$eval('#tabs', t => t.scrollWidth <= t.clientWidth + 1), 'le quattro schede stanno nella larghezza del telefono');
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

  // grafici: visibili in «Tutto», nascosti nelle viste filtrate
  await page.click('[data-tab=idx]');
  await page.click('.srow[data-k="4:E2"]');
  const nFig = await page.$$eval('.rd .fig svg', e => e.length);
  check(nFig === 2, 'E2: 2 grafici (costi e monopolio)');
  const figW = await page.$eval('.rd .fig svg', el => el.getBoundingClientRect().width);
  check(figW > 300 && figW <= 370, 'grafico largo quanto lo schermo (' + Math.round(figW) + ' px)');
  await page.locator('.rd .fig').first().scrollIntoViewIfNeeded();
  await shot(page, '04b-grafico.png');
  check(await noHScroll(page), 'scheda con grafici: nessuno scroll orizzontale');
  await page.click('[data-act=seg][data-name=mode][data-val=ess]');
  check((await page.$$eval('.rd .fig', e => e.length)) === 0, 'vista Essenziale: niente grafici');
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
  await page.click('[data-tab=idx]');
  await page.click('[data-act=tab][data-t=prog]');
  await page.click('[data-act=exportCopy]');
  check(/"marks":\{"[0-9a-f]{10}/.test(await page.inputValue('#exp-text')), 'esporta i segni come testo');
  await page.click('[data-act=resetAll]');
  await page.click('#modal-no');
  check(Object.keys((await state(page)).marks).length > 0, '«Annulla» non cancella');
  await shot(page, '08-progressi.png', true);
  check(await noHScroll(page), 'progressi: nessuno scroll orizzontale');
  check(page.errors.length === 0, 'nessun errore JavaScript (' + page.errors.join('; ') + ')');
  await page.close();

  /* ---------------- simulazioni */
  console.log('Simulazioni');
  const ps = await phone(browser);
  await ps.goto('file://' + LOCAL);
  const D = await ps.evaluate(() => JSON.parse(document.getElementById('data').textContent).sim);
  check(D && D.q.length > 700, 'quesiti delle simulazioni: ' + (D ? D.q.length : 0));
  check(D.q.every(q => q.inc === 'sì' || q.inc === 'riserva' || (q.inc === 'el' && /^EL-/.test(q.id))), 'nessun quesito escluso come nicchia (includi = no); le elaborate a parte');
  check(D.q.every(q => q.o.some(o => o[0] === q.k)), 'ogni chiave è una delle opzioni');
  const QD = {}; D.q.forEach(q => { QD[q.id] = q; });
  const simState = () => ps.evaluate(() => JSON.parse(localStorage.getItem('sna12-simulazioni-v1') || '{}'));
  const tally = ids => { const c = {}; ids.forEach(id => { const a = QD[id].a; c[a] = (c[a] || 0) + 1; }); return c; };
  await ps.click('[data-tab=sim]');
  const plans = await ps.$$eval('[data-act=simStart][data-mode=tempo]', b => b.map(x => x.getAttribute('data-p')));
  check(plans.join(',') === 'H1,H2,H3,H4,H5,H6', 'sei simulazioni dall\'analisi: ' + plans.join(', '));
  await shot(ps, '10-simulazioni.png');

  let cur0 = [];
  for (const plan of D.plans) {
    await ps.click('[data-act=simStart][data-p="' + plan.id + '"][data-mode=tempo]');
    const cur = (await simState()).cur;
    const t = tally(cur.ids);
    const okAreas = Object.keys(plan.aree).every(a => t[a] === plan.aree[a]) && Object.keys(t).every(a => plan.aree[a]);
    check(cur.ids.length === plan.n && okAreas && new Set(cur.ids).size === plan.n,
      plan.id + ': ' + plan.n + ' quesiti, aree come da piano');
    if (plan.id === 'H1') {
      cur0 = cur.ids;
      const brani = cur.ids.filter(id => QD[id].t === 'brano');
      check(brani.length === 6 && new Set(brani.map(id => QD[id].p)).size === 2, 'H1: due brani da tre domande');
      check(cur.ids.filter(id => /^figurale/.test(QD[id].t)).every(id => QD[id].img && QD[id].img.length), 'H1: i figurali hanno la figura');
      const order = cur.ids.map(id => D.areas.findIndex(a => a[0] === QD[id].a));
      check(order.every((v, i) => !i || v >= order[i - 1]), 'H1: ordine della busta (situazionali, ragionamento, materie, inglese)');
      check(await noHScroll(ps), 'prova: nessuno scroll orizzontale');
      const optH = await ps.$eval('.opt', el => el.getBoundingClientRect().height);
      check(optH >= 48, 'opzioni alte almeno 48 px (' + Math.round(optH) + ')');
      await shot(ps, '11-prova.png');
      await ps.click('.opt[data-l="A"]');
      check((await ps.getAttribute('.opt[data-l="A"]', 'aria-pressed')) === 'true', 'risposta scelta');
      await ps.click('.opt[data-l="A"]');
      check((await ps.getAttribute('.opt[data-l="A"]', 'aria-pressed')) === 'false', 'ritoccarla la lascia in bianco');
      // rispondo con la chiave ai primi 10, sbaglio 5, poi lascio in bianco
      for (let i = 0; i < 15; i++) {
        const q = QD[cur.ids[i]];
        const l = i < 10 ? q.k : q.o.map(o => o[0]).find(x => x !== q.k);
        await ps.click('.opt[data-l="' + l + '"]');
        await ps.click('[data-act=simNext]');
      }
      await ps.click('[data-act=simFlag]');
      await ps.click('[data-act=simGrid]');
      await shot(ps, '12-griglia.png');
      await ps.click('[data-jump="40"]');
      check((await ps.textContent('.qn')).trim() === '41', 'la griglia porta al quesito 41');
      await ps.reload();
      const after = (await simState()).cur;
      check(after && Object.keys(after.ans).length === 15 && (await ps.textContent('.qn')).trim() === '41', 'dopo il ricaricamento la prova riprende dove era');
      check((await ps.textContent('#countdown')).includes('rimasti'), 'il cronometro è nella testata');
      await ps.click('[data-act=simEnd]');
      await ps.click('#modal-yes');
      let exp = 0;
      cur.ids.slice(0, 15).forEach((id, i) => {
        const q = QD[id];
        if (i < 10) exp += 1;
        else if (q.a === 'situazionali') { const l = q.o.map(o => o[0]).find(x => x !== q.k); exp += q.w ? (l === q.w ? 0 : 0.5) : 0; }
        else exp -= 0.53;
      });
      const shown = (await ps.textContent('.score .big b')).replace('−', '-').replace(',', '.');
      check(Math.abs(Number(shown) - exp) < 0.005, 'punteggio ufficiale: ' + shown + ' (atteso ' + exp.toFixed(2) + ')');
      await shot(ps, '13-risultato.png');
      await ps.click('[data-act=seg][data-name=simRev][data-val=ko]');
      const nko = await ps.$$eval('article.rev', e => e.length);
      check(nko === 5, 'correzione: 5 sbagliati o neutri (' + nko + ')');
      check((await ps.$$eval('article.rev .opt.key', e => e.length)) === 5, 'la chiave è evidenziata');
      check(await noHScroll(ps), 'risultato: nessuno scroll orizzontale');
      await ps.click('[data-act=seg][data-name=simRev][data-val=all]');
      const link = await ps.$('article.rev [data-act=open]');
      check(!!link, 'dalla correzione si apre la scheda di ripasso');
      await link.click();
      check(!!(await ps.$('.rd .it')), 'la scheda si apre nel ripasso');
      await ps.click('[data-tab=sim]');
    } else {
      await ps.click('[data-tab=sim]');
      await ps.click('[data-act=simDrop]');
      await ps.click('#modal-yes');
    }
  }
  // H1 di nuovo: pesca prima quesiti non visti
  const firstRun = (await simState()).hist[0].ids;
  await ps.click('[data-act=simStart][data-p=H1][data-mode=tempo]');
  const again = (await simState()).cur.ids;
  const rep = again.filter(id => firstRun.indexOf(id) >= 0 && QD[id].a !== 'situazionali').length;
  check(rep <= 6, 'seconda H1: tematici e ragionamento quasi tutti nuovi (' + rep + ' ripetuti)');
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  // correzione subito
  await ps.click('[data-act=simStart][data-p=H2][data-mode=studio]');
  await ps.click('.opt[data-l="A"]');
  check(!!(await ps.$('.fb')) && (await ps.$eval('.opt[data-l="B"]', b => b.disabled)), 'correzione subito: commento e opzioni bloccate');
  await ps.emulateMedia({ colorScheme: 'dark' });
  await shot(ps, '14-correzione-scuro.png', true);
  await ps.emulateMedia({ colorScheme: 'light' });
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  // ripasso errori: i quesiti sbagliati escono quando li risolvi
  await ps.click('[data-act=seg][data-name=simTab][data-val=errori]');
  await shot(ps, '15-errori.png', true);
  await ps.click('[data-act=simErr]');
  const rc = (await simState()).cur;
  check(rc && rc.ids.length === 5 && rc.fb && !rc.tl, 'ripasso errori: i 5 sbagliati della prova, con correzione subito');
  check(rc.ids.every(id => cur0.indexOf(id) >= 10 && cur0.indexOf(id) < 15), 'ripasso errori: solo quesiti sbagliati (non gli omessi)');
  for (let i = 0; i < rc.ids.length; i++) {
    await ps.click('.opt[data-l="' + QD[rc.ids[i]].k + '"]');
    if (i < rc.ids.length - 1) await ps.click('[data-act=simNext]');
  }
  await ps.click('[data-act=simEnd]');
  await ps.click('#modal-yes');
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=seg][data-name=simTab][data-val=errori]');
  check(await ps.$eval('[data-act=simErr]', b => b.disabled), 'risolti tutti: niente più da ripassare');
  // blocco per materia
  await ps.click('[data-act=seg][data-name=simTab][data-val=blocco]');
  await ps.click('[data-act=simChip][data-g=ba][data-v=diritto_ue]');
  const schede = await ps.$$eval('[data-act=simChip][data-g=bt]', b => b.map(x => x.getAttribute('data-v')));
  check(schede.indexOf('U1') >= 0 && schede.indexOf('U4') >= 0, 'con una materia compaiono le sue schede: ' + schede.join(', '));
  await ps.click('[data-act=simSet][data-g=b][data-k=n][data-v="5"]');
  await ps.click('[data-act=simSet][data-g=b][data-k=tm][data-v="1"]');
  check(await noHScroll(ps), 'blocco: nessuno scroll orizzontale');
  await shot(ps, '16-blocco.png', true);
  await ps.click('[data-act=simDrill]');
  const bc = (await simState()).cur;
  check(bc && bc.p === 'B' && bc.ids.length === 5 && bc.ids.every(id => QD[id].a === 'diritto_ue'), 'blocco: 5 quesiti di diritto UE');
  check(bc.ids.every(id => cur0.indexOf(id) < 0), 'blocco: prima i quesiti mai visti');
  check(bc.tl === 8 && !bc.fb, 'blocco a tempo: 1,5 minuti a quesito');
  // numero libero e «Tutti»: un blocco intero in una sessione
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  await ps.fill('#n-b', '7');
  check((await ps.textContent('[data-act=simDrill]')).includes('(7)'), 'campo libero: «Avvia blocco (7)»');
  await ps.click('[data-act=simDrill]');
  check((await simState()).cur.ids.length === 7, 'campo libero: 7 quesiti');
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  await ps.click('[data-act=simChip][data-g=ba][data-v=diritto_costituzionale]');
  const nAll = await ps.$eval('#n-b', i => Number(i.max));
  await ps.click('[data-act=simSet][data-g=b][data-k=n][data-v="100000"]');
  await ps.click('[data-act=simDrill]');
  const all = (await simState()).cur.ids;
  const twinKey = q => q.tw ? [q.id].concat(q.tw).sort()[0] : q.id;
  const groups = list => new Set(list.map(twinKey)).size;
  const nUeCost = groups(D.q.filter(q => q.inc === 'sì' && (q.a === 'diritto_ue' || q.a === 'diritto_costituzionale')));
  check(nAll === nUeCost && all.length === nAll, '«Tutti»: diritto UE e costituzionale interi in una sessione (' + all.length + ')');
  check(all.every((id, i) => !i || D.areas.findIndex(a => a[0] === QD[id].a) >= D.areas.findIndex(a => a[0] === QD[all[i - 1]].a)), '«Tutti»: quesiti in ordine di materia');
  // gemelli (stesso quesito ripreso in un altro anno o in un'altra fonte): uno solo per blocco
  check(D.q.every(q => (q.tw || []).every(t => QD[t] && QD[t].tw.indexOf(q.id) >= 0)), 'gemelli collegati nei due sensi');
  check(['D3-6', 'D3-7', 'AD2-C.6'].every(id => QD[id].tw && QD[id].tw.length === 2), 'gemelli: atti non autoritativi in SNA 9, SNA 10 e Formez');
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  for (const a of ['diritto_ue', 'diritto_costituzionale', 'diritto_amministrativo']) await ps.click('[data-act=simChip][data-g=ba][data-v=' + a + ']');
  const nAmm = await ps.$eval('#n-b', i => Number(i.max));
  await ps.click('[data-act=simDrill]');
  const amm = (await simState()).cur.ids;
  const ammPool = D.q.filter(q => q.inc === 'sì' && q.a === 'diritto_amministrativo');
  check(ammPool.length > groups(ammPool) && amm.length === groups(ammPool) && nAmm === amm.length,
    '«Tutti» diritto amministrativo: ' + amm.length + ' quesiti, gemelli contati una volta (' + ammPool.length + ' righe)');
  check(new Set(amm.map(id => twinKey(QD[id]))).size === amm.length, 'nessun gemello due volte nello stesso blocco');
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  for (const a of ['diritto_amministrativo', 'diritto_ue', 'diritto_costituzionale']) await ps.click('[data-act=simChip][data-g=ba][data-v=' + a + ']');
  await ps.click('[data-act=simDrill]');
  // dalla scheda del ripasso ai suoi quesiti; scorrimento col dito; testo più grande; rifai gli errori
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  await ps.click('[data-tab=idx]');
  check((await ps.textContent('.srow[data-k="1:D4"] .sinfo')).includes('uscita 9 volte'), 'Indice: fascia e uscite d\'archivio della scheda');
  await ps.click('.srow[data-k="1:D4"]');
  await ps.click('[data-act=simDrillScheda]');
  const sd = (await simState()).cur;
  check(sd && sd.ids.length === groups(D.q.filter(q => q.t === 'D4' && q.inc === 'sì')) && sd.fb, 'dalla scheda D4: tutti i suoi quesiti, con correzione subito');
  await ps.evaluate(() => {
    const el = document.getElementById('app');
    const mk = (type, x) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 }); el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true })); };
    mk('touchstart', 320); mk('touchend', 80);
  });
  check((await ps.textContent('.qn')).trim() === '2', 'scorrere col dito porta al quesito successivo');
  await ps.click('#fz-btn');
  check((await ps.$eval('.qtext', e => parseFloat(getComputedStyle(e).fontSize))) > 19.5, 'Aa ingrandisce il testo');
  await ps.click('#fz-btn'); await ps.click('#fz-btn'); await ps.click('#fz-btn');
  const q1 = QD[sd.ids[1]];
  await ps.click('.opt[data-l="' + q1.o.map(o => o[0]).find(x => x !== q1.k) + '"]');
  await ps.click('[data-act=simEnd]');
  await ps.click('#modal-yes');
  await ps.click('[data-act=simRedo]');
  check((await simState()).cur.ids.join() === sd.ids[1], '«Rifai gli sbagliati» riparte dall\'errore della prova');
  // banca Elaborate: separata, etichettata, con il punto del ripasso
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  await ps.click('[data-act=seg][data-name=simTab][data-val=blocco]');
  for (const a of ['diritto_ue', 'diritto_costituzionale']) await ps.click('[data-act=simChip][data-g=ba][data-v=' + a + ']');
  for (const k of ['sna', 'formez', 'el']) await ps.click('[data-act=simChip][data-g=bs][data-v=' + k + ']');
  await ps.click('[data-act=simDrill]');
  const ec = (await simState()).cur;
  check(ec.ids.length > 0 && ec.ids.every(id => /^EL-/.test(id)), 'solo la banca Elaborate: tutte domande EL-');
  check(!!(await ps.$('.qhead .elb')), 'in prova l\'etichetta «elaborata»');
  check((await ps.$$eval('.opt', o => o.length)) === QD[ec.ids[0]].o.length, 'le opzioni sono solo quelle della domanda');
  await ps.click('[data-tab=sim]');
  await ps.click('[data-act=simDrop]');
  await ps.click('#modal-yes');
  for (const k of ['sna', 'formez', 'el']) await ps.click('[data-act=simChip][data-g=bs][data-v=' + k + ']');
  await ps.click('[data-act=simDrill]');
  check((await simState()).cur.tl > 0, 'blocco a tempo pronto per la prova del tempo scaduto');
  check(ps.errors.length === 0, 'nessun errore JavaScript (' + ps.errors.join('; ') + ')');
  const ctxS = ps.context();
  await ps.close();

  // tempo scaduto: la prova si consegna da sola
  const pt = await ctxS.newPage();
  pt.errors = [];
  pt.on('pageerror', e => pt.errors.push(e.message));
  await pt.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('sna12-simulazioni-v1') || 'null');
    if (s && s.cur) { s.cur.el = s.cur.tl * 60 - 1.5; localStorage.setItem('sna12-simulazioni-v1', JSON.stringify(s)); }
  });
  await pt.goto('file://' + LOCAL);
  await pt.waitForTimeout(3500);
  const ts = await pt.evaluate(() => JSON.parse(localStorage.getItem('sna12-simulazioni-v1')));
  check(!ts.cur && ts.hist.length === 4, 'tempo scaduto: prova consegnata da sola');
  check(pt.errors.length === 0, 'nessun errore JavaScript (' + pt.errors.join('; ') + ')');
  await pt.close();

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
  // simulazioni: una prova dall'altro dispositivo compare, una nuova si salva nell'account
  const sq = await p2.evaluate(() => JSON.parse(document.getElementById('data').textContent).sim.q.slice(0, 3).map(q => q.id));
  await p2.evaluate((ids) => {
    const at = Date.now() - 3600e3;
    window.__dbPush([{ id: 'sim', data: { v: 1, cur: null, resetAt: 0, hist: [{ id: 'H3-' + at, p: 'H3', at: at, end: at + 600e3, ids: ids, ans: { 0: 'A' }, fl: {}, el: 600, mode: 'tempo', min: 36, sc: 1, hi: 0 }] } }]);
  }, sq);
  await p2.click('[data-tab=sim]');
  await p2.click('[data-act=seg][data-name=simTab][data-val=storico]');
  check((await p2.$$eval('.hist li', e => e.length)) === 1, 'la prova fatta su un altro dispositivo compare nello storico');
  await p2.click('[data-act=seg][data-name=simTab][data-val=prove]');
  await p2.click('[data-act=simStart][data-p=H3][data-mode=tempo]');
  await p2.click('.opt[data-l="A"]');
  await p2.click('[data-act=simEnd]');
  await p2.click('#modal-yes');
  await p2.waitForTimeout(300);
  const simSets = await p2.evaluate(() => window.__dbLog.filter(l => l[0] === 'set' && l[1] === 'sim'));
  const lastSet = simSets[simSets.length - 1];
  check(lastSet && lastSet[2].hist.length === 2 && !lastSet[2].cur, 'la prova consegnata si salva nell\'account (documento «sim»)');
  check(p2.errors.length === 0, 'nessun errore JavaScript (' + p2.errors.join('; ') + ')');

  await browser.close();
  console.log('\nScreenshot in ' + SHOTS);
  console.log(failures ? failures + ' controlli FALLITI' : 'Tutti i controlli superati');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
