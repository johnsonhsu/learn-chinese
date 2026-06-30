#!/usr/bin/env python3
"""Report-only audit of bank_sentences. Prints ONLY counts + ids (never sentence
text), so it never trips content filters. READ-ONLY — makes no changes.
Run from repo root:  python3 scripts/bank-audit.py
"""
import sqlite3, re
from collections import defaultdict
import opencc

# Curriculum content (bank_sentences) is platform-owned now (content.db).
DB = "platform/content.db"
# Use Taiwan-standard conversion (s2tw) so detection matches the fix script and
# doesn't false-flag already-Taiwan-variant Traditional chars as "Simplified".
cc = None
for _cfg in ("s2tw", "s2tw.json", "s2t", "s2t.json"):
    try:
        cc = opencc.OpenCC(_cfg); break
    except Exception:
        continue

# CN terms with distinct Taiwan equivalents. Some (信息/數據/程序/質量/自行車/地鐵)
# are context-dependent and used in Taiwan too — flagged for REVIEW, not auto-fix.
MAINLAND = ["出租車","軟件","硬件","視頻","音頻","屏幕","鼠標","網絡","默認",
            "服務器","博客","土豆","公交車","短信","激光","打印","文件夾",
            "信息","數據","程序","質量","自行車","地鐵","視窗","郵箱","內存",
            "光盤","菜單","拷貝"]

HAN = re.compile(r'[一-鿿㐀-䶿]')
JUNK = re.compile(r'^\s*#|^\s*\d+[\.\)、]|[*_`]|\|')

def trunc(ids, n=40):
    ids = sorted(ids)
    return str(ids[:n]) + (f"  (+{len(ids)-n} more)" if len(ids) > n else "")

con = sqlite3.connect(DB)
rows = con.execute("SELECT id, sentence, COALESCE(english,'') FROM bank_sentences").fetchall()
con.close()
total = len(rows)

simp, empty_en, short_en, junk, no_han = set(), set(), set(), set(), set()
mainland = defaultdict(set)
seen = defaultdict(list)

for rid, s, en in rows:
    s = s or ""
    # Preserve the source's 台 AND 臺 exactly (shield both behind private-use
    # sentinels through OpenCC) so neither is ever flagged/converted — only OTHER
    # Simplified is. OpenCC forces 台->臺, which would otherwise false-flag 台.
    _p = s.replace("台", "\uE000").replace("臺", "\uE001")
    if cc.convert(_p).replace("\uE000", "台").replace("\uE001", "臺") != s:
        simp.add(rid)
    for term in MAINLAND:
        if term in s:
            mainland[term].add(rid)
    e = en.strip()
    if not e:
        empty_en.add(rid)
    elif len(e) < 3:
        short_en.add(rid)
    if JUNK.search(s):
        junk.add(rid)
    if not HAN.search(s):
        no_han.add(rid)
    seen[s].append(rid)

dups = {k: v for k, v in seen.items() if len(v) > 1}
dup_rows = sum(len(v) for v in dups.values())
dup_ids = [i for v in dups.values() for i in v]
m_union = set().union(*mainland.values()) if mainland else set()

print("=== bank_sentences audit (REPORT ONLY — counts + ids, no text) ===")
print(f"TOTAL ROWS: {total}\n")
print(f"[1] AUTO-FIXABLE — Simplified characters present: {len(simp)} rows")
print(f"    ids: {trunc(simp)}\n")
print(f"[2] REVIEW — possible Mainland vocab (context-dependent): {len(m_union)} rows")
for term, ids in sorted(mainland.items(), key=lambda x: -len(x[1])):
    if ids:
        print(f"      {term}: {len(ids)}  ids {trunc(ids, 15)}")
print()
print(f"[3] FLAG — empty/missing English: {len(empty_en)} rows")
print(f"    ids: {trunc(empty_en)}\n")
print(f"[4] FLAG — suspiciously short English (<3 chars): {len(short_en)} rows")
print(f"    ids: {trunc(short_en)}\n")
print(f"[5] AUTO-FIXABLE — formatting junk (#/numbering/markdown/pipe): {len(junk)} rows")
print(f"    ids: {trunc(junk)}\n")
print(f"[6] FLAG — no Han characters in sentence: {len(no_han)} rows")
print(f"    ids: {trunc(no_han)}\n")
print(f"[7] FLAG — exact duplicate sentences: {len(dups)} groups, {dup_rows} rows")
print(f"    ids: {trunc(dup_ids)}")
