#!/usr/bin/env python3
"""Genera dist/ripasso-sna12.html dai file Markdown in materiali/.

Uso:
    python3 build.py              # report sintetico + build
    python3 build.py --report     # report dettagliato con esempi, poi build
    python3 build.py --materiali altra/cartella --out altro.html
    python3 build.py --artifact   # versione da pubblicare come pagina ospitata

Solo libreria standard. Non modifica i file in materiali/.
"""

import argparse
import datetime
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from sna12.ripassi import parse_ripasso  # noqa: E402
from sna12.quesiti import EXPECTED, parse_quesiti_dir  # noqa: E402
from sna12.simulazioni import parse_simulazioni_dir  # noqa: E402


def collect(materiali):
    ripassi = [parse_ripasso(p) for p in sorted(glob.glob(os.path.join(materiali, "RIPASSO_*.md")))]
    quiz = parse_quesiti_dir(materiali)
    sims = parse_simulazioni_dir(materiali)
    return ripassi, quiz, sims


def build_data(ripassi, quiz, sims):
    volumes, schede, cards = [], [], []
    for r in ripassi:
        volumes.append({"vol": r["vol"], "title": r["title"], "file": r["file"]})
        for sc in r["schede"]:
            schede.append(dict(sc, vol=r["vol"]))
        for c in r["cards"]:
            c = {k: v for k, v in c.items() if v not in (None, "", False, [])}
            cards.append(c)
    data = {
        "generated": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
        "volumes": volumes,
        "schede": schede,
        "cards": cards,
        "quiz": None,
        "sims": [],
    }
    if quiz and quiz["questions"]:
        data["quiz"] = {
            "questions": quiz["questions"],
            "brani": quiz["brani"],
        }
    if sims:
        data["sims"] = [s for s in sims if s["questions"]]
    return data


def to_fragment(page):
    """Versione per pagina ospitata: niente <html>/<head>/<body>, solo titolo, stile e contenuto."""
    title = re.search(r"<title>.*?</title>", page, re.S).group(0)
    style = re.search(r"<style>.*?</style>", page, re.S).group(0)
    body = re.search(r"<body>(.*)</body>", page, re.S).group(1)
    return "%s\n%s\n%s" % (title, style, body.strip())


def render_html(data):
    src = os.path.join(HERE, "src")
    with open(os.path.join(src, "app.html"), encoding="utf-8") as f:
        tpl = f.read()
    with open(os.path.join(src, "app.css"), encoding="utf-8") as f:
        css = f.read()
    with open(os.path.join(src, "scoring.js"), encoding="utf-8") as f:
        scoring = f.read()
    with open(os.path.join(src, "app.js"), encoding="utf-8") as f:
        js = f.read()
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    blob = blob.replace("</", "<\\/").replace("<!--", "<\\!--")
    out = tpl.replace("/*__CSS__*/", css)
    out = out.replace("/*__DATA__*/", blob)
    out = out.replace("/*__JS__*/", scoring + "\n" + js)
    return out


# ---------------------------------------------------------------- report

def _strip_html(h):
    h = re.sub(r'<b class="lac" data-i="\d+">(.*?)</b>', r"[\1]", h)
    h = re.sub(r"<[^>]+>", "", h)
    return h.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")


def _card_line(c):
    if c["type"] == "tabella":
        q = (_strip_html(c["qLabel"]) + ": " if c.get("qLabel") else "") + _strip_html(c["q"])
        a = " · ".join("%s = %s" % (_strip_html(h), _strip_html(v)) for h, v in c["a"])
        return "D: %s  →  R: %s" % (q, a)
    return _strip_html(c["html"])


def report(ripassi, quiz, sims, verbose):
    lines = []
    w = lines.append
    w("=" * 78)
    w("REPORT DEL PARSER")
    w("=" * 78)
    w("")
    w("A. Ripassi di teoria → flashcard")
    w("-" * 78)
    tot = 0
    w("%-36s %6s %6s %6s %6s %6s %6s %5s" % ("file", "breve", "trapp", "tabel", "dettag", "totale", "novità", "num."))
    for r in ripassi:
        cnt = {}
        for c in r["cards"]:
            cnt[c["type"]] = cnt.get(c["type"], 0) + 1
        n = len(r["cards"])
        tot += n
        w("%-36s %6d %6d %6d %6d %6d %6d %5d" % (
            r["file"][:36], cnt.get("inbreve", 0), cnt.get("trappola", 0), cnt.get("tabella", 0),
            cnt.get("dettaglio", 0), n, sum(1 for c in r["cards"] if c.get("nov")),
            sum(1 for c in r["cards"] if c.get("numeri"))))
        st = r["stats"]
        notes = []
        if st.get("senza_grassetti"):
            notes.append("%d punti senza grassetti (nessuna lacuna possibile: esclusi)" % st["senza_grassetti"])
        if st.get("righe_saltate"):
            notes.append("%d righe di tabella vuote o poco informative saltate" % st["righe_saltate"])
        if notes:
            w("    esclusi: " + "; ".join(notes))
    w("%-36s %41d" % ("TOTALE CARTE", tot))
    if verbose:
        all_cards = [c for r in ripassi for c in r["cards"]]
        for t, label in (("inbreve", "In breve"), ("trappola", "Da non confondere"), ("tabella", "Tabella"),
                         ("dettaglio", "Dettaglio di nicchia (vol. 5)")):
            ex = [c for c in all_cards if c["type"] == t]
            if not ex:
                continue
            picks = [ex[len(ex) // 7], ex[(len(ex) * 4) // 7]]
            w("")
            w("  Esempi «%s» (lacune fra [ ]):" % label)
            for c in picks:
                w("   • [%s] %s" % (c["schedaKey"].split(":", 1)[1], _card_line(c)[:300]))
        ex = [c for c in all_cards if c.get("numeri")]
        if ex:
            w("")
            w("  Esempi «tabelle dei numeri»:")
            for c in (ex[3], ex[-5]):
                w("   • %s" % _card_line(c)[:300])
        ex = [c for c in all_cards if c.get("nov")]
        if ex:
            w("")
            w("  Esempi NOVITÀ:")
            for c in (ex[0], ex[len(ex) // 2]):
                w("   • %s" % _card_line(c)[:300])
    w("")
    w("B. Quesiti d'archivio → quiz")
    w("-" * 78)
    if not quiz or not quiz["files"]:
        w("  Nessun file DOSSIER_* / ADDENDA* in materiali/: la funzione Quiz resta nascosta.")
    else:
        w("%-34s %7s %7s %7s %7s %7s %8s" % ("file", "trovati", "figur.", "vig. X", "no chiave", "usabili", "attesi"))
        for f in quiz["files"]:
            exp = EXPECTED.get(f["src"])
            exp_s = "" if exp is None else str(exp)
            ok = ""
            if exp is not None:
                ok = " ok" if f["found"] == exp else " ≠ !!"
            w("%-34s %7d %7d %7d %7d %7d %8s%s" % (
                f["file"][:34], f["found"], f["figurali"], f["vig_x"], f["no_key"], f["usable"], exp_s, ok))
        if verbose:
            qs = quiz["questions"]
            kinds = (
                ("scelta multipla", [q for q in qs if not q.get("rank")]),
                ("situazionali", [q for q in qs if q.get("rank")]),
                ("con brano", [q for q in qs if q.get("brano")]),
                ("vigenza A", [q for q in qs if q.get("vig") == "A"]),
                ("affidabilità media", [q for q in qs if q.get("lowRel")]),
            )
            for label, ex in kinds:
                if not ex:
                    continue
                w("")
                w("  Esempi %s:" % label)
                for q in ex[:1] + ex[-1:] if len(ex) > 1 else ex:
                    w("   • %s [%s] %s" % (q["id"], q["label"], _strip_html(q["text"])[:160]))
                    w("     opzioni %s · chiave %s%s" % (
                        "/".join(o["k"] for o in q["opts"]), q.get("key") or ">".join(q["rank"]),
                        " · neutra/peggiore non indicate" if q.get("rank") and len(q["rank"]) == 1 else ""))
    w("")
    w("C. Simulazioni → prova a tempo")
    w("-" * 78)
    if not sims:
        w("  Nessun file SIMULAZIONE_MISTA_* in materiali/: la funzione Simulazione resta nascosta.")
    else:
        for s in sims:
            qs = s["questions"]
            w("  %s: %d quesiti, %d chiavi, %d spiegazioni, %d codici, %d parti, %d figurali, %d Formez «F»" % (
                s["file"], len(qs), sum(1 for q in qs if q.get("key") or q.get("rank")),
                sum(1 for q in qs if q.get("expl")), sum(1 for q in qs if q.get("code")),
                len(s["parts"]), sum(1 for q in qs if q.get("fig")), sum(1 for q in qs if q.get("formez"))))
            for p in s["problems"]:
                w("    !! " + p)
    w("")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--materiali", default=os.path.join(HERE, "materiali"))
    ap.add_argument("--out", default=os.path.join(HERE, "dist", "ripasso-sna12.html"))
    ap.add_argument("--report", action="store_true", help="report dettagliato con esempi")
    ap.add_argument("--artifact", action="store_true",
                    help="scrive dist/ripasso-sna12-artifact.html, frammento per pagina ospitata (senza download di file)")
    args = ap.parse_args(argv)

    ripassi, quiz, sims = collect(args.materiali)
    print(report(ripassi, quiz, sims, args.report))
    data = build_data(ripassi, quiz, sims)
    if args.artifact:
        data["hosted"] = True
        if args.out == ap.get_default("out"):
            args.out = os.path.join(HERE, "dist", "ripasso-sna12-artifact.html")
    html = render_html(data)
    if args.artifact:
        html = to_fragment(html)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)
    print("Scritto %s (%d KB): %d carte, %d quesiti, %d simulazioni." % (
        os.path.relpath(args.out), len(html.encode("utf-8")) // 1024, len(data["cards"]),
        len(data["quiz"]["questions"]) if data["quiz"] else 0, len(data["sims"])))


if __name__ == "__main__":
    main()
