#!/usr/bin/env python3
"""Genera una SIMULAZIONE_MISTA fittizia (solo per i test) nel formato delle istruzioni.

60 quesiti in 11 parti; situazionali 1-12 con chiave «C>B>A»; figurali 13-18 con immagine;
un brano «> …» prima dei quesiti 43-48; alcuni quesiti Formez «F».
"""
import os

PARTS = [
    ("I", "Quesiti situazionali", 1, 12),
    ("II", "Ragionamento figurale", 13, 18),
    ("III", "Ragionamento numerico", 19, 24),
    ("IV", "Ragionamento verbale", 25, 30),
    ("V", "Diritto amministrativo", 31, 36),
    ("VI", "Diritto costituzionale e UE", 37, 40),
    ("VII", "Comprensione del testo", 41, 48),
    ("VIII", "Management", 49, 52),
    ("IX", "Politiche pubbliche", 53, 55),
    ("X", "Economia", 56, 58),
    ("XI", "Inglese", 59, 60),
]
SIT_KEYS = ["C>B>A", "A>C>B", "B>A>C"]
MC_KEYS = "ABCDE"  # chiave scelta fra le opzioni del quesito


def nopt_for(n):
    return 3 if n <= 12 else (5 if n % 2 else 4)


def key_for(n):
    if n <= 12:
        return SIT_KEYS[n % 3]
    return MC_KEYS[(n * 3) % nopt_for(n)]


def formez(n):
    return n in (20, 33, 38, 50, 59)


def main(out_dir):
    L = ["# Simulazione mista 1 (FIXTURE di test, testo fittizio)", "", "# Prova", ""]
    for roman, title, a, b in PARTS:
        L += ["## Parte %s — %s (quesiti %d-%d)" % (roman, title, a, b), ""]
        for n in range(a, b + 1):
            if n == 43:
                L += ["> Brano fittizio per i quesiti 43-48: primo paragrafo.", ">",
                      "> Secondo paragrafo del brano fittizio.", ""]
            nopt = nopt_for(n)
            L += ["::::: q", "**%d.** Testo fittizio del quesito %d." % (n, n), ""]
            if 13 <= n <= 18:
                L += ["![](fig/sim1_q%d.png)" % n, ""]
            for k in "ABCDE"[:nopt]:
                L.append("- **%s** opzione %s del quesito %d" % (k, k, n))
            L += [":::::", ""]
    L += ["# Correzione", "", "## Chiavi rapide", "",
          "| N | Chiave | N | Chiave | N | Chiave | N | Chiave |",
          "|:--|:--|:--|:--|:--|:--|:--|:--|"]
    for r in range(1, 16):
        cells = []
        for c in range(4):
            n = r + 15 * c
            cells += [str(n), "**%s**%s" % (key_for(n), " F" if formez(n) else "")]
        L.append("| " + " | ".join(cells) + " |")
    L += ["", "## Correzione commentata", ""]
    for n in range(1, 61):
        L += ["**%d.** Chiave %s · codice per il ripasso: **COD-%02d**" % (n, key_for(n), n), "",
              "::: key", "Spiegazione fittizia del quesito %d." % n, ":::", ""]
    path = os.path.join(out_dir, "SIMULAZIONE_MISTA_1.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    return path


if __name__ == "__main__":
    print(main(os.path.join(os.path.dirname(os.path.abspath(__file__)), "materiali")))
