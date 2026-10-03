"""Parser dei quesiti d'archivio (DOSSIER_0n_*.md, ADDENDA*_Formez*.md) → quiz.

Regole (dalle istruzioni):
- è un quesito solo ciò che ha un'etichetta [UFFICIALE …];
- opzioni «- **A** …» (da 3 a 5), poi «**Chiave: A** (ragionata) · Vigenza **V**. spiegazione…»;
- «(ragionata, affidabilità media)» → avviso; «· meno efficace: **B**.» → situazionale;
- Dossier 1: solo i 12 «## Modello N — …» (testo in «> …», «**Chiave ufficiale: C.**»);
- vigenza X → escluso; quesiti con immagine (figurali) → esclusi;
- argomento = titolo «#» o «##» più vicino; brani «### Brano N — …» + «> …».
"""

import glob
import os
import re

from .common import clean_md_lines, fence_info, md_blocks, md_inline, md_plain

EXPECTED = {"D2": 108, "D3": 54, "D4": 62, "D5": 82, "D6": 182, "AD1": 52, "AD2": 294, "D1": 12}

QSTART_RE = re.compile(r"^\*\*((?:[A-Z]\.)?\d+)\.\*\*\s*(.*)$")
LABEL_RE = re.compile(r"\*?\[(UFFICIALE[^\]]*)\]\*?")
OPT_RE = re.compile(r"^\s*(?:>\s*)?[-*+]\s+\*\*([A-E])\*\*[.):]?\s*(.*)$")
KEY_RE = re.compile(r"\*\*Chiave(?:\s+ufficiale)?\s*:\s*([A-E])\s*\.?\s*\*\*\s*\.?")
WORST_RE = re.compile(r"\s*·?\s*meno efficace\s*:\s*\*\*([A-E])\*\*\s*\.?")
VIG_RE = re.compile(r"\s*·?\s*Vigenza\s*\*\*([VAX])\*\*\s*\.?")
HEAD_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
MODEL_RE = re.compile(r"^Modello\s+(\d+)\b")
BRANO_RE = re.compile(r"^Brano\s+(\w+)")


def _src_of(path):
    base = os.path.basename(path)
    m = re.match(r"DOSSIER_0*(\d+)_", base, re.I)
    if m:
        return "D%d" % int(m.group(1))
    m = re.match(r"ADDENDA(\d*)_", base, re.I)
    if m:
        return "AD%s" % (m.group(1) or "1")
    return None


def _materia_of(path):
    base = os.path.splitext(os.path.basename(path))[0]
    m = re.match(r"DOSSIER_\d+_(.+)$", base, re.I)
    if m:
        s = m.group(1).replace("_", " ").replace("-", " ").strip()
        return s[:1].upper() + s[1:]
    m = re.match(r"ADDENDA(\d*)_(.+)$", base, re.I)
    if m:
        return "Addenda " + m.group(2).replace("_", " ")
    return base


def _render(lines):
    return md_blocks([IMG_RE.sub("", ln) for ln in lines])


def _parse_key_line(line):
    """Restituisce dict con key, keyNote, lowRel, worst, vig, rest (spiegazione sulla riga)."""
    m = KEY_RE.search(line)
    if not m:
        return None
    out = {"key": m.group(1), "keyNote": "", "lowRel": False, "worst": None, "vig": "V"}
    rest = line[m.end():]
    pm = re.match(r"^\s*\(([^)]*)\)", rest)
    if pm:
        out["keyNote"] = pm.group(1).strip()
        out["lowRel"] = "affidabilit" in pm.group(1).lower() and "media" in pm.group(1).lower()
        rest = rest[pm.end():]
    wm = WORST_RE.search(rest)
    if wm:
        out["worst"] = wm.group(1)
        rest = rest[:wm.start()] + rest[wm.end():]
    vm = VIG_RE.search(rest)
    if vm:
        out["vig"] = vm.group(1)
        rest = rest[:vm.start()] + " " + rest[vm.end():]
    out["rest"] = re.sub(r"^[\s·.]+", "", rest).strip()
    return out


class _FileStats(dict):
    pass


def _finish_question(q, stats, out, brani_used):
    """Valida e converte un quesito grezzo; aggiorna le statistiche."""
    stats["found"] += 1
    raw_all = "\n".join(q["text"] + [o for _, ol in q["opts"] for o in ol] + q["expl"])
    if IMG_RE.search(raw_all):
        stats["figurali"] += 1
        return
    if not q.get("keyinfo"):
        stats["no_key"] += 1
        stats["problems"].append("%s: senza chiave" % q["id"])
        return
    ki = q["keyinfo"]
    if ki["vig"] == "X":
        stats["vig_x"] += 1
        return
    letters = [k for k, _ in q["opts"]]
    if not (3 <= len(letters) <= 5):
        stats["problems"].append("%s: %d opzioni" % (q["id"], len(letters)))
    if ki["key"] not in letters:
        stats["problems"].append("%s: chiave %s non fra le opzioni %s" % (q["id"], ki["key"], "".join(letters)))
        stats["no_key"] += 1
        return
    nov = "\\nov{}" in raw_all
    clean = lambda lines: [ln.replace("\\nov{}", "") for ln in lines]  # noqa: E731
    expl_lines = ([ki["rest"]] if ki["rest"] else []) + q["expl"]
    item = {
        "id": q["id"],
        "src": q["src"],
        "fonte": q["fonte"],
        "label": q["label"],
        "materia": q["materia"],
        "argomento": q["argomento"],
        "text": _render(clean(q["text"])),
        "opts": [{"k": k, "h": md_inline(" ".join(clean(ol)).strip())} for k, ol in q["opts"]],
        "vig": ki["vig"],
        "expl": _render(clean(expl_lines)),
    }
    sit = ki["worst"] is not None or q["sit_ctx"]
    if sit:
        if ki["worst"] and ki["worst"] in letters and ki["worst"] != ki["key"]:
            neutral = [k for k in letters if k not in (ki["key"], ki["worst"])]
            item["rank"] = [ki["key"]] + neutral + [ki["worst"]]
        else:
            item["rank"] = [ki["key"]]
    else:
        item["key"] = ki["key"]
    if ki["keyNote"]:
        item["keyNote"] = ki["keyNote"]
    if ki["lowRel"]:
        item["lowRel"] = True
    if nov:
        item["nov"] = True
    if q.get("brano"):
        item["brano"] = q["brano"]
        brani_used.add(q["brano"])
    stats["usable"] += 1
    out.append(item)


def parse_quesiti_file(path, brani):
    src = _src_of(path)
    with open(path, encoding="utf-8") as f:
        lines = clean_md_lines(f.readlines())
    materia_file = _materia_of(path)
    is_d1 = src == "D1"
    stats = {"file": os.path.basename(path), "src": src, "found": 0, "figurali": 0, "vig_x": 0,
             "no_key": 0, "usable": 0, "problems": []}
    out = []
    brani_used = set()

    h1 = ""
    near = ""  # titolo # o ## più vicino
    brano = None
    brano_lines = None
    model = None
    cur = None  # quesito in costruzione
    phase = None  # 'text' | 'opts' | 'expl'
    seen_ids = {}

    def close():
        nonlocal cur, phase
        if cur is not None:
            if cur["id"] in seen_ids:
                seen_ids[cur["id"]] += 1
                stats["problems"].append("%s: ID duplicato" % cur["id"])
                cur["id"] = "%s~%d" % (cur["id"], seen_ids[cur["id"]])
            else:
                seen_ids[cur["id"]] = 1
            _finish_question(cur, stats, out, brani_used)
        cur = None
        phase = None

    def close_brano():
        nonlocal brano_lines
        if brano and brano_lines is not None and brano not in brani:
            brani[brano] = _render([ln.replace("\\nov{}", "") for ln in brano_lines])
        brano_lines = None

    def new_q(num, label, first_text, sit_ctx=False, qid=None, label_text=None):
        nonlocal cur, phase
        fonte = "Formez" if re.search(r"formez", label, re.I) else (
            "SNA" if re.search(r"\bSNA", label) else ("Formez" if src.startswith("AD") else "SNA"))
        materia = materia_file
        if src.startswith("AD") and h1:
            materia = md_plain(h1)
        cur = {
            "id": qid or "%s-%s" % (src, num),
            "src": src,
            "label": label_text or label,
            "fonte": fonte,
            "materia": materia,
            "argomento": md_plain(near) if near else materia,
            "text": [first_text] if first_text.strip() else [],
            "opts": [],
            "expl": [],
            "keyinfo": None,
            "brano": brano,
            "sit_ctx": sit_ctx or "situazional" in (materia + " " + near).lower(),
        }
        phase = "text"

    for ln in lines:
        s = ln.strip()
        fi = fence_info(s)
        if fi:
            continue  # contenitori di impaginazione (::: {.sbs}, ::: L, ::: R…)
        hm = HEAD_RE.match(s)
        if hm:
            close()
            close_brano()
            level, title = len(hm.group(1)), hm.group(2).replace("\\nov{}", "").strip()
            model = None
            if level <= 2:
                brano = None
                near = title
                if level == 1:
                    h1 = title
            if is_d1 and level == 2:
                mm = MODEL_RE.match(md_plain(title))
                if mm:
                    model = int(mm.group(1))
                    new_q(None, "SNA 9", "", sit_ctx=True, qid="D1-M%d" % model,
                          label_text="SNA 9 · " + md_plain(title))
                    cur["argomento"] = md_plain(title)
                    continue
            if level == 3:
                bm = BRANO_RE.match(md_plain(title))
                if bm:
                    brano = "%s-B%s" % (src, bm.group(1))
                    brano_lines = ["**%s**" % md_plain(title), ""]
                else:
                    brano = None
            continue

        # Dossier 1: dentro un modello il testo è citato («> …»)
        if is_d1:
            if model is None:
                continue
            body = re.sub(r"^\s*>\s?", "", ln)
            if cur is None:
                continue
            ki = _parse_key_line(body)
            if ki and phase != "expl":
                cur["keyinfo"] = ki
                phase = "expl"
                continue
            om = OPT_RE.match(body)
            if om and phase in ("text", "opts"):
                cur["opts"].append((om.group(1), [om.group(2)]))
                phase = "opts"
                continue
            if phase == "opts" and body.strip() and body.startswith("  ") and cur["opts"]:
                cur["opts"][-1][1].append(body.strip())
                continue
            if phase == "text":
                cur["text"].append(body)
            elif phase == "expl":
                cur["expl"].append(body)
            elif phase == "opts" and not body.strip():
                pass
            continue

        qm = QSTART_RE.match(s)
        if qm:
            lm = LABEL_RE.search(qm.group(2))
            if lm:
                close()
                if brano_lines is not None:
                    close_brano()
                rest = (qm.group(2)[:lm.start()] + qm.group(2)[lm.end():]).strip()
                new_q(qm.group(1), lm.group(1).strip(), rest)
                continue
            # numerato ma senza etichetta UFFICIALE: non è un quesito
            close()
            continue

        if brano_lines is not None and cur is None:
            if s.startswith(">"):
                brano_lines.append(re.sub(r"^\s*>\s?", "", ln))
            elif not s:
                brano_lines.append("")
            continue

        if cur is None:
            continue
        ki = _parse_key_line(s)
        if ki and phase in ("text", "opts"):
            cur["keyinfo"] = ki
            phase = "expl"
            continue
        om = OPT_RE.match(ln)
        if om and phase in ("text", "opts"):
            cur["opts"].append((om.group(1), [om.group(2)]))
            phase = "opts"
            continue
        if phase == "opts":
            if s and ln.startswith("  ") and cur["opts"]:
                cur["opts"][-1][1].append(s)
            continue
        if phase == "text":
            cur["text"].append(ln)
        elif phase == "expl":
            if re.fullmatch(r"-{3,}|\*{3,}", s):
                close()
                continue
            cur["expl"].append(ln)
    close()
    close_brano()
    return out, stats


def parse_quesiti_dir(materiali):
    paths = sorted(glob.glob(os.path.join(materiali, "DOSSIER_*.md"))) + \
        sorted(glob.glob(os.path.join(materiali, "ADDENDA*.md")))
    if not paths:
        return None
    brani = {}
    questions, files = [], []
    for p in paths:
        if _src_of(p) is None:
            continue
        qs, st = parse_quesiti_file(p, brani)
        questions.extend(qs)
        files.append(st)
    used = {q["brano"] for q in questions if q.get("brano")}
    return {"questions": questions, "files": files, "brani": {k: v for k, v in brani.items() if k in used}}
