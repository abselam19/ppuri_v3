import json, os, unittest
from romanize import romanize

CASES = os.path.join(os.path.dirname(__file__), "..", "app", "tests", "roman-cases.json")


class RomanizeTest(unittest.TestCase):
    def test_shared_cases(self):
        with open(CASES, encoding="utf-8") as fh:
            cases = json.load(fh)["cases"]
        bad = []
        for c in cases:
            pron = c.get("pron", "").replace("ː", "") or None
            got = romanize(c["text"], pron, c.get("noun", False))
            if got != c["rr"]:
                bad.append(f'{c["text"]} ({c.get("pron", "")}): got {got}, want {c["rr"]}')
        self.assertEqual(bad, [], "\n" + "\n".join(bad))


if __name__ == "__main__":
    unittest.main()
