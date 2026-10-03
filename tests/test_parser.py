"""Test del parser dei ripassi.  Uso:  python3 -m unittest discover -s tests -v"""

import glob
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from build import ESCLUSI, collect  # noqa: E402
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


class TestInline(unittest.TestCase):
    def test_inline(self):
        self.assertEqual(md_inline("**a** e *b* \\* c"), "<b>a</b> e <i>b</i> * c")


if __name__ == "__main__":
    unittest.main()
