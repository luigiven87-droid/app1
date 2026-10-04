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
    /* Gemelli: lo stesso quesito ripreso in un altro anno, in un'altra fonte o come variante
       (q.tw, già simmetrico). Non escono insieme e uno visto conta a metà per l'altro. */
    var TWINS = {};
    SIM.q.forEach(function (q) {
      (q.tw || []).forEach(function (t) { (TWINS[q.id] = TWINS[q.id] || {})[t] = 1; });
    });
    function twinKey(q) { return q.tw ? [q.id].concat(q.tw).sort()[0] : q.id; }
    /* Un solo quesito per gruppo di gemelli (il primo della lista): per i conteggi e il ripasso errori. */
    function uniq(list) {
      var got = {};
      return list.filter(function (q) { var k = twinKey(q); if (got[k]) return false; got[k] = 1; return true; });
    }
    var REVIEW = 'R';

    TABS.push({ id: 'sim', label: 'Simulazioni' });

    /* ---------------------------------------------------------- stato */

    function blank() { return { v: 1, cur: null, hist: [], resetAt: 0 }; }
    function load() {
      try {
        var s = JSON.parse(localStorage.getItem(SIM_KEY) || 'null');
        if (s && s.v === 1) {
          var b = blank();
          b.cur = s.cur && Array.isArray(s.cur.ids) ? norm(s.cur) : null;
          b.hist = Array.isArray(s.hist) ? s.hist.filter(validRun).map(norm) : [];
          b.resetAt = Number(s.resetAt) || 0;
          return b;
        }
      } catch (e) { /* senza localStorage si lavora in memoria */ }
      return blank();
    }
    function validRun(r) { return r && r.id && Array.isArray(r.ids) && r.ans && typeof r.ans === 'object'; }
    /* tl: minuti a disposizione (0 = senza tempo); fb: correzione subito dopo ogni risposta.
       Le prove salvate prima avevano solo mode: 'tempo' | 'studio'. */
    function norm(r) {
      if (r && r.tl === undefined) r.tl = r.mode === 'tempo' ? (r.min || 0) : 0;
      if (r && r.fb === undefined) r.fb = r.mode === 'studio';
      return r;
    }
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
        if (validRun(h) && !byId[h.id]) { byId[h.id] = norm(h); changed = true; }
      });
      var hist = Object.keys(byId).map(function (k) { return byId[k]; })
        .filter(function (h) { return h.at > SS.resetAt; })
        .sort(function (a, b) { return a.end - b.end; });
      if (hist.length !== SS.hist.length) changed = true;
      SS.hist = hist;
      var rc = remote.cur && Array.isArray(remote.cur.ids) ? remote.cur : null;
      if (rc && (!SS.cur || (rc.upd || 0) > (SS.cur.upd || 0))) { SS.cur = norm(rc); changed = true; }
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
    function srcOf(q) { return /^AD/.test(q.id) ? 'formez' : /^EL-/.test(q.id) ? 'el' : 'sna'; }
    function bustaOf(q) { var m = /-B(\d)-/.exec(q.c || ''); return m ? m[1] : ''; }
    function paras(text) {
      return String(text || '').split(/\n\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    }

    /* ---------------------------------------------------------- sorteggio */

    function seenCounts(withTwins) {
      var c = {};
      SS.hist.forEach(function (h) { h.ids.forEach(function (id) { c[id] = (c[id] || 0) + 1; }); });
      if (withTwins) {
        Object.keys(c).forEach(function (id) {
          Object.keys(TWINS[id] || {}).forEach(function (t) { if (!c[t]) c[t] = 0.5; });
        });
      }
      return c;
    }

    function Picker(plan) {
      this.plan = plan;
      this.seen = seenCounts(true);
      this.ids = [];
      this.taken = {};
      this.coords = {};
      this.passages = {};
    }
    Picker.prototype.clash = function (q) {
      if (this.taken[q.id]) return true;
      if (q.c && this.coords[q.c]) return true;
      var self = this;
      return Object.keys(TWINS[q.id] || {}).some(function (t) { return self.taken[t]; });
    };
    Picker.prototype.take = function (q) {
      this.ids.push(q.id);
      this.taken[q.id] = 1;
      if (q.c) this.coords[q.c] = 1;
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

    /* ---------------------------------------------------------- blocco per materia */

    var SRC_LABEL = { sna: 'Preselettive SNA', formez: 'Formez', el: 'Elaborate (non d’archivio)' };
    function bPrefs() {
      var p = S.prefs.simB || (S.prefs.simB = {});
      if (!Array.isArray(p.a)) p.a = [];
      if (!Array.isArray(p.t)) p.t = [];
      if (!p.src) p.src = { sna: true, formez: true };
      if (p.src.el === undefined) p.src.el = false;
      if (!p.n) p.n = 10;
      if (p.tm === undefined) p.tm = 0;
      if (p.fb === undefined) p.fb = false;
      return p;
    }
    function ePrefs() {
      var p = S.prefs.simE || (S.prefs.simE = {});
      if (!Array.isArray(p.a)) p.a = [];
      if (!p.n) p.n = 15;
      if (p.tm === undefined) p.tm = 0;
      if (p.fb === undefined) p.fb = true;
      return p;
    }
    function usable(q, f) {
      if (q.inc === 'el') return !!f.src.el;
      if (!(q.inc === 'sì' || (f.ris && q.inc === 'riserva'))) return false;
      return !!f.src[srcOf(q)];
    }
    function drillPool(f, ignoreArea) {
      return SIM.q.filter(function (q) {
        if (!usable(q, f)) return false;
        if (ignoreArea) return true;
        if (f.a.length && f.a.indexOf(q.a) < 0) return false;
        if (f.a.length === 1 && f.t.length && f.t.indexOf(q.t) < 0) return false;
        return true;
      });
    }
    /* Prima i mai visti, poi i meno visti; un brano entra con le sue domande. */
    function drillPick(pool, n) {
      var pk = new Picker({});
      var units = {}, list = [];
      pool.forEach(function (q) {
        var k = q.t === 'brano' && q.p ? q.p + '|' + bustaOf(q) : q.id;
        if (!units[k]) { units[k] = []; list.push(units[k]); }
        units[k].push(q);
      });
      list = list.map(function (g) {
        var seen = g.reduce(function (m, q) { return Math.max(m, pk.seen[q.id] || 0); }, 0);
        return { g: g, k: [seen ? 1 : 0, seen, Math.random()] };
      }).sort(function (a, b) {
        for (var i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
        return 0;
      });
      list.forEach(function (x) {
        if (pk.ids.length >= n || (x.g[0].p && x.g[0].t === 'brano' && pk.passages[x.g[0].p])) return;
        x.g.slice().sort(function (a, b) { return qnum(a) - qnum(b); }).forEach(function (q) {
          if (pk.ids.length < n && !pk.clash(q)) pk.take(q);
        });
      });
      return order(pk.ids);
    }
    function areaNames(list) {
      return list.map(function (a) { return AREA[a] ? AREA[a].label : a; }).join(', ');
    }

    /* ---------------------------------------------------------- ripasso errori */

    /* Per ogni quesito: quante volte è uscito, quanti errori, l'esito dell'ultima volta.
       Errore = risposta errata, o situazionale non migliore; gli omessi solo se richiesto. */
    function errStats(withOmitted) {
      var st = {};
      SS.hist.slice().sort(function (a, b) { return a.end - b.end; }).forEach(function (h) {
        h.ids.forEach(function (id, i) {
          var q = Q[id];
          if (!q) return;
          var sc = score(q, h.ans[i]);
          var r = st[id] || (st[id] = { n: 0, err: 0, first: 0, last: 0, bad: false });
          var bad = sc.st === 'ko' || sc.st === 'mid' || (withOmitted && sc.st === 'omessa');
          r.n++;
          r.last = h.end;
          if (bad) { r.err++; if (!r.first) r.first = h.end; }
          r.bad = bad || (sc.st === 'omessa' && r.bad);
        });
      });
      return st;
    }
    var DUE = 12 * 3600e3;
    function errPool(f) {
      var st = errStats(!!f.om), now = Date.now();
      var list = Object.keys(st).filter(function (id) {
        return st[id].bad && st[id].err > 0 && (!f.a.length || f.a.indexOf(Q[id].a) >= 0);
      }).map(function (id) {
        var r = st[id];
        return { id: id, k: [now - r.last >= DUE ? 0 : 1, -r.err, r.first] };
      }).sort(function (a, b) {
        for (var i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
        return 0;
      }).map(function (x) { return Q[x.id]; }).filter(Boolean);
      return uniq(list).map(function (q) { return q.id; });
    }

    function planOf(run) {
      if (run.p === REVIEW) return { id: REVIEW, nome: 'Ripresa degli errori', min: run.min };
      if (run.p === 'B') return { id: 'B', nome: 'Blocco' + (run.lab ? ': ' + run.lab : ''), min: run.min };
      if (run.p === 'E') return { id: 'E', nome: 'Ripasso errori' + (run.lab ? ': ' + run.lab : ''), min: run.min };
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

    /* opt: { tl: minuti (0 = senza tempo), fb: correzione subito } */
    function start(plan, opt) {
      var ids = plan.ids || build(plan);
      if (!ids.length) { toast('Nessun quesito disponibile'); return; }
      var now = Date.now();
      SS.cur = { id: plan.id + '-' + now, p: plan.id, at: now, upd: now, ids: ids, ans: {}, fl: {},
        el: 0, i: 0, mode: opt.fb ? 'studio' : 'tempo', tl: opt.tl, fb: !!opt.fb, min: plan.min };
      if (plan.lab) SS.cur.lab = plan.lab;
      save();
      go({ tab: 'sim', s: 'run' });
    }
    function begin(plan, opt) {
      if (SS.cur) {
        ask('Hai una prova in corso (' + planOf(SS.cur).nome + '). Abbandonarla e iniziarne una nuova?', 'Abbandona e inizia', function () {
          SS.cur = null; start(plan, opt);
        }, true);
      } else start(plan, opt);
    }
    ACTIONS.simStart = function (t) {
      var plan = PLAN[t.getAttribute('data-p')];
      var studio = t.getAttribute('data-mode') === 'studio';
      if (plan) begin(plan, { tl: studio ? 0 : plan.min, fb: studio });
    };
    ACTIONS.simDrill = function () {
      var f = bPrefs();
      var pool = drillPool(f);
      var ids = drillPick(pool, f.n);
      if (!ids.length) { toast('Nessun quesito con questi filtri'); return; }
      if (ids.length < f.n && f.n < ALL) toast('Disponibili solo ' + ids.length + ' quesiti');
      var lab = f.a.length ? areaNames(f.a) : 'tutte le materie';
      if (f.a.length === 1 && f.t.length) lab += ' (' + f.t.join(', ') + ')';
      begin({ id: 'B', ids: ids, lab: lab, min: Math.ceil(ids.length * 1.5) },
        { tl: f.tm ? Math.ceil(ids.length * 1.5) : 0, fb: f.fb });
    };
    ACTIONS.simErr = function () {
      var f = ePrefs();
      var ids = order(errPool(f).slice(0, f.n));
      if (!ids.length) { toast('Nessun errore da ripassare con questi filtri'); return; }
      begin({ id: 'E', ids: ids, lab: f.a.length ? areaNames(f.a) : '', min: Math.ceil(ids.length * 1.5) },
        { tl: f.tm ? Math.ceil(ids.length * 1.5) : 0, fb: f.fb });
    };
    ACTIONS.simResume = function () { go({ tab: 'sim', s: 'run' }); };
    ACTIONS.simDrop = function () {
      ask('Abbandonare la prova in corso? Le risposte date finora non verranno conteggiate.', 'Abbandona', function () {
        SS.cur = null; save(); go({ tab: 'sim' });
      }, true);
    };

    function cur() { return SS.cur; }
    function touch() { var c = cur(); if (c) c.upd = Date.now(); save(); }
    function remaining(c) { return c.tl * 60 - c.el; }

    ACTIONS.simAns = function (t) {
      var c = cur();
      if (!c) return;
      var l = t.getAttribute('data-l');
      if (c.fb && c.ans[c.i]) return;
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
        mode: c.mode, tl: c.tl, fb: c.fb, min: c.min, sc: Math.round(t.pts * 100) / 100, hi: t.hi };
      if (c.lab) run.lab = c.lab;
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
      if (c.tl && remaining(c) <= 0) { finish(true); return; }
      if (++saveEvery % 10 === 0) { c.upd = Date.now(); save(); }
    }
    function paintClock() {
      var c = cur(), el = document.getElementById('countdown');
      if (!c || !el) return;
      var done = Object.keys(c.ans).length;
      var p = planOf(c);
      el.textContent = (p.id === 'B' ? 'Blocco' : p.id === 'E' ? 'Errori' : p.id) + ' · ' +
        (c.tl ? '⏱ ' + clock(remaining(c)) + ' rimasti' : '⏱ ' + clock(c.el)) + ' · ' + done + '/' + c.ids.length + ' risposte';
      el.classList.toggle('late', !!c.tl && remaining(c) < Math.min(300, c.tl * 12));
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
    ACTIONS.simToPassage = function () {
      var el = document.getElementById('passage');
      if (!el) return;
      el.open = true;
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - headerBottom() - 8, behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    ACTIONS.simZoom = function (t) { zoom(t.querySelector('img').getAttribute('src')); };

    /* ---------------------------------------------------------- disegno di un quesito */

    function passageHtml(q, open, bare) {
      var p = q.p && SIM.passages[q.p];
      if (!p) return '';
      var title = bare ? (q.a === 'inglese' ? 'Text' : 'Brano') : (p.title || 'Brano');
      return '<details class="passage" id="passage"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary>' +
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
    function pointText(p) {
      var t = p.t === 'row' ? [p.ql || '', p.q].concat(p.a.map(function (r) { return r[0] + ': ' + r[1]; })).join(' · ') : p.h;
      return stripTags(String(t)).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
    function citeHtml(q) {
      if (!q.cite || !q.cite.length) return '';
      return '<div class="cite"><p class="lbl">Nel ripasso</p>' + q.cite.map(function (id) {
        var e = PT[id];
        if (!e) return '';
        return '<blockquote>' + esc(pointText(e.p)) + '</blockquote>' +
          '<button class="linkish" data-act="simCite" data-id="' + esc(id) + '">Apri il punto nella scheda ' + esc(schedaByKey[e.sk].sc.code || '') + ' →</button>';
      }).join('') + '</div>';
    }
    ACTIONS.simCite = function (t) {
      var id = t.getAttribute('data-id');
      if (PT[id]) openScheda(PT[id].sk, id);
    };
    function feedbackHtml(q, a) {
      var s = score(q, a);
      var key = schedaOfCode[q.t];
      return '<div class="fb ' + s.st + '"><p class="fb-h"><b>' + s.lbl + '</b> · ' + fmt(s.pts) + (s.hi ? ' (o 0,50)' : '') +
        (a ? ' · hai scelto ' + a : '') + ' · chiave ' + q.k + (q.kk ? ' (' + esc(q.kk) + ')' : '') + '</p>' +
        (q.vg === 'A' ? '<p class="badge">Norma cambiata dopo la prova: la risposta resta giusta, ma leggi il commento.</p>' : '') +
        (q.vg === 'X' ? '<p class="badge">Superato: la norma oggi è diversa, leggi il commento.</p>' : '') +
        (q.km ? '<p class="badge">Chiave incerta: il dossier la dà ad affidabilità media.</p>' : '') +
        (keyNote(q) ? '<p class="small">' + keyNote(q) + '</p>' : '') +
        (q.cp ? '<p class="small"><b>' + esc(q.ti || '') + '</b> · ' + esc(q.cp) + '</p>' : '') +
        (q.inc === 'el' ? '<p class="badge el">Domanda elaborata, non d’archivio: costruita su un argomento della scheda non ancora uscito nelle preselettive SNA 9-11.</p>' : '') +
        q.com.map(function (c) { return '<p class="com">' + esc(c) + '</p>'; }).join('') +
        citeHtml(q) +
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
        '<button class="btn" data-act="simStart" data-p="' + esc(plan.id) + '" data-mode="studio">Senza tempo, correzione subito</button></div>' +
        '</section>';
    }
    var SUBS = ['prove', 'blocco', 'errori', 'storico'];
    var SUB_LABELS = ['Prove', 'Materie', 'Errori', 'Storico'];
    CHANGES.simTab = function (t) { S.prefs.simTab = t.value; saveLocal(); go({ tab: 'sim' }, true); };

    function chip(group, value, label, on, n) {
      return '<button type="button" class="chip pick" data-act="simChip" data-g="' + group + '" data-v="' + esc(value) + '" aria-pressed="' + !!on + '"' +
        (n === 0 && !on ? ' disabled' : '') + '>' + label + (n !== undefined ? ' <span class="cn">' + n + '</span>' : '') + '</button>';
    }
    ACTIONS.simChip = function (t) {
      var g = t.getAttribute('data-g'), v = t.getAttribute('data-v');
      var f = g.charAt(0) === 'b' ? bPrefs() : ePrefs();
      var key = g.charAt(1);
      if (key === 's') f.src[v] = !f.src[v];
      else if (key === 'r') f.ris = !f.ris;
      else if (key === 'o') f.om = !f.om;
      else if (key === 'f') f.fb = !f.fb;
      else {
        var list = f[key], i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1); else list.push(v);
        if (key === 'a') f.t = [];
      }
      saveLocal();
      go(view, true);
    };
    ACTIONS.simSet = function (t) {
      var f = t.getAttribute('data-g') === 'b' ? bPrefs() : ePrefs();
      f[t.getAttribute('data-k')] = Number(t.getAttribute('data-v'));
      saveLocal();
      go(view, true);
    };
    /* Quanti quesiti: scelte rapide, «Tutti» e un campo libero. */
    var ALL = 100000;
    function countField(g, f, max) {
      var presets = g === 'b' ? [5, 10, 15, 20, 30] : [10, 15, 20, 30];
      var shown = f.n >= ALL ? max : f.n;
      return '<div class="field"><span class="lbl">Quesiti</span>' +
        choice(g, 'n', presets.concat([ALL]), presets.map(String).concat(['Tutti (' + max + ')']), f.n) +
        '<label class="numrow" for="n-' + g + '"><span>Oppure scrivi quanti</span>' +
        '<input id="n-' + g + '" type="number" inputmode="numeric" min="1" max="' + Math.max(1, max) + '" step="1" value="' + shown + '" data-change="simN" data-g="' + g + '"></label></div>';
    }
    function setCount(t) {
      var g = t.getAttribute('data-g');
      var f = g === 'b' ? bPrefs() : ePrefs();
      var v = parseInt(t.value, 10);
      if (!(v > 0)) return;
      f.n = Math.min(v, ALL - 1);
      saveLocal();
      var btns = $app.querySelectorAll('[data-act=simSet][data-g="' + g + '"][data-k=n]');
      for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', String(Number(btns[i].getAttribute('data-v')) === f.n));
      var go_ = $app.querySelector(g === 'b' ? '[data-act=simDrill]' : '[data-act=simErr]');
      var max = Number(t.getAttribute('max'));
      if (go_) go_.textContent = (g === 'b' ? 'Avvia blocco (' : 'Avvia ripasso (') + Math.min(f.n, max) + ')';
    }
    CHANGES.simN = setCount;
    $app.addEventListener('input', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-change') === 'simN') setCount(e.target);
    });
    function choice(g, k, values, labels, cur) {
      return '<div class="seg" role="group">' + values.map(function (v, i) {
        return '<button type="button" data-act="simSet" data-g="' + g + '" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + labels[i] + '</button>';
      }).join('') + '</div>';
    }
    function countBy(list, key) {
      var c = {};
      list.forEach(function (q) { c[q[key]] = (c[q[key]] || 0) + 1; });
      return c;
    }
    /* Come countBy, ma i gemelli dello stesso gruppo contano una volta. */
    function countUniqBy(list, key) {
      var by = {};
      list.forEach(function (q) { (by[q[key]] = by[q[key]] || []).push(q); });
      var c = {};
      Object.keys(by).forEach(function (k) { c[k] = uniq(by[k]).length; });
      return c;
    }

    function resumeHtml() {
      var c = cur();
      if (!c) return '';
      var p = planOf(c);
      return '<div class="panel resume"><h2>In corso: ' + esc(p.nome) + '</h2>' +
        '<p class="small">' + Object.keys(c.ans).length + ' risposte su ' + c.ids.length +
        (c.tl ? ' · ' + clock(remaining(c)) + ' rimasti' : ' · senza tempo') + (c.fb ? ' · correzione subito' : '') + '</p>' +
        '<div class="row"><button class="btn primary" data-act="simResume">Riprendi</button>' +
        '<button class="btn ghost" data-act="simDrop">Abbandona</button></div></div>';
    }
    function statsHtml() {
      var seen = seenCounts();
      var nSeen = uniq(SIM.q.filter(function (q) { return seen[q.id]; })).length;
      var nErr = errPool({ a: [] }).length;
      return '<div class="stats"><div><b>' + uniq(SIM.q).length + '</b><span>quesiti</span></div>' +
        '<div><b>' + nSeen + '</b><span>già visti</span></div>' +
        '<div><b>' + nErr + '</b><span>errori da rivedere</span></div></div>';
    }

    function homeScreen() {
      var sub = SUBS.indexOf(S.prefs.simTab) >= 0 ? S.prefs.simTab : 'prove';
      var h = '<h1>Simulazioni</h1>' + resumeHtml() + statsHtml() +
        '<div class="subtabs">' + seg('simTab', SUBS, SUB_LABELS, sub) + '</div>';
      if (sub === 'blocco') h += drillHtml();
      else if (sub === 'errori') h += errHtml();
      else if (sub === 'storico') h += histHtml();
      else h += plansHtml();
      return h;
    }

    function plansHtml() {
      var h = '<p class="hint">Come la preselettiva XII: esatta <b>+1</b>, errata <b>−0,53</b>, omessa <b>0</b>; situazionali <b>1 / 0,50 / 0</b>. ' +
        'I quesiti sono quelli dei dossier (preselettive SNA 8-11 e concorsi Formez), con chiave e commento alla lettera; ' +
        'la nicchia esclusa dall’analisi non entra. Ogni prova pesca prima i quesiti che non hai ancora visto. ' +
        'Il cronometro conta solo mentre la prova è aperta.</p>' +
        '<p class="small muted sync" data-sync></p>';
      SIM.plans.forEach(function (plan) { h += planCard(plan); });
      var info = SIM.info;
      h += '<p class="small muted">Quesiti disponibili: ' + info.used + ' (dei ' + info.rows + ' classificati nell’analisi; ' + info.excluded +
        ' esclusi come nicchia). Non entrano i ' + info.missing + ' quesiti del Dossier 1 di cui il PDF dà solo un riassunto (situazionali SNA 10-11) o la sola lettera (buste 1 e 2 di SNA 9). ' +
        'Chiavi ufficiali: SNA 9 e Formez quando indicato; le altre sono ragionate e lo dice il commento.</p>';
      return h;
    }

    function drillHtml() {
      var f = bPrefs();
      var all = drillPool(f, true);
      var byArea = countUniqBy(all, 'a');
      var pool = uniq(drillPool(f));
      var seen = seenCounts(true);
      var fresh = pool.filter(function (q) { return !seen[q.id]; }).length;
      var h = '<section class="panel"><h2>Blocco per materia</h2>' +
        '<p class="small muted">Scegli una o più materie (nessuna = tutte). Con una sola materia puoi restringere alle schede o ai tipi di quesito. Escono prima i quesiti mai visti; con «Tutti» fai l’intero blocco in una sessione.</p>' +
        '<div class="chips">' + SIM.areas.map(function (a) { return chip('ba', a[0], esc(a[1]), f.a.indexOf(a[0]) >= 0, byArea[a[0]] || 0); }).join('') + '</div>';
      if (f.a.length === 1) {
        var inArea = all.filter(function (q) { return q.a === f.a[0]; });
        var byType = countUniqBy(inArea, 't');
        var types = Object.keys(byType).sort(function (x, y) {
          var nx = /^[A-Z]+\d+$/.test(x), ny = /^[A-Z]+\d+$/.test(y);
          if (nx && ny) return x.replace(/\d+/, '') === y.replace(/\d+/, '') ? Number(x.replace(/\D+/, '')) - Number(y.replace(/\D+/, '')) : (x < y ? -1 : 1);
          return x < y ? -1 : 1;
        });
        if (types.length > 1) {
          h += '<p class="lbl" style="margin-top:12px">' + (schedaOfCode[types[0]] ? 'Schede' : 'Tipi di quesito') + ' (nessuna = tutte)</p><div class="chips">' +
            types.map(function (t) {
              var lab = schedaOfCode[t] ? '<span class="code">' + esc(t) + '</span> ' + esc(schedaByKey[schedaOfCode[t]].sc.title) : esc(SIM.types[t] || t);
              return chip('bt', t, lab, f.t.indexOf(t) >= 0, byType[t]);
            }).join('') + '</div>';
        }
      }
      var nSrc = countBy(SIM.q.filter(function (q) { return q.inc === 'sì' || q.inc === 'el' || (f.ris && q.inc === 'riserva'); }).map(function (q) { return { s: srcOf(q) }; }), 's');
      var nRis = SIM.q.filter(function (q) { return q.inc === 'riserva' && f.src[srcOf(q)]; }).length;
      h += '<p class="lbl" style="margin-top:12px">Banche</p><div class="chips">' +
        ['sna', 'formez'].concat(nSrc.el ? ['el'] : []).map(function (k) { return chip('bs', k, SRC_LABEL[k], f.src[k], nSrc[k] || 0); }).join('') +
        chip('br', '1', 'Anche i quesiti di riserva', f.ris, nRis) + '</div>' +
        '<p class="small muted">Riserva: formati usciti solo in SNA 8 o nei concorsi Formez (logica deduttiva e verbale), varianti con le lettere spostate, situazionali in inglese.' +
        (nSrc.el ? ' <b>Elaborate</b>: domande scritte per questa app sugli argomenti delle schede non ancora usciti nelle preselettive SNA; ognuna rimanda al punto del ripasso che dà la risposta. Non entrano nelle prove H1-H6.' : '') + '</p>' +
        countField('b', f, pool.length) +
        '<div class="field"><span class="lbl">Tempo</span>' + choice('b', 'tm', [0, 1], ['Senza tempo', '1,5′ a quesito, come in prova'], f.tm) + '</div>' +
        '<div class="chips">' + chip('bf', '1', 'Correzione subito dopo ogni risposta', f.fb) + '</div>' +
        '<p class="small" style="margin-top:12px"><b>' + pool.length + '</b> quesiti con questi filtri, <b>' + fresh + '</b> mai visti.</p>' +
        '<button class="btn primary block" data-act="simDrill"' + (pool.length ? '' : ' disabled') + '>Avvia blocco (' + Math.min(f.n, pool.length) + ')</button></section>';
      return h;
    }

    function errHtml() {
      var f = ePrefs();
      var allErr = errPool({ a: [], om: f.om });
      var byArea = countBy(allErr.map(function (id) { return Q[id]; }), 'a');
      var pool = errPool(f);
      var st = errStats(!!f.om), now = Date.now();
      var due = pool.filter(function (id) { return now - st[id].last >= DUE; }).length;
      var h = '<section class="panel"><h2>Ripasso errori</h2>' +
        '<p class="small muted">Solo i quesiti che hai sbagliato (per i situazionali: non la migliore) e che non hai ancora risolto dopo; escono dal ripasso quando li fai giusti. ' +
        'Priorità: quelli che non rivedi da almeno 12 ore, poi i più sbagliati, poi i più vecchi.</p>';
      if (!SS.hist.length) return h + '<p class="empty">Si attiva dopo la prima prova o il primo blocco consegnato.</p></section>';
      h += '<div class="chips">' + SIM.areas.map(function (a) { return chip('ea', a[0], esc(a[1]), f.a.indexOf(a[0]) >= 0, byArea[a[0]] || 0); }).join('') + '</div>' +
        '<div class="chips" style="margin-top:10px">' + chip('eo', '1', 'Anche gli omessi', f.om) + '</div>' +
        countField('e', f, pool.length) +
        '<div class="field"><span class="lbl">Tempo</span>' + choice('e', 'tm', [0, 1], ['Senza tempo', '1,5′ a quesito, come in prova'], f.tm) + '</div>' +
        '<div class="chips">' + chip('ef', '1', 'Correzione subito dopo ogni risposta', f.fb) + '</div>' +
        '<p class="small" style="margin-top:12px"><b>' + pool.length + '</b> da ripassare' + (pool.length ? ', di cui <b>' + due + '</b> non rivisti da 12 ore' : '') + '.</p>' +
        '<button class="btn primary block" data-act="simErr"' + (pool.length ? '' : ' disabled') + '>Avvia ripasso (' + Math.min(f.n, pool.length) + ')</button></section>';
      return h;
    }

    function histHtml() {
      if (!SS.hist.length) return '<p class="empty">Nessuna prova consegnata.</p>';
      var seen = seenCounts(), st = errStats(false);
      var agg = {};
      SS.hist.forEach(function (h) {
        h.ids.forEach(function (id, i) {
          var q = Q[id];
          if (!q) return;
          var x = agg[q.a] || (agg[q.a] = { n: 0, ok: 0, pts: 0 });
          var sc = score(q, h.ans[i]);
          x.n++; x.pts += sc.pts; if (sc.st === 'ok') x.ok++;
        });
      });
      var tot = countBy(SIM.q, 'a');
      var h = '<div class="panel"><h2>Per materia</h2><p class="small muted">Tutte le risposte date finora, in prove, blocchi e ripassi.</p><ul class="areas">' +
        SIM.areas.filter(function (a) { return agg[a[0]]; }).map(function (a) {
          var x = agg[a[0]];
          var distinct = SIM.q.filter(function (q) { return q.a === a[0] && seen[q.id]; }).length;
          var todo = Object.keys(st).filter(function (id) { return Q[id].a === a[0] && st[id].bad && st[id].err; }).length;
          return '<li><span class="an">' + esc(a[1]) + '</span><span class="ap"><b>' + Math.round(100 * x.ok / x.n) + '%</b> giuste</span>' +
            '<span class="ad">' + x.n + ' risposte · ' + distinct + ' di ' + tot[a[0]] + ' quesiti visti · ' + fmt(x.pts / x.n) + ' punti a quesito' +
            (todo ? ' · <b>' + todo + '</b> da ripassare' : '') + '</span></li>';
        }).join('') + '</ul></div>';
      h += '<div class="panel"><h2>Prove consegnate</h2><ul class="hist">' + SS.hist.slice().reverse().map(function (r) {
        var p = planOf(r);
        return '<li><button class="linkish" data-act="simOpen" data-h="' + esc(r.id) + '"><span class="code">' + esc(r.p) + '</span> ' +
          esc(p.nome) + '</button><span class="muted small">' + when(r.end) + ' · <b>' + fmt(r.sc) + '</b> su ' + r.ids.length +
          ' · ' + Math.round(r.el / 60) + ' min' + (r.fb ? ' · correzione subito' : '') + '</span></li>';
      }).join('') + '</ul><hr><button class="btn ghost block" data-act="simClear">Cancella lo storico delle prove</button></div>';
      return h;
    }
    ACTIONS.simOpen = function (t) { go({ tab: 'sim', s: 'res', h: t.getAttribute('data-h') }); };
    ACTIONS.simClear = function () {
      ask('Cancellare tutte le prove consegnate' + (sync.mode === 'cloud' ? ', anche dal tuo account' : '') + '? Il ripasso degli errori ripartirà da zero.', 'Cancella', function () {
        SS.hist = []; SS.resetAt = Date.now(); if (SS.cur) SS.cur = null;
        save(); pushNow(); render(); toast('Storico cancellato');
      }, true);
    };

    function runScreen() {
      var c = cur();
      var q = Q[c.ids[c.i]];
      if (!q) { c.i = 0; q = Q[c.ids[0]]; }
      var a = c.ans[c.i];
      var reveal = c.fb && !!a;
      return '<div class="qhead"><span class="qn">' + (c.i + 1) + '</span><span class="qa">' + esc(AREA[q.a].label) +
        (q.inc === 'el' ? ' <span class="elb">elaborata</span>' : '') + '</span>' +
        '<button type="button" class="flagb" data-act="simFlag" aria-pressed="' + !!c.fl[c.i] + '">' + (c.fl[c.i] ? '● Dubbio' : '○ Dubbio') + '</button></div>' +
        (intro(q) ? '<p class="small muted">' + intro(q) + '</p>' : '') +
        passageHtml(q, true, true) +
        '<div class="qtext">' + paras(q.q) + '</div>' +
        imagesHtml(q) +
        (q.p ? '<button type="button" class="linkish up" data-act="simToPassage">↑ Rileggi il ' + (q.a === 'inglese' ? 'testo' : 'brano') + '</button>' : '') +
        optionsHtml(q, a, reveal) +
        (reveal ? feedbackHtml(q, a) : '') +
        (a && !reveal ? '<p class="small muted">Tocca di nuovo la risposta scelta per lasciarla in bianco.</p>' : '');
    }

    var REV_FILTERS = ['all', 'ko', 'om', 'fl', 'ok'];
    var REV_LABELS = ['Tutti', 'Sbagliati', 'Omessi', 'Dubbi', 'Giusti'];
    CHANGES.simRev = function (t) { S.prefs.simRev = t.value; saveLocal(); go(view, true); };

    function redoIds(run, withOm) {
      return run.ids.filter(function (id, i) {
        if (!Q[id]) return false;
        var st = score(Q[id], run.ans[i]).st;
        return st === 'ko' || st === 'mid' || (withOm && st === 'omessa');
      });
    }
    function redoHtml(run, t) {
      var ko = t.ko + t.mid;
      if (!ko && !t.om) return '';
      return '<div class="row">' +
        (ko ? '<button class="btn" data-act="simRedo" data-h="' + esc(run.id) + '">Rifai i ' + ko + ' sbagliati</button>' : '') +
        (t.om ? '<button class="btn" data-act="simRedo" data-h="' + esc(run.id) + '" data-om="1">Sbagliati e omessi (' + (ko + t.om) + ')</button>' : '') +
        '</div>';
    }
    ACTIONS.simRedo = function (t) {
      var run = SS.hist.filter(function (h) { return h.id === t.getAttribute('data-h'); })[0];
      if (!run) return;
      var ids = order(redoIds(run, t.getAttribute('data-om') === '1'));
      if (!ids.length) return;
      begin({ id: 'E', ids: ids, lab: 'da ' + planOf(run).nome, min: Math.ceil(ids.length * 1.5) }, { tl: 0, fb: true });
    };

    /* ---------------------------------------------------------- schede del ripasso: peso e risultati */

    var scCache = { key: '', v: null };
    function schedaStats() {
      var key = SS.hist.length + ':' + (SS.hist.length ? SS.hist[SS.hist.length - 1].id : '');
      if (scCache.key === key) return scCache.v;
      var v = {};
      SS.hist.forEach(function (h) {
        h.ids.forEach(function (id, i) {
          var q = Q[id];
          if (!q || !schedaOfCode[q.t]) return;
          var x = v[q.t] || (v[q.t] = { n: 0, ok: 0 });
          x.n++;
          if (score(q, h.ans[i]).st === 'ok') x.ok++;
        });
      });
      scCache = { key: key, v: v };
      return v;
    }
    var bankOf = countUniqBy(SIM.q.filter(function (q) { return q.inc === 'sì'; }), 't');
    var USC = SIM.usc || {};
    hooks.pointBadge = function (id) {
      var c = USC[id];
      if (!c) return '';
      return ' <span class="usc" title="' + esc(c.join(', ')) + '">uscito ' + esc(c.map(function (x) {
        return x.replace(/^SNA(\d+)-B(\d)-Q\d+$/, 'SNA $1');
      }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(', ')) + '</span>';
    };
    hooks.schedaInfo = function (code) {
      var info = SIM.schede && SIM.schede[code];
      var st = schedaStats()[code];
      var parts = [];
      if (info && info.f) parts.push('<span class="fa ' + esc(info.f) + '">' + esc(info.f) + '</span>');
      if (info && info.n) parts.push('uscita ' + info.n + ' volte in SNA 8-11');
      if (st) parts.push('tue: <b>' + Math.round(100 * st.ok / st.n) + '%</b> su ' + st.n);
      return parts.length ? '<span class="sinfo">' + parts.join(' · ') + '</span>' : '';
    };
    hooks.schedaFoot = function (code) {
      var n = bankOf[code];
      if (!n) return '';
      var st = schedaStats()[code];
      return '<div class="panel slim sfoot"><p><b>' + n + '</b> quesiti d’archivio su ' + esc(code) +
        (st ? ' · le tue risposte: <b>' + Math.round(100 * st.ok / st.n) + '%</b> giuste su ' + st.n : '') + '</p>' +
        '<button class="btn primary block" data-act="simDrillScheda" data-c="' + esc(code) + '">Fai i quesiti di ' + esc(code) + ' (correzione subito)</button></div>';
    };
    ACTIONS.simDrillScheda = function (t) {
      var code = t.getAttribute('data-c');
      var pool = SIM.q.filter(function (q) { return q.t === code && q.inc === 'sì'; });
      if (!pool.length) return;
      var ids = drillPick(pool, pool.length);
      begin({ id: 'B', ids: ids, lab: code + ' · ' + (schedaByKey[schedaOfCode[code]] ? schedaByKey[schedaOfCode[code]].sc.title : ''), min: Math.ceil(ids.length * 1.5) },
        { tl: 0, fb: true });
    };

    function resultScreen(run) {
      var p = planOf(run) || { nome: run.p };
      var t = totals(run);
      var h = '<nav class="crumb"><button class="linkish" data-act="tab" data-t="sim">← Simulazioni</button><span>' + when(run.end) + '</span></nav>' +
        '<h1><span class="code">' + esc(run.p) + '</span> ' + esc(p.nome) + '</h1>' +
        '<div class="panel score"><p class="big"><b>' + fmt(t.pts) + '</b> <span class="muted">su ' + t.n + '</span></p>' +
        (t.hi ? '<p class="small muted">Fino a ' + fmt(t.pts + t.hi) + ' se le scelte non migliori dei modelli SNA 9 fossero le neutre: la Scuola ha pubblicato solo la migliore.</p>' : '') +
        '<p class="small">' + t.ok + ' esatte o migliori · ' + (t.mid ? t.mid + ' neutre · ' : '') + t.ko + ' errate · ' + t.om + ' omesse · ' +
        Math.round(run.el / 60) + ' min' + (run.tl ? ' su ' + run.tl : ' senza tempo') + (run.fb ? ' · correzione subito' : '') + '</p>' +
        redoHtml(run, t) + '</div>';
      h += '<div class="panel"><h2>Per area</h2><ul class="areas">' +
        SIM.areas.filter(function (a) { return t.areas[a[0]]; }).map(function (a) {
          var x = t.areas[a[0]];
          var w = Math.min(100, Math.abs(x.pts) / x.n * 100);
          return '<li><span class="an">' + esc(a[1]) + '</span><span class="ap"><b>' + fmt(x.pts) + '</b> / ' + x.n + '</span>' +
            '<span class="abar' + (x.pts < 0 ? ' neg' : '') + '" aria-hidden="true"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
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

    /* ---------------------------------------------------------- scorrimento col dito */

    var sw = null;
    function inRun() { return view.tab === 'sim' && view.s === 'run' && cur(); }
    $app.addEventListener('touchstart', function (e) {
      sw = inRun() && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
    }, { passive: true });
    $app.addEventListener('touchend', function (e) {
      if (!sw || !inRun()) return;
      var t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - sw.t < 700) move(dx < 0 ? 1 : -1);
      sw = null;
    }, { passive: true });

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

    if (SS.cur && SS.cur.tl && remaining(SS.cur) <= 0) {
      // il tempo era già finito alla chiusura
      after.push(function () { if (cur()) finish(true); });
    }
  })();
