"""Test dei parser.  Uso:  python3 -m unittest discover -s tests -v

- Ripassi: sui file reali in materiali/ (se presenti).
- Quesiti e simulazioni: sui file reali se presenti, e sempre sulle fixture sintetiche
  in tests/fixtures/materiali (testo fittizio, nel formato descritto nelle istruzioni).
"""

import glob
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from sna12.common import md_inline  # noqa: E402
from sna12.quesiti import EXPECTED, parse_quesiti_dir  # noqa: E402
from sna12.ripassi import parse_ripasso, split_sentences  # noqa: E402
from sna12.simulazioni import parse_simulazioni_dir  # noqa: E402

REAL = os.path.join(ROOT, "materiali")
FIX = os.path.join(ROOT, "tests", "fixtures", "materiali")
LEFTOVER = re.compile(r"\\[a-zA-Z]+|\*\*|:::")


def _dirs_with(pattern):
    dirs = [FIX]
    if glob.glob(os.path.join(REAL, pattern)):
        dirs.insert(0, REAL)
    return dirs


class TestRipassi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vols = [parse_ripasso(p) for p in sorted(glob.glob(os.path.join(REAL, "RIPASSO_*.md")))]
        if not cls.vols:
            raise unittest.SkipTest("nessun RIPASSO_*.md in materiali/")

    def test_ogni_volume_produce_carte(self):
        for v in self.vols:
            self.assertGreater(len(v["cards"]), 0, v["file"])

    def test_id_univoci(self):
        ids = [c["id"] for v in self.vols for c in v["cards"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_lacune_fra_1_e_3(self):
        for v in self.vols:
            for c in v["cards"]:
                if c["type"] == "tabella":
                    continue
                n = len(re.findall(r'class="lac"', c["html"]))
                self.assertTrue(1 <= n <= 3, (c["id"], n, c["html"][:120]))
                self.assertNotIn("In breve", re.sub(r"<[^>]+>", "", c["html"])[:12])

    def test_niente_markup_residuo(self):
        for v in self.vols:
            for c in v["cards"]:
                blob = " ".join([c.get("html", ""), c.get("q", ""), c.get("qLabel", "")] +
                                [x for r in c.get("a", []) for x in r])
                self.assertIsNone(LEFTOVER.search(blob), (c["id"], blob[:160]))

    def test_tabelle_hanno_domanda_e_risposta(self):
        for v in self.vols:
            for c in v["cards"]:
                if c["type"] == "tabella":
                    self.assertTrue(c["q"].strip(), c["id"])
                    self.assertTrue(c["a"], c["id"])
                    self.assertTrue(all(val.strip() not in ("", "—") for _, val in c["a"]), c["id"])

    def test_novita_e_numeri(self):
        cards = [c for v in self.vols for c in v["cards"]]
        self.assertTrue(any(c["nov"] for c in cards))
        self.assertTrue(any(c["numeri"] for c in cards))
        # la tabella a coppie del vol. 2 (Autore | Concetto | | Autore | Concetto) diventa due carte per riga
        taylor = [c for c in cards if c["type"] == "tabella" and re.sub(r"<[^>]+>", "", c["q"]) == "Taylor"]
        dente = [c for c in cards if c["type"] == "tabella" and re.sub(r"<[^>]+>", "", c["q"]) == "Dente"]
        if taylor:
            self.assertTrue(dente)
            self.assertEqual(len(taylor[0]["a"]), 1)


class TestFrasi(unittest.TestCase):
    def test_abbreviazioni(self):
        s = split_sentences("Lo dice l'**art. 1 della L. 241/1990**. Poi Cons. St., sez. IV, n. 601/1999 e F. W. Taylor. Fine.")
        self.assertEqual(len(s), 3, s)

    def test_inline(self):
        self.assertEqual(md_inline("**a** e *b* \\* c"), "<b>a</b> e <i>b</i> * c")


class TestQuesiti(unittest.TestCase):
    def _all(self):
        for d in _dirs_with("DOSSIER_*.md"):
            r = parse_quesiti_dir(d)
            if r:
                yield d, r

    def test_testo_opzioni_chiave(self):
        for d, r in self._all():
            self.assertTrue(r["questions"], d)
            for q in r["questions"]:
                letters = [o["k"] for o in q["opts"]]
                self.assertTrue(re.sub(r"<[^>]+>", "", q["text"]).strip(), q["id"])
                self.assertTrue(3 <= len(letters) <= 5, (q["id"], letters))
                self.assertTrue(all(re.sub(r"<[^>]+>", "", o["h"]).strip() for o in q["opts"]), q["id"])
                if q.get("rank"):
                    self.assertTrue(all(k in letters for k in q["rank"]), (q["id"], q["rank"], letters))
                else:
                    self.assertIn(q["key"], letters, q["id"])
                self.assertNotEqual(q["vig"], "X", q["id"])
                self.assertNotIn("<img", q["text"])

    def test_id_univoci(self):
        for d, r in self._all():
            ids = [q["id"] for q in r["questions"]]
            self.assertEqual(len(ids), len(set(ids)), d)

    def test_conteggi_attesi(self):
        """Solo sui file reali: confronta i quesiti trovati con i conteggi delle istruzioni."""
        r = parse_quesiti_dir(REAL) if glob.glob(os.path.join(REAL, "DOSSIER_*.md")) else None
        if not r:
            self.skipTest("nessun DOSSIER_* reale in materiali/")
        for f in r["files"]:
            if f["src"] in EXPECTED:
                self.assertEqual(f["found"], EXPECTED[f["src"]], f)

    def test_fixture(self):
        r = parse_quesiti_dir(FIX)
        by = {q["id"]: q for q in r["questions"]}
        self.assertEqual(sorted(by), sorted(["D1-M1", "D1-M2", "D5-11", "D5-13", "D6-1", "D6-2", "D6-3", "AD2-C.12"]))
        st = {f["src"]: f for f in r["files"]}
        self.assertEqual((st["D5"]["figurali"], st["D5"]["vig_x"]), (1, 1))
        self.assertEqual(st["AD2"]["no_key"], 1)
        self.assertEqual(by["AD2-C.12"]["rank"], ["A", "B", "C"])
        self.assertEqual(by["D1-M1"]["rank"], ["C"])
        self.assertTrue(by["D5-13"].get("lowRel") and by["D5-13"].get("nov") and by["D5-13"]["vig"] == "A")
        self.assertEqual(by["D6-1"]["brano"], by["D6-2"]["brano"])
        self.assertIn(by["D6-1"]["brano"], r["brani"])
        self.assertIn("Secondo paragrafo", by["D5-11"]["expl"])
        self.assertEqual((by["D6-3"]["fonte"], by["D5-11"]["fonte"]), ("Formez", "SNA"))


class TestSimulazioni(unittest.TestCase):
    def test_60_quesiti_60_chiavi(self):
        for d in _dirs_with("SIMULAZIONE_MISTA_*.md"):
            for s in parse_simulazioni_dir(d):
                qs = s["questions"]
                self.assertEqual(len(qs), 60, s["file"])
                self.assertEqual(sum(1 for q in qs if q.get("key") or q.get("rank")), 60, s["file"])
                self.assertEqual(len(s["parts"]), 11, s["file"])
                self.assertEqual(sorted(q["n"] for q in qs), list(range(1, 61)), s["file"])
                for q in qs:
                    letters = [o["k"] for o in q["opts"]]
                    keys = q.get("rank") or [q.get("key")]
                    self.assertTrue(all(k in letters for k in keys), (s["file"], q["n"], keys, letters))
                    self.assertTrue(q.get("expl"), (s["file"], q["n"]))
                self.assertEqual(s["problems"], [], s["file"])

    def test_fixture_dettagli(self):
        s = parse_simulazioni_dir(FIX)[0]
        by = {q["n"]: q for q in s["questions"]}
        self.assertEqual(by[1]["rank"], ["A", "C", "B"])
        self.assertTrue(all(by[n].get("fig") for n in range(13, 19)))
        self.assertTrue(by[20].get("formez") and not by[21].get("formez"))
        self.assertEqual(by[43].get("brano"), by[48].get("brano"))
        self.assertIsNone(by[42].get("brano"))
        self.assertEqual(by[7]["code"], "COD-07")


if __name__ == "__main__":
    unittest.main()
