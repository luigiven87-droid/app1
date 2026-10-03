/* Test del punteggio ufficiale.  Uso:  node tests/test_scoring.cjs */
'use strict';
const assert = require('assert');
const S = require('../src/scoring.js');

const mc = { key: 'B' };
const sit = { rank: ['C', 'B', 'A'] };      // «C>B>A»: C = 1, B = 0,50, A = 0
const sitBest = { rank: ['A'] };             // solo la migliore indicata

assert.deepStrictEqual(S.score(mc, 'B'), { p: 100, e: 'ok' });
assert.deepStrictEqual(S.score(mc, 'A'), { p: -53, e: 'ko' });
assert.deepStrictEqual(S.score(mc, null), { p: 0, e: 'om' });
assert.deepStrictEqual(S.score(sit, 'C'), { p: 100, e: 'best' });
assert.deepStrictEqual(S.score(sit, 'B'), { p: 50, e: 'neu' });
assert.deepStrictEqual(S.score(sit, 'A'), { p: 0, e: 'worst' });
assert.deepStrictEqual(S.score(sit, undefined), { p: 0, e: 'om' });
assert.deepStrictEqual(S.score(sitBest, 'A'), { p: 100, e: 'best' });
assert.deepStrictEqual(S.score(sitBest, 'B'), { p: 0, e: 'nc' });
assert.strictEqual(S.role(sit, 'C'), 'best');
assert.strictEqual(S.role(sit, 'B'), 'neu');
assert.strictEqual(S.role(sit, 'A'), 'worst');

// Consegna di prova calcolata a mano:
//  10 scelte multiple: 6 esatte (+6), 3 errate (−1,59), 1 omessa (0)
//   4 situazionali: 2 migliori (+2), 1 neutra (+0,50), 1 peggiore (0)
//  totale = 6 − 1,59 + 2 + 0,50 = 6,91
const qs = [], ans = {};
for (let i = 0; i < 10; i++) {
  qs.push({ id: 'm' + i, key: 'A' });
  ans['m' + i] = i < 6 ? 'A' : i < 9 ? 'B' : null;
}
['C', 'C', 'B', 'A'].forEach((a, i) => { qs.push({ id: 's' + i, rank: ['C', 'B', 'A'] }); ans['s' + i] = a; });
const t = S.total(qs, ans, q => q.id);
assert.strictEqual(t.p, 691);
assert.strictEqual(S.fmt(t.p), '6,91');
assert.deepStrictEqual([t.ok, t.ko, t.om, t.best, t.neu, t.worst, t.n, t.max], [6, 3, 1, 2, 1, 1, 14, 1400]);
assert.strictEqual(S.fmt(-6), '−0,06');
assert.strictEqual(S.fmt(-159), '−1,59');
console.log('Punteggio: tutti i controlli superati (consegna di prova = 6,91 come a mano)');
