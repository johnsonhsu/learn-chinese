"""Parity test for the Python glyph scrub (scripts/bank-fix.py canon()).

Runs against the SAME golden fixtures as the TypeScript importer's
canonicalizeTW() (shared/src/__tests__/canonicalize.test.ts), so the two
implementations cannot silently drift. Skips locally when the optional `opencc`
package isn't installed; CI installs it.
"""
import json
import pathlib
import importlib.util

import pytest

pytest.importorskip("opencc")  # skip the whole module if opencc is unavailable

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = json.loads((ROOT / "test" / "fixtures" / "glyph-canon.json").read_text(encoding="utf-8"))


def _load_canon():
    spec = importlib.util.spec_from_file_location("bank_fix", ROOT / "scripts" / "bank-fix.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # safe: destructive flow is guarded by __main__
    return mod.canon


canon = _load_canon()


@pytest.mark.parametrize("case", FIXTURES, ids=[c["note"] for c in FIXTURES])
def test_canon_matches_golden(case):
    assert canon(case["input"]) == case["expected"]


def test_preserves_tai_both_forms():
    assert canon("台") == "台"
    assert canon("臺") == "臺"
    assert canon("台灣臺灣") == "台灣臺灣"


def test_idempotent():
    for case in FIXTURES:
        once = canon(case["input"])
        assert canon(once) == once
