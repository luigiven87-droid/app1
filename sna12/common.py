"""Funzioni comuni ai parser: markdown inline, recinti «:::», tabelle pipe, ID stabili."""

import hashlib
import html
import re

NOV_MARK = "\ue000"  # segnaposto interno per \nov{} durante il parsing

_ESC_RE = re.compile(r"\\([!-/:-@\[-`{-~])")
_PH_RE = re.compile("\ue001(\\d+)\ue001")


def strip_latex_inline(text):
    """Toglie i comandi LaTeX inline residui (diversi da \\nov{}) lasciando il testo."""
    text = re.sub(r"\\(?:condbreak|clearpage|newpage|noindent|par)\b(\{[^}]*\})?", "", text)
    return text


def mark_nov(text):
    """Sostituisce \\nov{} con il segnaposto NOV_MARK."""
    return re.sub(r"\\nov\{\}", NOV_MARK, text)


def take_nov(text):
    """Restituisce (testo senza segnaposto/\\nov{}, era_novita)."""
    has = NOV_MARK in text or "\\nov{}" in text
    text = text.replace(NOV_MARK, "").replace("\\nov{}", "")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\s+([,;.:)])", r"\1", text) if has else text
    text = re.sub(r"\(\s+", "(", text) if has else text
    return text.strip(), has


def _protect_escapes(text):
    saved = []

    def repl(m):
        saved.append(m.group(1))
        return "\ue001%d\ue001" % (len(saved) - 1)

    return _ESC_RE.sub(repl, text), saved


def _restore_escapes(text, saved, escape_html):
    def repl(m):
        ch = saved[int(m.group(1))]
        return html.escape(ch, quote=False) if escape_html else ch

    return _PH_RE.sub(repl, text)


def _inline_core(text):
    """Converte markup inline già protetto (escape) in HTML."""
    text = html.escape(text, quote=False)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"<i>\1</i>", text)
    text = re.sub(r"(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])", r"<i>\1</i>", text)
    text = re.sub(r"\^([^\s^]+)\^", r"<sup>\1</sup>", text)
    text = re.sub(r"(?<!~)~([^\s~]+)~(?!~)", r"<sub>\1</sub>", text)
    return text


def md_inline(text):
    """Markdown inline (grassetto, corsivo, escape) → HTML sicuro."""
    text, saved = _protect_escapes(text)
    return _restore_escapes(_inline_core(text), saved, True)


def md_plain(text):
    """Markdown inline → testo semplice (per ricerca, ID, confronti)."""
    text, saved = _protect_escapes(text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = text.replace("**", "").replace("`", "")
    text = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"\1", text)
    text = _restore_escapes(text, saved, False)
    return re.sub(r"\s+", " ", text).strip()


def bold_segments(text):
    """Divide il markdown in segmenti [(è_grassetto, testo)] sui delimitatori **.

    Gli escape (\\*) sono protetti, quindi non producono falsi delimitatori.
    """
    prot, saved = _protect_escapes(text)
    parts = prot.split("**")
    if len(parts) % 2 == 0:  # numero dispari di ** → l'ultimo non è chiuso
        parts[-2] = parts[-2] + "**" + parts[-1]
        parts.pop()
    out = []
    for i, p in enumerate(parts):
        if p == "":
            continue
        out.append((i % 2 == 1, p))
    return out, saved


def segments_html(segments, saved, gaps):
    """Rende i segmenti in HTML; i grassetti con indice in `gaps` diventano lacune.

    `gaps` è un dict {indice_grassetto: numero_lacuna}.
    """
    out = []
    bi = 0
    for is_bold, txt in segments:
        h = _restore_escapes(_inline_core(txt), saved, True)
        if is_bold:
            if bi in gaps:
                out.append('<b class="lac" data-i="%d">%s</b>' % (gaps[bi], h))
            else:
                out.append("<b>%s</b>" % h)
            bi += 1
        else:
            out.append(h)
    return "".join(out).strip()


def stable_id(*parts, n=10):
    h = hashlib.sha1("\u241f".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return h[:n]


FENCE_RE = re.compile(r"^(:{3,})\s*(.*?)\s*:*\s*$")


def fence_info(line):
    """Se la riga è un recinto pandoc «:::», restituisce (n_due_punti, nome) altrimenti None.

    Nome vuoto = chiusura. Il nome è la prima parola (o il contenuto fra graffe).
    """
    m = FENCE_RE.match(line)
    if not m:
        return None
    name = m.group(2).strip()
    if name.startswith("{"):
        inner = name.strip("{} ")
        first = inner.split()[0] if inner.split() else ""
        name = first.lstrip(".")
    else:
        name = name.split()[0] if name else ""
    return len(m.group(1)), name


def split_table_row(line):
    """Divide una riga di tabella pipe in celle (rispetta \\|)."""
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    cells = re.split(r"(?<!\\)\|", s)
    return [c.strip().replace("\\|", "|") for c in cells]


def is_table_sep(line):
    cells = split_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c) and any(cells)


def is_empty_cell(text):
    p = md_plain(text).replace(NOV_MARK, "").strip()
    return p in ("", "—", "-", "–", "−", "/", "…", "...")


LATEX_SKIP_RE = re.compile(r"^\\(?!parte\b|nov\{\})[A-Za-z]+")


def clean_md_lines(raw_lines):
    """Toglie i comandi LaTeX di impaginazione (anche i blocchi center). Restituisce righe."""
    out = []
    in_center = False
    for raw in raw_lines:
        ln = raw.rstrip("\n").rstrip("\r")
        s = ln.strip()
        if in_center:
            if s.startswith("\\end{center}"):
                in_center = False
            continue
        if s.startswith("\\begin{center}"):
            in_center = True
            continue
        if LATEX_SKIP_RE.match(s):
            continue
        out.append(ln)
    return out


_LIST_RE = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")


def md_blocks(lines):
    """Mini-renderer a blocchi: paragrafi, elenchi, citazioni, tabelle → HTML."""
    out = []
    i = 0
    n = len(lines)
    while i < n:
        ln = lines[i]
        s = ln.strip()
        if not s or fence_info(s) or re.fullmatch(r"-{3,}|\*{3,}|_{3,}", s):
            i += 1
            continue
        if s.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append("<blockquote>%s</blockquote>" % md_blocks(buf))
            continue
        if s.startswith("|") and i + 1 < n and is_table_sep(lines[i + 1]):
            head = split_table_row(lines[i])
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(split_table_row(lines[i]))
                i += 1
            h = "".join("<th>%s</th>" % md_inline(c) for c in head)
            b = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % md_inline(c) for c in r) for r in rows)
            out.append('<div class="tw"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (h, b))
            continue
        m = _LIST_RE.match(ln)
        if m and len(m.group(1)) < 2:
            ordered = m.group(2)[0].isdigit()
            items = []
            while i < n:
                mm = _LIST_RE.match(lines[i])
                if mm and len(mm.group(1)) < 2:
                    items.append(mm.group(3).strip())
                elif lines[i].strip() and (lines[i].startswith("  ") or (mm and len(mm.group(1)) >= 2)) and items:
                    items[-1] += " " + lines[i].strip()
                elif not lines[i].strip():
                    # elenco "largo": continua se la riga dopo è un'altra voce
                    if i + 1 < n and _LIST_RE.match(lines[i + 1]) and len(_LIST_RE.match(lines[i + 1]).group(1)) < 2:
                        i += 1
                        continue
                    break
                else:
                    break
                i += 1
            tag = "ol" if ordered else "ul"
            out.append("<%s>%s</%s>" % (tag, "".join("<li>%s</li>" % md_inline(it) for it in items), tag))
            continue
        buf = []
        while i < n and lines[i].strip() and not lines[i].strip().startswith(">") \
                and not (_LIST_RE.match(lines[i]) and buf == []) and not fence_info(lines[i].strip()):
            if _LIST_RE.match(lines[i]) and len(_LIST_RE.match(lines[i]).group(1)) < 2:
                break
            buf.append(lines[i].strip())
            i += 1
        if buf:
            out.append("<p>%s</p>" % md_inline(" ".join(buf)))
        else:
            i += 1
    return "".join(out)


ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman_to_int(s):
    total, prev = 0, 0
    for ch in reversed(s.upper()):
        v = ROMAN.get(ch, 0)
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total
