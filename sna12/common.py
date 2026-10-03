"""Funzioni comuni: markdown inline, recinti «:::», tabelle pipe, pulizia LaTeX, ID stabili."""

import hashlib
import html
import re

_ESC_RE = re.compile(r"\\([!-/:-@\[-`{-~])")
_PH_RE = re.compile("\ue001(\\d+)\ue001")


def take_nov(text):
    """Toglie \\nov{} dal testo. Restituisce (testo, era_novità)."""
    has = "\\nov{}" in text
    if not has:
        return text.strip(), False
    text = text.replace("\\nov{}", "")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\s+([,;.:)])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    return text.strip(), True


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


def md_inline(text):
    """Markdown inline (grassetto, corsivo, escape) → HTML sicuro."""
    text, saved = _protect_escapes(text)
    text = html.escape(text, quote=False)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"<i>\1</i>", text)
    return _restore_escapes(text, saved, True)


def md_plain(text):
    """Markdown inline → testo semplice (ricerca, ID, confronti)."""
    text, saved = _protect_escapes(text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = text.replace("**", "").replace("`", "")
    text = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"\1", text)
    text = _restore_escapes(text, saved, False)
    return re.sub(r"\s+", " ", text).strip()


def stable_id(*parts, n=10):
    h = hashlib.sha1("\u241f".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return h[:n]


FENCE_RE = re.compile(r"^(:{3,})\s*(.*?)\s*:*\s*$")


def fence_info(line):
    """Recinto pandoc «:::»: restituisce (n_due_punti, nome) oppure None. Nome vuoto = chiusura."""
    m = FENCE_RE.match(line)
    if not m:
        return None
    name = m.group(2).strip()
    if name.startswith("{"):
        inner = name.strip("{} ").split()
        name = inner[0].lstrip(".") if inner else ""
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
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", s)]


def is_table_sep(line):
    cells = split_table_row(line)
    return any(cells) and all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c)


def is_empty_cell(text):
    return take_nov(md_plain(text))[0] in ("", "—", "-", "–", "−", "/", "…", "...")


CLEARPAGE = "\x00CLEARPAGE"
_LATEX_RE = re.compile(r"^\\(?!parte\b|nov\{\})[A-Za-z]+")


def clean_md_lines(raw_lines):
    """Toglie i comandi LaTeX di impaginazione (anche i blocchi center).

    \\clearpage diventa il segnaposto CLEARPAGE: annuncia la pagina di sintesi finale.
    """
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
        if s.startswith("\\clearpage") or s.startswith("\\newpage"):
            out.append(CLEARPAGE)
            continue
        if _LATEX_RE.match(s):
            continue
        out.append(ln)
    return out
