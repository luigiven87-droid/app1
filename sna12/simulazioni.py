"""Dati delle simulazioni: quesiti dai PDF + classificazione e piano dell'analisi.

- `materiali/pdf/`: Dossier 1-6 e Addenda 1-2 (testo, opzioni, chiave, commento);
- `materiali/analisi/*quesiti_sna12.csv`: area, scheda o tipo, fascia, includi;
- `materiali/analisi/*analisi_sna12.json`: le simulazioni H1-H6 (quote, fasce, tempi).

Entrano i quesiti con includi = «sì» o «riserva» di cui i PDF danno il testo
completo; i «no» (nicchia) restano fuori. Nulla viene riscritto: domande,
opzioni e commenti sono quelli dei dossier.
"""

import csv
import glob
import json
import os
import re

from sna12 import quesiti

AREAS = (
    ("situazionali", "Situazionali", "Sit."),
    ("ragionamento", "Ragionamento verbale e logico-astratto", "Rag."),
    ("diritto_costituzionale", "Diritto costituzionale", "Cost."),
    ("diritto_amministrativo", "Diritto amministrativo", "Amm."),
    ("diritto_ue", "Diritto dell’Unione europea", "UE"),
    ("economia_politica", "Economia politica", "Ec. pol."),
    ("politica_economica", "Politica economica", "Pol. ec."),
    ("economia_pa", "Economia delle amministrazioni pubbliche", "Ec. PA"),
    ("management_innovazione", "Management pubblico e innovazione digitale", "Mgmt"),
    ("politiche_pubbliche", "Analisi delle politiche pubbliche", "Politiche"),
    ("inglese", "Inglese", "Ingl."),
)

TYPES = {
    "soluzione_problemi": "Soluzione dei problemi",
    "sviluppo_collaboratori": "Sviluppo dei collaboratori",
    "promozione_cambiamento": "Promozione del cambiamento",
    "decisione_responsabile": "Decisione responsabile",
    "orientamento_risultato": "Orientamento al risultato",
    "gestione_relazioni": "Gestione delle relazioni",
    "brano": "Comprensione di un brano",
    "figurale_serie": "Serie figurale",
    "figurale_matrice": "Matrice figurale",
    "figurale_scarto": "Figura da scartare",
    "figurale_insiemi": "Diagramma di insiemi",
    "figurale_proporzione": "Proporzione fra figure",
    "deduzione": "Logica deduttiva",
    "verbale": "Logica verbale",
    "codici": "Codici",
    "grammatica": "Grammatica",
    "lessico": "Lessico",
    "comprensione": "Comprensione",
    "numeri": "Numeri in lettere",
}

# Da quali fonti pescare per prime (dal campo «fonti» di ogni simulazione dell'analisi).
PREF = {"H1": "sna", "H2": "any", "H3": "any", "H4": "formez", "H5": "any", "H6": "any"}
RISERVA = {"H6"}

WORST = re.compile(r"meno efficace:\s*([A-E])\b")


def _one(pattern):
    found = sorted(glob.glob(pattern))
    return found[-1] if found else None


def paths(materiali):
    return {
        "pdf": os.path.join(materiali, "pdf"),
        "csv": _one(os.path.join(materiali, "analisi", "*quesiti_sna12.csv")),
        "json": _one(os.path.join(materiali, "analisi", "*analisi_sna12.json")),
    }


def available(materiali):
    p = paths(materiali)
    return bool(p["csv"] and p["json"] and os.path.isdir(p["pdf"]) and quesiti.available(p["pdf"]))


def read_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f, delimiter=";"))


def plans(analysis):
    out = []
    for s in analysis.get("simulazioni", []):
        pid = s.get("id")
        out.append({
            "id": pid, "nome": s.get("nome", pid), "scopo": s.get("scopo", ""),
            "quando": s.get("quando", ""), "n": s.get("n_quesiti") or s.get("quesiti"),
            "min": s.get("minuti"), "aree": s.get("aree", {}), "quote": s.get("quote", {}),
            "fasce": s.get("fasce", {}), "note": [r for r in s.get("regole", []) if isinstance(r, str)],
            "fonti": s.get("fonti", []), "fpa": s.get("fonti_per_area", {}),
            "pref": PREF.get(pid, "any"), "riserva": pid in RISERVA,
        })
    return out


REF = re.compile(r"SNA\d+-B\d-Q\d+|AD\d-[A-Z]\.\d+")

# Stesso quesito in fonti diverse che l'analisi non segnala come ripetuto (verificati a mano).
# Le tre domande sul brano di SNA 9 uscito nelle buste 2 e 3 sono identiche.
GEMELLI = {"AD2-C.6": ["D3-6", "D3-7"], "AD2-C.2": ["D3-5"], "AD2-D.14": ["AD1-D.1"],
           "D6-49": ["D6-46"], "D6-50": ["D6-47"], "D6-51": ["D6-48"]}


def repeats(text, area):
    """Dal campo «ripetuto_in»: i riferimenti allo stesso quesito altrove (ripreso in un altro
    anno, variante Formez dello stesso scenario o quesito, stessa domanda nelle altre buste).
    Non contano i paralleli dello stesso anno, che sono domande diverse sullo stesso tema, i
    brani condivisi, gestiti con il brano, e le varianti di ragionamento, che sono esercizi
    dello stesso tipo con dati diversi."""
    out = []
    for seg in text.split("|"):
        if re.match(r"\s*(parallelo|stesso brano)", seg):
            continue
        if area == "ragionamento" and re.match(r"\s*variante", seg):
            continue
        out.extend(REF.findall(seg))
    return out


def twins(qs):
    """Raggruppa i gemelli (anche a catena) e scrive in ciascuno gli altri del gruppo (chiave «tw»)."""
    by = {}
    for q in qs:
        by[q["id"]] = q["id"]
        if q.get("c"):
            by[q["c"]] = q["id"]
    parent, linked = {}, set()

    def root(x):
        while parent.get(x, x) != x:
            x = parent[x]
        return x
    for q in qs:
        for ref in q.pop("rep", []) + GEMELLI.get(q["id"], []):
            other = by.get(ref)
            if other and other != q["id"]:
                parent[root(other)] = root(q["id"])
                linked.update((q["id"], other))
    groups = {}
    for qid in linked:
        groups.setdefault(root(qid), []).append(qid)
    for q in qs:
        if q["id"] in linked:
            q["tw"] = sorted(x for x in groups[root(q["id"])] if x != q["id"])


def compact(q, row):
    """Il quesito come lo usa la pagina (chiavi corte: sono centinaia)."""
    com = q.get("com") or []
    out = {
        "id": row["id"], "a": row["area"], "t": row["scheda_o_tipo"], "f": row["fascia"],
        "inc": row["includi"], "c": row["coordinate"], "es": row["estratta"],
        "lab": q.get("label", ""), "q": q.get("text", ""), "o": q.get("options", []),
        "k": q.get("key"), "kk": q.get("keykind"), "com": com,
    }
    if row["area"] == "situazionali" and com:
        m = WORST.search(com[0])
        if m and m.group(1) != q.get("key"):
            out["w"] = m.group(1)
    for src, dst in (("img", "img"), ("passage", "p"), ("title", "ti"), ("competenza", "cp")):
        if q.get(src):
            out[dst] = q[src]
    if row.get("ripetuto_in"):
        out["rep"] = repeats(row["ripetuto_in"], row["area"])
    if row.get("motivo"):
        out["mo"] = row["motivo"]
    first = com[0] if com else ""
    m = re.search(r"Vigenza ([AX])\b", first)
    if m:
        out["vg"] = m.group(1)  # A: risposta giusta ma norma o contesto cambiati; X: superato
    if "affidabilità media" in first:
        out["km"] = 1  # chiave ragionata ad affidabilità media, secondo il dossier
    return out


def schede(analysis):
    """Per ogni scheda: fascia, quesiti attesi nel XII (quota dell'area × peso) e uscite d'archivio.

    Alcune schede compaiono in più aree (E3, PE1, A1): vale la voce della loro area.
    """
    bp = analysis.get("blueprint_xii", {})
    out = {}
    for area, items in (analysis.get("argomenti") or {}).items():
        for it in items:
            code = it.get("scheda")
            own = it.get("area_propria", area) == area
            if not code or (code in out and not own):
                continue
            out[code] = {
                "f": it.get("fascia", ""),
                "x": round((bp.get(area) or 0) * (it.get("peso_xii") or 0), 2),
                "n": it.get("totale_scheda", 0), "ne": it.get("in_estratte", 0), "nn": it.get("in_non_estratte", 0),
            }
    return out


def build(materiali, with_images=True):
    """Dati per la pagina, oppure None se mancano i PDF, il CSV o il JSON."""
    if not available(materiali):
        return None
    p = paths(materiali)
    with open(p["json"], encoding="utf-8") as f:
        analysis = json.load(f)
    rows = read_csv(p["csv"])
    parsed = quesiti.parse_all(p["pdf"], with_images=with_images)
    qs, missing, excluded = [], [], []
    for row in rows:
        if row["includi"] == "no":
            excluded.append(row["id"])
            continue
        q = parsed["questions"].get(row["id"])
        if not q or not q.get("key") or len(q.get("options") or []) < 2:
            missing.append(row["id"])
            continue
        qs.append(compact(q, row))
    twins(qs)
    used = {q["p"] for q in qs if q.get("p")}
    passages = {ps["id"]: {"title": ps["title"], "label": ps["label"], "text": ps["text"]}
                for ps in parsed["passages"] if ps["id"] in used}
    known = {r["id"] for r in rows}
    return {
        "areas": [list(a) for a in AREAS],
        "types": TYPES,
        "blueprint": analysis.get("blueprint_xii", {}),
        "plans": plans(analysis),
        "schede": schede(analysis),
        "q": qs,
        "passages": passages,
        "info": {
            "csv": os.path.basename(p["csv"]), "json": os.path.basename(p["json"]),
            "pdf": sorted(os.path.basename(v) for v in parsed["sources"].values()),
            "rows": len(rows), "used": len(qs), "excluded": len(excluded),
            "missing": len(missing), "missing_ids": missing,
            "unlisted": sorted(set(parsed["questions"]) - known),
        },
    }


def report(sim):
    if not sim:
        return "Simulazioni: mancano i PDF in materiali/pdf o l'analisi in materiali/analisi (sezione nascosta)."
    info = sim["info"]
    by_inc = {}
    for q in sim["q"]:
        by_inc[q["inc"]] = by_inc.get(q["inc"], 0) + 1
    miss = info["missing_ids"]
    groups = {}
    for m in miss:
        g = re.sub(r"(-S\d+|-M\d+\.B\d|-\d+|\.\d+)$", "", m)
        g = "D1-S10/11 (solo riassunto)" if re.match(r"D1-S1[01]", m) else (
            "D1-M*.B1/B2 (solo la lettera)" if re.match(r"D1-M\d+\.B", m) else
            "D1-S8" if m.startswith("D1-S8") else g)
        groups[g] = groups.get(g, 0) + 1
    lines = [
        "Simulazioni: %d quesiti (%s) da %d righe del CSV; %d esclusi (nicchia, includi = no)." % (
            info["used"], ", ".join("%s %d" % (k, v) for k, v in sorted(by_inc.items())),
            info["rows"], info["excluded"]),
        "  Senza testo completo nei PDF: %d (%s)." % (
            len(miss), ", ".join("%s: %d" % kv for kv in sorted(groups.items())) or "nessuno"),
        "  Brani: %d · figure: %d · piani: %s" % (
            len(sim["passages"]), sum(len(q.get("img", [])) for q in sim["q"]),
            ", ".join(p["id"] for p in sim["plans"])),
    ]
    if info["unlisted"]:
        lines.append("  Quesiti nei PDF ma non nel CSV: %s" % ", ".join(info["unlisted"]))
    return "\n".join(lines)
