#!/usr/bin/env python3
"""Genera la pagina di rilettura dai ripassi in materiali/.

Uso:
    python3 build.py              # dist/ripasso-sna12.html, file unico da aprire con un doppio clic
    python3 build.py --artifact   # dist/ripasso-sna12-artifact.html, versione per la pagina su claude.ai
    python3 build.py --materiali altra/cartella --out altro.html

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

from sna12.ripassi import iter_points, parse_ripasso  # noqa: E402

# Volumi lasciati fuori di proposito.
ESCLUSI = ("RIPASSO_5_dettagli_di_nicchia.md",)


def collect(materiali):
    paths = sorted(glob.glob(os.path.join(materiali, "RIPASSO_*.md")))
    return [parse_ripasso(p) for p in paths if os.path.basename(p) not in ESCLUSI]


def build_data(volumes):
    return {
        "generated": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
        "volumes": [{"vol": v["vol"], "title": v["title"], "file": v["file"], "schede": v["schede"]}
                    for v in volumes],
    }


def render_html(data, hosted=False):
    src = os.path.join(HERE, "src")

    def read(name):
        with open(os.path.join(src, name), encoding="utf-8") as f:
            return f.read()

    blob = json.dumps(dict(data, hosted=hosted), ensure_ascii=False, separators=(",", ":"))
    blob = blob.replace("</", "<\\/").replace("<!--", "<\\!--")
    page = read("app.html").replace("/*__CSS__*/", read("app.css"))
    page = page.replace("/*__DATA__*/", blob).replace("/*__JS__*/", read("app.js"))
    if hosted:
        page = to_fragment(page)
    return page


def to_fragment(page):
    """Versione per pagina ospitata: niente <html>/<head>/<body>, solo titolo, stile e contenuto."""
    title = re.search(r"<title>.*?</title>", page, re.S).group(0)
    style = re.search(r"<style>.*?</style>", page, re.S).group(0)
    body = re.search(r"<body>(.*)</body>", page, re.S).group(1)
    return "%s\n%s\n%s" % (title, style, body.strip())


def report(volumes):
    lines = ["Volumi letti (esclusi: %s)" % ", ".join(ESCLUSI), ""]
    lines.append("%-36s %6s %6s %8s %8s %7s %6s" % ("file", "schede", "punti", "essenz.", "tabelle", "novità", "numeri"))
    tot = 0
    for v in volumes:
        pts = [p for sc in v["schede"] for p in iter_points(sc["b"])]
        tot += len(pts)
        lines.append("%-36s %6d %6d %8d %8d %7d %6d" % (
            v["file"][:36], len(v["schede"]), len(pts), sum(1 for p in pts if p.get("ess")),
            sum(1 for p in pts if p["t"] == "row"), sum(1 for p in pts if p.get("nov")),
            sum(1 for p in pts if p.get("num"))))
    lines.append("%-36s %13d" % ("TOTALE PUNTI", tot))
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--materiali", default=os.path.join(HERE, "materiali"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--artifact", action="store_true",
                    help="versione per la pagina su claude.ai (progressi salvati nell'account)")
    args = ap.parse_args(argv)

    volumes = collect(args.materiali)
    if not volumes:
        sys.exit("Nessun RIPASSO_*.md in %s" % args.materiali)
    print(report(volumes))
    out = args.out or os.path.join(HERE, "dist", "ripasso-sna12%s.html" % ("-artifact" if args.artifact else ""))
    page = render_html(build_data(volumes), hosted=args.artifact)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print("\nScritto %s (%d KB)" % (os.path.relpath(out), len(page.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
