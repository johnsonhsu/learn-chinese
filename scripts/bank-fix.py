#!/usr/bin/env python3
"""Fix bank_sentences: convert Simplified -> Traditional (Taiwan standard) in
place, and unify drawable-glyph variants. When a converted sentence collides with
an existing canonical row, the source row is a duplicate and is DELETED instead.
Plus a targeted grammar fix (id 3776 Cantonese 係 -> Mandarin 是). Backs up the DB
first. Reports COUNTS only (no sentence text). Idempotent.
Run from repo root: python3 scripts/bank-fix.py

`canon()` is module-level + side-effect-free so the parity test
(test/test_glyph_canon.py) can import it; the destructive DB pass only runs when
this file is executed as a script (guarded by __main__).
"""
import sqlite3, shutil, os, datetime
import opencc

# Curriculum content (bank_sentences) is platform-owned now (content.db).
DB = "platform/content.db"

cc = None
for cfg in ("s2tw", "s2tw.json", "s2t", "s2t.json"):
    try:
        cc = opencc.OpenCC(cfg); MODE = cfg; break
    except Exception:
        continue
assert cc, "no OpenCC config available"

# Canonical glyph unification. The corpus/LLM emits these variant forms, but only
# the MAPPED form is in the char ranking AND has hanzi-writer stroke data — the app
# literally cannot draw the variant (e.g. 汙 U+6C59 has no stroke data; 污 U+6C61
# does, ranked 809). Pure orthographic variants only. NEVER add 台/臺 here — those
# are intentionally distinct and are shielded across the OpenCC pass below.
VARIANT_MAP = {"汙": "污", "秘": "祕"}

# Private-use sentinels that shield 台/臺 from OpenCC (which would force 台->臺).
_T1, _T2 = chr(0xE000), chr(0xE001)

def canon(s):
    """Taiwan-Traditional canonical form: Simplified->Traditional while preserving
    台 AND 臺 EXACTLY as the source had them, then unify drawable-glyph variants."""
    s = s or ""
    _p = s.replace("台", _T1).replace("臺", _T2)
    conv = cc.convert(_p).replace(_T1, "台").replace(_T2, "臺")
    for k, v in VARIANT_MAP.items():
        conv = conv.replace(k, v)
    return conv


def main():
    con = sqlite3.connect(DB)
    con.execute("PRAGMA wal_checkpoint(TRUNCATE);"); con.commit()

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bkdir = f"modules/writing-challenge/.backup-bankfix-{stamp}"
    os.makedirs(bkdir, exist_ok=True)
    for ext in ("", "-wal", "-shm"):
        if os.path.exists(DB + ext):
            shutil.copy2(DB + ext, os.path.join(bkdir, os.path.basename(DB) + ext))

    rows = con.execute("SELECT id, sentence FROM bank_sentences").fetchall()
    total = len(rows)
    present = set(s for _, s in rows)   # sentences that will exist after the pass
    updates, deletes = [], []
    for rid, s in rows:
        s = s or ""
        conv = canon(s)
        if conv == s:
            continue
        if conv in present:            # canonical form already exists -> this row is a dup
            deletes.append(rid)
            present.discard(s)
        else:
            present.discard(s); present.add(conv)
            updates.append((rid, conv))

    # Deletes first, then updates -> avoids transient UNIQUE collisions.
    for rid in deletes:
        con.execute("DELETE FROM bank_sentences WHERE id=?", (rid,))
    for rid, conv in updates:
        con.execute("UPDATE bank_sentences SET sentence=? WHERE id=?", (conv, rid))

    # Targeted grammar fix: id 3776 Cantonese 係 -> Mandarin 是
    g3776 = "not needed"
    r = con.execute("SELECT sentence FROM bank_sentences WHERE id=3776").fetchone()
    if r and "係" in (r[0] or ""):
        newv = r[0].replace("係", "是")
        dup = con.execute("SELECT 1 FROM bank_sentences WHERE sentence=? AND id<>3776", (newv,)).fetchone()
        if dup:
            con.execute("DELETE FROM bank_sentences WHERE id=3776"); g3776 = "deleted (dup)"
        else:
            con.execute("UPDATE bank_sentences SET sentence=? WHERE id=3776", (newv,)); g3776 = "fixed"

    con.commit()
    con.execute("PRAGMA wal_checkpoint(TRUNCATE);"); con.commit()

    after = con.execute("SELECT sentence FROM bank_sentences").fetchall()
    remaining = sum(1 for (s,) in after if canon(s) != (s or ""))
    newtotal = con.execute("SELECT COUNT(*) FROM bank_sentences").fetchone()[0]
    integ = con.execute("PRAGMA integrity_check;").fetchone()[0]
    con.close()

    print(f"converter:                {MODE}")
    print(f"backup:                   {bkdir}")
    print(f"rows:                     {total} -> {newtotal}")
    print(f"Simplified+variant fixed: {len(updates)} rows")
    print(f"dups removed (collided w/ existing canonical): {len(deletes)} rows")
    print(f"id 3776 係→是:            {g3776}")
    print(f"still differing:          {remaining} (should be 0)")
    print(f"integrity:                {integ}")


if __name__ == "__main__":
    main()
