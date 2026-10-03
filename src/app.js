(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('data').textContent);
  var $app = document.getElementById('app');
  var $tabs = document.getElementById('tabs');
  var STORE_KEY = 'sna12-ripasso-v1';
  var EXAM = new Date(2026, 9, 6); // 6 ottobre 2026
  var SIM_MINUTES = 90;

  /* ============================================================ stato */

  function blankState() {
    return { v: 1, cards: {}, quiz: {}, sims: {}, prefs: {} };
  }
  var storageOk = true;
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) {
          var b = blankState();
          ['cards', 'quiz', 'sims', 'prefs'].forEach(function (k) { if (s[k] && typeof s[k] === 'object') b[k] = s[k]; });
          return b;
        }
      }
    } catch (e) { storageOk = false; }
    return blankState();
  }
  var S = loadState();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch (e) {
      if (storageOk) toast('Attenzione: il browser non salva i progressi. Usa «Esporta progressi».');
      storageOk = false;
    }
  }

  /* ============================================================ utilità */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  /* Conferma dentro la pagina: confirm() non funziona ovunque (pagine ospitate). */
  var $modal = document.getElementById('modal');
  var modalYes = null;
  var modalFocus = null;
  function ask(msg, yesLabel, onYes, danger) {
    modalYes = onYes;
    modalFocus = document.activeElement;
    $modal.innerHTML = '<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-msg">' +
      '<p id="modal-msg">' + esc(msg).replace(/\n/g, '<br>') + '</p>' +
      '<div class="row"><button class="btn" type="button" id="modal-no">Annulla</button>' +
      '<button class="btn ' + (danger ? 'ko' : 'primary') + '" type="button" id="modal-yes">' + esc(yesLabel) + '</button></div></div>';
    $modal.hidden = false;
    document.getElementById('modal-yes').focus();
  }
  function closeModal() {
    $modal.hidden = true;
    $modal.innerHTML = '';
    modalYes = null;
    if (modalFocus && modalFocus.focus) { try { modalFocus.focus(); } catch (e) { /* elemento sparito */ } }
  }
  $modal.addEventListener('click', function (e) {
    if (e.target.id === 'modal-yes') { var f = modalYes; closeModal(); if (f) f(); }
    else if (e.target.id === 'modal-no' || e.target === $modal) closeModal();
  });
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? 'Copiato' : 'Copia non riuscita: tieni premuto sul testo e copialo a mano');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Copiato'); }, fallback);
    } else fallback();
  }
  function opt(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function check(name, label, on) {
    return '<label class="check"><input type="checkbox" data-change="' + name + '"' + (on ? ' checked' : '') + '> <span>' + label + '</span></label>';
  }
  function seg(name, values, current, labels) {
    return '<div class="seg" role="group">' + values.map(function (v, i) {
      return '<button type="button" data-act="seg" data-name="' + name + '" data-val="' + v + '" aria-pressed="' + (String(v) === String(current)) + '">' + esc(labels ? labels[i] : v) + '</button>';
    }).join('') + '</div>';
  }
  function scrollTop() { window.scrollTo(0, 0); }
  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ============================================================ tema e testata */

  var THEMES = ['auto', 'light', 'dark'];
  var HOST_THEME = document.documentElement.getAttribute('data-theme');
  function applyTheme() {
    var t = S.prefs.theme || 'auto';
    if (t === 'auto') {
      if (HOST_THEME) document.documentElement.setAttribute('data-theme', HOST_THEME);
      else document.documentElement.removeAttribute('data-theme');
    }
    else document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('theme-btn');
    btn.textContent = t === 'auto' ? '◐' : (t === 'light' ? '☀' : '☾');
    btn.setAttribute('aria-label', 'Tema: ' + (t === 'auto' ? 'automatico' : t === 'light' ? 'chiaro' : 'scuro') + '. Tocca per cambiare');
  }
  document.getElementById('theme-btn').addEventListener('click', function () {
    var t = S.prefs.theme || 'auto';
    S.prefs.theme = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    save(); applyTheme();
    toast('Tema: ' + ({ auto: 'automatico', light: 'chiaro', dark: 'scuro' })[S.prefs.theme]);
  });

  function countdown() {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((EXAM - today) / 86400000);
    var el = document.getElementById('countdown');
    if (days > 1) el.textContent = 'Preselettiva del 6 ottobre · mancano ' + days + ' giorni';
    else if (days === 1) el.textContent = 'Preselettiva domani, 6 ottobre 2026';
    else if (days === 0) el.textContent = 'Preselettiva oggi · in bocca al lupo';
    else el.textContent = 'Preselettiva del 6 ottobre 2026';
  }

  /* ============================================================ navigazione */

  var TABS = [{ id: 'flash', label: 'Flashcard' }];
  if (DATA.quiz && DATA.quiz.questions.length) TABS.push({ id: 'quiz', label: 'Quiz' });
  if (DATA.sims && DATA.sims.length) TABS.push({ id: 'sim', label: 'Simulazione' });
  TABS.push({ id: 'prog', label: 'Progressi' });

  var view = { tab: 'flash', screen: 'home' };
  var session = null; // sessione in corso (flashcard o quiz)

  function renderTabs() {
    $tabs.innerHTML = TABS.map(function (t) {
      return '<button class="tab" role="tab" type="button" data-tab="' + t.id + '" aria-selected="' + (view.tab === t.id) + '">' + t.label + '</button>';
    }).join('');
  }
  $tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    var t = b.getAttribute('data-tab');
    session = null;
    stopTimer();
    view = { tab: t, screen: 'home' };
    S.prefs.tab = t; save();
    render();
  });

  function render() {
    renderTabs();
    var fn = SCREENS[view.tab + ':' + view.screen] || SCREENS['flash:home'];
    $app.innerHTML = fn();
    afterRender();
  }
  var afterHooks = [];
  function afterRender() {
    var hs = afterHooks; afterHooks = [];
    hs.forEach(function (f) { f(); });
  }

  var ACTIONS = {};
  var CHANGES = {};
  var SCREENS = {};
  $app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || !$app.contains(t)) return;
    var a = ACTIONS[t.getAttribute('data-act')];
    if (a) { e.preventDefault(); a(t, e); }
  });
  $app.addEventListener('change', function (e) {
    var t = e.target.closest('[data-change]');
    if (!t) return;
    var c = CHANGES[t.getAttribute('data-change')];
    if (c) c(t, e);
  });
  ACTIONS.seg = function (t) {
    var name = t.getAttribute('data-name');
    var val = t.getAttribute('data-val');
    var c = CHANGES[name];
    if (c) c({ value: val, checked: true });
  };

  /* ============================================================ FLASHCARD */

  var TYPE_LABEL = { inbreve: 'In breve', trappola: 'Da non confondere', tabella: 'Tabella', dettaglio: 'Dettaglio di nicchia' };
  var schedaByKey = {};
  DATA.schede.forEach(function (s) { schedaByKey[s.key] = s; });
  var volByN = {};
  DATA.volumes.forEach(function (v) { volByN[v.vol] = v; });

  function schedaName(key) {
    var s = schedaByKey[key];
    if (!s) return '';
    return s.code ? s.code + ' — ' + s.title : s.title;
  }
  function fcPrefs() {
    var p = S.prefs.fc || (S.prefs.fc = {});
    if (p.vol === undefined) p.vol = '';
    if (p.scheda === undefined) p.scheda = '';
    if (!p.size) p.size = 20;
    return p;
  }
  function cardState(id) { return S.cards[id] || null; }
  function cardBox(id) { var s = S.cards[id]; return s ? s.b : 1; }

  function fcFiltered(p) {
    return DATA.cards.filter(function (c) {
      if (p.vol && String(c.vol) !== String(p.vol)) return false;
      if (p.scheda && c.schedaKey !== p.scheda) return false;
      if (p.nov && !c.nov) return false;
      if (p.num && !c.numeri) return false;
      if (p.wrong) { var s = S.cards[c.id]; if (!s || !s.w) return false; }
      return true;
    });
  }

  function buildFcSession(cards, size, docOrder) {
    var byBox = [[], [], [], [], [], []];
    var pool = docOrder ? cards.slice() : shuffle(cards.slice());
    pool.forEach(function (c) { byBox[cardBox(c.id)].push(c); });
    var out = [];
    for (var b = 1; b <= 5; b++) {
      var wrong = [], seen = [], fresh = [];
      byBox[b].forEach(function (c) {
        var s = S.cards[c.id];
        if (!s) fresh.push(c); else if (s.w) wrong.push(c); else seen.push(c);
      });
      seen.sort(function (x, y) { return (S.cards[x.id].t || 0) - (S.cards[y.id].t || 0); });
      out = out.concat(wrong, seen, fresh);
    }
    if (size && size !== 'all') out = out.slice(0, Number(size));
    return out.map(function (c) { return c.id; });
  }
  var cardById = {};
  DATA.cards.forEach(function (c) { cardById[c.id] = c; });

  CHANGES.fcVol = function (t) { var p = fcPrefs(); p.vol = t.value; p.scheda = ''; save(); render(); };
  CHANGES.fcScheda = function (t) { fcPrefs().scheda = t.value; save(); render(); };
  CHANGES.fcNov = function (t) { fcPrefs().nov = t.checked; save(); render(); };
  CHANGES.fcNum = function (t) { fcPrefs().num = t.checked; save(); render(); };
  CHANGES.fcWrong = function (t) { fcPrefs().wrong = t.checked; save(); render(); };
  CHANGES.fcSize = function (t) { fcPrefs().size = t.value; save(); render(); };

  SCREENS_DEF('flash:home', function () {
    var p = fcPrefs();
    var cards = fcFiltered(p);
    var boxes = [0, 0, 0, 0, 0, 0];
    var fresh = 0, wrong = 0;
    cards.forEach(function (c) {
      var s = S.cards[c.id];
      if (!s) fresh++; else { boxes[s.b]++; if (s.w) wrong++; }
    });
    var vols = '<option value="">Tutti i volumi</option>' + DATA.volumes.map(function (v) {
      return opt(v.vol, 'Vol. ' + v.vol + ' — ' + v.title, String(p.vol) === String(v.vol));
    }).join('');
    var schede = DATA.schede.filter(function (s) { return !p.vol || String(s.vol) === String(p.vol); });
    var schedeOpts = '<option value="">Tutte le schede</option>' + schede.map(function (s) {
      return opt(s.key, (p.vol ? '' : 'Vol. ' + s.vol + ' · ') + (s.code ? s.code + ' — ' : '') + s.title, p.scheda === s.key);
    }).join('');
    var n = cards.length;
    var size = p.size === 'all' ? n : Math.min(n, Number(p.size));
    return '' +
      '<h1>Flashcard</h1>' +
      '<div class="panel">' +
      '<div class="field"><label for="fc-vol">Volume</label><select id="fc-vol" data-change="fcVol">' + vols + '</select></div>' +
      '<div class="field"><label for="fc-sch">Scheda</label><select id="fc-sch" data-change="fcScheda">' + schedeOpts + '</select></div>' +
      '<div class="checks">' +
      check('fcNov', 'Solo <span class="badge nov">NOVITÀ</span>', p.nov) +
      check('fcNum', 'Solo tabelle dei numeri (pagine di sintesi)', p.num) +
      check('fcWrong', 'Solo carte sbagliate («Non sapevo» all\'ultima risposta)', p.wrong) +
      '</div>' +
      '<div class="field"><span class="lbl">Carte per sessione</span>' + seg('fcSize', [10, 20, 40, 'all'], p.size, ['10', '20', '40', 'Tutte']) + '</div>' +
      '</div>' +
      '<div class="panel">' +
      '<div class="lbl" id="fc-count">Nel filtro: ' + plural(n, 'carta', 'carte') + ' · nuove ' + fresh + ' · sbagliate ' + wrong + '</div>' +
      '<div class="boxes" aria-label="Carte per scatola">' +
      '<div><span class="n">' + fresh + '</span><span class="l">nuove</span></div>' +
      [1, 2, 3, 4, 5].map(function (b) { return '<div><span class="n">' + boxes[b] + '</span><span class="l">scatola ' + b + '</span></div>'; }).join('') +
      '</div>' +
      '<p class="small muted">Le nuove partono dalla scatola 1. «Sapevo» fa salire di una scatola, «Non sapevo» riporta alla 1, «Incerto» lascia dov\'è. Ogni sessione comincia dalle scatole basse.</p>' +
      '<button class="btn primary block" data-act="fcStart"' + (n ? '' : ' disabled') + '>' + (n ? 'Inizia: ' + plural(size, 'carta', 'carte') : 'Nessuna carta con questi filtri') + '</button>' +
      '</div>';
  });

  ACTIONS.fcStart = function () {
    var p = fcPrefs();
    var ids = buildFcSession(fcFiltered(p), p.size, !!p.scheda);
    startFc(ids);
  };
  function startFc(ids) {
    if (!ids.length) return;
    session = { kind: 'fc', live: true, ids: ids, i: 0, revealed: false, res: { ok: 0, mid: 0, ko: 0 }, missed: [] };
    view = { tab: 'flash', screen: 'run' };
    render(); scrollTop();
  }

  function cardBody(c) {
    if (c.type === 'tabella') {
      var h = '';
      if (c.caption) h += '<div class="ctx">' + c.caption + '</div>';
      h += '<div class="tq">' + (c.qLabel ? '<span class="ql">' + c.qLabel + '</span>' : '') + c.q + '</div>';
      if (!session.revealed) {
        h += '<div class="asks">' + c.ask.map(function (a) { return '<span>' + a + '?</span>'; }).join('') + '</div>';
      } else {
        h += '<dl class="ta">' + c.a.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
      }
      return h;
    }
    return '<div>' + c.html + '</div>';
  }

  SCREENS_DEF('flash:run', function () {
    var s = session;
    if (!s || s.kind !== 'fc') { view.screen = 'home'; return SCREENS['flash:home'](); }
    if (s.i >= s.ids.length) return fcEnd();
    var c = cardById[s.ids[s.i]];
    var st = cardState(c.id);
    var box = st ? st.b : 1;
    var sch = schedaByKey[c.schedaKey];
    var ctx = 'Vol. ' + c.vol + ' · ' + esc(schedaName(c.schedaKey)) + (c.sezione ? ' · ' + esc(c.sezione) : '');
    var badges = '<span class="badge box">' + (st ? 'Scatola ' + box : 'Nuova') + '</span>' +
      '<span class="badge">' + TYPE_LABEL[c.type] + (c.part ? ' ' + c.part[0] + '/' + c.part[1] : '') + '</span>' +
      (c.nov ? '<span class="badge nov">NOVITÀ</span>' : '') +
      (c.numeri ? '<span class="badge">Numeri</span>' : '') +
      (st && st.w ? '<span class="badge ko">sbagliata l\'ultima volta</span>' : '');
    var pct = Math.round(100 * s.i / s.ids.length);
    var bar = s.revealed
      ? '<button class="btn ko" data-act="fcRate" data-r="ko">Non sapevo</button>' +
        '<button class="btn warn" data-act="fcRate" data-r="mid">Incerto</button>' +
        '<button class="btn ok" data-act="fcRate" data-r="ok">Sapevo</button>'
      : '<button class="btn primary" data-act="fcShow">Mostra risposta</button>';
    return '' +
      '<div class="qhead"><span class="muted small">Carta ' + (s.i + 1) + ' di ' + s.ids.length + '</span>' +
      '<button class="linkish" data-act="fcQuit">Termina</button></div>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="badges">' + badges + '</div>' +
      '<p class="ctx">' + ctx + '</p>' +
      '<div class="card' + (s.revealed ? ' revealed' : '') + '" id="fc-card">' + cardBody(c) + '</div>' +
      (sch && sch.parte ? '<p class="small muted">' + esc(sch.parte) + '</p>' : '') +
      '<p class="small muted hide-touch">Tastiera: <kbd>spazio</kbd> mostra · <kbd>1</kbd> non sapevo · <kbd>2</kbd> incerto · <kbd>3</kbd> sapevo</p>' +
      '<div class="actionbar"><div class="actionbar-in">' + bar + '</div></div>';
  });

  ACTIONS.fcShow = function () {
    if (!session || session.revealed) return;
    session.revealed = true;
    render();
  };
  ACTIONS.fcRate = function (t) { fcRate(t.getAttribute('data-r')); };
  function fcRate(r) {
    var s = session;
    if (!s || !s.revealed) return;
    var id = s.ids[s.i];
    var st = S.cards[id] || { b: 1, n: 0 };
    if (r === 'ok') { st.b = Math.min(5, (st.b || 1) + 1); st.w = false; s.res.ok++; }
    else if (r === 'ko') { st.b = 1; st.w = true; s.res.ko++; s.missed.push(id); }
    else { st.b = st.b || 1; s.res.mid++; }
    st.n = (st.n || 0) + 1;
    st.t = Date.now();
    S.cards[id] = st;
    save();
    s.i++; s.revealed = false;
    render(); scrollTop();
  }
  ACTIONS.fcQuit = function () {
    if (!session) return;
    session.ids = session.ids.slice(0, session.i);
    render();
  };
  function fcEnd() {
    var s = session;
    s.live = false;
    var done = s.res.ok + s.res.mid + s.res.ko;
    return '' +
      '<h1>Sessione finita</h1>' +
      '<div class="panel"><div class="kv">' +
      '<span>Carte viste</span><span>' + done + '</span>' +
      '<span>Sapevo</span><span>' + s.res.ok + '</span>' +
      '<span>Incerto</span><span>' + s.res.mid + '</span>' +
      '<span>Non sapevo</span><span>' + s.res.ko + '</span>' +
      '</div></div>' +
      '<div class="row">' +
      (s.missed.length ? '<button class="btn primary" data-act="fcMissed">Ripassa le ' + s.missed.length + ' non sapute</button>' : '') +
      '<button class="btn" data-act="fcAgain">Nuova sessione</button>' +
      '<button class="btn ghost" data-act="fcHome">Filtri</button>' +
      '</div>';
  }
  ACTIONS.fcMissed = function () { startFc(shuffle(session.missed.slice())); };
  ACTIONS.fcAgain = function () { ACTIONS.fcStart(); };
  ACTIONS.fcHome = function () { session = null; view = { tab: 'flash', screen: 'home' }; render(); };

  /* ============================================================ QUIZ */

  var QZ = DATA.quiz ? DATA.quiz.questions : [];
  var qById = {};
  QZ.forEach(function (q) { qById[q.id] = q; });
  function qzPrefs() {
    var p = S.prefs.qz || (S.prefs.qz = {});
    if (p.materia === undefined) p.materia = '';
    if (p.arg === undefined) p.arg = '';
    if (p.fonte === undefined) p.fonte = '';
    if (p.random === undefined) p.random = true;
    if (!p.size) p.size = 20;
    return p;
  }
  function qWrong(id) {
    var s = S.quiz[id];
    return !!(s && (s.g || s.r === 'ko' || s.r === 'worst' || s.r === 'neu' || s.r === 'nc'));
  }
  function qzFiltered(p) {
    return QZ.filter(function (q) {
      if (p.materia && q.materia !== p.materia) return false;
      if (p.arg && q.argomento !== p.arg) return false;
      if (p.fonte && q.fonte !== p.fonte) return false;
      if (p.wrong && !qWrong(q.id)) return false;
      return true;
    });
  }
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  CHANGES.qzMat = function (t) { var p = qzPrefs(); p.materia = t.value; p.arg = ''; save(); render(); };
  CHANGES.qzArg = function (t) { qzPrefs().arg = t.value; save(); render(); };
  CHANGES.qzFonte = function (t) { qzPrefs().fonte = t.value; save(); render(); };
  CHANGES.qzWrong = function (t) { qzPrefs().wrong = t.checked; save(); render(); };
  CHANGES.qzRandom = function (t) { qzPrefs().random = t.checked; save(); render(); };
  CHANGES.qzSize = function (t) { qzPrefs().size = t.value; save(); render(); };

  function exportCodesAll() {
    return QZ.filter(function (q) { return qWrong(q.id); }).map(function (q) { return q.id; });
  }

  SCREENS_DEF('quiz:home', function () {
    var p = qzPrefs();
    var qs = qzFiltered(p);
    var materie = uniq(QZ.map(function (q) { return q.materia; }));
    var args = uniq(QZ.filter(function (q) { return !p.materia || q.materia === p.materia; }).map(function (q) { return q.argomento; }));
    var n = qs.length;
    var size = p.size === 'all' ? n : Math.min(n, Number(p.size));
    var answered = QZ.filter(function (q) { return S.quiz[q.id]; }).length;
    var codes = exportCodesAll();
    return '' +
      '<h1>Quiz d\'archivio</h1>' +
      '<div class="panel">' +
      '<div class="field"><label for="qz-mat">Materia</label><select id="qz-mat" data-change="qzMat"><option value="">Tutte le materie</option>' +
      materie.map(function (m) { return opt(m, m, p.materia === m); }).join('') + '</select></div>' +
      '<div class="field"><label for="qz-arg">Argomento</label><select id="qz-arg" data-change="qzArg"><option value="">Tutti gli argomenti</option>' +
      args.map(function (a) { return opt(a, a, p.arg === a); }).join('') + '</select></div>' +
      '<div class="field"><span class="lbl">Fonte</span>' + seg('qzFonte', ['', 'SNA', 'Formez'], p.fonte, ['Tutte', 'SNA', 'Formez']) + '</div>' +
      '<div class="checks">' +
      check('qzWrong', 'Solo sbagliati o indovinati a caso', p.wrong) +
      check('qzRandom', 'Ordine casuale', p.random) +
      '</div>' +
      '<div class="field"><span class="lbl">Numero di domande</span>' + seg('qzSize', [10, 20, 30, 60, 'all'], p.size, ['10', '20', '30', '60', 'Tutte']) + '</div>' +
      '</div>' +
      '<div class="panel">' +
      '<p class="lbl">Nel filtro: ' + plural(n, 'quesito', 'quesiti') + ' · già risposti in totale ' + answered + ' di ' + QZ.length + '</p>' +
      '<p class="small muted">Punteggio ufficiale: esatta +1, errata −0,53, omessa 0; situazionali 1 / 0,50 / 0.</p>' +
      '<button class="btn primary block" data-act="qzStart"' + (n ? '' : ' disabled') + '>' + (n ? 'Inizia: ' + plural(size, 'quesito', 'quesiti') : 'Nessun quesito con questi filtri') + '</button>' +
      '</div>' +
      '<div class="panel"><h2 style="margin-top:0">Esporta codici</h2>' +
      '<p class="small muted">Codici dei quesiti sbagliati o indovinati a caso (tutte le sessioni).</p>' +
      (codes.length ? '<p class="codes" id="codes-all">' + esc(codes.join(', ')) + '</p><button class="btn sm" data-act="copyCodes" data-src="codes-all">Copia ' + plural(codes.length, 'codice', 'codici') + '</button>'
        : '<p class="muted small">Ancora nessuno.</p>') +
      '</div>';
  });

  ACTIONS.qzStart = function () {
    var p = qzPrefs();
    var qs = qzFiltered(p);
    if (p.random) qs = shuffle(qs.slice());
    if (p.size !== 'all') qs = qs.slice(0, Number(p.size));
    session = { kind: 'qz', live: true, ids: qs.map(function (q) { return q.id; }), i: 0, ans: {}, done: {}, guess: {} };
    view = { tab: 'quiz', screen: 'run' };
    render(); scrollTop();
  };

  var ROLE_LABEL = { best: 'migliore', neu: 'neutra', worst: 'peggiore' };
  function optionsHtml(q, chosen, revealed, act, disabled) {
    return '<div class="opts">' + q.opts.map(function (o) {
      var cls = 'opt', tag = '';
      if (revealed) {
        var role = Scoring.role(q, o.k);
        if (q.rank) {
          if (role === 'best') cls += ' right';
          else if (role === 'neu') cls += ' neu';
          else if (role === 'worst') cls += ' wrong';
          if (role) tag = '<span class="tag ' + role + '">' + ROLE_LABEL[role] + '</span>';
          if (o.k === chosen) tag += '<span class="tag mine">tua</span>';
        } else {
          if (o.k === q.key) { cls += ' right'; tag = '<span class="tag best">chiave</span>'; }
          else if (o.k === chosen) cls += ' wrong';
          if (o.k === chosen) tag += '<span class="tag mine">tua</span>';
        }
      } else if (o.k === chosen) cls += ' sel';
      return '<button type="button" class="' + cls + '" data-act="' + act + '" data-k="' + o.k + '"' + (disabled ? ' disabled' : '') + '>' +
        '<span class="k">' + o.k + '</span><span class="t">' + o.h + '</span>' + tag + '</button>';
    }).join('') + '</div>';
  }
  function keyText(q) {
    if (q.rank) {
      if (q.rank.length === 1) return 'migliore ' + q.rank[0] + ' (neutra e peggiore non indicate nel materiale)';
      return 'migliore ' + q.rank[0] + ' · ' + (q.rank.length > 2 ? 'neutra ' + q.rank.slice(1, -1).join(', ') + ' · ' : '') + 'peggiore ' + q.rank[q.rank.length - 1];
    }
    return q.key;
  }
  function verdictHtml(q, ans) {
    var r = Scoring.score(q, ans);
    var map = {
      ok: ['ok', 'Esatta · +1'], ko: ['ko', 'Errata · −0,53'], om: ['om', 'Omessa · 0'],
      best: ['ok', 'Risposta migliore · +1'], neu: ['neu', 'Risposta neutra · +0,50'], worst: ['ko', 'Risposta peggiore · 0'],
      nc: ['neu', 'Non è la migliore · 0 (neutra e peggiore non indicate nel materiale)']
    };
    var m = map[r.e];
    return '<div class="verdict ' + m[0] + '">' + m[1] + '</div>';
  }
  function braniHtml(id, brani, open) {
    if (!id || !brani[id]) return '';
    return '<details class="brano"' + (open ? ' open' : '') + '><summary>Brano</summary>' + brani[id] + '</details>';
  }

  SCREENS_DEF('quiz:run', function () {
    var s = session;
    if (!s || s.kind !== 'qz') { view.screen = 'home'; return SCREENS['quiz:home'](); }
    if (s.i >= s.ids.length) return qzEnd();
    var q = qById[s.ids[s.i]];
    var done = !!s.done[q.id];
    var ans = s.ans[q.id];
    var running = 0;
    s.ids.forEach(function (id) { if (s.done[id]) running += Scoring.score(qById[id], s.ans[id]).p; });
    var badges = '<span class="badge">' + esc(q.fonte) + '</span>' +
      (q.rank ? '<span class="badge">situazionale</span>' : '') +
      (q.nov ? '<span class="badge nov">NOVITÀ</span>' : '') +
      (q.vig === 'A' ? '<span class="badge warn">contesto cambiato</span>' : '');
    var h = '' +
      '<div class="qhead"><span class="muted small">Quesito ' + (s.i + 1) + ' di ' + s.ids.length + ' · punti ' + Scoring.fmt(running) + '</span>' +
      '<button class="linkish" data-act="qzQuit">Termina</button></div>' +
      '<div class="progress"><i style="width:' + Math.round(100 * s.i / s.ids.length) + '%"></i></div>' +
      '<div class="qhead"><span class="qid">' + esc(q.id) + '</span></div>' +
      '<div class="badges">' + badges + '</div>' +
      '<p class="ctx">' + esc(q.materia) + (q.argomento && q.argomento !== q.materia ? ' · ' + esc(q.argomento) : '') + '</p>' +
      (q.lowRel ? '<div class="note">Attenzione: chiave ragionata con affidabilità media.</div>' : '') +
      braniHtml(q.brano, DATA.quiz.brani, true) +
      '<div class="qtext">' + q.text + '</div>' +
      optionsHtml(q, ans, done, 'qzAns', done);
    h += check('qzGuess', 'Indovinata a caso', !!s.guess[q.id]);
    if (done) {
      h += verdictHtml(q, ans) +
        '<div class="panel"><p><b>Chiave:</b> ' + esc(keyText(q)) + (q.keyNote ? ' <span class="muted">(' + esc(q.keyNote) + ')</span>' : '') + '</p>' +
        '<div class="expl">' + (q.expl || '<p class="muted">Nessuna spiegazione nel materiale.</p>') + '</div>' +
        '<hr><p class="small muted">Fonte: [' + esc(q.label) + '] · Vigenza ' + esc(q.vig) + '</p></div>';
    }
    var bar = done
      ? '<button class="btn primary" data-act="qzNext">' + (s.i + 1 < s.ids.length ? 'Avanti' : 'Risultato') + '</button>'
      : '<button class="btn" data-act="qzSkip">Salta (omessa)</button>';
    h += '<div class="actionbar"><div class="actionbar-in">' + bar + '</div></div>';
    return h;
  });

  ACTIONS.qzAns = function (t) {
    var s = session;
    var id = s.ids[s.i];
    if (s.done[id]) return;
    s.ans[id] = t.getAttribute('data-k');
    qzRecord(id);
    render();
    var v = document.querySelector('.verdict');
    if (v) v.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  ACTIONS.qzSkip = function () {
    var s = session;
    var id = s.ids[s.i];
    s.ans[id] = null;
    qzRecord(id);
    render();
  };
  function qzRecord(id) {
    var s = session;
    s.done[id] = true;
    var r = Scoring.score(qById[id], s.ans[id]);
    var prev = S.quiz[id] || { n: 0 };
    S.quiz[id] = { r: r.e, g: !!s.guess[id], n: (prev.n || 0) + 1, t: Date.now() };
    save();
  }
  CHANGES.qzGuess = function (t) {
    var s = session;
    var id = s.ids[s.i];
    s.guess[id] = t.checked;
    if (s.done[id] && S.quiz[id]) { S.quiz[id].g = t.checked; S.quiz[id].t = Date.now(); save(); }
  };
  ACTIONS.qzNext = function () { session.i++; render(); scrollTop(); };
  ACTIONS.qzQuit = function () {
    var s = session;
    s.ids = s.ids.filter(function (id) { return s.done[id]; });
    s.i = s.ids.length;
    render(); scrollTop();
  };

  function qzEnd() {
    var s = session;
    s.live = false;
    var qs = s.ids.map(function (id) { return qById[id]; });
    var tot = Scoring.total(qs, s.ans, function (q) { return q.id; });
    var codes = s.ids.filter(function (id) {
      var r = Scoring.score(qById[id], s.ans[id]).e;
      return s.guess[id] || r === 'ko' || r === 'worst' || r === 'neu' || r === 'nc';
    });
    var rows = qs.map(function (q) {
      var r = Scoring.score(q, s.ans[q.id]);
      var cls = { ok: 'ok', best: 'ok', ko: 'ko', worst: 'ko', neu: 'warn', nc: 'warn', om: '' }[r.e];
      return '<tr><td class="qid">' + esc(q.id) + '</td><td>' + (s.ans[q.id] || '—') + '</td><td>' + esc(keyText(q).split(' (')[0]) + '</td>' +
        '<td class="num"><span class="badge ' + cls + '">' + Scoring.fmt(r.p) + '</span>' + (s.guess[q.id] ? ' <span class="badge warn">a caso</span>' : '') + '</td></tr>';
    }).join('');
    return '' +
      '<h1>Risultato del quiz</h1>' +
      '<div class="panel"><div class="score">' + Scoring.fmt(tot.p) + '<span class="muted" style="font-size:20px"> / ' + Scoring.fmt(tot.max) + '</span></div>' +
      '<div class="kv" style="margin-top:10px">' +
      '<span>Esatte</span><span>' + tot.ok + '</span>' +
      '<span>Errate</span><span>' + tot.ko + '</span>' +
      (tot.best + tot.neu + tot.worst + tot.nc ? '<span>Situazionali: migliore / neutra / peggiore</span><span>' + tot.best + ' / ' + (tot.neu + tot.nc) + ' / ' + tot.worst + '</span>' : '') +
      '<span>Omesse</span><span>' + tot.om + '</span>' +
      '</div></div>' +
      '<div class="panel"><h2 style="margin-top:0">Codici da ripassare</h2><p class="small muted">Sbagliati o indovinati a caso in questa sessione.</p>' +
      (codes.length ? '<p class="codes" id="codes-sess">' + esc(codes.join(', ')) + '</p><button class="btn sm" data-act="copyCodes" data-src="codes-sess">Esporta codici</button>' : '<p class="muted small">Nessuno.</p>') +
      '</div>' +
      '<div class="panel"><div class="tw"><table><thead><tr><th>Quesito</th><th>Tua</th><th>Chiave</th><th class="num">Punti</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="row"><button class="btn primary" data-act="qzAgain">Nuovo quiz</button><button class="btn ghost" data-act="qzHome">Filtri</button></div>';
  }
  ACTIONS.qzAgain = function () { ACTIONS.qzStart(); };
  ACTIONS.qzHome = function () { session = null; view = { tab: 'quiz', screen: 'home' }; render(); };
  ACTIONS.copyCodes = function (t) {
    var el = document.getElementById(t.getAttribute('data-src'));
    if (el) copyText(el.textContent);
  };

  /* ============================================================ SIMULAZIONE */

  var SIMS = DATA.sims || [];
  var simById = {};
  SIMS.forEach(function (s) { simById[s.id] = s; });
  var timerHandle = null;
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
  function simState(id) { return S.sims[id] || null; }
  function simRemaining(st) { return SIM_MINUTES * 60000 - (Date.now() - st.start); }
  function simQ(sim, n) {
    for (var i = 0; i < sim.questions.length; i++) if (sim.questions[i].n === n) return sim.questions[i];
    return null;
  }
  function partOf(sim, n) {
    for (var i = 0; i < sim.parts.length; i++) if (sim.parts[i].n === n) return sim.parts[i];
    return null;
  }

  SCREENS_DEF('sim:home', function () {
    var h = '<h1>Simulazione a tempo</h1>' +
      '<p class="muted">' + SIM_MINUTES + ' minuti, navigazione libera, risposte modificabili fino alla consegna. Il tempo scorre anche se chiudi la pagina.</p>';
    SIMS.forEach(function (sim) {
      var st = simState(sim.id);
      var status, btns;
      if (!st) {
        status = 'Non iniziata · ' + sim.questions.length + ' quesiti';
        btns = '<button class="btn primary" data-act="simStart" data-id="' + sim.id + '">Inizia</button>';
      } else if (!st.submitted) {
        var rem = simRemaining(st);
        status = rem > 0 ? 'In corso · restano ' + fmtClock(rem) : 'Tempo scaduto: da consegnare';
        btns = '<button class="btn primary" data-act="simResume" data-id="' + sim.id + '">' + (rem > 0 ? 'Riprendi' : 'Vedi esito') + '</button>' +
          '<button class="btn ghost" data-act="simReset" data-id="' + sim.id + '">Ricomincia</button>';
      } else {
        var tot = simTotals(sim, st).all;
        status = 'Consegnata · punteggio ' + Scoring.fmt(tot.p) + ' su ' + Scoring.fmt(tot.max);
        btns = '<button class="btn primary" data-act="simResult" data-id="' + sim.id + '">Esito e revisione</button>' +
          '<button class="btn ghost" data-act="simReset" data-id="' + sim.id + '">Rifai</button>';
      }
      h += '<div class="panel"><h2 style="margin-top:0">' + esc(sim.title) + '</h2><p class="small muted">' + esc(sim.file) + '</p>' +
        '<p>' + status + '</p><div class="row">' + btns + '</div></div>';
    });
    return h;
  });

  ACTIONS.simStart = function (t) {
    var id = t.getAttribute('data-id');
    ask('Iniziare la simulazione? Il timer di ' + SIM_MINUTES + ' minuti parte subito.', 'Inizia', function () {
      S.sims[id] = { start: Date.now(), ans: {}, rev: {}, cur: simById[id].questions[0].n, submitted: null };
      save();
      openSim(id);
    });
  };
  ACTIONS.simResume = function (t) { openSim(t.getAttribute('data-id')); };
  ACTIONS.simReset = function (t) {
    var id = t.getAttribute('data-id');
    ask('Cancellare risposte ed esito di questa simulazione e ricominciare da capo?', 'Cancella', function () {
      delete S.sims[id]; save(); render();
    }, true);
  };
  ACTIONS.simResult = function (t) {
    session = { kind: 'simres', sim: t.getAttribute('data-id'), filter: 'all' };
    view = { tab: 'sim', screen: 'result' };
    render(); scrollTop();
  };
  function openSim(id) {
    var st = simState(id);
    if (simRemaining(st) <= 0) { simSubmit(id, true); return; }
    session = { kind: 'sim', live: true, sim: id, grid: false };
    view = { tab: 'sim', screen: 'run' };
    render(); scrollTop();
    startTimer();
  }
  function startTimer() {
    stopTimer();
    timerHandle = setInterval(function () {
      if (!session || session.kind !== 'sim') { stopTimer(); return; }
      var st = simState(session.sim);
      var rem = simRemaining(st);
      var el = document.getElementById('sim-timer');
      if (el) { el.textContent = fmtClock(rem); el.classList.toggle('low', rem < 5 * 60000); }
      if (rem <= 0) { stopTimer(); toast('Tempo scaduto: simulazione consegnata'); simSubmit(session.sim, true); }
    }, 1000);
  }

  SCREENS_DEF('sim:run', function () {
    var s = session;
    if (!s || s.kind !== 'sim') { view.screen = 'home'; return SCREENS['sim:home'](); }
    var sim = simById[s.sim];
    var st = simState(s.sim);
    var q = simQ(sim, st.cur) || sim.questions[0];
    var idx = sim.questions.indexOf(q);
    var part = partOf(sim, q.part);
    var nAns = Object.keys(st.ans).filter(function (k) { return st.ans[k]; }).length;
    var nRev = Object.keys(st.rev).filter(function (k) { return st.rev[k]; }).length;
    var rem = simRemaining(st);
    var h = '' +
      '<div class="panel" style="padding:10px 14px">' +
      '<div class="qhead" style="margin:0"><span>Tempo <span class="timer' + (rem < 300000 ? ' low' : '') + '" id="sim-timer">' + fmtClock(rem) + '</span></span>' +
      '<span class="small muted">risposte ' + nAns + '/' + sim.questions.length + (nRev ? ' · da rivedere ' + nRev : '') + '</span></div>' +
      '<div class="row" style="margin-top:6px"><button class="btn sm ghost" data-act="simGrid">' + (s.grid ? 'Nascondi indice' : 'Indice dei quesiti') + '</button>' +
      '<button class="btn sm" data-act="simSubmitAsk">Consegna</button></div>' +
      (s.grid ? simGrid(sim, st, q.n, null) +
        '<div class="legend"><span>■ risposta data</span><span>● da rivedere</span></div>' : '') +
      '</div>' +
      (part ? '<p class="ctx">Parte ' + esc(part.roman) + ' — ' + esc(part.title) + '</p>' : '') +
      '<div class="qhead"><span class="qid">Quesito ' + q.n + '</span>' +
      (q.nov ? '<span class="badge nov">NOVITÀ</span>' : '') + '</div>' +
      braniHtml(q.brano, sim.brani, true) +
      (q.fig ? '<div class="fig">figura: vedi il PDF della simulazione</div>' : '') +
      '<div class="qtext">' + q.text + '</div>' +
      optionsHtml(q, st.ans[q.n], false, 'simAns', false) +
      '<div class="row">' +
      '<label class="check" style="flex:1"><input type="checkbox" data-change="simRev"' + (st.rev[q.n] ? ' checked' : '') + '> <span>Da rivedere</span></label>' +
      (st.ans[q.n] ? '<button class="btn sm ghost" data-act="simClear">Cancella risposta</button>' : '') +
      '</div>' +
      '<div class="actionbar"><div class="actionbar-in">' +
      '<button class="btn" data-act="simGo" data-d="-1"' + (idx <= 0 ? ' disabled' : '') + '>← Indietro</button>' +
      '<button class="btn primary" data-act="simGo" data-d="1"' + (idx >= sim.questions.length - 1 ? ' disabled' : '') + '>Avanti →</button>' +
      '</div></div>';
    return h;
  });

  function simGrid(sim, st, cur, results) {
    return '<div class="grid">' + sim.questions.map(function (q) {
      var cls = [];
      if (results) {
        var e = results[q.n];
        cls.push(e === 'ok' || e === 'best' ? 'r-ok' : e === 'ko' || e === 'worst' ? 'r-ko' : e === 'neu' || e === 'nc' ? 'r-neu' : '');
      } else {
        if (st.ans[q.n]) cls.push('ans');
        if (st.rev[q.n]) cls.push('rev');
        if (q.n === cur) cls.push('cur');
      }
      return '<button type="button" class="' + cls.join(' ') + '" data-act="' + (results ? 'simJumpRev' : 'simJump') + '" data-n="' + q.n + '" aria-label="Quesito ' + q.n + '">' + q.n + '</button>';
    }).join('') + '</div>';
  }
  ACTIONS.simGrid = function () { session.grid = !session.grid; render(); };
  ACTIONS.simJump = function (t) {
    var st = simState(session.sim);
    st.cur = Number(t.getAttribute('data-n')); save();
    session.grid = false;
    render(); scrollTop();
  };
  ACTIONS.simGo = function (t) {
    var sim = simById[session.sim];
    var st = simState(session.sim);
    var i = sim.questions.indexOf(simQ(sim, st.cur)) + Number(t.getAttribute('data-d'));
    if (i < 0 || i >= sim.questions.length) return;
    st.cur = sim.questions[i].n; save();
    render(); scrollTop();
  };
  ACTIONS.simAns = function (t) {
    var st = simState(session.sim);
    if (simRemaining(st) <= 0) return;
    st.ans[st.cur] = t.getAttribute('data-k');
    save(); render();
  };
  ACTIONS.simClear = function () {
    var st = simState(session.sim);
    delete st.ans[st.cur]; save(); render();
  };
  CHANGES.simRev = function (t) {
    var st = simState(session.sim);
    if (t.checked) st.rev[st.cur] = true; else delete st.rev[st.cur];
    save(); render();
  };
  ACTIONS.simSubmitAsk = function () {
    var sim = simById[session.sim];
    var st = simState(session.sim);
    var nAns = sim.questions.filter(function (q) { return st.ans[q.n]; }).length;
    var nRev = sim.questions.filter(function (q) { return st.rev[q.n]; }).length;
    var msg = 'Consegnare la simulazione?\n\nRisposte date: ' + nAns + ' su ' + sim.questions.length +
      (nRev ? '\nSegnati da rivedere: ' + nRev : '') + '\n\nDopo la consegna le risposte non si possono più cambiare.';
    var id = session.sim;
    ask(msg, 'Consegna', function () { simSubmit(id, false); });
  };
  function simSubmit(id, auto) {
    var st = simState(id);
    st.submitted = Date.now();
    st.auto = !!auto;
    save();
    stopTimer();
    session = { kind: 'simres', sim: id, filter: 'all' };
    view = { tab: 'sim', screen: 'result' };
    render(); scrollTop();
  }

  function simTotals(sim, st) {
    var key = function (q) { return q.n; };
    var res = { all: Scoring.total(sim.questions, st.ans, key), parts: [], arch: null, formez: null };
    res.parts = sim.parts.map(function (p) {
      return { part: p, t: Scoring.total(sim.questions.filter(function (q) { return q.part === p.n; }), st.ans, key) };
    });
    res.arch = Scoring.total(sim.questions.filter(function (q) { return !q.formez; }), st.ans, key);
    res.formez = Scoring.total(sim.questions.filter(function (q) { return q.formez; }), st.ans, key);
    return res;
  }
  function simCode(sim, q) { return q.code || (sim.id + '-' + q.n); }

  SCREENS_DEF('sim:result', function () {
    var s = session;
    if (!s || s.kind !== 'simres') { view.screen = 'home'; return SCREENS['sim:home'](); }
    var sim = simById[s.sim];
    var st = simState(s.sim);
    if (!st || !st.submitted) { view.screen = 'home'; return SCREENS['sim:home'](); }
    var R = simTotals(sim, st);
    var results = {};
    sim.questions.forEach(function (q) { results[q.n] = Scoring.score(q, st.ans[q.n]).e; });
    var wrongQs = sim.questions.filter(function (q) { var e = results[q.n]; return e === 'ko' || e === 'worst' || e === 'neu' || e === 'nc'; });
    var codes = uniq(wrongQs.map(function (q) { return simCode(sim, q); }));
    var used = Math.min(SIM_MINUTES * 60000, st.submitted - st.start);
    function line(t) {
      return '<td class="num">' + (t.ok + t.best) + ' · ' + (t.ko + t.worst + t.neu + t.nc) + ' · ' + t.om + '</td>' +
        '<td class="num"><b>' + Scoring.fmt(t.p) + '</b><br><span class="small muted">su ' + (t.max / 100) + '</span></td>';
    }
    var thead = '<thead><tr><th>Parte</th><th class="num">G · S · O</th><th class="num">Punti</th></tr></thead>';
    var h = '' +
      '<h1>Esito · ' + esc(sim.title) + '</h1>' +
      '<div class="panel"><div class="score">' + Scoring.fmt(R.all.p) + '<span class="muted" style="font-size:20px"> / ' + Scoring.fmt(R.all.max) + '</span></div>' +
      '<p class="small muted" style="margin-top:6px">' + (st.auto ? 'Consegnata allo scadere del tempo' : 'Consegnata dopo ' + fmtClock(used)) +
      ' · esatta +1, errata −0,53, omessa 0; situazionali 1 / 0,50 / 0</p>' +
      '<div class="kv">' +
      '<span>Esatte (scelta multipla)</span><span>' + R.all.ok + '</span>' +
      '<span>Errate (scelta multipla)</span><span>' + R.all.ko + '</span>' +
      '<span>Situazionali: migliore / neutra / peggiore</span><span>' + R.all.best + ' / ' + (R.all.neu + R.all.nc) + ' / ' + R.all.worst + '</span>' +
      '<span>Omesse</span><span>' + R.all.om + '</span>' +
      '</div></div>' +
      '<div class="panel"><h2 style="margin-top:0">Per parte</h2><div class="tw"><table>' + thead + '<tbody>' +
      R.parts.map(function (x) {
        return '<tr><td><b>' + esc(x.part.roman) + '</b> · ' + esc(x.part.title) + '</td>' + line(x.t) + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="small muted">G · S · O = giuste · sbagliate · omesse. Giuste = esatte e risposte migliori; nei situazionali le neutre stanno fra le sbagliate ma valgono 0,50.</p></div>' +
      '<div class="panel"><h2 style="margin-top:0">Archivio e Formez</h2><div class="tw"><table>' + thead.replace('Parte', 'Gruppo') + '<tbody>' +
      '<tr><td>Archivio (' + R.arch.n + ')</td>' + line(R.arch) + '</tr>' +
      '<tr><td>Formez «mai visti» (' + R.formez.n + ')</td>' + line(R.formez) + '</tr>' +
      '</tbody></table></div></div>' +
      '<div class="panel"><h2 style="margin-top:0">Codici sbagliati</h2><p class="small muted">Codici per il ripasso dei quesiti errati, peggiori o neutri.</p>' +
      (codes.length ? '<p class="codes" id="codes-sim">' + esc(codes.join(', ')) + '</p><button class="btn sm" data-act="copyCodes" data-src="codes-sim">Esporta codici</button>' : '<p class="muted small">Nessuno.</p>') +
      '</div>' +
      '<h2>Revisione</h2>' +
      simGrid(sim, st, null, results) +
      '<div class="field"><span class="lbl">Mostra</span>' + seg('simFilter', ['all', 'wrong', 'om'], s.filter, ['Tutti', 'Sbagliati', 'Omessi']) + '</div>';
    sim.questions.forEach(function (q) {
      var e = results[q.n];
      if (s.filter === 'wrong' && !(e === 'ko' || e === 'worst' || e === 'neu' || e === 'nc')) return;
      if (s.filter === 'om' && e !== 'om') return;
      var part = partOf(sim, q.part);
      h += '<div class="panel" id="rev-' + q.n + '">' +
        '<div class="qhead"><span class="qid">Quesito ' + q.n + '</span><span class="small muted">' + (part ? 'Parte ' + esc(part.roman) : '') + (q.formez ? ' · Formez' : '') + '</span></div>' +
        braniHtml(q.brano, sim.brani, false) +
        (q.fig ? '<div class="fig">figura: vedi il PDF della simulazione</div>' : '') +
        '<div class="qtext">' + q.text + '</div>' +
        optionsHtml(q, st.ans[q.n], true, 'noop', true) +
        verdictHtml(q, st.ans[q.n]) +
        '<p><b>Chiave:</b> ' + esc(keyText(q)) + (q.code ? ' · <b>codice per il ripasso:</b> <span class="qid">' + esc(q.code) + '</span>' : '') + '</p>' +
        '<div class="expl">' + (q.expl || '<p class="muted">Nessuna spiegazione nel materiale.</p>') + '</div>' +
        '</div>';
    });
    h += '<div class="row"><button class="btn ghost" data-act="simBack">Torna alle simulazioni</button></div>';
    return h;
  });
  CHANGES.simFilter = function (t) { session.filter = t.value; render(); };
  ACTIONS.simJumpRev = function (t) {
    var n = t.getAttribute('data-n');
    var el = document.getElementById('rev-' + n);
    if (!el) { session.filter = 'all'; render(); el = document.getElementById('rev-' + n); }
    if (el) el.scrollIntoView({ block: 'start' });
  };
  ACTIONS.simBack = function () { session = null; view = { tab: 'sim', screen: 'home' }; render(); };
  ACTIONS.noop = function () {};

  /* ============================================================ PROGRESSI */

  SCREENS_DEF('prog:home', function () {
    var seen = 0, boxes = [0, 0, 0, 0, 0, 0], wrong = 0;
    DATA.cards.forEach(function (c) {
      var s = S.cards[c.id];
      if (s) { seen++; boxes[s.b]++; if (s.w) wrong++; }
    });
    var h = '<h1>Progressi</h1>' +
      '<div class="panel"><h2 style="margin-top:0">Flashcard</h2>' +
      '<div class="kv"><span>Carte viste</span><span>' + seen + ' / ' + DATA.cards.length + '</span>' +
      '<span>Sbagliate all\'ultima risposta</span><span>' + wrong + '</span>' +
      '<span>Nella scatola 5</span><span>' + boxes[5] + '</span></div>' +
      '<div class="boxes" style="margin-top:10px"><div><span class="n">' + (DATA.cards.length - seen) + '</span><span class="l">nuove</span></div>' +
      [1, 2, 3, 4, 5].map(function (b) { return '<div><span class="n">' + boxes[b] + '</span><span class="l">scatola ' + b + '</span></div>'; }).join('') +
      '</div></div>';
    if (QZ.length) {
      var ans = 0, ok = 0, ko = 0;
      QZ.forEach(function (q) { var s = S.quiz[q.id]; if (s) { ans++; if (s.r === 'ok' || s.r === 'best') ok++; else if (s.r !== 'om') ko++; } });
      h += '<div class="panel"><h2 style="margin-top:0">Quiz</h2><div class="kv">' +
        '<span>Quesiti risposti</span><span>' + ans + ' / ' + QZ.length + '</span>' +
        '<span>Giusti all\'ultima risposta</span><span>' + ok + '</span>' +
        '<span>Sbagliati o non migliori</span><span>' + ko + '</span>' +
        '<span>Da ripassare (sbagliati o a caso)</span><span>' + exportCodesAll().length + '</span></div></div>';
    }
    if (SIMS.length) {
      h += '<div class="panel"><h2 style="margin-top:0">Simulazioni</h2><div class="kv">' + SIMS.map(function (sim) {
        var st = simState(sim.id);
        var v = !st ? 'non iniziata' : !st.submitted ? 'in corso' : Scoring.fmt(simTotals(sim, st).all.p) + ' / ' + Scoring.fmt(sim.questions.length * 100);
        return '<span>' + esc(sim.title) + '</span><span>' + v + '</span>';
      }).join('') + '</div></div>';
    }
    h += '<div class="panel"><h2 style="margin-top:0">Esporta / Importa progressi</h2>' +
      '<p class="small muted">I progressi stanno solo in questo browser. Per spostarli su un altro dispositivo esportali, conserva il testo (per esempio in una nota o in un messaggio a te stesso) e importalo dall\'altra parte: l\'import unisce i dati e, per ogni carta o quesito, tiene la risposta più recente.</p>' +
      (storageOk ? '' : '<div class="note">Questo browser non permette di salvare: esporta prima di chiudere la pagina.</div>') +
      '<div class="row"><button class="btn primary" data-act="exportCopy">Esporta e copia il testo</button>' +
      (DATA.hosted ? '' : '<button class="btn" data-act="exportFile">Scarica file JSON</button>') + '</div>' +
      '<div class="field" style="margin-top:10px"><label for="exp-text">Testo esportato</label><textarea id="exp-text" readonly placeholder="Tocca «Esporta e copia il testo»"></textarea></div>' +
      '<hr>' +
      '<div class="field"><label for="imp-file">Importa da file</label><input id="imp-file" type="file" accept=".json,application/json" data-change="importFile" style="min-height:48px"></div>' +
      '<div class="field"><label for="imp-text">…oppure incolla il testo esportato</label><textarea id="imp-text" placeholder="{&quot;v&quot;:1,…}"></textarea></div>' +
      '<button class="btn block" data-act="importText">Importa testo incollato</button>' +
      '<hr><button class="btn ghost block" data-act="resetAll">Azzera tutti i progressi</button>' +
      '</div>' +
      '<div class="panel small muted"><h2 style="margin-top:0">Dati</h2>' +
      '<p>Generato il ' + esc(DATA.generated) + ' da ' + DATA.volumes.length + ' volumi di ripasso' +
      (QZ.length ? ', ' + QZ.length + ' quesiti d\'archivio' : '') + (SIMS.length ? ', ' + SIMS.length + ' simulazioni' : '') + '.</p>' +
      '<p>' + DATA.volumes.map(function (v) { return 'Vol. ' + v.vol + ' — ' + esc(v.title) + ' (' + DATA.cards.filter(function (c) { return c.vol === v.vol; }).length + ' carte)'; }).join('<br>') + '</p>' +
      (QZ.length ? '' : '<p>Quiz d\'archivio non disponibile: mancano i file DOSSIER_* / ADDENDA* fra i materiali.</p>') +
      (SIMS.length ? '' : '<p>Simulazione non disponibile: mancano i file SIMULAZIONE_MISTA_* fra i materiali.</p>') +
      '</div>';
    return h;
  });

  function exportJson() {
    return JSON.stringify({ v: 1, app: 'ripasso-sna12', exported: new Date().toISOString(), cards: S.cards, quiz: S.quiz, sims: S.sims, prefs: S.prefs });
  }
  ACTIONS.exportFile = function () {
    var blob = new Blob([exportJson()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'progressi-sna12-' + stamp() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('File esportato');
  };
  ACTIONS.exportCopy = function () {
    var ta = document.getElementById('exp-text');
    var text = exportJson();
    if (ta) { ta.value = text; ta.focus(); ta.select(); }
    copyText(text);
  };
  function mergeMap(dst, src) {
    var n = 0;
    Object.keys(src || {}).forEach(function (k) {
      var a = dst[k], b = src[k];
      if (!b || typeof b !== 'object') return;
      if (!a || (b.t || b.submitted || b.start || 0) > (a.t || a.submitted || a.start || 0)) { dst[k] = b; n++; }
    });
    return n;
  }
  function importJson(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { toast('Testo non valido: non è un JSON'); return; }
    if (!d || d.v !== 1 || typeof d.cards !== 'object') { toast('Il file non sembra un export di questa app'); return; }
    var n = mergeMap(S.cards, d.cards) + mergeMap(S.quiz, d.quiz || {}) + mergeMap(S.sims, d.sims || {});
    save();
    toast('Importati ' + n + ' elementi');
    render();
  }
  CHANGES.importFile = function (t) {
    var f = t.files && t.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () { importJson(String(r.result)); };
    r.readAsText(f);
  };
  ACTIONS.importText = function () {
    var v = document.getElementById('imp-text').value.trim();
    if (!v) { toast('Incolla prima il testo esportato'); return; }
    importJson(v);
  };
  ACTIONS.resetAll = function () {
    ask('Cancellare tutti i progressi (flashcard, quiz, simulazioni) da questo browser?', 'Azzera', function () {
      var theme = S.prefs.theme;
      S = blankState(); S.prefs.theme = theme; save(); render(); toast('Progressi azzerati');
    }, true);
  };

  /* ============================================================ tastiera */

  document.addEventListener('keydown', function (e) {
    if (!$modal.hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!session) return;
    if (session.kind === 'fc' && view.screen === 'run' && session.i < session.ids.length) {
      if ((e.key === ' ' || e.key === 'Enter') && !session.revealed) { e.preventDefault(); ACTIONS.fcShow(); }
      else if (session.revealed && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault(); fcRate({ 1: 'ko', 2: 'mid', 3: 'ok' }[e.key]);
      }
    } else if (session.kind === 'qz' && view.screen === 'run' && session.i < session.ids.length) {
      var q = qById[session.ids[session.i]];
      var k = e.key.toUpperCase();
      if (!session.done[q.id] && /^[A-E]$/.test(k) && q.opts.some(function (o) { return o.k === k; })) {
        e.preventDefault(); ACTIONS.qzAns({ getAttribute: function () { return k; } });
      } else if (session.done[q.id] && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ACTIONS.qzNext(); }
    } else if (session.kind === 'sim' && view.screen === 'run') {
      if (e.key === 'ArrowRight') ACTIONS.simGo({ getAttribute: function () { return '1'; } });
      else if (e.key === 'ArrowLeft') ACTIONS.simGo({ getAttribute: function () { return '-1'; } });
    }
  });

  /* ============================================================ avvio */

  function SCREENS_DEF(name, fn) { SCREENS[name] = fn; }

  applyTheme();
  countdown();
  if (S.prefs.tab && TABS.some(function (t) { return t.id === S.prefs.tab; })) view.tab = S.prefs.tab;
  render();
  window.addEventListener('pageshow', countdown);
})();
