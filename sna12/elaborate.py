"""Banca «Elaborate»: domande nuove, non d'archivio, sugli argomenti delle schede
non ancora usciti nelle preselettive SNA 9-11.

File in `elaborate/*.txt` (nel repository: contengono solo domande scritte per
questa app e i codici dei punti del ripasso su cui si basano, non il testo dei
materiali). Formato:

    @area diritto_amministrativo
    ## D4
    Q EL-D4-1
    T: testo della domanda
    A: opzione
    B: opzione
    C: opzione
    K: B
    F: id-punto, id-punto        (punti del ripasso che danno la risposta)
    S: spiegazione
    N: novità                    (facoltativo: argomento aggiornato al 2025-2026)

    U: id-punto = SNA10-B3-Q29, SNA9-B1-Q30   (punto già uscito in archivio)

Le righe che iniziano con uno spazio continuano il campo precedente; `#` a
inizio riga è un commento.
"""

import glob
import os
import re

FIELD = re.compile(r"^([A-Z]):\s?(.*)$")
COORD = re.compile(r"^SNA\d+-B\d-Q\d+$")


class ElaborateError(ValueError):
    pass


def parse_file(path):
    area, scheda = None, None
    questions, uscite = [], {}
    cur, last = None, None
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    for n, raw in enumerate(lines, start=1):
        where = "%s:%d" % (os.path.basename(path), n)
        if not raw.strip() or raw.startswith("#") and not raw.startswith("## "):
            continue
        if raw.startswith("@area "):
            area = raw[6:].strip()
            continue
        if raw.startswith("## "):
            scheda = raw[3:].strip()
            cur = None
            continue
        if raw.startswith("Q "):
            cur = {"id": raw[2:].strip(), "a": area, "t": scheda, "where": where}
            questions.append(cur)
            last = None
            continue
        if raw.startswith((" ", "\t")):
            if cur is None or last is None:
                raise ElaborateError("%s: riga di continuazione senza campo" % where)
            cur[last] += " " + raw.strip()
            continue
        m = FIELD.match(raw)
        if not m:
            raise ElaborateError("%s: riga non riconosciuta: %r" % (where, raw[:60]))
        key, val = m.group(1), m.group(2).strip()
        if key == "U":
            pid, _, coords = val.partition("=")
            uscite.setdefault(pid.strip(), []).extend(c.strip() for c in coords.split(",") if c.strip())
            continue
        if cur is None:
            raise ElaborateError("%s: campo %s fuori da una domanda" % (where, key))
        cur[key] = val
        last = key
    return questions, uscite


def load(folder, point_ids, schede_codes, areas):
    """Domande validate e mappa punto → coordinate d'archivio. Si ferma al primo errore."""
    questions, uscite = [], {}
    for path in sorted(glob.glob(os.path.join(folder, "*.txt"))):
        qs, us = parse_file(path)
        questions.extend(qs)
        for k, v in us.items():
            uscite.setdefault(k, []).extend(v)
    seen = set()
    out = []
    for q in questions:
        w = q["where"]
        if q["id"] in seen:
            raise ElaborateError("%s: id doppio %s" % (w, q["id"]))
        seen.add(q["id"])
        if q["a"] not in areas:
            raise ElaborateError("%s: area sconosciuta %r" % (w, q["a"]))
        if q["a"] != "inglese" and q["t"] not in schede_codes:
            raise ElaborateError("%s: scheda sconosciuta %r" % (w, q["t"]))
        opts = [[k, q[k]] for k in "ABCDE" if q.get(k)]
        if len(opts) < 3 or not q.get("T") or not q.get("S"):
            raise ElaborateError("%s: servono domanda, almeno tre opzioni e spiegazione" % w)
        if q.get("K") not in [o[0] for o in opts]:
            raise ElaborateError("%s: chiave %r fuori dalle opzioni" % (w, q.get("K")))
        cite = [c.strip() for c in q.get("F", "").split(",") if c.strip()]
        if q["a"] != "inglese" and not cite:
            raise ElaborateError("%s: manca il punto del ripasso (F:)" % w)
        missing = [c for c in cite if c not in point_ids]
        if missing:
            raise ElaborateError("%s: punti del ripasso inesistenti: %s" % (w, ", ".join(missing)))
        item = {
            "id": q["id"], "a": q["a"], "t": q["t"], "f": "", "inc": "el", "c": "", "es": "",
            "lab": "Domanda elaborata, non d’archivio · scheda %s" % q["t"] if q["a"] != "inglese"
            else "Domanda elaborata, non d’archivio · inglese",
            "q": q["T"], "o": opts, "k": q["K"], "kk": "elaborata", "com": [q["S"]], "cite": cite,
        }
        if q.get("N"):
            item["nov"] = 1
        out.append(item)
    for pid, coords in uscite.items():
        if pid not in point_ids:
            raise ElaborateError("uscite: punto inesistente %s" % pid)
        bad = [c for c in coords if not COORD.match(c)]
        if bad:
            raise ElaborateError("uscite: coordinate non valide per %s: %s" % (pid, ", ".join(bad)))
    return out, {k: sorted(set(v)) for k, v in uscite.items()}
