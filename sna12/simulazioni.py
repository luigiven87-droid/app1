"""Parser delle simulazioni (SIMULAZIONE_MISTA_n.md) → prova a tempo.

- «# Prova»: 60 quesiti in blocchi «::::: q … :::::», divisi in 11 parti
  («## Parte I — Quesiti situazionali (quesiti 1-12)»); i brani sono blocchi «> …»
  prima dei quesiti del gruppo.
- «## Chiavi rapide»: tabella con coppie N | Chiave; «C>B>A» = situazionale
  (C = 1, B = 0,50, A = 0); «F» dopo la chiave = quesito Formez «mai visto».
- «## Correzione commentata»: «codice per il ripasso: **…**» e spiegazione in «::: key … :::».
- Figurali: immagine non disponibile → nota «figura: vedi il PDF della simulazione».
"""

import glob
import os
import re

from .common import (
    clean_md_lines,
    fence_info,
    is_table_sep,
    md_blocks,
    md_inline,
    md_plain,
    roman_to_int,
    split_table_row,
)

HEAD_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
PART_RE = re.compile(r"^Parte\s+([IVXLC]+)\b\s*[—–-]?\s*(.*?)\s*$")
RANGE_RE = re.compile(r"\(quesit[io]\s+(\d+)\s*[-–—]\s*(\d+)\)")
QNUM_RE = re.compile(r"^\*\*(\d+)\.\*\*\s*(.*)$")
OPT_RE = re.compile(r"^\s*[-*+]\s+\*\*([A-E])\*\*[.):]?\s*(.*)$")
IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
CODE_RE = re.compile(r"codice per il ripasso\s*:\s*\*\*(.+?)\*\*", re.I)
CORR_NUM_RE = re.compile(r"^(?:\*\*(\d+)\.\*\*|#{2,6}\s*(?:Quesito\s+)?(\d+)\b)")
KEYCELL_RE = re.compile(r"^([A-E](?:\s*>\s*[A-E])*)$")


def _parse_keycell(cell):
    s = md_plain(cell).replace("\\nov{}", "").strip()
    formez = bool(re.search(r"F", s))
    s = re.sub(r"[\s()·*]*F[\s()·*]*$", "", s).strip()
    s = s.replace("F", "").strip()
    m = KEYCELL_RE.match(s.replace(" ", ""))
    if not m:
        return None
    order = m.group(1).replace(" ", "").split(">")
    return order, formez


def parse_simulazione(path):
    base = os.path.basename(path)
    m = re.search(r"(\d+)", base)
    sid = "S%s" % (m.group(1) if m else "1")
    with open(path, encoding="utf-8") as f:
        lines = clean_md_lines(f.readlines())

    title = ""
    mode = None  # 'prova' | 'keys' | 'corr'
    parts = []
    qblocks = []  # (part_n, brano_id, [lines])
    brani = {}
    brano_id = None
    brano_buf = None
    keys = {}
    codes = {}
    expls = {}
    corr_cur = None
    corr_ord_key = 0
    corr_ord_code = 0
    problems = []

    fence_stack = []
    q_lines = None
    q_depth = 0
    key_lines = None
    key_depth = 0
    last_was_q = False

    def flush_brano():
        nonlocal brano_buf, brano_id
        if brano_buf is not None:
            brano_id = "%s-B%d" % (sid, len(brani) + 1)
            brani[brano_id] = md_blocks([ln.replace("\\nov{}", "") for ln in brano_buf])
            brano_buf = None

    i = 0
    n = len(lines)
    while i < n:
        ln = lines[i]
        s = ln.strip()
        fi = fence_info(s)

        # --- dentro un blocco q
        if q_lines is not None:
            if fi:
                if fi[1]:
                    fence_stack.append(fi)
                    q_depth += 1
                elif q_depth > 0:
                    fence_stack.pop()
                    q_depth -= 1
                else:
                    qblocks.append((parts[-1]["n"] if parts else 0, brano_id, q_lines))
                    q_lines = None
                    last_was_q = True
                i += 1
                continue
            q_lines.append(ln)
            i += 1
            continue
        # --- dentro un blocco key
        if key_lines is not None:
            if fi:
                if fi[1]:
                    key_depth += 1
                elif key_depth > 0:
                    key_depth -= 1
                else:
                    if corr_cur is not None and corr_cur not in expls:
                        num = corr_cur
                    else:
                        corr_ord_key += 1
                        num = corr_ord_key
                        while num in expls:
                            num += 1
                    corr_ord_key = max(corr_ord_key, num)
                    expls[num] = md_blocks([ln2.replace("\\nov{}", "") for ln2 in key_lines])
                    key_lines = None
                i += 1
                continue
            key_lines.append(ln)
            i += 1
            continue

        hm = HEAD_RE.match(s)
        if hm:
            level, htxt = len(hm.group(1)), md_plain(hm.group(2))
            low = htxt.lower()
            if not title and level == 1 and "prova" not in low:
                title = htxt
            if re.match(r"^prova\b", low):
                mode = "prova"
            elif "chiavi rapide" in low:
                mode = "keys"
            elif "correzione commentata" in low:
                mode = "corr"
            elif mode == "prova":
                pm = PART_RE.match(htxt)
                if pm:
                    flush_brano()
                    brano_id = None
                    rm = RANGE_RE.search(htxt)
                    parts.append({
                        "n": roman_to_int(pm.group(1)),
                        "roman": pm.group(1),
                        "title": RANGE_RE.sub("", pm.group(2)).strip(" —–-"),
                        "from": int(rm.group(1)) if rm else None,
                        "to": int(rm.group(2)) if rm else None,
                    })
            elif mode == "corr":
                cm = CORR_NUM_RE.match(s)
                if cm:
                    corr_cur = int(cm.group(1) or cm.group(2))
            i += 1
            continue

        if mode == "prova":
            if fi and fi[1] == "q":
                flush_brano()
                q_lines = []
                q_depth = 0
                i += 1
                continue
            if s.startswith(">"):
                if brano_buf is None:
                    brano_buf = []
                    if last_was_q:
                        brano_id = None
                brano_buf.append(re.sub(r"^\s*>\s?", "", ln))
                last_was_q = False
                i += 1
                continue
            if not s and brano_buf is not None:
                brano_buf.append("")
            i += 1
            continue

        if mode == "keys":
            if s.startswith("|") and i + 1 < n and is_table_sep(lines[i + 1]):
                i += 2
                while i < n and lines[i].strip().startswith("|"):
                    cells = split_table_row(lines[i])
                    for c in range(0, len(cells) - 1, 2):
                        num = md_plain(cells[c]).strip().rstrip(".")
                        if not num.isdigit():
                            continue
                        kc = _parse_keycell(cells[c + 1])
                        if kc is None:
                            problems.append("chiave illeggibile per il quesito %s: %r" % (num, cells[c + 1]))
                            continue
                        keys[int(num)] = kc
                    i += 1
                continue
            i += 1
            continue

        if mode == "corr":
            cm = CORR_NUM_RE.match(s)
            if cm:
                corr_cur = int(cm.group(1) or cm.group(2))
            km = CODE_RE.search(s)
            if km:
                if corr_cur is not None and corr_cur not in codes:
                    num = corr_cur
                else:
                    corr_ord_code += 1
                    num = corr_ord_code
                    while num in codes:
                        num += 1
                corr_ord_code = max(corr_ord_code, num)
                codes[num] = md_plain(km.group(1))
            if fi and fi[1] == "key":
                key_lines = []
                key_depth = 0
            i += 1
            continue
        i += 1

    # ---- quesiti
    questions = []
    for idx, (pn, bid, ql) in enumerate(qblocks, 1):
        num = idx
        text, opts = [], []
        phase = "text"
        fig = False
        for ln in ql:
            s = ln.strip()
            if fence_info(s):
                continue
            if IMG_RE.search(ln):
                fig = True
                ln = IMG_RE.sub("", ln)
                s = ln.strip()
                if not s:
                    continue
            qm = QNUM_RE.match(s) if not text and phase == "text" else None
            if qm:
                num = int(qm.group(1))
                if qm.group(2).strip():
                    text.append(qm.group(2))
                continue
            om = OPT_RE.match(ln)
            if om:
                opts.append([om.group(1), [om.group(2)]])
                phase = "opts"
                continue
            if phase == "opts":
                if s and ln.startswith("  ") and opts:
                    opts[-1][1].append(s)
                continue
            text.append(ln)
        part_n = pn
        for p in parts:
            if p["from"] and p["to"] and p["from"] <= num <= p["to"]:
                part_n = p["n"]
        nov = any("\\nov{}" in x for x in ql)
        q = {
            "n": num,
            "part": part_n,
            "text": md_blocks([t.replace("\\nov{}", "") for t in text]),
            "opts": [{"k": k, "h": md_inline(" ".join(v).replace("\\nov{}", "").strip())} for k, v in opts],
        }
        if fig:
            q["fig"] = True
        if bid:
            q["brano"] = bid
        if nov:
            q["nov"] = True
        kc = keys.get(num)
        if kc:
            order, formez = kc
            if len(order) > 1:
                q["rank"] = order
            else:
                q["key"] = order[0]
            if formez:
                q["formez"] = True
        if num in codes:
            q["code"] = codes[num]
        if num in expls:
            q["expl"] = expls[num]
        questions.append(q)

    letters_ok = all(
        (q.get("key") in [o["k"] for o in q["opts"]]) if q.get("key") else
        all(k in [o["k"] for o in q["opts"]] for k in q.get("rank", ["?"]))
        for q in questions)
    if len(questions) != 60:
        problems.append("%d quesiti invece di 60" % len(questions))
    if len(keys) != 60:
        problems.append("%d chiavi invece di 60" % len(keys))
    if len(parts) != 11:
        problems.append("%d parti invece di 11" % len(parts))
    if not letters_ok:
        problems.append("qualche chiave non è fra le opzioni del quesito")
    missing_expl = [q["n"] for q in questions if not q.get("expl")]
    if missing_expl:
        problems.append("senza spiegazione: %s" % missing_expl[:10])

    return {
        "id": sid,
        "file": base,
        "title": title or "Simulazione mista %s" % sid[1:],
        "parts": parts,
        "questions": questions,
        "brani": brani,
        "problems": problems,
    }


def parse_simulazioni_dir(materiali):
    paths = sorted(glob.glob(os.path.join(materiali, "SIMULAZIONE_MISTA_*.md")))
    return [parse_simulazione(p) for p in paths]
