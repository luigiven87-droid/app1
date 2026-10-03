"""Grafici e schemi in SVG, agganciati ai punti delle schede che illustrano.

Ogni figura disegna ciò che il testo della scheda dice (le didascalie riprendono il testo);
le curve economiche sono calcolate da funzioni, così intersezioni e minimi cadono dove devono.
Colori solo tramite classi CSS (c1-c3 per le serie, testo e assi dai token del tema).
"""

import html
import math
import re

from .common import md_plain

# ------------------------------------------------------------------ primitive SVG


def _t(s):
    return html.escape(str(s), quote=False)


def _f(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


class Svg:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.el = []

    def add(self, s):
        self.el.append(s)

    def line(self, x1, y1, x2, y2, cls="ln"):
        self.add('<line class="%s" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (cls, _f(x1), _f(y1), _f(x2), _f(y2)))

    def poly(self, pts, cls="c1"):
        self.add('<polyline class="%s" points="%s"/>' % (cls, " ".join("%s,%s" % (_f(x), _f(y)) for x, y in pts)))

    def polygon(self, pts, cls="sh"):
        self.add('<polygon class="%s" points="%s"/>' % (cls, " ".join("%s,%s" % (_f(x), _f(y)) for x, y in pts)))

    def rect(self, x, y, w, h, cls="bx", r=8):
        self.add('<rect class="%s" x="%s" y="%s" width="%s" height="%s" rx="%s"/>' % (cls, _f(x), _f(y), _f(w), _f(h), r))

    def circle(self, x, y, r=4, cls="pt"):
        self.add('<circle class="%s" cx="%s" cy="%s" r="%s"/>' % (cls, _f(x), _f(y), r))

    def text(self, x, y, s, anchor="start", cls=""):
        """Testo su una o più righe (separate da \\n)."""
        lines = str(s).split("\n")
        c = (' class="%s"' % cls) if cls else ""
        if len(lines) == 1:
            self.add('<text%s x="%s" y="%s" text-anchor="%s">%s</text>' % (c, _f(x), _f(y), anchor, _t(s)))
            return
        sp = "".join('<tspan x="%s" dy="%s">%s</tspan>' % (_f(x), "0" if i == 0 else "1.25em", _t(t))
                     for i, t in enumerate(lines))
        self.add('<text%s x="%s" y="%s" text-anchor="%s">%s</text>' % (c, _f(x), _f(y), anchor, sp))

    def arrow(self, x1, y1, x2, y2, cls="ln", head=7):
        """Linea con punta (poligono, niente marker con id)."""
        self.line(x1, y1, x2, y2, cls)
        a = math.atan2(y2 - y1, x2 - x1)
        p1 = (x2 - head * math.cos(a - 0.45), y2 - head * math.sin(a - 0.45))
        p2 = (x2 - head * math.cos(a + 0.45), y2 - head * math.sin(a + 0.45))
        self.polygon([(x2, y2), p1, p2], "ah")

    def render(self, label):
        return ('<svg viewBox="0 0 %d %d" role="img" aria-label="%s" xmlns="http://www.w3.org/2000/svg">%s</svg>'
                % (self.w, self.h, html.escape(label), "".join(self.el)))


class Plot(Svg):
    """Piano cartesiano con assi, scala e funzioni."""

    def __init__(self, w=360, h=250, xr=(0, 10), yr=(0, 10), box=(40, 14, 20, 36), ox=0, oy=0):
        super().__init__(w, h)
        self.x0, self.x1 = xr
        self.y0, self.y1 = yr
        l, t, r, b = box
        self.L, self.T, self.R, self.B = ox + l, oy + t, ox + (w if not ox else 0) - r, oy + h - b

    def text(self, x, y, s, anchor="start", cls=""):
        super().text(x, y, s, anchor, (cls + " hl").strip())

    def frame(self, x0, x1, top, bottom):
        self.L, self.R, self.T, self.B = x0, x1, top, bottom

    def X(self, x):
        return self.L + (x - self.x0) / (self.x1 - self.x0) * (self.R - self.L)

    def Y(self, y):
        return self.B - (y - self.y0) / (self.y1 - self.y0) * (self.B - self.T)

    def axes(self, xl, yl):
        self.arrow(self.L, self.B, self.R + 6, self.B, "ax", 6)
        self.arrow(self.L, self.B, self.L, self.T - 6, "ax", 6)
        self.text(self.R + 4, self.B + 16, xl, "end", "tm")
        self.text(self.L + 8, self.T + 2, yl, "start", "tm")

    def fn(self, f, a, b, cls="c1", n=80):
        pts = []
        for i in range(n + 1):
            x = a + (b - a) * i / n
            y = f(x)
            if self.y0 <= y <= self.y1:
                pts.append((self.X(x), self.Y(y)))
        self.poly(pts, cls)

    def seg(self, xa, ya, xb, yb, cls="c1"):
        self.line(self.X(xa), self.Y(ya), self.X(xb), self.Y(yb), cls)

    def guide(self, x, y, xt=None, yt=None):
        """Tratteggi dal punto agli assi, con le etichette sugli assi."""
        self.line(self.X(x), self.Y(y), self.X(x), self.B, "gd")
        self.line(self.X(x), self.Y(y), self.L, self.Y(y), "gd")
        if xt:
            self.text(self.X(x), self.B + 15, xt, "middle", "tm")
        if yt:
            self.text(self.L - 5, self.Y(y) + 4, yt, "end", "tm")

    def pt(self, x, y, label=None, dx=6, dy=-6, anchor="start"):
        self.circle(self.X(x), self.Y(y), 4)
        if label:
            self.text(self.X(x) + dx, self.Y(y) + dy, label, anchor, "tb")

    def lab(self, x, y, s, dx=0, dy=0, anchor="start", cls="tb"):
        self.text(self.X(x) + dx, self.Y(y) + dy, s, anchor, cls)

    def area(self, pts, cls="sh"):
        self.polygon([(self.X(x), self.Y(y)) for x, y in pts], cls)


def _solve(f, a, b, it=80):
    """Zero di f in [a, b] per bisezione."""
    fa = f(a)
    for _ in range(it):
        m = (a + b) / 2
        fm = f(m)
        if (fa < 0) == (fm < 0):
            a, fa = m, fm
        else:
            b = m
    return (a + b) / 2


# ------------------------------------------------------------------ economia


def fig_prezzo_massimo():
    p = Plot(xr=(0, 10), yr=(0, 10))
    D = lambda q: 9 - 0.8 * q  # noqa: E731
    S = lambda q: 1 + 0.8 * q  # noqa: E731
    pmax, qs, qd = 3.4, 3.0, 7.0
    p.area([(qs, D(qs)), (qs, S(qs)), (5, 5)])
    p.axes("Q", "P")
    p.fn(D, 0.6, 9.6, "c1")
    p.fn(S, 0.4, 9.6, "c2")
    p.seg(0, pmax, 9.2, pmax, "c3 dash")
    p.guide(5, 5, "Q*", "P*")
    p.guide(qs, S(qs), "Qₒ", "P max")
    p.line(p.X(qd), p.Y(pmax), p.X(qd), p.B, "gd")
    p.text(p.X(qd), p.B + 15, "Qᵈ", "middle", "tm")
    p.pt(5, 5, "E", 8, -4)
    p.lab(9.6, D(9.6), "D", 4, 4)
    p.lab(9.6, S(9.6), "S", 4, 4)
    p.lab(2.85, 5.2, "perdita\nsecca", 0, 0, "end", "tm")
    p.arrow(p.X(qs) + 2, p.Y(pmax) + 14, p.X(qd) - 2, p.Y(pmax) + 14, "ln", 6)
    p.arrow(p.X(qd) - 2, p.Y(pmax) + 14, p.X(qs) + 2, p.Y(pmax) + 14, "ln", 6)
    p.lab(5, pmax, "eccesso di domanda", 0, 30, "middle", "tm")
    return p.render("Prezzo massimo sotto l'equilibrio: quantità scambiata più bassa e perdita secca"), (
        "Prezzo massimo sotto l'equilibrio: si scambia la quantità offerta Qₒ, più bassa di quella di "
        "equilibrio Q*. Il triangolo grigio è la perdita secca per offerta insufficiente; fra Qₒ e Qᵈ "
        "c'è eccesso di domanda (code e mercato nero).")


def curve_costi():
    """Costo totale C(Q) = F + aQ − bQ² + cQ³: restituisce CVMe, CMa, CMe e i due minimi."""
    F, a, b, c = 20.0, 12.0, 3.0, 0.3
    cvme = lambda q: a - b * q + c * q * q  # noqa: E731
    cma = lambda q: a - 2 * b * q + 3 * c * q * q  # noqa: E731
    cme = lambda q: F / q + cvme(q)  # noqa: E731
    q_cv = b / (2 * c)  # minimo del CVMe
    q_ce = _solve(lambda q: -F / (q * q) - b + 2 * c * q, 1, 9)  # minimo del CMe
    return cvme, cma, cme, q_cv, q_ce


def fig_costi():
    p = Plot(xr=(0, 9.5), yr=(0, 14))
    cvme, cma, cme, q_cv, q_ce = curve_costi()
    p.axes("Q", "costi")
    p.fn(cvme, 0.3, 8.6, "c3")
    p.fn(cme, 1.5, 8.6, "c2")
    p.fn(cma, 0.3, 8.6, "c1")
    p.guide(q_cv, cvme(q_cv), None, None)
    p.guide(q_ce, cme(q_ce), None, None)
    p.pt(q_cv, cvme(q_cv), "chiusura", 6, 16)
    p.pt(q_ce, cme(q_ce), "pareggio", -8, -8, "end")
    p.lab(8.6, cvme(8.6), "CVMe", 5, 4)
    p.lab(8.6, cme(8.6), "CMe", 5, 4)
    qtop = _solve(lambda q: cma(q) - 13.6, 4, 9)
    p.lab(qtop, 13.6, "CMa", 6, 4)
    return p.render("Il costo marginale taglia costo medio variabile e costo medio nel loro minimo"), (
        "Il costo marginale (CMa) taglia il costo medio variabile (CVMe) e il costo medio (CMe) nel loro "
        "punto di minimo: il minimo del CVMe è il punto di chiusura, il minimo del CMe il punto di pareggio.")


def fig_islm():
    p = Plot(xr=(0, 10), yr=(0, 10))
    LM = lambda y: 1 + 0.8 * y  # noqa: E731
    IS = lambda y: 9 - y  # noqa: E731
    IS2 = lambda y: 11.5 - y  # noqa: E731
    y0 = 8 / 1.8
    y1 = 10.5 / 1.8
    i0, i1 = LM(y0), LM(y1)
    y_noc = 11.5 - i0  # reddito con il tasso fermo a i0
    p.axes("Y", "i")
    p.fn(LM, 0, 9, "c1")
    p.fn(IS, 0.8, 8.6, "c2 dash")
    p.fn(IS2, 2, 9.8, "c2")
    p.guide(y0, i0, "Y₀", "i₀")
    p.guide(y1, i1, "Y₁", "i₁")
    p.line(p.X(y1), p.Y(i0), p.X(y_noc), p.Y(i0), "gd")
    p.circle(p.X(y_noc), p.Y(i0), 3, "pto")
    p.pt(y0, i0, "E₀", -8, 4, "end")
    p.pt(y1, i1, "E₁", -4, -9, "end")
    p.arrow(p.X(1.6), p.Y(IS(1.6)), p.X(3.6), p.Y(IS(1.6)), "ln", 6)
    p.lab(9, LM(9), "LM", 4, 4)
    p.lab(8.6, IS(8.6), "IS", 4, 4)
    p.lab(9.8, IS2(9.8), "IS′", 4, 4)
    p.lab((y1 + y_noc) / 2, i0, "spiazzamento", 0, 16, "middle", "tm")
    return p.render("Politica fiscale espansiva nel modello IS-LM"), (
        "Politica fiscale espansiva: la IS si sposta a destra (IS′), salgono reddito (Y₀ → Y₁) e tasso "
        "(i₀ → i₁). Il tasso più alto riduce gli investimenti privati: è l'effetto spiazzamento, la "
        "distanza fra Y₁ e il reddito che si avrebbe con il tasso fermo a i₀.")


def fig_casi_limite():
    s = Svg(360, 220)
    out = []
    for k, (title, vertical) in enumerate((("LM verticale", True), ("LM orizzontale", False))):
        p = Plot(360, 220, xr=(0, 10), yr=(0, 10))
        left = 30 + k * 180
        p.frame(left, left + 140, 30, 186)
        p.axes("Y", "i")
        IS = lambda y: 8 - y  # noqa: E731
        IS2 = lambda y: 11 - y  # noqa: E731
        if vertical:
            p.seg(5, 0.6, 5, 9.4, "c1")
            p.lab(5, 9.4, "LM", 4, 4)
            e0, e1 = (5, IS(5)), (5, IS2(5))
        else:
            p.seg(0.3, 3, 9.4, 3, "c1")
            p.lab(0.3, 3, "LM", 2, -7, "start")
            e0, e1 = (5, 3), (8, 3)
        p.fn(IS, 0.5, 7.6, "c2 dash")
        p.fn(IS2, 1.6, 9.6, "c2")
        p.guide(e0[0], e0[1], "Y₀" if not vertical else "Y₀ = Y₁")
        if not vertical:
            p.guide(e1[0], e1[1], "Y₁")
        p.pt(*e0)
        p.pt(*e1)
        p.text(left + 70, 16, title, "middle", "tb")
        s.el.extend(p.el)
    return s.render("Casi limite della politica fiscale con LM verticale e orizzontale"), (
        "Politica fiscale espansiva nei casi limite. Con LM verticale la IS si sposta ma il reddito non "
        "cambia: sale solo il tasso, spiazzamento totale. Con LM orizzontale (trappola della liquidità) "
        "il reddito sale a tasso invariato: nessuno spiazzamento, politica fiscale massimamente efficace.")


def fig_adas():
    s = Svg(360, 230)
    panels = (("Shock di domanda", "AD"), ("Shock di offerta negativo", "AS"))
    for k, (title, moves) in enumerate(panels):
        p = Plot(360, 230, xr=(0, 10), yr=(0, 10))
        left = 30 + k * 180
        p.frame(left, left + 140, 32, 192)
        p.axes("Y", "P")
        AS = lambda y: 1.5 + 0.7 * y  # noqa: E731
        AD = lambda y: 9 - 0.8 * y  # noqa: E731
        if moves == "AD":
            AD2 = lambda y: 11 - 0.8 * y  # noqa: E731
            p.fn(AS, 0, 9.5, "c1")
            p.fn(AD, 0.5, 9.5, "c2 dash")
            p.fn(AD2, 2.2, 9.8, "c2")
            p.lab(9.5, AS(9.5), "AS", -2, -6, "end")
            p.lab(9.8, AD2(9.8), "AD′", 3, 4)
            y0 = 7.5 / 1.5
            y1 = 9.5 / 1.5
            e0, e1 = (y0, AS(y0)), (y1, AS(y1))
        else:
            AS2 = lambda y: 3.9 + 0.7 * y  # noqa: E731
            p.fn(AS, 0, 9.5, "c1 dash")
            p.fn(AS2, 0, 8.6, "c1")
            p.fn(AD, 0.5, 9.5, "c2")
            p.lab(8.6, AS2(8.6), "AS′", 3, 2)
            p.lab(9.5, AD(9.5), "AD", 3, 4)
            y0 = 7.5 / 1.5
            y1 = 5.1 / 1.5
            e0, e1 = (y0, AS(y0)), (y1, AS2(y1))
        p.guide(e0[0], e0[1], "Y₀", "P₀")
        p.guide(e1[0], e1[1], "Y₁", "P₁")
        p.pt(*e0)
        p.pt(*e1)
        p.text(left + 70, 16, title, "middle", "tb")
        s.el.extend(p.el)
    return s.render("Modello AD-AS: shock di domanda e shock di offerta"), (
        "Shock di domanda: prezzi e prodotto si muovono nello stesso verso (P e Y salgono). Shock di "
        "offerta negativo: si muovono in verso opposto, prezzi su e prodotto giù: è la stagflazione.")


def fig_phillips():
    p = Plot(xr=(0, 10), yr=(0, 10))
    un = 5.0
    sr = lambda u: 0.6 + 14 / (u + 0.6) - 14 / (un + 0.6) + 3  # noqa: E731
    p.axes("disoccupazione", "inflazione")
    p.seg(un, 0.4, un, 9.6, "c1")
    p.fn(sr, 0.9, 9.6, "c2")
    p.text(p.X(un), p.B + 15, "tasso naturale", "middle", "tm")
    p.lab(un, 9.6, "lungo periodo", 6, 10)
    p.lab(9.6, sr(9.6), "breve periodo", 0, -10, "end")
    return p.render("Curva di Phillips di breve e di lungo periodo"), (
        "Curva di Phillips: nel breve periodo relazione inversa fra disoccupazione e inflazione; con le "
        "aspettative (Friedman e Phelps) nel lungo periodo è verticale al tasso naturale di disoccupazione "
        "(NAIRU): nessun trade-off permanente.")


def fig_laffer():
    p = Plot(xr=(0, 100), yr=(0, 10))
    g = lambda t: 27 * (t / 100) * (1 - t / 100) ** 0.7  # noqa: E731
    tmax = 100 / 1.7
    p.axes("aliquota", "gettito")
    p.fn(g, 0, 95, "c1")
    p.line(p.X(tmax), p.Y(g(tmax)), p.X(tmax), p.B, "gd")
    p.pt(tmax, g(tmax), "massimo", 0, -10, "middle")
    p.text(p.L, p.B + 15, "0", "middle", "tm")
    p.text(p.X(tmax), p.B + 15, "?", "middle", "tm")
    return p.render("Curva di Laffer: gettito e aliquota"), (
        "Curva di Laffer: con aliquota zero il gettito è nullo; cresce con l'aliquota fino a un massimo "
        "e poi scende (forma a U rovesciata). Non dice dove si trovi il massimo: da sola non dimostra "
        "che tagliare le aliquote aumenti il gettito.")


def fig_consumatore():
    p = Plot(xr=(0, 10), yr=(0, 10))
    M = 8.0
    p.axes("x₁", "x₂")
    p.fn(lambda x: M - x, 0, M, "c1")
    for u, cls, lab, x0 in ((9, "c2 dash", None, 2.0), (16, "c2", "U₂", 2.2), (25, "c2 dash", "U₃", 3.0)):
        p.fn(lambda x, u=u: u / x, x0, 10, cls)
        if lab:
            p.lab(10, u / 10, lab, 2, -6, "end")
    p.pt(4, 4, "ottimo: SMS = p₁/p₂", 8, -6)
    p.guide(4, 4, "x₁*", "x₂*")
    p.lab(0.4, 5.7, "retta di\nbilancio", 0, 0, "start", "tm")
    return p.render("Ottimo del consumatore: tangenza fra curva di indifferenza e retta di bilancio"), (
        "Ottimo del consumatore: la curva di indifferenza più alta raggiungibile (U₂) è tangente alla "
        "retta di bilancio; lì il saggio marginale di sostituzione è uguale al rapporto fra i prezzi "
        "(SMS = p₁/p₂). U₃ darebbe più utilità ma costa più del reddito.")


def fig_monopolio():
    p = Plot(xr=(0, 10), yr=(0, 10))
    D = lambda q: 10 - q  # noqa: E731
    RMa = lambda q: 10 - 2 * q  # noqa: E731
    cma, qm, qc = 2.0, 4.0, 8.0
    p.area([(qm, D(qm)), (qm, cma), (qc, cma)])
    p.axes("Q", "P")
    p.fn(D, 0, 9.6, "c1")
    p.fn(RMa, 0, 4.9, "c3")
    p.seg(0, cma, 9.6, cma, "c2")
    p.guide(qm, D(qm), "Qₘ", "Pₘ")
    p.line(p.X(qm), p.Y(cma), p.X(qm), p.B, "gd")
    p.line(p.X(qc), p.Y(cma), p.X(qc), p.B, "gd")
    p.text(p.X(qc), p.B + 15, "Q conc.", "middle", "tm")
    p.pt(qm, D(qm), None)
    p.pt(qm, cma, None)
    p.lab(9.6, D(9.6), "D", 3, -4)
    p.lab(2.6, RMa(2.6), "RMa", -8, 4, "end")
    p.lab(9.6, cma, "CMa", 0, -6, "end")
    p.lab(4.3, 3.6, "perdita\nsecca", 0, 0, "start", "tm")
    return p.render("Monopolio: ricavo marginale uguale a costo marginale e perdita secca"), (
        "Monopolio: si produce dove ricavo marginale = CMa (Qₘ) e il prezzo si legge sulla domanda "
        "(Pₘ > CMa). Rispetto alla concorrenza perfetta (P = CMa) la quantità è più bassa, il prezzo "
        "più alto e nasce una perdita secca. Nel disegno il CMa è costante, per semplicità.")


# ------------------------------------------------------------------ schemi


def _box(s, x, y, w, h, label, cls="bx", tcls="tb", size=None):
    s.rect(x, y, w, h, cls)
    n = label.count("\n") + 1
    s.text(x + w / 2, y + h / 2 + 4 - (n - 1) * 7.5, label, "middle", tcls)


def matrix(rows, cols, cells, row_title, col_title, aria):
    """Matrice 2×2: rows/cols = etichette, cells[r][c] = testo della cella."""
    s = Svg(360, 236)
    x0, y0, cw, ch = 112, 50, 118, 82
    s.text(x0 + cw, 16, col_title, "middle", "tm")
    for c, lab in enumerate(cols):
        s.text(x0 + cw * c + cw / 2, 40, lab, "middle", "tb")
    s.text(14, y0 + ch, row_title, "start", "tm")
    for r, lab in enumerate(rows):
        s.text(104, y0 + ch * r + ch / 2 + 4, lab, "end", "tb")
        for c in range(2):
            _box(s, x0 + cw * c + 3, y0 + ch * r + 3, cw - 6, ch - 6, cells[r][c], "bx", "")
    return s.render(aria)


def fig_procedimento():
    s = Svg(360, 360)
    steps = (("Avvio", "comunicazione di avvio\n(art. 7): oggetto, responsabile,\ndata di conclusione"),
             ("Istruttoria", "pareri 20 gg · conferenza di\nservizi 30/60 gg · sospensione\nuna volta, max 30 gg"),
             ("Decisione", "provvedimento espresso\ne motivato · preavviso di\nrigetto 10 gg (istanza di parte)"),
             ("Integrazione\ndell'efficacia", "atti limitativi: efficaci con\nla comunicazione"))
    y = 12
    for k, (name, note) in enumerate(steps):
        _box(s, 10, y, 118, 58, name, "bx acc")
        s.text(142, y + 17, note, "start", "")
        if k < len(steps) - 1:
            s.arrow(69, y + 58, 69, y + 76, "ln", 6)
        y += 78
    s.rect(10, y + 2, 340, 34, "band", 8)
    s.text(180, y + 24, "termine: 30 gg · fino a 90 · fino a 180", "middle", "tb")
    return s.render("Le fasi del procedimento amministrativo con i termini"), (
        "Il procedimento: avvio → istruttoria → decisione → integrazione dell'efficacia, con i termini "
        "da ricordare (L. 241/1990). Il termine decorre dall'avvio d'ufficio o dal ricevimento della domanda.")


def fig_termini():
    s = Svg(360, 430)
    top, k = 24, 1.04
    Y = lambda d: top + d * k  # noqa: E731
    s.arrow(60, top, 60, Y(365) + 12, "ax", 6)
    s.text(72, top + 4, "giorni", "start", "tm")
    marks = ((30, "30 gg", "accesso · appalti · riassunzione"),
             (60, "60 gg", "annullamento · appello (dalla notifica)"),
             (120, "120 gg", "risarcimento"),
             (180, "180 gg", "nullità · appello senza notifica: 6 mesi"),
             (365, "1 anno", "azione contro il silenzio (al massimo)"))
    s.circle(60, top, 4, "pto")
    s.text(48, top + 4, "0", "end", "tm")
    for d, lab, what in marks:
        s.line(52, Y(d), 68, Y(d), "c1")
        s.text(48, Y(d) + 4, lab, "end", "tb")
        s.text(78, Y(d) + 4, what, "start", "")
    return s.render("Termini delle azioni davanti al giudice amministrativo, in scala"), (
        "I termini del processo amministrativo in scala (giorni dalla notifica, comunicazione o piena "
        "conoscenza). L'ottemperanza, entro la prescrizione decennale, resta fuori scala.")


def fig_fonti():
    s = Svg(360, 232)
    levels = (("Costituzione e\nleggi costituzionali", 170, 44, "lv0", "tb"),
              ("Fonti primarie\nlegge · d.l. · d.lgs. · leggi regionali\nregolamenti parlamentari · referendum", 250, 60, "lv1", "sm"),
              ("Fonti secondarie: regolamenti\n(Governo, ministri, Regioni, enti locali)", 258, 46, "lv2", "sm"),
              ("Consuetudini", 258, 34, "lv3", ""))
    cx, y = 133, 8
    for text, w, h, cls, tcls in levels:
        s.rect(cx - w / 2, y, w, h, cls, 6)
        n = text.count("\n")
        lh = 6.9 if "sm" in tcls else 7.5
        s.text(cx, y + h / 2 + 4 - n * lh, text, "middle", tcls)
        y += h + 6
    _box(s, 272, 54, 82, 70, "Diritto\ndell'Unione\n(a parte)", "bx acc")
    s.arrow(272, 88, cx + 125 + 2, 88, "ln", 6)
    s.text(313, 142, "primato", "middle", "tb")
    return s.render("La scala delle fonti del diritto e il diritto dell'Unione a parte"), (
        "La scala delle fonti: in cima Costituzione e leggi costituzionali, poi le fonti primarie, le "
        "secondarie e le consuetudini. Il diritto dell'Unione si colloca a parte, con il primato.")


def fig_revisione():
    s = Svg(360, 330)
    _box(s, 40, 8, 280, 44, "1ª deliberazione di ciascuna Camera", "bx acc")
    s.arrow(180, 52, 180, 84, "ln", 6)
    s.text(188, 72, "almeno 3 mesi", "start", "tm")
    _box(s, 40, 86, 280, 48, "2ª deliberazione:\nmaggioranza assoluta dei componenti", "bx acc")
    s.arrow(130, 134, 92, 168, "ln", 6)
    s.arrow(230, 134, 268, 168, "ln", 6)
    _box(s, 8, 170, 168, 66, "2/3 in entrambe\nle Camere:\nniente referendum", "bx")
    _box(s, 184, 170, 168, 66, "meno dei 2/3:\nreferendum possibile", "bx")
    s.text(268, 256, "lo chiedono entro 3 mesi\n1/5 di una Camera,\n500.000 elettori o\n5 Consigli regionali", "middle", "")
    s.text(92, 256, "la legge è\npromulgata", "middle", "")
    s.text(268, 322, "senza quorum", "middle", "tb")
    return s.render("Il procedimento di revisione costituzionale"), (
        "Revisione costituzionale (art. 138): due deliberazioni per Camera a distanza di almeno tre mesi, "
        "maggioranza assoluta nella seconda. Con i due terzi non si fa referendum; altrimenti può essere "
        "chiesto, e vale senza quorum.")


def fig_mintzberg():
    s = Svg(360, 250)
    s.add('<ellipse class="ide" cx="180" cy="124" rx="174" ry="118"/>')
    s.text(180, 20, "ideologia (cultura)", "middle", "tm")
    _box(s, 128, 30, 104, 40, "vertice\nstrategico", "bx acc")
    _box(s, 150, 76, 60, 64, "linea\nintermedia", "bx")
    _box(s, 96, 146, 168, 50, "nucleo operativo", "bx acc")
    _box(s, 26, 80, 112, 50, "tecnostruttura", "bx")
    _box(s, 222, 80, 112, 50, "staff di\nsupporto", "bx")
    return s.render("Le cinque parti dell'organizzazione secondo Mintzberg"), (
        "Le cinque parti di Mintzberg: vertice strategico, linea intermedia, nucleo operativo; ai lati "
        "la tecnostruttura (standardizza il lavoro altrui) e lo staff di supporto (servizi indiretti); "
        "intorno l'ideologia, cioè la cultura.")


def fig_maslow():
    s = Svg(360, 258)
    layers = ("fisiologici", "sicurezza", "appartenenza", "stima", "autorealizzazione")
    h, base, cx = 40, 250, 160
    for i, lab in enumerate(layers):
        w = 300 - i * 40
        y = base - (i + 1) * (h + 4)
        s.rect(cx - w / 2, y, w, h, "lv%d" % min(i, 3), 6)
        s.text(cx, y + h / 2 + 4, lab, "middle", "tb")
    s.arrow(334, 244, 334, 32, "ln", 6)
    s.text(346, 20, "ordine ascendente", "end", "tm")
    return s.render("La scala dei bisogni di Maslow"), (
        "La scala di Maslow, in ordine ascendente: fisiologici → sicurezza → appartenenza → stima → "
        "autorealizzazione. Un bisogno superiore si attiva quando l'inferiore è ragionevolmente soddisfatto.")


def fig_kingdon():
    s = Svg(360, 210)
    streams = (("problemi", 30), ("politiche (soluzioni)", 90), ("politica (clima, elezioni)", 150))
    for lab, y in streams:
        s.add('<path class="c1 str" d="M 8 %d C 120 %d, 160 %d, 236 105"/>' % (y, y, y))
        s.text(12, y + 20 if y > 105 else y - 8, lab, "start", "")
    s.polygon([(236, 105), (228, 97), (229, 113)], "ah")
    _box(s, 240, 74, 114, 62, "finestra di\nopportunità", "bx acc")
    s.text(297, 160, "la sfrutta\nl'imprenditore\ndi policy", "middle", "tm")
    return s.render("I flussi multipli di Kingdon convergono nella finestra di opportunità"), (
        "Flussi multipli (Kingdon, 1984): quando il flusso dei problemi, delle politiche e della politica "
        "convergono si apre una finestra di opportunità, che l'imprenditore di policy sfrutta.")


def fig_catena():
    s = Svg(360, 200)
    names = ("Input", "Attività", "Output", "Risultato", "Impatto")
    w, gap, y = 62, 7, 70
    xs = [6 + i * (w + gap) for i in range(5)]
    for i, (x, n) in enumerate(zip(xs, names)):
        _box(s, x, y, w, 40, n, "bx acc" if n in ("Output", "Risultato") else "bx", "tb sm")
        if i < 4:
            s.arrow(x + w, y + 20, x + w + gap, y + 20, "ln", 5)
    # efficienza: output / input
    s.add('<path class="ln" d="M %s %s V %s H %s V %s"/>' % (xs[0] + w / 2, y, y - 16, xs[2] + w / 2, y))
    s.text((xs[0] + xs[2]) / 2 + w / 2, y - 22, "efficienza = output / input", "middle", "tb")
    # efficacia: risultati / obiettivi
    _box(s, xs[3] - 4, 150, w + 8, 34, "obiettivi", "bx dashb", "")
    s.line(xs[3] + w / 2, y + 40, xs[3] + w / 2, 150, "ln dash")
    s.text(xs[3] - 10, 140, "efficacia =\nrisultati / obiettivi", "end", "tb")
    s.arrow(xs[4] + w / 2, 150, xs[4] + w / 2, y + 42, "ln", 6)
    s.text(xs[4] + w / 2, 166, "fattori\nesterni", "middle", "tm")
    return s.render("La catena del valore di una politica pubblica"), (
        "La catena del valore: input → attività → output → risultati → impatto. Efficienza = output / "
        "input; efficacia = risultati / obiettivi. L'impatto è il più esposto a fattori esterni.")


def fig_fasi_bilancio():
    s = Svg(360, 220)
    rows = (("Entrata", ("accertamento", "riscossione", "versamento"), "residui attivi: accertate e non\nriscosse, o riscosse e non versate"),
            ("Spesa", ("impegno", "liquidazione", "ordinazione", "pagamento"), "residui passivi: impegnate\ne non pagate"))
    y = 22
    for title, steps, note in rows:
        s.text(6, y - 6, title, "start", "tb")
        n = len(steps)
        w = (348 - (n - 1) * 8) / n
        for i, st in enumerate(steps):
            x = 6 + i * (w + 8)
            _box(s, x, y, w, 36, st, "bx acc" if i == 0 else "bx", "")
            if i < n - 1:
                s.arrow(x + w, y + 18, x + w + 8, y + 18, "ln", 5)
        x1, x2 = 6 + w / 2, 6 + (n - 1) * (w + 8) + w / 2
        s.add('<path class="ln" d="M %s %s V %s H %s V %s"/>' % (_f(x1), y + 36, y + 46, _f(x2), y + 36))
        s.text(180, y + 62, note, "middle", "tm")
        y += 110
    return s.render("Le fasi dell'entrata e della spesa e i residui"), (
        "Le fasi dell'entrata (accertamento, riscossione, versamento) e della spesa (impegno, liquidazione, "
        "ordinazione, pagamento). Ciò che a fine anno è avviato e non concluso diventa residuo.")


# ------------------------------------------------------------------ registro e aggancio

def _mx_beni():
    return matrix(["rivale", "non rivale"], ["escludibile", "non escludibile"],
                  [["bene privato", "risorsa comune"], ["bene di club", "bene pubblico\npuro"]],
                  "", "", "Beni: rivalità ed escludibilità")


FIGURES = [
    # (codice scheda, tipo di aggancio, testo dell'aggancio, funzione)
    ("E1", "after_point", "Ottimo: tangenza", fig_consumatore),
    ("E1", "after_point", "Prezzo massimo sotto l'equilibrio", fig_prezzo_massimo),
    ("E2", "after_point", "La regola: il CMa taglia", fig_costi),
    ("E2", "after_table", "Monopolio", fig_monopolio),
    ("E3", "after_point", "Curva di Phillips", fig_phillips),
    ("PE1", "after_table", "Rivale", lambda: (_mx_beni(), (
        "Rivalità ed escludibilità: il mercato funziona per il bene privato; la risorsa comune rischia il "
        "sovrasfruttamento; il bene pubblico puro soffre di free riding e offerta insufficiente."))),
    ("PE2", "after_point", "Curva di Laffer", fig_laffer),
    ("PE3", "after_point", "Politica fiscale espansiva (più spesa", fig_islm),
    ("PE3", "after_table", "LM orizzontale", fig_casi_limite),
    ("PE3", "after_point", "Shock di offerta", fig_adas),
    ("D4", "after_box", "inbreve", fig_procedimento),
    ("D10", "after_table", "Annullamento (art. 29)", fig_termini),
    ("C1", "after_point", "Il diritto dell'Unione si colloca a parte", fig_fonti),
    ("C3", "after_point", "Referendum: se nella seconda votazione", fig_revisione),
    ("M2", "after_point", "A queste si aggiunge l'ideologia", fig_mintzberg),
    ("M3", "after_table", "fisiologici → sicurezza", fig_maslow),
    ("P2", "after_table", "clientelare", lambda: (matrix(
        ["concentrati", "diffusi"], ["concentrati", "diffusi"],
        [["dei gruppi\ndi interesse", "clientelare"], ["imprenditoriale", "maggioritaria"]],
        "benefici", "costi", "Tipologia di Wilson: costi e benefici concentrati o diffusi"), (
        "Wilson: la politica dipende da come si distribuiscono costi e benefici. Con benefici concentrati "
        "e costi diffusi è clientelare; con benefici diffusi e costi concentrati serve un imprenditore di policy."))),
    ("P3", "after_point", "Flussi multipli (Kingdon", fig_kingdon),
    ("P3", "after_table", "calcolo tecnico", lambda: (matrix(
        ["condivisi", "in conflitto"], ["certi", "incerti"],
        [["calcolo tecnico", "giudizio\n(voto fra esperti)"], ["compromesso\n(negoziazione)", "ispirazione,\npiccoli passi"]],
        "fini", "mezzi", "Thompson e Tuden: quale modello decisionale secondo fini e mezzi"), (
        "Thompson e Tuden: con fini condivisi e mezzi certi basta il calcolo tecnico; con fini e mezzi "
        "incerti o in conflitto si procede per ispirazione o per piccoli passi."))),
    ("P4", "after_point", "Matland (1995)", lambda: (matrix(
        ["bassa", "alta"], ["basso", "alto"],
        [["amministrativa", "politica"], ["sperimentale", "simbolica"]],
        "ambiguità", "conflitto", "Matland: ambiguità e conflitto nell'attuazione"), (
        "Matland incrocia ambiguità e conflitto: attuazione amministrativa, politica, sperimentale o simbolica."))),
    ("P5", "after_h", "1. La catena del valore", fig_catena),
    ("A3", "after_table", "accertamento", fig_fasi_bilancio),
]


def _plain(b):
    if b["t"] == "row":
        return md_plain(re.sub(r"<[^>]+>", "", b.get("q", "") + " " + " ".join(x for r in b.get("a", []) for x in r)))
    return md_plain(re.sub(r"<[^>]+>", "", b.get("h", "")))


def _insert(blocks, kind, needle, fig):
    """Inserisce la figura nella lista di blocchi (anche dentro i riquadri). True se trovata."""
    for i, b in enumerate(blocks):
        hit = False
        if kind == "after_h" and b["t"] == "h":
            hit = _plain(b).startswith(needle)
        elif kind == "after_point" and b["t"] in ("p", "li"):
            hit = needle in _plain(b)
        elif kind == "after_table" and b["t"] == "table":
            hit = any(needle in _plain(r) for r in b["rows"])
        elif kind == "after_box" and b["t"] == "box":
            hit = b["k"] == needle
        if hit:
            blocks.insert(i + 1, fig)
            return True
        if b["t"] == "box" and _insert(b["b"], kind, needle, fig):
            return True
    return False


def attach(volumes):
    """Aggancia le figure alle schede. Restituisce [(codice, didascalia breve)]; errore se un aggancio manca."""
    by_code = {sc["code"]: sc for v in volumes for sc in v["schede"] if sc["code"]}
    placed, missing = [], []
    for code, kind, needle, make in FIGURES:
        sc = by_code.get(code)
        if sc is None:
            continue  # volume non presente fra i materiali
        svg, cap = make()
        fig = {"t": "fig", "svg": svg, "cap": cap}
        if _insert(sc["b"], kind, needle, fig):
            placed.append((code, cap.split(":")[0]))
        else:
            missing.append("%s: %s «%s»" % (code, kind, needle))
    if missing:
        raise RuntimeError("Figure senza aggancio (il testo è cambiato?):\n  " + "\n  ".join(missing))
    return placed
