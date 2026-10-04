  /* ============================================================ SIMULAZIONI
     Inserito da build.py dentro la funzione di app.js: usa DATA, S, sync, hooks,
     SCREENS, ACTIONS, CHANGES, go, render, esc, toast, ask, openScheda. */

  (function () {
    var SIM = DATA.sim;
    if (!SIM) return;

    var Q = {};
    SIM.q.forEach(function (q) { Q[q.id] = q; });
    var AREA = {};
    SIM.areas.forEach(function (a, i) { AREA[a[0]] = { i: i, label: a[1], short: a[2] }; });
    var PLAN = {};
    SIM.plans.forEach(function (p) { PLAN[p.id] = p; });
    var schedaOfCode = {};
    SCHEDE.forEach(function (e) { if (e.sc.code) schedaOfCode[e.sc.code] = e.sc.key; });
    var SIM_KEY = 'sna12-simulazioni-v1';
    var REVIEW = 'R';

    TABS.push({ id: 'sim', label: 'Simulazioni' });

    /* ---------------------------------------------------------- stato */

    function blank() { return { v: 1, cur: null, hist: [], resetAt: 0 }; }
    function load() {
      try {
        var s = JSON.parse(localStorage.getItem(SIM_KEY) || 'null');
        if (s && s.v === 1) {
          var b = blank();
          b.cur = s.cur && Array.isArray(s.cur.ids) ? s.cur : null;
          b.hist = Array.isArray(s.hist) ? s.hist.filter(validRun) : [];
          b.resetAt = Number(s.resetAt) || 0;
          return b;
        }
      } catch (e) { /* senza localStorage si lavora in memoria */ }
      return blank();
    }
    function validRun(r) { return r && r.id && Array.isArray(r.ids) && r.ans && typeof r.ans === 'object'; }
    var SS = load();
    var pushTimer = null;
    function save(push) {
      try { localStorage.setItem(SIM_KEY, JSON.stringify(SS)); } catch (e) { /* in memoria */ }
      if (push !== false) schedulePush();
    }
    function schedulePush() {
      if (!sync.coll) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushNow, 1500);
    }
    function pushNow() {
      clearTimeout(pushTimer);
      if (!sync.coll) return;
      sync.coll.doc('sim').set(JSON.parse(JSON.stringify(SS))).catch(function () { sync.mode = 'error'; showSync(); });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { tick(); save(false); if (pushTimer) pushNow(); }
    });

    /* Unisce lo stato salvato nell'account con quello locale: le prove concluse si
       sommano, la prova in corso è quella modificata per ultima. */
    function merge(remote) {
      if (!remote || remote.v !== 1) return false;
      var changed = false;
      var resetAt = Math.max(Number(remote.resetAt) || 0, SS.resetAt || 0);
      if (resetAt !== SS.resetAt) { SS.resetAt = resetAt; changed = true; }
      var byId = {};
      SS.hist.forEach(function (h) { byId[h.id] = h; });
      (Array.isArray(remote.hist) ? remote.hist : []).forEach(function (h) {
        if (validRun(h) && !byId[h.id]) { byId[h.id] = h; changed = true; }
      });
      var hist = Object.keys(byId).map(function (k) { return byId[k]; })
        .filter(function (h) { return h.at > SS.resetAt; })
        .sort(function (a, b) { return a.end - b.end; });
      if (hist.length !== SS.hist.length) changed = true;
      SS.hist = hist;
      var rc = remote.cur && Array.isArray(remote.cur.ids) ? remote.cur : null;
      if (rc && (!SS.cur || (rc.upd || 0) > (SS.cur.upd || 0))) { SS.cur = rc; changed = true; }
      if (SS.cur && (byId[SS.cur.id] || SS.cur.at <= SS.resetAt)) { SS.cur = null; changed = true; }
      return changed;
    }
    var firstRemote = true;
    hooks.remote = function (doc) {
      var changed = merge(doc);
      if (changed) { save(false); if (view.tab === 'sim' && view.s !== 'run') render(); }
      if (firstRemote) {
        firstRemote = false;
        var remoteN = doc && Array.isArray(doc.hist) ? doc.hist.length : -1;
        var local = SS.hist.length || SS.cur;
        if (local && (remoteN !== SS.hist.length || (SS.cur && (!doc || !doc.cur || doc.cur.id !== SS.cur.id)))) schedulePush();
      }
    };
    hooks.exportSim = function () { return SS; };
    hooks.importSim = function (d) {
      var before = SS.hist.length;
      if (merge(d)) save();
      return SS.hist.length - before;
    };

    /* ---------------------------------------------------------- utilità */

    function fmt(x) {
      var r = Math.round(x * 100) / 100;
      return String(r).replace('.', ',').replace('-', '−');
    }
    function clock(sec) {
      sec = Math.max(0, Math.round(sec));
      var m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    }
    function when(ts) {
      var d = new Date(ts);
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    function typeLabel(q) { return SIM.types[q.t] || q.t; }
    function topicLabel(q) {
      if (schedaOfCode[q.t]) return q.t + ' · ' + schedaByKey[schedaOfCode[q.t]].sc.title;
      return typeLabel(q);
    }
    function srcOf(q) { return /^AD/.test(q.id) ? 'formez' : 'sna'; }
    function bustaOf(q) { var m = /-B(\d)-/.exec(q.c || ''); return m ? m[1] : ''; }
    function paras(text) {
      return String(text || '').split(/\n\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    }

    /* ---------------------------------------------------------- sorteggio */

    function seenCounts() {
      var c = {};
      SS.hist.forEach(function (h) { h.ids.forEach(function (id) { c[id] = (c[id] || 0) + 1; }); });
      return c;
    }

    function Picker(plan) {
      this.plan = plan;
      this.seen = seenCounts();
      this.ids = [];
      this.taken = {};
      this.coords = {};
      this.passages = {};
    }
    Picker.prototype.clash = function (q) {
      if (this.taken[q.id]) return true;
      if (q.c && this.coords[q.c]) return true;
      var self = this;
      return (q.rep || []).some(function (c) { return self.coords[c]; });
    };
    Picker.prototype.take = function (q) {
      var self = this;
      this.ids.push(q.id);
      this.taken[q.id] = 1;
      if (q.c) this.coords[q.c] = 1;
      (q.rep || []).forEach(function (c) { self.coords[c] = 1; });
      if (q.p) this.passages[q.p] = 1;
    };
    /* Ordine: mai visti prima, poi «sì» prima di «riserva», poi la fonte preferita
       dalla simulazione, poi la fascia indicata, poi i meno visti, poi a caso. */
    Picker.prototype.rank = function (cands, area, src) {
      var plan = this.plan, seen = this.seen;
      var fasce = (plan.fasce && plan.fasce[area]) || [];
      return cands.map(function (q) {
        var n = seen[q.id] || 0;
        return { q: q, k: [
          n ? 1 : 0,
          q.inc === 'sì' || plan.riserva ? 0 : 1,
          src && src !== 'any' && srcOf(q) !== src ? 1 : 0,
          fasce.length && fasce.indexOf(q.f) < 0 ? 1 : 0,
          n, Math.random()] };
      }).sort(function (a, b) {
        for (var i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
        return 0;
      }).map(function (x) { return x.q; });
    };
    Picker.prototype.pick = function (area, t, n, src) {
      var self = this;
      var cands = SIM.q.filter(function (q) {
        return q.a === area && (!t || q.t === t) && (q.inc === 'sì' || q.inc === 'riserva') && !self.clash(q);
      });
      var got = 0;
      this.rank(cands, area, src).forEach(function (q) {
        if (got < n && !self.clash(q)) { self.take(q); got++; }
      });
      return got;
    };
    /* Brani: tre domande sullo stesso testo, come nelle buste SNA 9-11. */
    Picker.prototype.pickBrani = function (n) {
      var self = this, groups = {};
      SIM.q.forEach(function (q) {
        if (q.a !== 'ragionamento' || q.t !== 'brano' || !q.p) return;
        var k = q.p + '|' + bustaOf(q);
        (groups[k] = groups[k] || []).push(q);
      });
      var list = Object.keys(groups).map(function (k) {
        var g = groups[k];
        var seen = g.reduce(function (m, q) { return Math.max(m, self.seen[q.id] || 0); }, 0);
        return { g: g, k: [seen ? 1 : 0, g.length === 3 ? 0 : 1, seen, Math.random()] };
      }).sort(function (a, b) {
        for (var i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
        return 0;
      });
      var got = 0;
      list.forEach(function (x) {
        if (got >= n || self.passages[x.g[0].p]) return;
        if (x.g.some(function (q) { return self.clash(q); })) return;
        x.g.slice().sort(function (a, b) { return qnum(a) - qnum(b); }).forEach(function (q) {
          if (got < n) { self.take(q); got++; }
        });
      });
      return got;
    };
    function qnum(q) { var m = /-Q(\d+)$/.exec(q.c || ''); return m ? Number(m[1]) : 0; }

    function build(plan) {
      var pk = new Picker(plan);
      SIM.areas.forEach(function (a) {
        var area = a[0], n = plan.aree[area];
        if (!n) return;
        var start = pk.ids.length;
        var quote = plan.quote[area] || {};
        var fpa = plan.fpa && plan.fpa[area];
        if (fpa) {
          ['formez', 'archivio'].forEach(function (s) {
            var src = s === 'formez' ? 'formez' : 'sna';
            Object.keys(fpa[s] || {}).forEach(function (t) { pk.pick(area, t, fpa[s][t], src); });
          });
        } else {
          Object.keys(quote).forEach(function (t) {
            if (t === 'brano') pk.pickBrani(quote[t]);
            else pk.pick(area, t, quote[t], plan.pref);
          });
        }
        var short = n - (pk.ids.length - start);
        if (short > 0) pk.pick(area, null, short, plan.pref); // quota scoperta: altre schede della stessa area
      });
      return order(pk.ids);
    }

    /* Ordine della busta SNA 11: situazionali, figurali, brani, poi le materie. */
    function order(ids) {
      var qs = ids.map(function (id) { return Q[id]; });
      var sub = function (q) {
        if (q.a === 'ragionamento') return q.t === 'brano' ? 2 : /^figurale/.test(q.t) ? 0 : 1;
        if (q.a === 'inglese') return q.p ? 1 : 0;
        return 0;
      };
      var firstPos = {};
      qs.forEach(function (q, i) { if (q.p && firstPos[q.p] === undefined) firstPos[q.p] = i; });
      var rnd = {};
      qs.forEach(function (q) { rnd[q.id] = Math.random(); });
      qs.sort(function (a, b) {
        var d = AREA[a.a].i - AREA[b.a].i;
        if (d) return d;
        d = sub(a) - sub(b);
        if (d) return d;
        if (a.p || b.p) {
          d = (firstPos[a.p] || 0) - (firstPos[b.p] || 0);
          if (d) return d;
          return qnum(a) - qnum(b);
        }
        return rnd[a.id] - rnd[b.id];
      });
      return qs.map(function (q) { return q.id; });
    }

    /* Ripresa degli errori: quesiti sbagliati od omessi nell'ultima prova in cui sono comparsi. */
    function lastOutcomes() {
      var last = {};
      SS.hist.forEach(function (h) {
        h.ids.forEach(function (id, i) { if (Q[id]) last[id] = score(Q[id], h.ans[i]); });
      });
      return last;
    }
    function reviewIds() {
      var last = lastOutcomes();
      return Object.keys(last).filter(function (id) { return last[id].pts < 1; });
    }
    function reviewPlan() {
      var ids = order(shuffle(reviewIds()).slice(0, 30));
      return {
        id: REVIEW, nome: 'Ripresa degli errori', n: ids.length, min: Math.ceil(ids.length * 1.5),
        scopo: 'Torni sui quesiti sbagliati od omessi nelle prove precedenti, finché non li risolvi.',
        ids: ids
      };
    }

    function planOf(run) {
      if (run.p === REVIEW) return { id: REVIEW, nome: 'Ripresa degli errori', min: run.min };
      return PLAN[run.p] || { id: run.p, nome: run.p, min: run.min };
    }

    /* ---------------------------------------------------------- punteggio */

    function score(q, a) {
      if (q.a === 'situazionali') {
        if (!a) return { pts: 0, st: 'omessa', lbl: 'Omessa' };
        if (a === q.k) return { pts: 1, st: 'ok', lbl: 'Migliore' };
        if (q.w) return a === q.w ? { pts: 0, st: 'ko', lbl: 'Meno efficace' } : { pts: 0.5, st: 'mid', lbl: 'Neutra' };
        return { pts: 0, hi: 0.5, st: 'ko', lbl: 'Non la migliore' };
      }
      if (!a) return { pts: 0, st: 'omessa', lbl: 'Omessa' };
      return a === q.k ? { pts: 1, st: 'ok', lbl: 'Esatta' } : { pts: -0.53, st: 'ko', lbl: 'Errata' };
    }
    function totals(run) {
      var t = { pts: 0, hi: 0, n: 0, ok: 0, ko: 0, mid: 0, om: 0, areas: {}, schede: {} };
      run.ids.forEach(function (id, i) {
        var q = Q[id];
        if (!q) return;
        var s = score(q, run.ans[i]);
        var a = t.areas[q.a] = t.areas[q.a] || { pts: 0, hi: 0, n: 0, ok: 0, ko: 0, mid: 0, om: 0 };
        [t, a].forEach(function (x) {
          x.pts += s.pts; x.hi += s.hi || 0; x.n++;
          if (s.st === 'ok') x.ok++; else if (s.st === 'ko') x.ko++; else if (s.st === 'mid') x.mid++; else x.om++;
        });
        if (s.pts < 1 && schedaOfCode[q.t]) t.schede[q.t] = (t.schede[q.t] || 0) + 1;
      });
      return t;
    }

    /* ---------------------------------------------------------- avvio, risposta, consegna */

    function start(plan, mode) {
      var ids = plan.ids || build(plan);
      if (!ids.length) { toast('Nessun quesito disponibile per questa prova'); return; }
      var now = Date.now();
      SS.cur = { id: plan.id + '-' + now, p: plan.id, at: now, upd: now, ids: ids, ans: {}, fl: {},
        el: 0, i: 0, mode: mode, min: plan.min };
      save();
      go({ tab: 'sim', s: 'run' });
    }
    function begin(plan, mode) {
      if (SS.cur) {
        ask('Hai una prova in corso (' + planOf(SS.cur).nome + '). Abbandonarla e iniziarne una nuova?', 'Abbandona e inizia', function () {
          SS.cur = null; start(plan, mode);
        }, true);
      } else start(plan, mode);
    }
    ACTIONS.simStart = function (t) {
      var id = t.getAttribute('data-p');
      var plan = id === REVIEW ? reviewPlan() : PLAN[id];
      if (plan) begin(plan, t.getAttribute('data-mode'));
    };
    ACTIONS.simResume = function () { go({ tab: 'sim', s: 'run' }); };
    ACTIONS.simDrop = function () {
      ask('Abbandonare la prova in corso? Le risposte date finora non verranno conteggiate.', 'Abbandona', function () {
        SS.cur = null; save(); go({ tab: 'sim' });
      }, true);
    };

    function cur() { return SS.cur; }
    function touch() { var c = cur(); if (c) c.upd = Date.now(); save(); }
    function remaining(c) { return c.min * 60 - c.el; }

    ACTIONS.simAns = function (t) {
      var c = cur();
      if (!c) return;
      var l = t.getAttribute('data-l');
      if (c.mode === 'studio' && c.ans[c.i]) return;
      if (c.ans[c.i] === l) delete c.ans[c.i]; else c.ans[c.i] = l;
      touch();
      render();
    };
    ACTIONS.simFlag = function () {
      var c = cur();
      if (c.fl[c.i]) delete c.fl[c.i]; else c.fl[c.i] = 1;
      touch(); render();
    };
    function move(d) {
      var c = cur();
      if (!c) return;
      var j = c.i + d;
      if (j < 0 || j >= c.ids.length) return;
      c.i = j; touch(); render(); window.scrollTo(0, 0);
    }
    ACTIONS.simNext = function () { move(1); };
    ACTIONS.simPrev = function () { move(-1); };
    ACTIONS.simGrid = function () { grid(); };
    ACTIONS.simEnd = function () { confirmEnd(); };

    function confirmEnd() {
      var c = cur();
      var n = c.ids.length, done = Object.keys(c.ans).length, fl = Object.keys(c.fl).length;
      ask('Consegnare la prova? ' + done + ' risposte su ' + n + (done < n ? ' (' + (n - done) + ' in bianco valgono 0)' : '') +
        (fl ? ', ' + fl + ' segnate come dubbie' : '') + '.', 'Consegna', function () { finish(false); });
    }
    function finish(timeUp) {
      var c = cur();
      if (!c) return;
      tick();
      var t = totals(c);
      var run = { id: c.id, p: c.p, at: c.at, end: Date.now(), ids: c.ids, ans: c.ans, fl: c.fl, el: Math.round(c.el),
        mode: c.mode, min: c.min, sc: Math.round(t.pts * 100) / 100, hi: t.hi };
      SS.hist.push(run);
      SS.cur = null;
      save();
      pushNow();
      go({ tab: 'sim', s: 'res', h: run.id });
      if (timeUp) toast('Tempo scaduto: prova consegnata');
    }

    /* ---------------------------------------------------------- cronometro */

    var lastTick = 0, timer = null;
    function running() { return view.tab === 'sim' && view.s === 'run' && cur() && document.visibilityState === 'visible'; }
    function tick() {
      var c = cur(), now = Date.now();
      if (c && lastTick && running()) c.el += Math.min(5, (now - lastTick) / 1000);
      lastTick = now;
    }
    var saveEvery = 0;
    function onTick() {
      if (!running()) { lastTick = Date.now(); return; }
      tick();
      var c = cur();
      paintClock();
      if (c.mode === 'tempo' && remaining(c) <= 0) { finish(true); return; }
      if (++saveEvery % 10 === 0) { c.upd = Date.now(); save(); }
    }
    function paintClock() {
      var c = cur(), el = document.getElementById('countdown');
      if (!c || !el) return;
      var done = Object.keys(c.ans).length;
      var p = planOf(c);
      el.textContent = p.id + ' · ' + (c.mode === 'tempo' ? '⏱ ' + clock(remaining(c)) + ' rimasti' : 'senza tempo') +
        ' · ' + done + '/' + c.ids.length + ' risposte';
      el.classList.toggle('late', c.mode === 'tempo' && remaining(c) < 300);
    }

    /* ---------------------------------------------------------- barra della prova */

    var $simbar = document.createElement('div');
    $simbar.className = 'actionbar simbar';
    $simbar.hidden = true;
    document.body.appendChild($simbar);
    $simbar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b && ACTIONS[b.getAttribute('data-act')]) ACTIONS[b.getAttribute('data-act')](b, e);
    });

    hooks.render = function () {
      var inRun = view.tab === 'sim' && view.s === 'run' && cur();
      $simbar.hidden = !inRun;
      document.body.classList.toggle('with-simbar', !!inRun);
      if (inRun) {
        var c = cur();
        $simbar.innerHTML = '<div class="actionbar-in">' +
          '<button type="button" class="btn nav" data-act="simPrev" aria-label="Quesito precedente"' + (c.i ? '' : ' disabled') + '>←</button>' +
          '<button type="button" class="btn gridb" data-act="simGrid">' + (c.i + 1) + ' / ' + c.ids.length + ' <span aria-hidden="true">▦</span></button>' +
          '<button type="button" class="btn nav" data-act="simNext" aria-label="Quesito successivo"' + (c.i < c.ids.length - 1 ? '' : ' disabled') + '>→</button>' +
          '<button type="button" class="btn primary endb" data-act="simEnd">Consegna</button></div>';
        lastTick = lastTick || Date.now();
        if (!timer) timer = setInterval(onTick, 1000);
        paintClock();
      } else {
        if (timer) { tick(); clearInterval(timer); timer = null; lastTick = 0; }
        var el = document.getElementById('countdown');
        if (el && el.classList.contains('late')) el.classList.remove('late');
        countdown();
      }
    };

    function grid() {
      var c = cur();
      var cells = c.ids.map(function (id, i) {
        var q = Q[id];
        var cls = (c.ans[i] ? ' done' : '') + (c.fl[i] ? ' flag' : '') + (i === c.i ? ' here' : '');
        var head = i === 0 || Q[c.ids[i - 1]].a !== q.a ? '<span class="gsep">' + esc(AREA[q.a].short) + '</span>' : '';
        return head + '<button type="button" class="gcell' + cls + '" data-jump="' + i + '" aria-label="Quesito ' + (i + 1) +
          (c.ans[i] ? ', risposto ' + c.ans[i] : ', senza risposta') + (c.fl[i] ? ', dubbio' : '') + '">' + (i + 1) + '</button>';
      }).join('');
      $modal.innerHTML = '<div class="modal-box gridbox" role="dialog" aria-modal="true" aria-label="Griglia dei quesiti">' +
        '<p class="small muted">Pieno: risposto · punto: dubbio. Tocca un numero per andarci.</p>' +
        '<div class="grid">' + cells + '</div>' +
        '<div class="row"><button class="btn" type="button" id="modal-no">Chiudi</button></div></div>';
      $modal.hidden = false;
      var here = $modal.querySelector('.gcell.here');
      if (here) here.focus();
    }
    $modal.addEventListener('click', function (e) {
      var b = e.target.closest('[data-jump]');
      if (!b) return;
      var c = cur();
      closeModal();
      if (!c) return;
      c.i = Number(b.getAttribute('data-jump'));
      touch(); render(); window.scrollTo(0, 0);
    });
    function zoom(src) {
      $modal.innerHTML = '<div class="modal-box imgbox" role="dialog" aria-modal="true" aria-label="Figura ingrandita">' +
        '<div class="imgscroll"><img src="' + src + '" alt="Figura del quesito, ingrandita"></div>' +
        '<div class="row"><button class="btn" type="button" id="modal-no">Chiudi</button></div></div>';
      $modal.hidden = false;
    }
    ACTIONS.simZoom = function (t) { zoom(t.querySelector('img').getAttribute('src')); };

    /* ---------------------------------------------------------- disegno di un quesito */

    function passageHtml(q, open) {
      var p = q.p && SIM.passages[q.p];
      if (!p) return '';
      return '<details class="passage"' + (open ? ' open' : '') + '><summary>' + esc(p.title || 'Brano') + '</summary>' +
        p.text.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</details>';
    }
    function imagesHtml(q) {
      return (q.img || []).map(function (src) {
        return '<button type="button" class="qimg" data-act="simZoom" aria-label="Ingrandisci la figura"><img src="' + src + '" alt="Figura del quesito"></button>';
      }).join('');
    }
    function intro(q) {
      if (q.a === 'situazionali') return 'Scegli l’opzione più efficace: 1 punto la migliore, 0,50 la neutra, 0 la meno efficace.';
      return '';
    }
    function keyNote(q) {
      if (q.a !== 'situazionali') return '';
      var others = q.o.map(function (o) { return o[0]; }).filter(function (l) { return l !== q.k && l !== q.w; });
      if (q.w) return 'Migliore ' + q.k + ' (1) · neutra ' + others.join(', ') + ' (0,50) · meno efficace ' + q.w + ' (0), come indicato nel dossier.';
      return 'Migliore ' + q.k + ' (chiave ufficiale). Neutra e meno efficace non sono pubblicate: una scelta diversa vale 0 o 0,50.';
    }
    function feedbackHtml(q, a) {
      var s = score(q, a);
      var key = schedaOfCode[q.t];
      return '<div class="fb ' + s.st + '"><p class="fb-h"><b>' + s.lbl + '</b> · ' + fmt(s.pts) + (s.hi ? ' (o 0,50)' : '') +
        (a ? ' · hai scelto ' + a : '') + ' · chiave ' + q.k + (q.kk ? ' (' + esc(q.kk) + ')' : '') + '</p>' +
        (keyNote(q) ? '<p class="small">' + keyNote(q) + '</p>' : '') +
        (q.cp ? '<p class="small"><b>' + esc(q.ti || '') + '</b> · ' + esc(q.cp) + '</p>' : '') +
        q.com.map(function (c) { return '<p class="com">' + esc(c) + '</p>'; }).join('') +
        '<p class="src">' + esc(q.lab) + ' · <span class="code">' + esc(q.id) + '</span>' +
        (q.mo ? ' · ' + esc(q.mo) : '') + '</p>' +
        (key ? '<button class="btn block" data-act="open" data-k="' + esc(key) + '">Apri la scheda ' + esc(q.t) + ' nel ripasso</button>' : '') +
        '</div>';
    }
    function optionsHtml(q, a, reveal) {
      return '<div class="opts" role="group" aria-label="Opzioni">' + q.o.map(function (o) {
        var l = o[0], cls = '';
        if (reveal) {
          if (l === q.k) cls = ' key';
          else if (l === a) cls = ' wrong';
          if (q.w && l === q.w) cls += ' worst';
        }
        return '<button type="button" class="opt' + cls + '" data-act="simAns" data-l="' + l + '" aria-pressed="' + (a === l) + '"' +
          (reveal ? ' disabled' : '') + '><span class="ol">' + l + '</span><span class="ot">' + esc(o[1]) + '</span></button>';
      }).join('') + '</div>';
    }

    /* ---------------------------------------------------------- schermate */

    SCREENS.sim = function () {
      if (view.s === 'run') {
        if (cur()) return runScreen();
        view = { tab: 'sim' };
      }
      if (view.s === 'res') {
        var run = SS.hist.filter(function (h) { return h.id === view.h; })[0];
        if (run) return resultScreen(run);
        view = { tab: 'sim' };
      }
      return homeScreen();
    };

    function composition(plan) {
      var a = plan.aree || {}, parts = [];
      if (a.situazionali) parts.push(a.situazionali + ' situazionali');
      if (a.ragionamento) parts.push(a.ragionamento + ' di ragionamento');
      var tem = 0;
      Object.keys(a).forEach(function (k) { if (k !== 'situazionali' && k !== 'ragionamento' && k !== 'inglese') tem += a[k]; });
      if (tem) parts.push(tem + ' di materia');
      if (a.inglese) parts.push(a.inglese + ' di inglese');
      return parts.join(' · ');
    }
    function planCard(plan) {
      var done = SS.hist.filter(function (h) { return h.p === plan.id; });
      var best = done.length ? done[done.length - 1] : null;
      return '<section class="panel plan">' +
        '<div class="plan-h"><span class="code">' + esc(plan.id) + '</span><h2>' + esc(plan.nome) + '</h2></div>' +
        '<p class="plan-m">' + plan.n + ' quesiti · ' + plan.min + ' minuti' + (plan.quando ? ' · <span class="when">' + esc(plan.quando) + '</span>' : '') + '</p>' +
        '<p class="small">' + esc(plan.scopo) + '</p>' +
        (plan.aree ? '<p class="small muted">' + composition(plan) + '</p>' : '') +
        (plan.note && plan.note.length ? '<ul class="pnote">' + plan.note.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
        (best ? '<p class="small muted">Ultima volta: ' + when(best.end) + ' · ' + fmt(best.sc) + ' su ' + best.ids.length + '</p>' : '') +
        '<div class="row"><button class="btn primary" data-act="simStart" data-p="' + esc(plan.id) + '" data-mode="tempo">Inizia a tempo</button>' +
        '<button class="btn" data-act="simStart" data-p="' + esc(plan.id) + '" data-mode="studio">Correzione subito</button></div>' +
        '</section>';
    }
    function homeScreen() {
      var c = cur();
      var h = '<h1>Simulazioni</h1>';
      if (c) {
        var p = planOf(c);
        h += '<div class="panel resume"><h2>Prova in corso: ' + esc(p.nome) + '</h2>' +
          '<p class="small">' + Object.keys(c.ans).length + ' risposte su ' + c.ids.length +
          (c.mode === 'tempo' ? ' · ' + clock(remaining(c)) + ' rimasti' : ' · senza tempo') + '</p>' +
          '<div class="row"><button class="btn primary" data-act="simResume">Riprendi</button>' +
          '<button class="btn ghost" data-act="simDrop">Abbandona</button></div></div>';
      }
      h += '<p class="hint">Come la preselettiva XII: esatta <b>+1</b>, errata <b>−0,53</b>, omessa <b>0</b>; situazionali <b>1 / 0,50 / 0</b>. ' +
        'I quesiti sono quelli dei dossier (preselettive SNA 8-11 e concorsi Formez), con chiave e commento alla lettera; ' +
        'la nicchia esclusa dall’analisi non entra. Ogni prova pesca prima i quesiti che non hai ancora visto. ' +
        'Il cronometro conta solo mentre la prova è aperta.</p>' +
        '<p class="small muted sync" data-sync></p>';
      SIM.plans.forEach(function (plan) { h += planCard(plan); });
      var rev = reviewIds().length;
      h += '<section class="panel plan"><div class="plan-h"><span class="code">' + REVIEW + '</span><h2>Ripresa degli errori</h2></div>' +
        '<p class="small">Fino a 30 quesiti sbagliati, omessi o non migliori nell’ultima prova in cui sono usciti, 1,5 minuti ciascuno.</p>' +
        (rev ? '<div class="row"><button class="btn primary" data-act="simStart" data-p="' + REVIEW + '" data-mode="tempo">Inizia (' + Math.min(30, rev) + ' quesiti)</button>' +
          '<button class="btn" data-act="simStart" data-p="' + REVIEW + '" data-mode="studio">Correzione subito</button></div>'
          : '<p class="small muted">Si attiva dopo la prima prova consegnata.</p>') + '</section>';
      if (SS.hist.length) {
        h += '<div class="panel"><h2>Prove consegnate</h2><ul class="hist">' + SS.hist.slice().reverse().map(function (r) {
          var p = planOf(r) || { nome: r.p };
          return '<li><button class="linkish" data-act="simOpen" data-h="' + esc(r.id) + '"><span class="code">' + esc(r.p) + '</span> ' +
            esc(p.nome) + '</button><span class="muted small">' + when(r.end) + ' · <b>' + fmt(r.sc) + '</b> su ' + r.ids.length +
            ' · ' + Math.round(r.el / 60) + ' min' + (r.mode === 'studio' ? ' · correzione subito' : '') + '</span></li>';
        }).join('') + '</ul><hr><button class="btn ghost block" data-act="simClear">Cancella lo storico delle prove</button></div>';
      }
      var info = SIM.info;
      h += '<p class="small muted">Quesiti disponibili: ' + info.used + ' (dei ' + info.rows + ' classificati nell’analisi; ' + info.excluded +
        ' esclusi come nicchia). Non entrano i ' + info.missing + ' quesiti del Dossier 1 di cui il PDF dà solo un riassunto (situazionali SNA 10-11) o la sola lettera (buste 1 e 2 di SNA 9). ' +
        'Chiavi ufficiali: SNA 9 e Formez quando indicato; le altre sono ragionate e lo dice il commento.</p>';
      return h;
    }
    ACTIONS.simOpen = function (t) { go({ tab: 'sim', s: 'res', h: t.getAttribute('data-h') }); };
    ACTIONS.simClear = function () {
      ask('Cancellare tutte le prove consegnate' + (sync.mode === 'cloud' ? ', anche dal tuo account' : '') + '? La ripresa degli errori ripartirà da zero.', 'Cancella', function () {
        SS.hist = []; SS.resetAt = Date.now(); if (SS.cur) SS.cur = null;
        save(); pushNow(); render(); toast('Storico cancellato');
      }, true);
    };

    function runScreen() {
      var c = cur();
      var q = Q[c.ids[c.i]];
      if (!q) { c.i = 0; q = Q[c.ids[0]]; }
      var a = c.ans[c.i];
      var reveal = c.mode === 'studio' && !!a;
      return '<div class="qhead"><span class="qn">' + (c.i + 1) + '</span><span class="qa">' + esc(AREA[q.a].label) + '</span>' +
        '<button type="button" class="flagb" data-act="simFlag" aria-pressed="' + !!c.fl[c.i] + '">' + (c.fl[c.i] ? '● Dubbio' : '○ Dubbio') + '</button></div>' +
        (intro(q) ? '<p class="small muted">' + intro(q) + '</p>' : '') +
        passageHtml(q, true) +
        '<div class="qtext">' + paras(q.q) + '</div>' +
        imagesHtml(q) +
        optionsHtml(q, a, reveal) +
        (reveal ? feedbackHtml(q, a) : '') +
        (a && !reveal ? '<p class="small muted">Tocca di nuovo la risposta scelta per lasciarla in bianco.</p>' : '');
    }

    var REV_FILTERS = ['all', 'ko', 'om', 'fl', 'ok'];
    var REV_LABELS = ['Tutti', 'Sbagliati', 'Omessi', 'Dubbi', 'Giusti'];
    CHANGES.simRev = function (t) { S.prefs.simRev = t.value; saveLocal(); go(view, true); };

    function resultScreen(run) {
      var p = planOf(run) || { nome: run.p };
      var t = totals(run);
      var h = '<nav class="crumb"><button class="linkish" data-act="tab" data-t="sim">← Simulazioni</button><span>' + when(run.end) + '</span></nav>' +
        '<h1><span class="code">' + esc(run.p) + '</span> ' + esc(p.nome) + '</h1>' +
        '<div class="panel score"><p class="big"><b>' + fmt(t.pts) + '</b> <span class="muted">su ' + t.n + '</span></p>' +
        (t.hi ? '<p class="small muted">Fino a ' + fmt(t.pts + t.hi) + ' se le scelte non migliori dei modelli SNA 9 fossero le neutre: la Scuola ha pubblicato solo la migliore.</p>' : '') +
        '<p class="small">' + t.ok + ' esatte o migliori · ' + (t.mid ? t.mid + ' neutre · ' : '') + t.ko + ' errate · ' + t.om + ' omesse · ' +
        Math.round(run.el / 60) + ' min' + (run.mode === 'studio' ? ' (correzione subito)' : ' su ' + run.min) + '</p></div>';
      h += '<div class="panel"><h2>Per area</h2><ul class="areas">' +
        SIM.areas.filter(function (a) { return t.areas[a[0]]; }).map(function (a) {
          var x = t.areas[a[0]];
          return '<li><span class="an">' + esc(a[1]) + '</span><span class="ap"><b>' + fmt(x.pts) + '</b> / ' + x.n + '</span>' +
            '<span class="ad">' + x.ok + (a[0] === 'situazionali' ? ' migliori' : ' esatte') + (x.mid ? ' · ' + x.mid + ' neutre' : '') +
            ' · ' + x.ko + (a[0] === 'situazionali' ? ' meno efficaci o non migliori' : ' errate') + ' · ' + x.om + ' omesse</span></li>';
        }).join('') + '</ul></div>';
      var sk = Object.keys(t.schede).sort(function (a, b) { return t.schede[b] - t.schede[a]; });
      if (sk.length) {
        h += '<div class="panel"><h2>Schede da rileggere</h2><p class="small muted">Dove hai sbagliato od omesso: apri la scheda nel ripasso.</p><div class="chips">' +
          sk.map(function (code) {
            return '<button class="chip" data-act="open" data-k="' + esc(schedaOfCode[code]) + '"><span class="code">' + esc(code) + '</span> ' +
              esc(schedaByKey[schedaOfCode[code]].sc.title) + ' · ' + t.schede[code] + '</button>';
          }).join('') + '</div></div>';
      }
      var f = REV_FILTERS.indexOf(S.prefs.simRev) >= 0 ? S.prefs.simRev : 'all';
      var items = run.ids.map(function (id, i) { return { q: Q[id], i: i, a: run.ans[i] }; }).filter(function (x) {
        if (!x.q) return false;
        var s = score(x.q, x.a);
        if (f === 'ko') return s.st === 'ko' || s.st === 'mid';
        if (f === 'om') return s.st === 'omessa';
        if (f === 'fl') return !!(run.fl || {})[x.i];
        if (f === 'ok') return s.st === 'ok';
        return true;
      });
      h += '<div class="panel slim"><div class="field"><span class="lbl">Correzione</span>' + seg('simRev', REV_FILTERS, REV_LABELS, f) + '</div></div>';
      var lastP = null;
      h += items.length ? items.map(function (x) {
        var q = x.q, s = score(q, x.a);
        var showP = q.p && q.p !== lastP;
        lastP = q.p || null;
        return '<article class="rev ' + s.st + '"><div class="qhead"><span class="qn">' + (x.i + 1) + '</span><span class="qa">' +
          esc(AREA[q.a].short) + ' · ' + esc(topicLabel(q)) + '</span>' + ((run.fl || {})[x.i] ? '<span class="dub">dubbio</span>' : '') + '</div>' +
          (showP ? passageHtml(q, false) : (q.p ? '<p class="small muted">Stesso brano del quesito precedente.</p>' : '')) +
          '<div class="qtext">' + paras(q.q) + '</div>' + imagesHtml(q) + optionsHtml(q, x.a, true) + feedbackHtml(q, x.a) + '</article>';
      }).join('') : '<p class="empty">Nessun quesito con questo filtro.</p>';
      h += '<div class="endbox"><button class="btn primary block" data-act="tab" data-t="sim">Torna alle simulazioni</button></div>';
      return h;
    }

    /* ---------------------------------------------------------- tastiera */

    document.addEventListener('keydown', function (e) {
      if (!(view.tab === 'sim' && view.s === 'run' && cur())) return;
      if (!$modal.hidden) return;
      var tag = e.target && e.target.tagName;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key;
      if (k === 'ArrowRight') { e.preventDefault(); move(1); }
      else if (k === 'ArrowLeft') { e.preventDefault(); move(-1); }
      else if (/^[a-eA-E]$/.test(k)) {
        var b = $app.querySelector('.opt[data-l="' + k.toUpperCase() + '"]');
        if (b && !b.disabled) { e.preventDefault(); ACTIONS.simAns(b); }
      } else if (k === 'f' || k === 'F') { e.preventDefault(); ACTIONS.simFlag(); }
      else return;
      e.stopImmediatePropagation();
    });

    if (SS.cur && SS.cur.mode === 'tempo' && remaining(SS.cur) <= 0) {
      // il tempo era già finito alla chiusura
      after.push(function () { if (cur()) finish(true); });
    }
  })();
