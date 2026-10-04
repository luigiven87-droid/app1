"""Test dei parser (ripassi e quesiti dei dossier).  Uso:  python3 -m unittest discover -s tests -v"""

import glob
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from build import ESCLUSI, collect  # noqa: E402
from sna12 import elaborate, quesiti, simulazioni  # noqa: E402
from sna12.common import md_inline  # noqa: E402
from sna12.ripassi import iter_points  # noqa: E402

REAL = os.path.join(ROOT, "materiali")
LEFTOVER = re.compile(r"\\[a-zA-Z]+|\*\*|:::")


class TestRipassi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not glob.glob(os.path.join(REAL, "RIPASSO_*.md")):
            raise unittest.SkipTest("nessun RIPASSO_*.md in materiali/")
        cls.vols = collect(REAL)
        cls.points = [p for v in cls.vols for sc in v["schede"] for p in iter_points(sc["b"])]

    def test_volume_di_nicchia_escluso(self):
        self.assertTrue(all(v["file"] not in ESCLUSI for v in self.vols))
        self.assertEqual(len(self.vols), 4)

    def test_ogni_scheda_ha_punti(self):
        for v in self.vols:
            self.assertGreater(len(v["schede"]), 5, v["file"])
            for sc in v["schede"]:
                self.assertTrue(any(True for _ in iter_points(sc["b"])), sc["key"])

    def test_schede_attese(self):
        codes = [sc["code"] for v in self.vols for sc in v["schede"]]
        for c in ("D1", "D10", "M1", "P6", "C1", "U7", "E1", "PE4", "A4"):
            self.assertIn(c, codes)
        # una pagina dei numeri per volume
        self.assertEqual(sum(1 for v in self.vols for sc in v["schede"] if sc["numeri"]), 4)

    def test_id_univoci(self):
        ids = [p["id"] for p in self.points]
        self.assertEqual(len(ids), len(set(ids)))

    def test_niente_markup_residuo(self):
        for p in self.points:
            blob = " ".join([p.get("h", ""), p.get("q", ""), p.get("ql", "")] + [x for r in p.get("a", []) for x in r])
            self.assertIsNone(LEFTOVER.search(blob), (p["id"], blob[:160]))

    def test_riquadri_essenziali(self):
        ess = [p for p in self.points if p.get("ess")]
        self.assertGreater(len(ess), 250)
        d4 = [sc for v in self.vols for sc in v["schede"] if sc["code"] == "D4"][0]
        boxes = [b for b in d4["b"] if b["t"] == "box"]
        self.assertEqual([b["k"] for b in boxes], ["inbreve", "trappole"])
        self.assertEqual(len(boxes[1]["b"]), 10)  # i 10 punti di «Da non confondere» di D4

    def test_novita_e_tabelle(self):
        self.assertGreater(sum(1 for p in self.points if p.get("nov")), 40)
        rows = [p for p in self.points if p["t"] == "row"]
        self.assertTrue(all(p["a"] or p["q"] for p in rows))
        taylor = [p for p in rows if re.sub(r"<[^>]+>", "", p["q"]) == "Taylor"]
        self.assertTrue(taylor and len(taylor[0]["a"]) == 1)  # tabella a coppie Autore | Concetto

    def test_testo_integrale(self):
        """Il testo dei punti è quello del file: controllo a campione su frasi note."""
        allt = " ".join(re.sub(r"<[^>]+>", "", p.get("h", "")) for p in self.points)
        for frase in ("i pubblici impiegati sono al servizio esclusivo della Nazione",
                      "l'istante ha 10 giorni per presentare osservazioni scritte",
                      "La Provincia è un ente di secondo grado."):
            self.assertIn(frase, allt + " " + " ".join(r[1] for p in self.points for r in p.get("a", [])))


class TestFigure(unittest.TestCase):
    def test_figure_agganciate_e_ben_formate(self):
        import xml.etree.ElementTree as ET
        from sna12 import figure
        vols = collect(REAL)  # collect() aggancia le figure; un aggancio mancante solleva errore
        figs = []

        def walk(bs):
            for b in bs:
                if b["t"] == "fig":
                    figs.append(b)
                elif b["t"] == "box":
                    walk(b["b"])
        for v in vols:
            for sc in v["schede"]:
                walk(sc["b"])
        self.assertEqual(len(figs), len(figure.FIGURES))
        for f in figs:
            root = ET.fromstring(f["svg"])
            self.assertTrue(root.get("aria-label"))
            self.assertTrue(f["cap"])
            self.assertNotIn("<script", f["svg"])

    def test_costi_minimi(self):
        """Il CMa taglia CVMe e CMe esattamente nel loro minimo (come dice la scheda E2)."""
        from sna12.figure import curve_costi
        cvme, cma, cme, q_cv, q_ce = curve_costi()
        self.assertAlmostEqual(cma(q_cv), cvme(q_cv), places=6)
        self.assertAlmostEqual(cma(q_ce), cme(q_ce), places=6)
        for d in (-0.05, 0.05):
            self.assertGreater(cvme(q_cv + d), cvme(q_cv))
            self.assertGreater(cme(q_ce + d), cme(q_ce))


class TestQuesiti(unittest.TestCase):
    """Sui PDF veri (materiali/pdf) e sull'analisi (materiali/analisi), se ci sono."""

    @classmethod
    def setUpClass(cls):
        if not simulazioni.available(REAL):
            raise unittest.SkipTest("mancano i PDF in materiali/pdf o l'analisi in materiali/analisi")
        cls.sim = simulazioni.build(REAL)
        cls.q = {q["id"]: q for q in cls.sim["q"]}

    def test_conteggi(self):
        info = self.sim["info"]
        self.assertEqual(info["unlisted"], [])
        # mancano solo i quesiti del Dossier 1 che il PDF riassume in una riga
        self.assertTrue(all(m.startswith("D1-") for m in info["missing_ids"]), info["missing_ids"])
        self.assertTrue(all(re.match(r"D1-(S\d|M\d+\.B)", m) for m in info["missing_ids"]))
        self.assertEqual(info["used"] + info["excluded"] + info["missing"], info["rows"])
        self.assertEqual(sum(1 for q in self.sim["q"] if q["a"] == "ragionamento" and q["t"].startswith("figurale")), 54)

    def test_chiavi_e_opzioni(self):
        for q in self.sim["q"]:
            letters = [o[0] for o in q["o"]]
            self.assertIn(q["k"], letters, q["id"])
            self.assertEqual(letters, sorted(letters), q["id"])
            self.assertTrue(q["q"] and all(o[1] for o in q["o"]), q["id"])
            self.assertTrue(q["com"] and re.match(r"Chiave", q["com"][0]), q["id"])
            self.assertNotIn("•", q["q"] + "".join(o[1] for o in q["o"]), q["id"])

    def test_testo_alla_lettera(self):
        q = self.q["D3-7"]
        self.assertEqual(q["c"], "SNA9-B3-Q30")
        self.assertTrue(q["q"].startswith("La pubblica amministrazione, nell’adozione di atti di natura non autoritativa"))
        self.assertEqual(q["o"][0], ["A", "agisce secondo le norme di diritto privato, salvo che la legge disponga diversamente"])
        self.assertEqual((q["k"], q["kk"]), ("A", "ufficiale"))
        self.assertIn("(art. 1, comma 1-bis)", q["com"][0])  # trattino a fine riga conservato
        self.assertEqual([o[1] for o in self.q["AD2-I.14"]["o"]], ["S", "T", "R"])

    def test_parole_spezzate_ricomposte(self):
        text = " ".join(q["q"] + " " + " ".join(o[1] for o in q["o"]) + " " + " ".join(q["com"]) for q in self.sim["q"])
        self.assertNotRegex(text, r"\b(elettroni-che|com-promettono|con-temporanea)\b")
        self.assertIn("elettroniche", self.q["D1-M5"]["q"])

    def test_situazionali(self):
        m1 = self.q["D1-M1"]
        self.assertEqual((m1["k"], m1["kk"]), ("C", "ufficiale"))
        self.assertTrue(m1["q"].startswith("Sei il/la nuovo/a responsabile del reparto marketing"))
        self.assertTrue(any(c.startswith("Vince la C") for c in m1["com"]))
        self.assertNotIn("w", m1)  # SNA 9: pubblicata solo la migliore
        a1 = self.q["AD2-A.1"]
        self.assertEqual((a1["k"], a1["w"]), ("C", "B"))

    def test_brani_e_figure(self):
        b = self.q["D6-1"]
        self.assertIn("Taffimay", " ".join(self.sim["passages"][b["p"]]["text"]))
        mozart = [q for q in self.sim["q"] if q.get("p") and "Mozart" in self.sim["passages"][q["p"]]["title"]]
        self.assertEqual(len(mozart), 6)  # stesso brano in due buste
        for k in range(69, 123):
            q = self.q["D6-%d" % k]
            self.assertEqual(len(q.get("img", [])), 1, q["id"])
            self.assertTrue(q["img"][0].startswith("data:image/png;base64,"))
        self.assertFalse(any(q.get("img") for q in self.sim["q"] if not q["t"].startswith("figurale")))

    def test_nicchia_esclusa(self):
        for i in ("AD1-A.24", "AD2-C.45", "AD2-E.5", "AD2-F.4"):
            self.assertNotIn(i, self.q)

    def test_piani(self):
        plans = {p["id"]: p for p in self.sim["plans"]}
        self.assertEqual(sorted(plans), ["H1", "H2", "H3", "H4", "H5", "H6"])
        self.assertEqual((plans["H1"]["n"], plans["H1"]["min"]), (60, 90))
        self.assertEqual(sum(plans["H1"]["aree"].values()), 60)
        for p in plans.values():
            self.assertEqual(sum(p["aree"].values()), p["n"], p["id"])


class TestElaborate(unittest.TestCase):
    """Banca «Elaborate»: formato, chiavi, punti del ripasso citati."""

    @classmethod
    def setUpClass(cls):
        if not glob.glob(os.path.join(REAL, "RIPASSO_*.md")):
            raise unittest.SkipTest("nessun RIPASSO_*.md in materiali/")
        vols = collect(REAL)
        cls.points = {p["id"] for v in vols for sc in v["schede"] for p in iter_points(sc["b"])}
        cls.codes = {sc["code"] for v in vols for sc in v["schede"] if sc.get("code")}
        areas = {a[0] for a in simulazioni.AREAS}
        cls.qs, cls.usc = elaborate.load(os.path.join(ROOT, "elaborate"), cls.points, cls.codes, areas)

    def test_domande(self):
        self.assertGreater(len(self.qs), 50)
        for q in self.qs:
            self.assertTrue(q["id"].startswith("EL-"), q["id"])
            self.assertEqual(q["inc"], "el")
            letters = [o[0] for o in q["o"]]
            self.assertEqual(letters, list("ABCDE"[:len(letters)]), q["id"])
            self.assertIn(q["k"], letters, q["id"])
            texts = [o[1] for o in q["o"]]
            self.assertEqual(len(set(texts)), len(texts), q["id"])
            self.assertNotIn(q["q"], texts, q["id"])
            if q["a"] != "inglese":
                self.assertTrue(q["cite"] and all(c in self.points for c in q["cite"]), q["id"])

    def test_uscite(self):
        self.assertTrue(all(re.match(r"SNA\d+-B\d-Q\d+$", c) for v in self.usc.values() for c in v))

    def test_errori_di_formato(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "x.txt"), "w", encoding="utf-8") as f:
                f.write("@area diritto_amministrativo\n## D4\nQ EL-X-1\nT: domanda\nA: a\nB: b\nC: c\nK: D\nF: zzz\nS: s\n")
            with self.assertRaises(elaborate.ElaborateError):
                elaborate.load(d, self.points, self.codes, {"diritto_amministrativo"})


class TestInline(unittest.TestCase):
    def test_inline(self):
        self.assertEqual(md_inline("**a** e *b* \\* c"), "<b>a</b> e <i>b</i> * c")


if __name__ == "__main__":
    unittest.main()
