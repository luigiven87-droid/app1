"""Parser dei ripassi di teoria (RIPASSO_n_*.md) → schede da rileggere.

Ogni scheda è una sequenza di blocchi:
  {"t": "h",   "h": html}                         titolo di sezione («## …»)
  {"t": "sub", "h": html}                         didascalia in grassetto («**Le misure**»)
  {"t": "box", "k": "inbreve|trappole|nota|novita", "title": testo, "b": [blocchi]}
  {"t": "table", "rows": [punto…]}                tabella: un punto per riga
  punto (segnabile «lo so» / «da ripassare»):
  {"t": "p"|"li", "id", "h": html, "n": "1." (elenchi numerati), "nov", "ess", "num"}
  {"t": "row", "id", "ql": etichetta, "q": html, "a": [[etichetta, html]…], "nov", "ess", "num"}
"""

import os
import re

from .common import (
    CLEARPAGE,
    clean_md_lines,
    fence_info,
    is_empty_cell,
    is_table_sep,
    md_inline,
    md_plain,
    split_table_row,
    stable_id,
    take_nov,
)

SCHEDA_RE = re.compile(r"^([A-Z]{1,3}\d+)\s+[—–-]\s+(.+)$")
HEAD_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
PARTE_RE = re.compile(r"^\\parte\{(.+)\}\s*$")
ITEM_RE = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
BOXES = {"inbreve": "In breve", "trappole": "Da non confondere", "nota": "Nota", "novita": "Novità"}


def _volume_meta(path, raw_lines):
    base = os.path.basename(path)
    m = re.match(r"RIPASSO_(\d+)_", base)
    vol = int(m.group(1)) if m else 0
    for ln in raw_lines[:30]:
        mm = re.search(r"\\color\{[^}]*\}\s*(.+?)\\par\}", ln)
        if mm:
            return vol, re.sub(r"\\\\\[[^\]]*\]\s*", " · ", mm.group(1)).strip()
    for ln in raw_lines[:10]:
        mm = re.search(r"\\newcommand\{\\testataDX\}\{(.+)\}", ln)
        if mm:
            return vol, mm.group(1)
    return vol, base


# ------------------------------------------------------------------ blocchi grezzi

def _starts_block(line):
    s = line.strip()
    return (not s or s == CLEARPAGE or fence_info(s) or HEAD_RE.match(s) or PARTE_RE.match(s)
            or s.startswith("|") or (ITEM_RE.match(line) and len(ITEM_RE.match(line).group(1)) < 2))


def raw_blocks(lines):
    """Divide le righe in blocchi grezzi: div, h, parte, clearpage, table, li, p."""
    out = []
    i, n = 0, len(lines)
    while i < n:
        ln = lines[i]
        s = ln.strip()
        if not s:
            i += 1
            continue
        if s == CLEARPAGE:
            out.append(("clearpage",))
            i += 1
            continue
        fi = fence_info(s)
        if fi:
            if not fi[1]:  # chiusura spaiata
                i += 1
                continue
            depth, inner = 1, []
            i += 1
            while i < n:
                f2 = fence_info(lines[i].strip())
                if f2:
                    depth += 1 if f2[1] else -1
                    if depth == 0:
                        break
                inner.append(lines[i])
                i += 1
            out.append(("div", fi[1], inner))
            i += 1
            continue
        m = PARTE_RE.match(s)
        if m:
            out.append(("parte", m.group(1).strip()))
            i += 1
            continue
        m = HEAD_RE.match(s)
        if m:
            out.append(("h", len(m.group(1)), m.group(2)))
            i += 1
            continue
        if s.startswith("|") and i + 1 < n and is_table_sep(lines[i + 1]):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(("table", rows))
            continue
        m = ITEM_RE.match(ln)
        if m and len(m.group(1)) < 2:
            item = [ln]
            i += 1
            while i < n:
                nxt = lines[i]
                if not nxt.strip():
                    # elenco «largo»: prosegue solo se la riga dopo è indentata
                    if i + 1 < n and lines[i + 1].startswith("  ") and lines[i + 1].strip():
                        i += 1
                        continue
                    break
                mm = ITEM_RE.match(nxt)
                if mm and len(mm.group(1)) < 2:
                    break
                if nxt.startswith("  ") or not _starts_block(nxt):
                    item.append(nxt)
                    i += 1
                    continue
                break
            out.append(("li", item))
            continue
        para = [s]
        i += 1
        while i < n and not _starts_block(lines[i]):
            para.append(lines[i].strip())
            i += 1
        out.append(("p", " ".join(para)))
    return out


# ------------------------------------------------------------------ conversione

def _is_caption(text):
    """Paragrafo-didascalia: «**Le misure**», «**SCIA** (art. 19)», «**Che cosa deve dire** (art. 8, c. 2):»."""
    t = take_nov(text)[0]
    if not t.startswith("**"):
        return False
    end = t.find("**", 2)
    if end < 0:
        return False
    plain = md_plain(t)
    rest = md_plain(t[end + 2:]).strip()
    if len(plain) > 130:
        return False
    return rest == "" or rest.endswith(":") or bool(re.fullmatch(r"\(.*\)\s*:?", rest))


def _lead_bold(text):
    m = re.match(r"^\*\*(.+?)\*\*", take_nov(text)[0])
    return md_plain(m.group(1)).rstrip(". ") if m else ""


class _Ctx:
    def __init__(self, vol):
        self.vol = vol
        self.seen = {}
        self.counts = {}

    def new_id(self, scheda_key, kind, plain):
        base = stable_id(self.vol, scheda_key, kind, plain)
        k = self.seen.get(base, 0)
        self.seen[base] = k + 1
        return base if k == 0 else "%s-%d" % (base, k)

    def count(self, what, n=1):
        self.counts[what] = self.counts.get(what, 0) + n


def _li_html(item_lines):
    m = ITEM_RE.match(item_lines[0])
    marker = m.group(2)
    main, subs = [m.group(3).strip()], []
    for ln in item_lines[1:]:
        mm = ITEM_RE.match(ln)
        if mm and len(mm.group(1)) >= 2:
            subs.append(mm.group(3).strip())
        elif subs:
            subs[-1] += " " + ln.strip()
        else:
            main.append(ln.strip())
    text = " ".join(main)
    raw = text + " " + " ".join(subs)
    nov = "\\nov{}" in raw
    h = md_inline(take_nov(text)[0])
    if subs:
        h += "<ul>" + "".join("<li>%s</li>" % md_inline(take_nov(s)[0]) for s in subs) + "</ul>"
    plain = md_plain(take_nov(raw)[0])
    num = marker if marker[0].isdigit() else ""
    return h, plain, nov, num


def _table(rows_md, ctx, sk, flags):
    header = split_table_row(rows_md[0])
    body = [split_table_row(r) for r in rows_md[2:]]
    ncol = len(header)
    body = [(r + [""] * ncol)[:ncol] for r in body]
    keep = [c for c in range(ncol) if header[c].strip() or any(r[c].strip() for r in body)]
    header = [header[c] for c in keep]
    body = [[r[c] for c in keep] for r in body]
    ncol = len(header)
    groups = [list(range(ncol))]
    hp = [md_plain(h).lower() for h in header]
    if ncol >= 4 and ncol % 2 == 0 and all(hp[i] == hp[i % 2] for i in range(ncol)):
        groups = [[i, i + 1] for i in range(0, ncol, 2)]  # Autore | Concetto | Autore | Concetto
    out = []
    for g in groups:
        for row in body:
            cells = [row[c] for c in g]
            heads = [header[c] for c in g]
            if all(is_empty_cell(c) for c in cells):
                ctx.count("righe vuote")
                continue
            nov = any("\\nov{}" in c for c in cells)
            q = "" if is_empty_cell(cells[0]) else md_inline(take_nov(cells[0])[0])
            a = [[md_inline(take_nov(h)[0]), md_inline(take_nov(c)[0])]
                 for h, c in zip(heads[1:], cells[1:]) if not is_empty_cell(c)]
            plain = " | ".join(md_plain(take_nov(c)[0]) for c in cells)
            pt = {"t": "row", "id": ctx.new_id(sk, "row", plain), "q": q, "a": a}
            if q and not is_empty_cell(heads[0]):
                pt["ql"] = md_inline(take_nov(heads[0])[0])
            _flags(pt, nov, flags)
            out.append(pt)
            ctx.count("righe di tabella")
    return {"t": "table", "rows": out}


def _flags(pt, nov, flags):
    if nov or flags.get("nov"):
        pt["nov"] = 1
    if flags.get("ess"):
        pt["ess"] = 1
    if flags.get("num"):
        pt["num"] = 1


def _convert(blocks, ctx, sk, flags):
    """Blocchi grezzi (dentro una scheda) → blocchi della scheda."""
    out = []
    for b in blocks:
        kind = b[0]
        if kind == "h":
            out.append({"t": "h" if b[1] <= 2 else "sub", "h": md_inline(take_nov(b[2])[0])})
        elif kind == "p":
            text = b[1]
            if _is_caption(text):
                out.append({"t": "sub", "h": md_inline(take_nov(text)[0])})
                continue
            t, nov = take_nov(text)
            pt = {"t": "p", "id": ctx.new_id(sk, "p", md_plain(t)), "h": md_inline(t)}
            _flags(pt, nov, flags)
            out.append(pt)
            ctx.count("paragrafi")
        elif kind == "li":
            h, plain, nov, num = _li_html(b[1])
            pt = {"t": "li", "id": ctx.new_id(sk, "li", plain), "h": h}
            if num:
                pt["n"] = num
            _flags(pt, nov, flags)
            out.append(pt)
            ctx.count("punti elenco")
        elif kind == "table":
            out.append(_table(b[1], ctx, sk, flags))
        elif kind == "div":
            name, inner = b[1], raw_blocks(b[2])
            if name not in BOXES:  # «piccolo» e altri contenitori di impaginazione
                out.extend(_convert(inner, ctx, sk, flags))
                continue
            title = BOXES[name]
            if inner and inner[0][0] == "p":
                first = inner[0][1]
                if name == "inbreve" and re.match(r"^\*\*In breve\.?\*\*", first):
                    rest = re.sub(r"^\*\*In breve\.?\*\*\s*", "", first)
                    inner = ([("p", rest)] if rest.strip() else []) + inner[1:]
                elif name == "trappole" and re.match(r"^\*\*Da non confondere\*\*\s*$", first):
                    inner = inner[1:]
                elif name in ("nota", "novita") and _is_caption(first):
                    title = take_nov(md_plain(first))[0]
                    inner = inner[1:]
            f2 = dict(flags)
            if name in ("inbreve", "trappole"):
                f2["ess"] = True
                ctx.count("In breve" if name == "inbreve" else "Da non confondere",
                          sum(1 for x in inner if x[0] in ("p", "li")))
            if name == "novita":
                f2["nov"] = True
            out.append({"t": "box", "k": name, "title": title, "b": _convert(inner, ctx, sk, f2)})
        # «clearpage» e «parte» sono gestiti a livello di volume
    return out


def iter_points(blocks):
    """Tutti i punti segnabili di una lista di blocchi, in ordine di lettura."""
    for b in blocks:
        if b["t"] in ("p", "li", "row"):
            yield b
        elif b["t"] == "table":
            yield from b["rows"]
        elif b["t"] == "box":
            yield from iter_points(b["b"])


def parse_ripasso(path):
    with open(path, encoding="utf-8") as f:
        raw = f.readlines()
    vol, title = _volume_meta(path, raw)
    ctx = _Ctx(vol)
    blocks = raw_blocks(clean_md_lines(raw))

    schede = []
    parte = ""
    after_clearpage = False
    pending = []  # blocchi prima della prima scheda (es. riquadro «novità» del volume)
    cur = None

    def open_scheda(code, title_, numeri):
        sc = {"key": "%d:%s" % (vol, code or title_), "code": code, "title": title_,
              "parte": parte, "numeri": numeri, "raw": []}
        schede.append(sc)
        return sc

    for b in blocks:
        if b[0] == "parte":
            parte = b[1]
            continue
        if b[0] == "clearpage":
            after_clearpage = True
            continue
        if b[0] == "h" and b[1] == 1:
            text = md_plain(take_nov(b[2])[0])
            m = SCHEDA_RE.match(text)
            if m:
                cur = open_scheda(m.group(1), m.group(2), False)
            else:
                numeri = after_clearpage or bool(re.match(r"(I numeri|Colpo d'occhio)", text, re.I))
                cur = open_scheda("", text, numeri)
            after_clearpage = False
            continue
        if cur is None:
            pending.append(b)
        else:
            cur["raw"].append(b)

    # Riquadro iniziale del volume (vol. 3 e 4: «Stato delle riforme…»): scheda a sé.
    intro = [b for b in pending if b[0] == "div" and b[1] in BOXES]
    if intro:
        first_p = next((x for x in raw_blocks(intro[0][2]) if x[0] == "p"), None)
        t = _lead_bold(first_p[1]) if first_p else "Aggiornamenti"
        sc = {"key": "%d:intro" % vol, "code": "", "title": t, "parte": "", "numeri": False, "raw": intro}
        schede.insert(0, sc)

    out = []
    for sc in schede:
        flags = {"num": True} if sc["numeri"] else {}
        sc["b"] = _convert(sc.pop("raw"), ctx, sc["key"], flags)
        if any(True for _ in iter_points(sc["b"])):
            out.append(sc)
    return {"vol": vol, "title": title, "file": os.path.basename(path), "schede": out, "counts": ctx.counts}
