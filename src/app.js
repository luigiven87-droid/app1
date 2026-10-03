(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('data').textContent);
  var $app = document.getElementById('app');
  var $tabs = document.getElementById('tabs');
  var $bar = document.getElementById('bar');
  var $modal = document.getElementById('modal');
  var STORE_KEY = 'sna12-rilettura-v1';
  var EXAM = new Date(2026, 9, 6); // 6 ottobre 2026
  var RIP = 1, OK = 2; // stati di un punto: 0 non segnato, 1 da ripassare, 2 lo so

  /* ============================================================ indice dei contenuti */

  var SCHEDE = [];          // [{vol, volTitle, sc}]
  var schedaByKey = {};
  var PT = {};              // id → {p, sk, vol, sec}
  var ORDER = [];           // id in ordine di lettura
  var ptsOfScheda = {};     // key → [id]

  function stripTags(h) { return String(h).replace(/<[^>]+>/g, ''); }
  function walk(blocks, fn, ctx) {
    blocks.forEach(function (b) {
      if (b.t === 'h') { ctx.sec = stripTags(b.h); return; }
      if (b.t === 'box') { walk(b.b, fn, ctx); return; }
      if (b.t === 'table') { b.rows.forEach(function (r) { fn(r, ctx); }); return; }
      if (b.t === 'p' || b.t === 'li' || b.t === 'row') fn(b, ctx);
    });
  }
  DATA.volumes.forEach(function (v) {
    v.schede.forEach(function (sc) {
      var entry = { vol: v.vol, volTitle: v.title, sc: sc };
      SCHEDE.push(entry);
      schedaByKey[sc.key] = entry;
      ptsOfScheda[sc.key] = [];
      walk(sc.b, function (p, ctx) {
        PT[p.id] = { p: p, sk: sc.key, vol: v.vol, sec: ctx.sec };
        ORDER.push(p.id);
        ptsOfScheda[sc.key].push(p.id);
      }, { sec: '' });
    });
  });

  /* ============================================================ stato */

  function blankState() { return { v: 1, marks: {}, resetAt: 0, prefs: {} }; }
  var storageOk = true;
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) {
          var b = blankState();
          if (s.marks && typeof s.marks === 'object') b.marks = s.marks;
          if (s.prefs && typeof s.prefs === 'object') b.prefs = s.prefs;
          b.resetAt = Number(s.resetAt) || 0;
          return b;
        }
      }
    } catch (e) { storageOk = false; }
    return blankState();
  }
  var S = loadState();
  function saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch (e) { storageOk = false; }
  }
  function st(id) { var m = S.marks[id]; return m ? m[0] : 0; }
  function stamp(id) { var m = S.marks[id]; return m ? m[1] : 0; }

  /* ============================================================ salvataggio nell'account (pagina su claude.ai) */

  var sync = { mode: 'local', coll: null, pending: {}, busy: {}, timers: {}, first: true };

  function syncLabel() {
    if (sync.mode === 'cloud') return 'Progressi salvati nel tuo account Claude: li ritrovi su ogni dispositivo.';
    if (sync.mode === 'connecting') return 'Collegamento al tuo account…';
    if (sync.mode === 'error') return 'Salvataggio nell\'account non riuscito: i progressi restano in questo browser.';
    return 'Progressi salvati in questo browser.';
  }
  function showSync() {
    var els = document.querySelectorAll('[data-sync]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = syncLabel();
      els[i].setAttribute('data-mode', sync.mode);
    }
  }

  function startSync() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    sync.mode = 'connecting'; showSync();
    Promise.all([window.claude.use('user'), window.claude.use('db')]).then(function (r) {
      var user = r[0], db = r[1];
      if (!user || !db) { sync.mode = 'local'; showSync(); return null; }
      return user.id().then(function (uid) {
        if (!uid) { sync.mode = 'local'; showSync(); return; }
        sync.coll = db.collection('data/users/' + uid);
        sync.coll.onSnapshot(onRemote, function () { sync.mode = 'error'; showSync(); });
      });
    }).catch(function () { sync.mode = 'error'; showSync(); });
  }

  function onRemote(snap) {
    var changed = [];
    var remote = {};
    var resetAt = 0;
    snap.docs.forEach(function (d) {
      var data = d.data() || {};
      if (d.id === 'meta') { resetAt = Number(data.resetAt) || 0; return; }
      var m = data.m || {};
      Object.keys(m).forEach(function (id) { remote[id] = m[id]; });
    });
    if (resetAt > (S.resetAt || 0)) {
      S.resetAt = resetAt;
      Object.keys(S.marks).forEach(function (id) {
        if (stamp(id) <= resetAt) { delete S.marks[id]; changed.push(id); }
      });
    }
    Object.keys(remote).forEach(function (id) {
      var r = remote[id];
      if (!Array.isArray(r) || r[1] <= (S.resetAt || 0)) return;
      if (r[1] > stamp(id)) { S.marks[id] = [r[0], r[1]]; changed.push(id); }
    });
    if (sync.first) {
      // punti segnati qui prima del collegamento (o più recenti): li porto nell'account
      sync.first = false;
      Object.keys(S.marks).forEach(function (id) {
        var r = remote[id];
        if (PT[id] && (!r || r[1] < stamp(id))) queue(id);
      });
    }
    sync.mode = 'cloud';
    showSync();
    if (changed.length) { saveLocal(); changed.forEach(paintPoint); refreshProgress(); }
  }

  function queue(id) {
    if (!sync.coll || !PT[id]) return;
    var vol = PT[id].vol;
    (sync.pending[vol] = sync.pending[vol] || {})[id] = S.marks[id] || [0, Date.now()];
    clearTimeout(sync.timers[vol]);
    sync.timers[vol] = setTimeout(function () { flush(vol); }, 700);
  }
  function flush(vol) {
    if (!sync.coll || sync.busy[vol]) return;
    var batch = sync.pending[vol];
    if (!batch || !Object.keys(batch).length) return;
    sync.pending[vol] = {};
    sync.busy[vol] = true;
    var ref = sync.coll.doc('v' + vol);
    ref.update({ m: batch }).catch(function (e) {
      if (!e || e.code !== 'invalid_argument') throw e;
      // il documento del volume non esiste ancora: lo creo con tutti i segni del volume
      var all = {};
      Object.keys(S.marks).forEach(function (id) { if (PT[id] && PT[id].vol === vol) all[id] = S.marks[id]; });
      return ref.set({ m: all });
    }).then(function () {
      if (sync.mode !== 'cloud') { sync.mode = 'cloud'; showSync(); }
    }, function () {
      sync.mode = 'error'; showSync();
      var p = sync.pending[vol] || {};
      Object.keys(batch).forEach(function (id) { if (!p[id]) p[id] = batch[id]; });
      sync.pending[vol] = p;
    }).then(function () {
      sync.busy[vol] = false;
      if (sync.pending[vol] && Object.keys(sync.pending[vol]).length && sync.mode === 'cloud') flush(vol);
    });
  }
  function flushAll() { Object.keys(sync.pending).forEach(function (v) { clearTimeout(sync.timers[v]); flush(Number(v)); }); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushAll(); });

  function setMark(id, s) {
    S.marks[id] = [s, Date.now()];
    S.prefs.last = { sk: PT[id].sk, id: id };
    saveLocal();
    queue(id);
  }

  /* ============================================================ utilità */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var modalYes = null;
  function ask(msg, yesLabel, onYes, danger) {
    modalYes = onYes;
    $modal.innerHTML = '<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-msg">' +
      '<p id="modal-msg">' + esc(msg) + '</p>' +
      '<div class="row"><button class="btn" type="button" id="modal-no">Annulla</button>' +
      '<button class="btn ' + (danger ? 'danger' : 'primary') + '" type="button" id="modal-yes">' + esc(yesLabel) + '</button></div></div>';
    $modal.hidden = false;
    document.getElementById('modal-yes').focus();
  }
  function closeModal() { $modal.hidden = true; $modal.innerHTML = ''; modalYes = null; }
  $modal.addEventListener('click', function (e) {
    if (e.target.id === 'modal-yes') { var f = modalYes; closeModal(); if (f) f(); }
    else if (e.target.id === 'modal-no' || e.target === $modal) closeModal();
  });

  function copyText(text, fallbackEl) {
    function manual() {
      if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); }
      toast('Copia automatica non riuscita: il testo è selezionato, copialo a mano');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('Copiato'); }, manual);
        return;
      }
    } catch (e) { /* passa al metodo manuale */ }
    manual();
  }

  /* ============================================================ tema e testata */

  var THEMES = ['auto', 'light', 'dark'];
  var HOST_THEME = document.documentElement.getAttribute('data-theme');
  function applyTheme() {
    var t = S.prefs.theme || 'auto';
    if (t === 'auto') {
      if (HOST_THEME) document.documentElement.setAttribute('data-theme', HOST_THEME);
      else document.documentElement.removeAttribute('data-theme');
    } else document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('theme-btn');
    btn.textContent = t === 'auto' ? '◐' : (t === 'light' ? '☀' : '☾');
    btn.setAttribute('aria-label', 'Tema: ' + ({ auto: 'automatico', light: 'chiaro', dark: 'scuro' })[t] + '. Tocca per cambiare');
  }
  document.getElementById('theme-btn').addEventListener('click', function () {
    var t = S.prefs.theme || 'auto';
    S.prefs.theme = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    saveLocal(); applyTheme();
    toast('Tema: ' + ({ auto: 'automatico', light: 'chiaro', dark: 'scuro' })[S.prefs.theme]);
  });
  function countdown() {
    var now = new Date();
    var days = Math.round((EXAM - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    var el = document.getElementById('countdown');
    if (days > 1) el.textContent = 'Preselettiva del 6 ottobre · mancano ' + days + ' giorni';
    else if (days === 1) el.textContent = 'Preselettiva domani, 6 ottobre';
    else if (days === 0) el.textContent = 'Preselettiva oggi · in bocca al lupo';
    else el.textContent = 'Preselettiva del 6 ottobre 2026';
  }

  /* ============================================================ navigazione */

  var TABS = [
    { id: 'idx', label: 'Indice' },
    { id: 'rip', label: 'Da ripassare' },
    { id: 'find', label: 'Cerca' },
    { id: 'prog', label: 'Progressi' }
  ];
  var view = { tab: 'idx' };
  var SCREENS = {}, ACTIONS = {}, CHANGES = {};

  function renderTabs() {
    var tab = view.tab === 'sch' ? 'idx' : view.tab;
    $tabs.innerHTML = TABS.map(function (t) {
      return '<button class="tab" role="tab" type="button" data-tab="' + t.id + '" aria-selected="' + (tab === t.id) + '">' + t.label + '</button>';
    }).join('');
  }
  $tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    go({ tab: b.getAttribute('data-tab') });
  });
  function go(v, keepScroll) {
    view = v;
    S.prefs.view = v; saveLocal();
    render();
    if (!keepScroll) window.scrollTo(0, 0);
  }
  var after = [];
  function render() {
    unfocus();
    renderTabs();
    $app.innerHTML = (SCREENS[view.tab] || SCREENS.idx)();
    showSync();
    var a = after; after = [];
    a.forEach(function (f) { f(); });
  }

  $app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (t && $app.contains(t)) {
      var a = ACTIONS[t.getAttribute('data-act')];
      if (a) { e.preventDefault(); a(t, e); }
      return;
    }
    var it = e.target.closest('.it');
    if (it && $app.contains(it)) {
      var id = it.getAttribute('data-id');
      if (focusId === id) unfocus(); else focusPoint(id, false);
    }
  });
  $app.addEventListener('change', function (e) {
    var t = e.target.closest('[data-change]');
    if (!t) return;
    var c = CHANGES[t.getAttribute('data-change')];
    if (c) c(t, e);
  });
  ACTIONS.seg = function (t) {
    var c = CHANGES[t.getAttribute('data-name')];
    if (c) c({ value: t.getAttribute('data-val') });
  };
  function seg(name, values, labels, current) {
    return '<div class="seg" role="group">' + values.map(function (v, i) {
      return '<button type="button" data-act="seg" data-name="' + name + '" data-val="' + v + '" aria-pressed="' + (String(v) === String(current)) + '">' + labels[i] + '</button>';
    }).join('') + '</div>';
  }
  function check(name, label, on) {
    return '<label class="check"><input type="checkbox" data-change="' + name + '"' + (on ? ' checked' : '') + '> <span>' + label + '</span></label>';
  }

  /* ============================================================ punti: disegno e segni */

  var NOV = '<span class="nov">novità</span>';
  function pointHtml(p) {
    var s = st(p.id);
    var attrs = ' class="it ' + p.t + '" data-id="' + p.id + '" data-s="' + s + '" tabindex="0"';
    if (p.t === 'row') {
      var h = '<div' + attrs + '>';
      if (p.q) h += '<div class="rq">' + (p.ql ? '<span class="rl">' + p.ql + '</span>' : '') + p.q + (p.nov ? ' ' + NOV : '') + '</div>';
      h += '<dl class="ra">' + p.a.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
      if (!p.q && p.nov) h += NOV;
      return h + '</div>';
    }
    return '<div' + attrs + '>' + (p.t === 'li' ? '<span class="mk" aria-hidden="true">' + (p.n || '•') + '</span>' : '') +
      '<div class="tx">' + p.h + (p.nov ? ' ' + NOV : '') + '</div></div>';
  }

  /* Disegna i blocchi di una scheda; `keep(p)` decide quali punti mostrare.
     In vista completa compare tutto; nelle viste filtrate titoli e riquadri
     compaiono solo se contengono punti visibili. */
  function blocksHtml(blocks, keep, all) {
    var out = [], heads = [];
    function flushHeads() { out.push(heads.join('')); heads = []; }
    blocks.forEach(function (b) {
      if (b.t === 'h') {
        if (all) out.push('<h3 class="sec-h">' + b.h + '</h3>'); else heads = ['<h3 class="sec-h">' + b.h + '</h3>'];
        return;
      }
      if (b.t === 'sub') {
        if (all) out.push('<p class="sub">' + b.h + '</p>'); else heads.push('<p class="sub">' + b.h + '</p>');
        return;
      }
      var inner = '';
      if (b.t === 'box') {
        var x = blocksHtml(b.b, keep, all);
        if (x) inner = '<section class="box ' + b.k + '"><h4 class="box-t">' + esc(b.title) + '</h4>' + x + '</section>';
      } else if (b.t === 'table') {
        var rows = b.rows.filter(keep).map(pointHtml).join('');
        if (rows) inner = '<div class="tbl">' + rows + '</div>';
      } else if (keep(b)) inner = pointHtml(b);
      if (inner) { flushHeads(); out.push(inner); }
    });
    return out.join('');
  }

  function counts(ids) {
    var c = { n: ids.length, ok: 0, rip: 0, none: 0 };
    ids.forEach(function (id) { var s = st(id); if (s === OK) c.ok++; else if (s === RIP) c.rip++; else c.none++; });
    return c;
  }
  function pbar(c) {
    if (!c.n) return '<div class="pbar"></div>';
    return '<div class="pbar" role="img" aria-label="' + c.ok + ' lo so, ' + c.rip + ' da ripassare, ' + c.none + ' non segnati">' +
      '<i class="ok" style="width:' + (100 * c.ok / c.n) + '%"></i><i class="rip" style="width:' + (100 * c.rip / c.n) + '%"></i></div>';
  }
  function progHtml(scope) {
    var ids = scope === 'all' ? ORDER : scope.indexOf('sk:') === 0 ? ptsOfScheda[scope.slice(3)] :
      ORDER.filter(function (id) { return 'vol:' + PT[id].vol === scope; });
    var c = counts(ids);
    return pbar(c) + '<div class="pnums"><span><b>' + c.rip + '</b> da ripassare</span><span><b>' + c.ok + '</b> lo so</span><span><b>' + c.none + '</b> non segnati</span></div>';
  }
  function miniProg(key) {
    var c = counts(ptsOfScheda[key]);
    return pbar(c) + '<span class="mini">' + (c.rip ? '<b class="r">' + c.rip + ' da ripassare</b> · ' : '') +
      (c.none === c.n ? plural(c.n, 'punto', 'punti') : c.ok + ' di ' + c.n + ' lo so') + '</span>';
  }
  function refreshProgress() {
    var els = document.querySelectorAll('[data-prog]');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = progHtml(els[i].getAttribute('data-prog'));
    var minis = document.querySelectorAll('[data-mini]');
    for (var j = 0; j < minis.length; j++) minis[j].innerHTML = miniProg(minis[j].getAttribute('data-mini'));
  }
  function paintPoint(id) {
    var el = $app.querySelector('.it[data-id="' + id + '"]');
    if (el) el.setAttribute('data-s', st(id));
    if (id === focusId) paintBar();
  }

  /* ---- punto selezionato e barra in basso */
  var focusId = null;
  function headerBottom() { return document.querySelector('.top').getBoundingClientRect().bottom; }
  function focusPoint(id, scroll) {
    var prev = $app.querySelector('.it.focus');
    if (prev) prev.classList.remove('focus');
    var el = $app.querySelector('.it[data-id="' + id + '"]');
    if (!el) { unfocus(); return; }
    el.classList.add('focus');
    focusId = id;
    $bar.hidden = false;
    document.body.classList.add('with-bar');
    paintBar();
    if (scroll) {
      var r = el.getBoundingClientRect();
      var top = headerBottom();
      var bottom = window.innerHeight - $bar.getBoundingClientRect().height;
      if (r.top < top + 8 || r.bottom > bottom - 8) {
        window.scrollTo({ top: window.scrollY + r.top - top - 24, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
  }
  function unfocus() {
    var prev = $app.querySelector('.it.focus');
    if (prev) prev.classList.remove('focus');
    focusId = null;
    $bar.hidden = true;
    document.body.classList.remove('with-bar');
  }
  function paintBar() {
    var s = st(focusId);
    $bar.querySelector('[data-mark="1"]').setAttribute('aria-pressed', String(s === RIP));
    $bar.querySelector('[data-mark="2"]').setAttribute('aria-pressed', String(s === OK));
  }
  function nextPoint(dir) {
    var els = Array.prototype.slice.call($app.querySelectorAll('.it'));
    if (!els.length) return null;
    var i = -1;
    for (var k = 0; k < els.length; k++) if (els[k].getAttribute('data-id') === focusId) { i = k; break; }
    var j = i < 0 ? (dir > 0 ? 0 : els.length - 1) : i + dir;
    return j >= 0 && j < els.length ? els[j].getAttribute('data-id') : null;
  }
  function mark(s) {
    if (!focusId) return;
    var id = focusId;
    var ns = st(id) === s ? 0 : s;
    setMark(id, ns);
    paintPoint(id);
    refreshProgress();
    if (ns) {
      var nx = nextPoint(1);
      if (nx) focusPoint(nx, true); else { unfocus(); toast('Fine della pagina'); }
    }
  }
  $bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-mark')) mark(Number(b.getAttribute('data-mark')));
    else if (b.getAttribute('data-nav') === 'close') unfocus();
  });

  /* ============================================================ INDICE */

  SCREENS.idx = function () {
    var last = S.prefs.last && schedaByKey[S.prefs.last.sk] ? schedaByKey[S.prefs.last.sk] : null;
    var nrip = counts(ORDER).rip;
    var h = '<h1>Indice</h1>' +
      '<div class="panel">' +
      '<div data-prog="all">' + progHtml('all') + '</div>' +
      '<p class="small muted sync" data-sync></p>' +
      '<div class="row">' +
      (last ? '<button class="btn primary" data-act="open" data-k="' + esc(last.sc.key) + '" data-resume="1">Riprendi: ' + esc(last.sc.code || last.sc.title) + '</button>' : '') +
      '<button class="btn" data-act="tab" data-t="rip">' + (nrip ? 'Rileggi i ' + nrip + ' da ripassare' : 'Da ripassare') + '</button>' +
      '</div></div>' +
      '<p class="hint">Apri una scheda e leggi. Tocca un punto per segnarlo <b>«Da ripassare»</b> o <b>«Lo so»</b>: nei giri successivi rileggi solo quello che ti manca.</p>';
    DATA.volumes.forEach(function (v) {
      h += '<section class="vol"><h2 class="vol-t"><span class="vol-n">Vol. ' + v.vol + '</span> ' + esc(v.title) + '</h2>';
      var parte = null;
      v.schede.forEach(function (sc) {
        if (sc.parte && sc.parte !== parte) { parte = sc.parte; h += '<h3 class="parte">' + esc(parte) + '</h3>'; }
        h += '<button class="srow" data-act="open" data-k="' + esc(sc.key) + '">' +
          '<span class="code">' + esc(sc.code || (sc.numeri ? 'Σ' : '◆')) + '</span>' +
          '<span class="st"><span class="stt">' + esc(sc.title) + '</span><span class="sp" data-mini="' + esc(sc.key) + '">' + miniProg(sc.key) + '</span></span>' +
          '</button>';
      });
      h += '</section>';
    });
    return h;
  };
  ACTIONS.tab = function (t) { go({ tab: t.getAttribute('data-t') }); };
  ACTIONS.open = function (t) {
    var k = t.getAttribute('data-k');
    var resume = t.hasAttribute('data-resume') && S.prefs.last && S.prefs.last.sk === k ? S.prefs.last.id : null;
    openScheda(k, resume);
  };
  function openScheda(k, scrollTo) {
    if (!S.prefs.last || S.prefs.last.sk !== k) S.prefs.last = { sk: k, id: null };
    go({ tab: 'sch', k: k });
    if (scrollTo && $app.querySelector('.it[data-id="' + scrollTo + '"]')) focusPoint(scrollTo, true);
  }

  /* ============================================================ SCHEDA */

  var MODES = ['all', 'ess', 'rip', 'none'];
  var MODE_LABELS = ['Tutto', 'Essenziale', 'Da ripassare', 'Non segnati'];
  function modeFilter(mode) {
    if (mode === 'ess') return function (p) { return !!p.ess; };
    if (mode === 'rip') return function (p) { return st(p.id) === RIP; };
    if (mode === 'none') return function (p) { return st(p.id) === 0; };
    return function () { return true; };
  }
  CHANGES.mode = function (t) { S.prefs.mode = t.value; saveLocal(); go(view, true); };

  SCREENS.sch = function () {
    var e = schedaByKey[view.k];
    if (!e) { view = { tab: 'idx' }; return SCREENS.idx(); }
    var sc = e.sc;
    var mode = MODES.indexOf(S.prefs.mode) >= 0 ? S.prefs.mode : 'all';
    var body = blocksHtml(sc.b, modeFilter(mode), mode === 'all');
    var i = SCHEDE.indexOf(e);
    var prev = SCHEDE[i - 1], next = SCHEDE[i + 1];
    var heads = sc.b.filter(function (b) { return b.t === 'h'; }).map(function (b) { return stripTags(b.h); });
    var empty = {
      ess: 'Questa scheda non ha «In breve» né «Da non confondere».',
      rip: 'Nessun punto da ripassare in questa scheda.',
      none: 'Hai già segnato tutti i punti di questa scheda.'
    }[mode];
    return '<nav class="crumb"><button class="linkish" data-act="tab" data-t="idx">← Indice</button>' +
      '<span>Vol. ' + e.vol + (sc.parte ? ' · ' + esc(sc.parte) : '') + '</span></nav>' +
      '<h1>' + (sc.code ? '<span class="code">' + esc(sc.code) + '</span> ' : '') + esc(sc.title) + '</h1>' +
      '<div class="panel slim"><div data-prog="sk:' + esc(sc.key) + '">' + progHtml('sk:' + sc.key) + '</div>' +
      '<div class="field"><span class="lbl">Mostra</span>' + seg('mode', MODES, MODE_LABELS, mode) + '</div>' +
      (mode === 'all' && heads.length > 1 ? '<details class="toc"><summary>Sezioni</summary><ol>' +
        heads.map(function (t, j) { return '<li><button class="linkish" data-act="jump" data-j="' + j + '">' + esc(t) + '</button></li>'; }).join('') +
        '</ol></details>' : '') +
      '</div>' +
      '<article class="rd">' + (body || '<p class="empty">' + empty + '</p>') + '</article>' +
      '<div class="endbox">' +
      (counts(ptsOfScheda[sc.key]).none ? '<button class="btn block" data-act="restOk">Segna «lo so» tutti i punti non segnati</button>' : '') +
      '<div class="row">' +
      (prev ? '<button class="btn" data-act="open" data-k="' + esc(prev.sc.key) + '">← ' + esc(prev.sc.code || 'Precedente') + '</button>' : '') +
      (next ? '<button class="btn primary" data-act="open" data-k="' + esc(next.sc.key) + '">' + esc(next.sc.code || 'Successiva') + ' →</button>' : '') +
      '</div></div>';
  };
  ACTIONS.jump = function (t) {
    var el = $app.querySelectorAll('.rd .sec-h')[Number(t.getAttribute('data-j'))];
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - headerBottom() - 12, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  ACTIONS.restOk = function () {
    var ids = ptsOfScheda[view.k].filter(function (id) { return st(id) === 0; });
    ask('Segnare «lo so» i ' + ids.length + ' punti non ancora segnati di questa scheda? Quelli «da ripassare» restano come sono.', 'Segna «lo so»', function () {
      ids.forEach(function (id) { setMark(id, OK); });
      go(view, true);
      toast(plural(ids.length, 'punto segnato', 'punti segnati') + ' «lo so»');
    });
  };

  /* ============================================================ DA RIPASSARE (giri successivi) */

  function rvPrefs() {
    var p = S.prefs.rv || (S.prefs.rv = {});
    if (!p.s) p.s = 'rip';
    if (p.vol === undefined) p.vol = '';
    return p;
  }
  CHANGES.rvS = function (t) { rvPrefs().s = t.value; saveLocal(); go(view, true); };
  CHANGES.rvVol = function (t) { rvPrefs().vol = t.value; saveLocal(); go(view, true); };
  CHANGES.rvNov = function (t) { rvPrefs().nov = t.checked; saveLocal(); go(view, true); };
  CHANGES.rvNum = function (t) { rvPrefs().num = t.checked; saveLocal(); go(view, true); };
  CHANGES.rvEss = function (t) { rvPrefs().ess = t.checked; saveLocal(); go(view, true); };

  function listByScheda(match, emptyMsg) {
    var h = '', tot = 0;
    SCHEDE.forEach(function (e) {
      var ids = ptsOfScheda[e.sc.key].filter(function (id) { return match(PT[id].p); });
      if (!ids.length) return;
      tot += ids.length;
      var set = {};
      ids.forEach(function (id) { set[id] = 1; });
      h += '<section class="grp"><button class="grp-h" data-act="open" data-k="' + esc(e.sc.key) + '">' +
        '<span class="code">' + esc(e.sc.code || ('Vol. ' + e.vol)) + '</span> <span class="gt">' + esc(e.sc.title) + '</span> <span class="muted">· ' + ids.length + '</span></button>' +
        '<div class="rd">' + blocksHtml(e.sc.b, function (p) { return !!set[p.id]; }, false) + '</div></section>';
    });
    return { html: tot ? h : '<p class="empty">' + emptyMsg + '</p>', n: tot };
  }

  SCREENS.rip = function () {
    var p = rvPrefs();
    var want = { rip: RIP, none: 0, ok: OK }[p.s];
    var match = function (pt) {
      if (st(pt.id) !== want) return false;
      if (p.vol && String(PT[pt.id].vol) !== String(p.vol)) return false;
      if (p.nov && !pt.nov) return false;
      if (p.num && !pt.num) return false;
      if (p.ess && !pt.ess) return false;
      return true;
    };
    var empty = {
      rip: 'Nessun punto da ripassare con questi filtri. Segnali mentre leggi le schede.',
      none: 'Nessun punto non segnato con questi filtri.',
      ok: 'Nessun punto segnato «lo so» con questi filtri.'
    }[p.s];
    var L = listByScheda(match, empty);
    return '<h1>' + ({ rip: 'Da ripassare', none: 'Non ancora segnati', ok: 'Già saputi' })[p.s] + '</h1>' +
      '<div class="panel">' +
      '<div class="field"><span class="lbl">Punti</span>' + seg('rvS', ['rip', 'none', 'ok'], ['Da ripassare', 'Non segnati', 'Lo so'], p.s) + '</div>' +
      '<div class="field"><label class="lbl" for="rv-vol">Volume</label><select id="rv-vol" data-change="rvVol"><option value="">Tutti i volumi</option>' +
      DATA.volumes.map(function (v) { return '<option value="' + v.vol + '"' + (String(p.vol) === String(v.vol) ? ' selected' : '') + '>Vol. ' + v.vol + ' — ' + esc(v.title) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="checks">' + check('rvEss', 'Solo «In breve» e «Da non confondere»', p.ess) +
      check('rvNov', 'Solo <span class="nov">novità</span>', p.nov) + check('rvNum', 'Solo pagine dei numeri', p.num) + '</div>' +
      '<p class="lbl" id="rv-count">' + plural(L.n, 'punto', 'punti') + '</p>' +
      '</div>' + L.html;
  };

  /* ============================================================ CERCA */

  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var SEARCH = null;
  function searchIndex() {
    if (SEARCH) return SEARCH;
    SEARCH = {};
    ORDER.forEach(function (id) {
      var p = PT[id].p;
      var txt = p.t === 'row' ? [p.ql || '', p.q].concat(p.a.map(function (r) { return r[0] + ' ' + r[1]; })).join(' ') : p.h;
      SEARCH[id] = norm(stripTags(txt).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    });
    return SEARCH;
  }
  SCREENS.find = function () {
    after.push(runSearch);
    return '<h1>Cerca</h1>' +
      '<div class="panel"><label class="lbl" for="q">Parola, articolo o numero (per esempio «21-nonies», «silenzio», «72 ore»)</label>' +
      '<input id="q" type="search" autocomplete="off" value="' + esc(S.prefs.q || '') + '" placeholder="Cerca nei ripassi"></div>' +
      '<div id="results"></div>';
  };
  var searchTimer = null;
  $app.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    S.prefs.q = e.target.value; saveLocal();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 150);
  });
  function runSearch() {
    var box = document.getElementById('results');
    if (!box) return;
    unfocus();
    var words = norm(S.prefs.q || '').split(/\s+/).filter(function (w) { return w.length > 1 || /\d/.test(w); });
    if (!words.length) { box.innerHTML = '<p class="empty">Scrivi almeno due lettere.</p>'; return; }
    var idx = searchIndex();
    var hits = {}, n = 0;
    ORDER.forEach(function (id) {
      if (n >= 200) return;
      var t = idx[id];
      if (words.every(function (w) { return t.indexOf(w) >= 0; })) { hits[id] = 1; n++; }
    });
    var L = listByScheda(function (p) { return !!hits[p.id]; }, 'Nessun risultato.');
    box.innerHTML = (n ? '<p class="lbl">' + (n >= 200 ? 'Primi 200 risultati' : plural(n, 'risultato', 'risultati')) + '</p>' : '') + L.html;
  }

  /* ============================================================ PROGRESSI */

  SCREENS.prog = function () {
    return '<h1>Progressi</h1>' +
      '<div class="panel"><p class="sync" data-sync></p>' +
      (DATA.hosted ? '<p class="small muted">Entri con il tuo account Claude: i segni stanno nella tua area privata di questa pagina, che nessun altro può leggere.</p>' :
        '<p class="small muted">Questa copia del file salva solo in questo browser. Per ritrovare i segni su più dispositivi usa la pagina su claude.ai, oppure esporta e importa il testo qui sotto.</p>') +
      (storageOk ? '' : '<p class="note">Questo browser non permette di salvare in locale.</p>') +
      '</div>' +
      '<div class="panel"><h2>Per volume</h2><div class="tw"><table><thead><tr><th>Volume</th><th class="num">Da ripassare</th><th class="num">Lo so</th><th class="num">Non segnati</th></tr></thead><tbody>' +
      DATA.volumes.map(function (v) {
        var c = counts(ORDER.filter(function (id) { return PT[id].vol === v.vol; }));
        return '<tr><td>Vol. ' + v.vol + ' — ' + esc(v.title) + '</td><td class="num">' + c.rip + '</td><td class="num">' + c.ok + '</td><td class="num">' + c.none + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<div class="panel"><h2>Copia di sicurezza</h2>' +
      '<p class="small muted">Esporta i segni come testo e conservalo dove vuoi; per ripristinarli, incollalo qui sotto e importa. L\'import unisce i dati e per ogni punto tiene il segno più recente.</p>' +
      '<button class="btn primary" data-act="exportCopy">Esporta e copia il testo</button>' +
      '<div class="field" style="margin-top:10px"><label class="lbl" for="exp-text">Testo esportato</label><textarea id="exp-text" readonly></textarea></div>' +
      '<div class="field"><label class="lbl" for="imp-text">Testo da importare</label><textarea id="imp-text" placeholder="Incolla qui il testo esportato"></textarea></div>' +
      '<button class="btn" data-act="importText">Importa</button>' +
      '<hr><button class="btn ghost block" data-act="resetAll">Cancella tutti i segni</button></div>' +
      '<p class="small muted">Materiali: ' + DATA.volumes.map(function (v) { return esc(v.file); }).join(', ') +
      ' · pagina generata il ' + esc(DATA.generated) + ' · ' + ORDER.length + ' punti.</p>';
  };
  ACTIONS.exportCopy = function () {
    var text = JSON.stringify({ v: 1, app: 'sna12-rilettura', exported: new Date().toISOString(), resetAt: S.resetAt || 0, marks: S.marks });
    var ta = document.getElementById('exp-text');
    ta.value = text;
    copyText(text, ta);
  };
  ACTIONS.importText = function () {
    var v = document.getElementById('imp-text').value.trim();
    if (!v) { toast('Incolla prima il testo esportato'); return; }
    var d;
    try { d = JSON.parse(v); } catch (e) { toast('Il testo non è un export valido'); return; }
    if (!d || d.v !== 1 || !d.marks || typeof d.marks !== 'object') { toast('Il testo non è un export di questa pagina'); return; }
    var n = 0;
    Object.keys(d.marks).forEach(function (id) {
      var r = d.marks[id];
      if (PT[id] && Array.isArray(r) && r[1] > stamp(id) && r[1] > (S.resetAt || 0)) { S.marks[id] = [r[0], r[1]]; queue(id); n++; }
    });
    saveLocal();
    toast(n ? plural(n, 'segno importato', 'segni importati') : 'Niente di nuovo da importare');
    render();
  };
  ACTIONS.resetAll = function () {
    ask('Cancellare tutti i segni «lo so» e «da ripassare»' + (sync.mode === 'cloud' ? ', anche dal tuo account' : '') + '?', 'Cancella', function () {
      var now = Date.now();
      S.marks = {};
      S.resetAt = now;
      S.prefs.last = null;
      saveLocal();
      if (sync.coll) {
        sync.pending = {};
        var vols = DATA.volumes.map(function (v) { return v.vol; });
        sync.coll.doc('meta').set({ resetAt: now }).then(function () {
          return Promise.all(vols.map(function (vol) { return sync.coll.doc('v' + vol).set({ m: {} }); }));
        }).catch(function () { sync.mode = 'error'; showSync(); });
      }
      render();
      toast('Segni cancellati');
    }, true);
  };

  /* ============================================================ tastiera */

  document.addEventListener('keydown', function (e) {
    if (!$modal.hidden) { if (e.key === 'Escape') closeModal(); return; }
    var tag = e.target && e.target.tagName;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) && e.target.type !== 'checkbox') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'j') {
      var n = nextPoint(1); if (n) { e.preventDefault(); focusPoint(n, true); }
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      var p = nextPoint(-1); if (p) { e.preventDefault(); focusPoint(p, true); }
    } else if (focusId && (e.key === '1' || e.key === 'r')) { e.preventDefault(); mark(RIP); }
    else if (focusId && (e.key === '2' || e.key === 's')) { e.preventDefault(); mark(OK); }
    else if (focusId && e.key === 'Escape') unfocus();
    else if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('it')) {
      e.preventDefault(); focusPoint(e.target.getAttribute('data-id'), false);
    }
  });

  /* ============================================================ avvio */

  applyTheme();
  countdown();
  var pv = S.prefs.view;
  if (pv && SCREENS[pv.tab] && (pv.tab !== 'sch' || schedaByKey[pv.k])) view = pv;
  render();
  if (view.tab === 'sch' && S.prefs.last && S.prefs.last.sk === view.k && S.prefs.last.id) {
    var el0 = $app.querySelector('.it[data-id="' + S.prefs.last.id + '"]');
    if (el0) window.scrollTo(0, window.scrollY + el0.getBoundingClientRect().top - headerBottom() - 24);
  }
  startSync();
})();
