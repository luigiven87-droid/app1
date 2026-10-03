/* Punteggio ufficiale della preselettiva (in centesimi, per evitare errori di arrotondamento).
   Scelta multipla: esatta +1, errata −0,53, omessa 0.
   Situazionali: migliore 1, neutra 0,50, peggiore 0; omessa 0.
   Un quesito situazionale ha `rank` = [migliore, …neutre, peggiore]; se il materiale indica
   solo la migliore, `rank` = [migliore] e le altre risposte valgono 0 («non classificata»). */
var Scoring = (function () {
  var PTS = { ok: 100, ko: -53, om: 0, best: 100, neu: 50, worst: 0, nc: 0 };

  function score(q, ans) {
    if (ans === null || ans === undefined || ans === '') return { p: 0, e: 'om' };
    if (q.rank && q.rank.length) {
      var i = q.rank.indexOf(ans);
      if (i === 0) return { p: PTS.best, e: 'best' };
      if (i < 0) return { p: PTS.nc, e: 'nc' };
      if (i === q.rank.length - 1) return { p: PTS.worst, e: 'worst' };
      return { p: PTS.neu, e: 'neu' };
    }
    return ans === q.key ? { p: PTS.ok, e: 'ok' } : { p: PTS.ko, e: 'ko' };
  }

  /* Ruolo di un'opzione in un situazionale: 'best' | 'neu' | 'worst' | null */
  function role(q, k) {
    if (!q.rank) return k === q.key ? 'best' : null;
    var i = q.rank.indexOf(k);
    if (i === 0) return 'best';
    if (i < 0 || q.rank.length === 1) return null;
    return i === q.rank.length - 1 ? 'worst' : 'neu';
  }

  /* questions: array di quesiti; answers: {chiave: lettera}; keyOf(q) → chiave in answers */
  function total(questions, answers, keyOf) {
    var t = { p: 0, ok: 0, ko: 0, om: 0, best: 0, neu: 0, worst: 0, nc: 0, n: 0, max: 0 };
    questions.forEach(function (q) {
      var r = score(q, answers[keyOf(q)]);
      t.p += r.p;
      t[r.e] += 1;
      t.n += 1;
      t.max += 100;
    });
    return t;
  }

  function fmt(cents) {
    var neg = cents < 0;
    var a = Math.abs(cents);
    var s = Math.floor(a / 100) + ',' + String(a % 100).padStart(2, '0');
    return (neg ? '−' : '') + s;
  }

  return { PTS: PTS, score: score, role: role, total: total, fmt: fmt };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
