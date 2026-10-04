"""Quesiti d'archivio (Dossier 1-6) e Formez (Addenda 1-2) letti dai PDF.

Il testo viene da `pdftotext -layout`; le figure dei quesiti figurali da
`pdftohtml -xml`, che dà anche la loro posizione nella pagina. Testi, opzioni,
chiavi e commenti restano quelli dei PDF: qui si tolgono solo testatine e
numeri di pagina e si ricompongono le righe spezzate.

Gli ID sono quelli dell'analisi (`quesiti_sna12.csv`): `D<n>-<k>` per i
dossier, `D1-M<n>` per i dodici modelli del Dossier 1, `AD1-<sez>.<n>` e
`AD2-<sez>.<n>` per le Addenda.
"""

import base64
import glob
import os
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

SOURCES = (
    ("D1", "SNA12_DOSSIER_01_*.pdf"),
    ("D2", "SNA12_DOSSIER_02_*.pdf"),
    ("D3", "SNA12_DOSSIER_03_*.pdf"),
    ("D4", "SNA12_DOSSIER_04_*.pdf"),
    ("D5", "SNA12_DOSSIER_05_*.pdf"),
    ("D6", "SNA12_DOSSIER_06_*.pdf"),
    ("AD1", "SNA12_ADDENDA_*.pdf"),
    ("AD2", "SNA12_ADDENDA2_*.pdf"),
)

BREAK = "\x00BREAK"

START = re.compile(r"^\s*(?:(\d+)|([A-I])\.(\d+))\.\s+\[UFFICIALE")
PASSAGE = re.compile(r"^\s*\[UFFICIALE SNA-(\d+) \| busta (\d)[^\]]*?, Q(\d+)-(\d+)\]\s*$")
PASSAGE_PART = re.compile(r"busta (\d)[^·\]]*?, Q(\d+)-(\d+)")
MODELLO = re.compile(r"^Modello (\d+) — (.+)$")
OPTION = re.compile(r"^•\s*([A-E])(?:\s+(.*)|(\S{1,3}))$")
INLINE_OPTIONS = re.compile(r"^([A-E]) (.+?) · ([B-E]) ")
KEY = re.compile(r"^Chiave(?: ufficiale)?: ([A-E])\b")
HEADING = re.compile(
    r"^(Scheda [A-Z]+\d+ — |Quesiti d’archivio|Brano \d+ — |Parte [A-Z] — |[A-D]\.\d+ \S"
    r"|[A-I]\. [A-Z][a-z]|Modello \d+ — |Da memorizzare|Da ricordare|Da domani|Da oggi"
    r"|Allenamento quotidiano|Soluzioni$|\d+\.\d+ [A-Z]|\d+\. [A-Z][a-z]+\b)"
)
LABEL = re.compile(r"\[(UFFICIALE[^\]]*)\]")
FIGURE_REF = re.compile(r"\b(Fig\.|Figura|Immagine|Alternativa \d)", re.I)
COORD = re.compile(r"SNA-(\d+) \| busta (\d)[^\]]*?, Q(\d+)")


def find_sources(pdf_dir):
    """{prefisso: percorso}; fra due versioni dello stesso dossier vince quella non da stampa."""
    out = {}
    for prefix, pattern in SOURCES:
        found = sorted(glob.glob(os.path.join(pdf_dir, pattern)))
        if not found:
            continue
        plain = [f for f in found if "STAMPA" not in os.path.basename(f)]
        out[prefix] = (plain or found)[-1]
    return out


def available(pdf_dir):
    return bool(shutil.which("pdftotext")) and bool(find_sources(pdf_dir))


def pdf_text(path):
    return subprocess.run(["pdftotext", "-layout", path, "-"], check=True,
                          capture_output=True, text=True).stdout


# --- pagine -----------------------------------------------------------------

def page_lines(text):
    """Righe del documento senza testatine e numeri di pagina.

    Ogni elemento è (pagina, riga). Fra due pagine c'è una riga BREAK: chi
    legge decide se il paragrafo continua o no.
    """
    out = []
    for n, page in enumerate(text.split("\f"), start=1):
        lines = page.split("\n")
        idx = [i for i, l in enumerate(lines) if l.strip()]
        if idx and lines[idx[0]].lstrip().startswith("SNA XII /"):
            lines[idx[0]] = ""
        idx = [i for i, l in enumerate(lines) if l.strip()]
        if idx and re.fullmatch(r"\s*\d{1,3}\s*", lines[idx[-1]]):
            lines[idx[-1]] = ""
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
        if not lines:
            continue
        if out:
            out.append((n, BREAK))
        out.extend((n, l.rstrip()) for l in lines)
    return out


# --- ricomposizione delle righe ----------------------------------------------

WORD = re.compile(r"[^\W\d_]+(?:-[^\W\d_]+)*", re.UNICODE)


class Vocab:
    """Parole viste intere nei testi: decidono se il trattino a fine riga resta."""

    def __init__(self):
        self.words = set()
        self.hyph = set()

    def feed(self, text):
        for line in text.split("\n"):
            body = line.rstrip()
            if body.endswith("-"):
                body = body[:-1].rsplit(" ", 1)[0] if " " in body else ""
            for w in WORD.findall(body):
                w = w.lower()
                if "-" in w:
                    self.hyph.add(w)
                else:
                    self.words.add(w)

    def join_hyphen(self, left, right):
        """True se il trattino fra `left` e `right` è vero (resta)."""
        l = re.search(r"([^\W_]+)$", left)
        r = re.match(r"([^\W_]+)", right)
        if not l or not r:
            return True
        a, b = l.group(1).lower(), r.group(1).lower()
        if f"{a}-{b}" in self.hyph:
            return True
        if a + b in self.words:
            return False
        if a[-1].isdigit() or b[0].isdigit() or r.group(1)[0].isupper():
            return True
        if a[-1] in "àèéìòù":
            return True
        # due parole lunghe e intere (economico-tecnico); le sillabe spezzate sono più corte
        if len(a) >= 8 and len(b) >= 6 and a in self.words and b in self.words:
            return True
        return False


def join_lines(lines, vocab):
    out = ""
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if not out:
            out = s
        elif out.endswith("-") and len(out) > 1 and out[-2].isalnum():
            if vocab.join_hyphen(out[:-1], s):
                out += s
            else:
                out = out[:-1] + s
        else:
            out += " " + s
    return re.sub(r"(?<=\S)  +(?=\S)", " ", out)


# --- blocchi ----------------------------------------------------------------

def _is_full(line, width):
    s = line.rstrip()
    return s.endswith("-") or len(s) >= width - 12


def _is_heading_after(lines, i, width):
    """Dopo un salto pagina: una riga breve, senza punto e seguita da una riga vuota è un titolo."""
    nxt = lines[i + 1:i + 3]
    if not nxt or nxt[0] == BREAK or not nxt[0].strip():
        return False
    first = nxt[0].rstrip()
    after = nxt[1] if len(nxt) > 1 else ""
    return (not after.strip() and not re.search(r"[.?!:;»)]$", first)
            and len(first) < width - 12)


def paragraphs(lines):
    """Divide in paragrafi; una riga BREAK unisce se la riga prima arriva al margine."""
    width = max((len(l) for l in lines if l != BREAK), default=0)
    paras, cur = [], []
    for i, l in enumerate(lines):
        if l == BREAK:
            if cur and (not _is_full(cur[-1], width) or _is_heading_after(lines, i, width)):
                paras.append(cur)
                cur = []
            continue
        if not l.strip():
            if cur:
                paras.append(cur)
                cur = []
            continue
        cur.append(l)
    if cur:
        paras.append(cur)
    return paras


def dedent(lines):
    ind = min((len(l) - len(l.lstrip()) for l in lines if l.strip() and l != BREAK), default=0)
    return [l if l == BREAK else l[ind:] for l in lines]


def segment(rows):
    """Divide le righe in blocchi: ('q', id_locale, righe), ('passage', ...), ('modello', ...)."""
    blocks = []
    cur = None
    for i, (page, line) in enumerate(rows):
        s = line.strip() if line != BREAK else ""
        m = START.match(line) if line != BREAK else None
        pm = PASSAGE.match(line) if line != BREAK else None
        mm = MODELLO.match(s) if s else None
        prev = rows[i - 1][1] if i else ""
        heading = bool(s) and HEADING.match(s) and not m and (prev == BREAK or not prev.strip())
        if m:
            local = m.group(1) or f"{m.group(2)}.{m.group(3)}"
            cur = {"kind": "q", "local": local, "page": page, "lines": [line]}
            blocks.append(cur)
        elif pm:
            title = ""
            for j in range(i - 1, max(i - 4, -1), -1):
                t = rows[j][1]
                if t != BREAK and t.strip():
                    title = t.strip()
                    break
            if cur and cur["lines"] and cur["lines"][-1].strip() == title:
                cur["lines"].pop()
            cur = {"kind": "passage", "title": title, "label": s, "page": page,
                   "ed": int(pm.group(1)),
                   "parts": [(int(a), int(b), int(c)) for a, b, c in PASSAGE_PART.findall(s)],
                   "lines": []}
            blocks.append(cur)
        elif mm:
            cur = {"kind": "modello", "local": mm.group(1), "title": mm.group(2),
                   "page": page, "lines": []}
            blocks.append(cur)
        elif heading:
            cur = None
        elif cur is not None:
            cur["lines"].append(line)
    return blocks


def _split_question(lines, vocab):
    """Etichetta, testo, opzioni e paragrafi dopo le opzioni."""
    lines = dedent(lines)
    head, opts, tail = [], [], []
    state = "head"
    expanded = []
    for l in lines:
        if l != BREAK and l.lstrip().startswith("•") and len(re.findall(r"•\s*[A-E]\s", l)) > 1:
            expanded.extend(re.split(r"\s+(?=•\s*[A-E]\s)", l.strip()))
        else:
            expanded.append(l)
    for l in expanded:
        s = l.strip() if l != BREAK else ""
        if state != "tail" and l != BREAK:
            om = OPTION.match(s)
            im = INLINE_OPTIONS.match(s)
            if KEY.match(s):
                state = "tail"
            elif om:
                state = "opts"
                opts.append([om.group(1), [om.group(2) or om.group(3)]])
                continue
            elif im and state == "head":
                for part in re.split(r" · (?=[A-E] )", s):
                    opts.append([part[0], [part[2:]]])
                state = "opts"
                continue
            elif state == "opts" and s:
                opts[-1][1].append(s)
                continue
        if state == "head":
            head.append(l)
        elif state == "tail":
            tail.append(l)
    text = join_lines([l for l in head if l != BREAK], vocab)
    label = ""
    lm = LABEL.search(text)
    if lm:
        label = lm.group(1)
        text = text[lm.end():].strip()
    text = re.sub(r"^\d+\.\s*", "", text) if not lm else text
    options = [[k, join_lines(v, vocab)] for k, v in opts]
    paras = [join_lines(p, vocab) for p in paragraphs(tail)]
    return label, text, options, paras


def parse_key(com):
    m = KEY.match(com or "")
    if not m:
        return None, ""
    rest = com[m.end():]
    kind = "ufficiale" if ("ufficiale" in rest[:40] or com.startswith("Chiave ufficiale")) else "ragionata"
    return m.group(1), kind


def parse_document(prefix, text, vocab):
    rows = page_lines(text)
    blocks = segment(rows)
    questions, passages, extra = [], [], []
    current = None
    for b in blocks:
        if b["kind"] == "passage":
            current = {
                "id": f"{prefix}-B{len(passages) + 1}", "title": b["title"],
                "label": b["label"].strip("[]"), "ed": b["ed"], "parts": b["parts"],
                "page": b["page"], "text": [join_lines(p, vocab) for p in paragraphs(b["lines"])],
            }
            passages.append(current)
            continue
        if b["kind"] == "modello":
            if prefix != "D1":
                continue
            q = _parse_modello(b, vocab)
            if q:
                questions.append(q)
            continue
        label, qtext, options, paras = _split_question(b["lines"], vocab)
        com = [p for p in paras if p]
        key, kind = parse_key(com[0] if com else "")
        q = {"id": f"{prefix}-{b['local']}", "page": b["page"], "label": label,
             "text": qtext, "options": options, "key": key, "keykind": kind,
             "com": com[:1]}
        if len(com) > 1:
            extra.append((q["id"], com[1:]))
        m = COORD.search(label)
        if current and m and int(m.group(1)) == current["ed"] and any(
                int(m.group(2)) == bu and lo <= int(m.group(3)) <= hi for bu, lo, hi in current["parts"]):
            q["passage"] = current["id"]
        questions.append(q)
    return questions, passages, extra


def _parse_modello(b, vocab):
    lines = dedent(b["lines"])
    paras = paragraphs(lines)
    if not paras:
        return None
    joined = [join_lines(p, vocab) for p in paras]
    comp = joined[0]
    lm = LABEL.search(comp)
    if not lm:
        return None
    situ, options, com = [], [], []
    state = "situ"
    for p, raw in zip(joined[1:], paras[1:]):
        if state == "situ" and not OPTION.match(raw[0].strip()):
            situ.append(p)
            continue
        if state in ("situ", "opts") and OPTION.match(raw[0].strip()):
            state = "opts"
            for l in raw:
                om = OPTION.match(l.strip())
                if om:
                    options.append([om.group(1), [om.group(2) or om.group(3)]])
                elif KEY.match(l.strip()):
                    state = "com"
                    com.append([l])
                elif state == "opts":
                    options[-1][1].append(l)
                elif l.strip().startswith("Vince la "):
                    com.append([l])
                else:
                    com[-1].append(l)
            continue
        state = "com"
        com.append(raw)
    com = [join_lines(c, vocab) for c in com]
    key, kind = parse_key(com[0] if com else "")
    return {"id": f"D1-M{b['local']}", "page": b["page"], "label": lm.group(1),
            "title": b["title"], "competenza": comp[:lm.start()].strip(),
            "text": "\n\n".join(situ), "options": [[k, join_lines(v, vocab)] for k, v in options],
            "key": key, "keykind": kind, "com": com}


# --- figure -----------------------------------------------------------------

def figures(path, workdir):
    """Immagini del PDF con la pagina e la posizione, più le etichette dei quesiti."""
    base = os.path.join(workdir, "x")
    subprocess.run(["pdftohtml", "-xml", "-q", path, base], check=True, capture_output=True)
    root = ET.parse(base + ".xml").getroot()
    images, labels = [], []
    for page in root.iter("page"):
        n = int(page.get("number"))
        texts = list(page.iter("text"))
        for img in page.iter("image"):
            images.append({"page": n, "top": int(img.get("top")), "src": img.get("src")})
        for i, t in enumerate(texts):
            s = "".join(t.itertext()).strip()
            m = re.fullmatch(r"(\d+)\.", s)
            if m and i + 1 < len(texts) and "".join(texts[i + 1].itertext()).strip().startswith("[UFFICIALE"):
                labels.append({"page": n, "top": int(t.get("top")), "local": m.group(1)})
    return images, labels


def attach_images(questions, prefix, path, wanted):
    """Assegna ogni immagine al quesito la cui etichetta la precede (o le sta accanto)."""
    if not shutil.which("pdftohtml"):
        return []
    by_id = {q["id"]: q for q in questions}
    attached = []
    with tempfile.TemporaryDirectory() as tmp:
        images, labels = figures(path, tmp)
        labels.sort(key=lambda x: (x["page"], x["top"]))
        for img in images:
            owner = None
            for lab in labels:
                if (lab["page"], lab["top"]) <= (img["page"], img["top"] + 40):
                    owner = lab
                else:
                    break
            if not owner:
                continue
            qid = f"{prefix}-{owner['local']}"
            if qid not in by_id or not wanted(qid):
                continue
            src = img["src"] if os.path.isabs(img["src"]) else os.path.join(tmp, os.path.basename(img["src"]))
            data = _compress(src, tmp)
            by_id[qid].setdefault("img", []).append(data)
            attached.append(qid)
    return attached


def _compress(src, tmp):
    out = os.path.join(tmp, "c.png")
    if shutil.which("convert"):
        subprocess.run(["convert", src, "-strip", "-resize", "720x>", "-colors", "32",
                        "PNG8:" + out], check=True, capture_output=True)
    else:
        out = src
    with open(out, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


# --- tutto insieme ----------------------------------------------------------

def parse_all(pdf_dir, with_images=True):
    """{'questions': {id: q}, 'passages': [...], 'extra': [...], 'sources': {...}}."""
    sources = find_sources(pdf_dir)
    texts = {p: pdf_text(f) for p, f in sources.items()}
    vocab = Vocab()
    for t in texts.values():
        vocab.feed(t)
    questions, passages, extra = {}, [], []
    for prefix, text in texts.items():
        qs, ps, ex = parse_document(prefix, text, vocab)
        for q in qs:
            q["src"] = prefix
            questions[q["id"]] = q
        for p in ps:
            p["src"] = prefix
        passages.extend(ps)
        extra.extend(ex)
    if with_images and "D6" in sources:
        attach_images(list(questions.values()), "D6", sources["D6"], lambda qid: bool(
            FIGURE_REF.search(questions[qid]["text"] + " " + " ".join(o[1] for o in questions[qid]["options"]))))
    return {"questions": questions, "passages": passages, "extra": extra, "sources": sources}


def coordinates(label):
    m = COORD.search(label or "")
    if not m:
        return None
    return f"SNA{m.group(1)}-B{m.group(2)}-Q{m.group(3)}"
