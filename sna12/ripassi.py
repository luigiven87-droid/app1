"""Parser dei ripassi di teoria (RIPASSO_n_*.md) → flashcard."""

import math
import os
import re

from .common import (
    NOV_MARK,
    bold_segments,
    fence_info,
    is_empty_cell,
    is_table_sep,
    mark_nov,
    md_inline,
    md_plain,
    segments_html,
    split_table_row,
    stable_id,
    take_nov,
)

MAX_GAPS = 3

SCHEDA_RE = re.compile(r"^#\s+([A-Z]{1,3}\d+)\s+[—–-]\s+(.+?)\s*$")
H1_RE = re.compile(r"^#\s+(.+?)\s*$")
H2_RE = re.compile(r"^##\s+(.+?)\s*$")
PARTE_RE = re.compile(r"^\\parte\{(.+)\}\s*$")
ITEM_RE = re.compile(r"^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$")

# Abbreviazioni dopo le quali un punto non chiude la frase.
ABBR = {
    "art", "artt", "c", "cc", "n", "nn", "sez", "cons", "st", "ad", "plen", "cost",
    "cass", "un", "p", "pp", "par", "lett", "ss", "es", "cfr", "ecc", "sent", "ord",
    "reg", "dir", "all", "cap", "vol", "cod", "civ", "pen", "proc", "l", "tab", "fig",
    "sig", "dott", "prof", "min", "pres", "rel", "vs", "co", "nr", "succ", "mod",
    "segg", "cit", "rif", "doc", "spa", "srl",
}


def _volume_meta(path, lines):
    base = os.path.basename(path)
    m = re.match(r"RIPASSO_(\d+)_", base)
    vol = int(m.group(1)) if m else 0
    title = None
    for ln in lines[:30]:
        mm = re.search(r"\\color\{[^}]*\}\s*(.+?)\\par\}", ln)
        if mm:
            title = re.sub(r"\\\\\[[^\]]*\]\s*", " · ", mm.group(1)).strip()
            break
    if not title:
        for ln in lines[:10]:
            mm = re.search(r"\\newcommand\{\\testataDX\}\{(.+)\}", ln)
            if mm:
                title = mm.group(1)
    if not title:
        title = base
    return vol, title


def _clean_lines(lines):
    """Toglie i comandi LaTeX di impaginazione; restituisce [(n_riga, testo)]."""
    out = []
    in_center = False
    for i, raw in enumerate(lines, 1):
        ln = raw.rstrip("\n")
        s = ln.strip()
        if in_center:
            if s.startswith("\\end{center}"):
                in_center = False
            continue
        if s.startswith("\\begin{center}"):
            in_center = True
            continue
        if s.startswith("\\") and not s.startswith("\\parte") and not s.startswith("\\nov{}"):
            # \newcommand, \thispagestyle, \setcounter, \tableofcontents, \clearpage,
            # \condbreak, \includegraphics, \vspace…: impaginazione.
            if s.startswith("\\clearpage") or s.startswith("\\newpage"):
                out.append((i, "\x00CLEARPAGE"))
            continue
        out.append((i, ln))
    return out


def split_sentences(text):
    """Divide un paragrafo markdown in frasi, senza spezzare grassetti né abbreviazioni."""
    sents = []
    start = 0
    i = 0
    bold = False
    n = len(text)
    while i < n:
        if text.startswith("**", i):
            bold = not bold
            i += 2
            continue
        ch = text[i]
        if ch in ".?!" and not bold:
            j = i + 1
            while j < n and text[j] in "»”\")":
                j += 1
            if j < n and text[j] in " \t":
                k = j
                while k < n and text[k] in " \t" + NOV_MARK:
                    k += 1
                nxt = text[k:k + 2]
                starts_new = k < n and (nxt[:1].isupper() or nxt[:1] in "«“\"(" or nxt == "**")
                if starts_new and (ch in "?!" or not _is_abbrev(text, i)):
                    sents.append(text[start:j].strip())
                    start = j  # l'eventuale \nov{} resta con la frase che segue
                    i = k
                    continue
        i += 1
    tail = text[start:].strip()
    if tail:
        sents.append(tail)
    return [s for s in sents if s]


def _is_abbrev(text, dot_pos):
    k = dot_pos
    while k > 0 and not text[k - 1].isspace() and text[k - 1] not in "(«“\"/" + NOV_MARK:
        k -= 1
    word = text[k:dot_pos].replace("*", "")
    if not word:
        return False
    if len(word) == 1 and word.isalpha():
        return True  # iniziale (F. W. Taylor) o sigla (L. 241/1990)
    if word.lower() in ABBR:
        return True
    if "." in word and re.search(r"[A-Za-z]", word):
        return True  # d.lgs, d.P.R, c.p.a
    return False


def _gap_groups(n_bold, exclude):
    """Indici dei grassetti da trasformare in lacune, in gruppi di al massimo MAX_GAPS."""
    cand = [i for i in range(n_bold) if i not in exclude]
    if not cand:
        return []
    k = math.ceil(len(cand) / MAX_GAPS)
    size, extra = divmod(len(cand), k)
    groups, pos = [], 0
    for g in range(k):
        s = size + (1 if g < extra else 0)
        groups.append(cand[pos:pos + s])
        pos += s
    return groups


LABELS = re.compile(r"^(in breve\.?|da non confondere)$", re.I)


def cloze_cards(unit_md, base, kind, stats):
    """Crea le carte a lacune di un'unità (frase o punto). Restituisce una lista."""
    text, nov = take_nov(unit_md)
    segs, saved = bold_segments(text)
    bolds = [i for i, (b, _) in enumerate(segs) if b]
    n_bold = len(bolds)
    exclude = set()
    for bi, si in enumerate(bolds):
        if LABELS.match(md_plain(segs[si][1]).strip()):
            exclude.add(bi)
    # Etichetta iniziale «**Tema**: …»: resta visibile come contesto se ci sono altre lacune.
    if segs and segs[0][0] and len(segs) > 1 and segs[1][1].lstrip().startswith(":"):
        if n_bold - len(exclude) > 1:
            exclude.add(0)
    groups = _gap_groups(n_bold, exclude)
    if not groups:
        stats["senza_grassetti"] = stats.get("senza_grassetti", 0) + 1
        return []
    plain = md_plain(text)
    cards = []
    for gi, grp in enumerate(groups):
        gaps = {b: j for j, b in enumerate(grp)}
        card = dict(base)
        card.update(
            id=stable_id(base["vol"], base["schedaKey"], kind, plain, gi),
            type=kind,
            nov=nov,
            html=segments_html(segs, saved, gaps),
            n=len(grp),
            part=(gi + 1, len(groups)) if len(groups) > 1 else None,
        )
        cards.append(card)
    return cards


def _collect_items(block_lines):
    """Raggruppa le righe di un blocco in paragrafi e voci di elenco (con continuazioni)."""
    units = []  # (tipo, testo) tipo ∈ {'p','li'}
    cur = None
    for ln in block_lines:
        if not ln.strip():
            if cur:
                units.append(cur)
                cur = None
            continue
        m = ITEM_RE.match(ln)
        if m and len(m.group(1)) < 2:
            if cur:
                units.append(cur)
            cur = ["li", m.group(2).strip()]
        elif m and cur and cur[0] == "li":
            # sotto-voce: la tratto come voce autonoma
            units.append(cur)
            cur = ["li", m.group(2).strip()]
        else:
            if cur:
                cur[1] += " " + ln.strip()
            else:
                cur = ["p", ln.strip()]
    if cur:
        units.append(cur)
    return [tuple(u) for u in units]


def _table_cards(rows_md, base, stats, caption):
    """Trasforma una tabella pipe in carte domanda/risposta."""
    header = split_table_row(rows_md[0])
    body = [split_table_row(r) for r in rows_md[2:]]
    ncol = len(header)
    body = [(r + [""] * ncol)[:ncol] for r in body]
    # Colonne-spaziatrici (intestazione e celle vuote): via.
    keep = [c for c in range(ncol) if header[c].strip() or any(r[c].strip() for r in body)]
    header = [header[c] for c in keep]
    body = [[r[c] for c in keep] for r in body]
    ncol = len(header)
    # Coppie ripetute (Autore | Concetto | Autore | Concetto): una carta per coppia.
    groups = [list(range(ncol))]
    hp = [md_plain(h).lower() for h in header]
    if ncol >= 4 and ncol % 2 == 0 and all(hp[i] == hp[i % 2] for i in range(ncol)):
        groups = [[i, i + 1] for i in range(0, ncol, 2)]
    cards = []
    for ri, row in enumerate(body):
        for g in groups:
            cells = [row[c] for c in g]
            heads = [header[c] for c in g]
            q_raw = cells[0]
            if is_empty_cell(q_raw):
                stats["righe_saltate"] = stats.get("righe_saltate", 0) + 1
                continue
            answers = [(h, c) for h, c in zip(heads[1:], cells[1:]) if not is_empty_cell(c)]
            if not answers:
                stats["righe_saltate"] = stats.get("righe_saltate", 0) + 1
                continue
            q_plain = md_plain(take_nov(q_raw)[0])
            if all(md_plain(take_nov(c)[0]) == q_plain for _, c in answers):
                stats["righe_saltate"] = stats.get("righe_saltate", 0) + 1
                continue
            nov = any("\\nov{}" in x or NOV_MARK in x for x in cells)
            q_txt, _ = take_nov(q_raw)
            card = dict(base)
            card.update(
                id=stable_id(base["vol"], base["schedaKey"], "tabella", base.get("sezione", ""),
                             md_plain(heads[0]), q_plain, ri, g[0]),
                type="tabella",
                nov=nov,
                qLabel=md_inline(take_nov(heads[0])[0]) if not is_empty_cell(heads[0]) else "",
                q=md_inline(q_txt),
                ask=[md_inline(take_nov(h)[0]) for h, _ in answers],
                a=[[md_inline(take_nov(h)[0]), md_inline(take_nov(c)[0])] for h, c in answers],
                caption=caption,
            )
            cards.append(card)
    return cards


def parse_ripasso(path):
    with open(path, encoding="utf-8") as f:
        raw_lines = f.readlines()
    vol, vol_title = _volume_meta(path, raw_lines)
    is_niche = "dettagli" in os.path.basename(path).lower() or "nicchia" in os.path.basename(path).lower()
    lines = _clean_lines(raw_lines)
    stats = {}
    cards = []
    schede = []

    parte = ""
    scheda = None  # dict
    sezione = ""
    sub = ""
    after_clearpage = False
    stack = []  # recinti aperti
    block_buf = []
    last_para = ""

    def new_scheda(code, title, numeri):
        nonlocal scheda, sezione, sub
        key = "%d:%s" % (vol, code or title)
        scheda = {"key": key, "code": code, "title": title, "numeri": numeri, "parte": parte}
        schede.append(scheda)
        sezione = ""
        sub = ""

    def base():
        return {
            "vol": vol,
            "schedaKey": scheda["key"] if scheda else "%d:" % vol,
            "numeri": bool(scheda and scheda["numeri"]),
            "sezione": sezione,
        }

    def flush_block(name, buf):
        if not scheda:
            return
        units = _collect_items(buf)
        if name == "inbreve":
            for kind, txt in units:
                txt = re.sub(r"^\*\*In breve\.?\*\*\s*", "", mark_nov(txt))
                for s in split_sentences(txt):
                    if "**" not in s:
                        continue
                    cards.extend(cloze_cards(s, base(), "inbreve", stats))
        elif name == "trappole":
            for kind, txt in units:
                if kind == "p" and re.match(r"^\*\*Da non confondere\*\*", txt):
                    continue
                if kind != "li":
                    continue
                stats["punti_trappole"] = stats.get("punti_trappole", 0) + 1
                cards.extend(cloze_cards(mark_nov(txt), base(), "trappola", stats))

    i = 0
    n = len(lines)
    while i < n:
        lineno, ln = lines[i]
        s = ln.strip()
        if ln == "\x00CLEARPAGE":
            after_clearpage = True
            i += 1
            continue
        fi = fence_info(s)
        if fi:
            ncol, name = fi
            if name:
                stack.append(name)
                block_buf = []
            elif stack:
                name = stack.pop()
                if name in ("inbreve", "trappole"):
                    flush_block(name, block_buf)
                block_buf = []
            i += 1
            continue
        if stack and stack[-1] in ("inbreve", "trappole"):
            block_buf.append(ln)
            i += 1
            continue
        m = PARTE_RE.match(s)
        if m:
            parte = m.group(1).strip()
            i += 1
            continue
        m = SCHEDA_RE.match(s)
        if m:
            new_scheda(m.group(1), take_nov(m.group(2))[0], False)
            after_clearpage = False
            i += 1
            continue
        m = H1_RE.match(s) if not s.startswith("##") else None
        if m:
            title = take_nov(m.group(1))[0]
            numeri = (after_clearpage and not is_niche) or bool(
                re.match(r"(I numeri|Colpo d'occhio)", title, re.I))
            new_scheda("", title, numeri)
            after_clearpage = False
            i += 1
            continue
        m = H2_RE.match(s)
        if m:
            sezione = md_plain(take_nov(m.group(1))[0])
            sub = ""
            i += 1
            continue
        if s.startswith("|") and i + 1 < n and is_table_sep(lines[i + 1][1]):
            rows = []
            while i < n and lines[i][1].strip().startswith("|"):
                rows.append(lines[i][1])
                i += 1
            caption = md_inline(take_nov(last_para)[0]) if last_para else ""
            if scheda:
                b = base()
                stats["righe_tabella"] = stats.get("righe_tabella", 0) + len(rows) - 2
                cards.extend(_table_cards(rows, b, stats, caption))
            last_para = ""
            continue
        if is_niche and scheda:
            if re.fullmatch(r"\*\*[^*]+\*\*", s):
                sezione = md_plain(s)
                i += 1
                continue
            mi = ITEM_RE.match(ln)
            if mi and len(mi.group(1)) < 2:
                txt = mi.group(2).strip()
                # continuazioni
                while i + 1 < n and lines[i + 1][1].startswith("  ") and not ITEM_RE.match(lines[i + 1][1]):
                    i += 1
                    txt += " " + lines[i][1].strip()
                stats["punti_dettaglio"] = stats.get("punti_dettaglio", 0) + 1
                cards.extend(cloze_cards(mark_nov(txt), base(), "dettaglio", stats))
                i += 1
                continue
        if s:
            last_para = s if (s.startswith("**") and len(md_plain(s)) < 120 and not ITEM_RE.match(ln)) else ""
        i += 1

    # ID univoci
    seen = {}
    for c in cards:
        if c["id"] in seen:
            seen[c["id"]] += 1
            c["id"] = c["id"] + "-%d" % seen[c["id"]]
        else:
            seen[c["id"]] = 0
    return {
        "vol": vol,
        "title": vol_title,
        "file": os.path.basename(path),
        "schede": [sc for sc in schede if any(c["schedaKey"] == sc["key"] for c in cards)],
        "cards": cards,
        "stats": stats,
    }
