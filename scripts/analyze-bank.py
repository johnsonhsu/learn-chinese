#!/usr/bin/env python3
"""Analyze the sentence bank against the character ranking.

Rerun anytime (e.g. after dumping more sentences):
    python3 scripts/analyze-bank.py        (or: npm run analyze-bank)

- Bank: read live from platform/content.db (no server needed).
- Ranking: fetched from the running dev server's /api/content/admin/char-ranking
  (cached to /tmp/char-ranking.json; falls back to the cache if the server is down).
"""
import sqlite3, json, re, os, sys, urllib.request, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Curriculum content (bank_sentences) is platform-owned now (content.db).
DB = os.path.join(ROOT, "platform/content.db")
RANK_URL = "http://localhost:3000/api/content/admin/char-ranking"
RANK_CACHE = "/tmp/char-ranking.json"
HAN = re.compile(r"[一-鿿]")

# Coverage target: every character should appear in at least this many sentences.
# (Was 100; the goal is now a 50/char minimum — analyze against this.)
TARGET = 50


def load_ranking():
    try:
        with urllib.request.urlopen(RANK_URL, timeout=8) as r:
            data = json.load(r)
        if not isinstance(data, list) or not data:
            raise ValueError("unexpected ranking payload")
        json.dump(data, open(RANK_CACHE, "w"))  # refresh cache
        return data
    except Exception as e:
        if os.path.exists(RANK_CACHE):
            print(f"(server unavailable: {e} — using cached ranking)", file=sys.stderr)
            return json.load(open(RANK_CACHE))
        sys.exit(f"Cannot get ranking — start the dev server (npm run dev) or provide {RANK_CACHE}. ({e})")


def main():
    rank = {r["char"]: r["rank"] for r in load_ranking()}
    con = sqlite3.connect(DB)
    sents = [s for (s,) in con.execute("SELECT sentence FROM bank_sentences")]
    with_en = con.execute("SELECT COUNT(*) FROM bank_sentences WHERE TRIM(COALESCE(english,'')) <> ''").fetchone()[0]
    con.close()

    covered = collections.Counter()
    for s in sents:
        for c in {ch for ch in s if HAN.match(ch)}:
            covered[c] += 1

    def gate(s):
        rs = [rank.get(c, 6000) for c in s if HAN.match(c)]
        return max(rs) if rs else 0

    # Mirror the app's difficulty model (server/index.ts bankDifficulty):
    #   round(maxRank*0.6 + avgRank*0.4); unranked chars -> 6000.
    # Banded into the same 5 bands (400 wide): <400, 400-800, 800-1200, 1200-1600, 1600+.
    def difficulty(s):
        rs = [rank.get(c, 6000) for c in {ch for ch in s if HAN.match(ch)}]
        if not rs:
            return 0
        return round(max(rs) * 0.6 + (sum(rs) / len(rs)) * 0.4)

    def diff_band(d):
        return min(4, d // 400)

    # Per-char: how many sentences use it + which difficulty bands it spans.
    char_counts = collections.Counter()
    char_band = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    for s in sents:
        b = diff_band(difficulty(s))
        for c in {ch for ch in s if HAN.match(ch)}:
            char_counts[c] += 1
            char_band[c][b] += 1

    bands = [(1, 150), (151, 300), (301, 600), (601, 1000), (1001, 1500), (1501, 3000), (3001, 10 ** 9)]
    cnt = collections.Counter()
    for s in sents:
        g = gate(s)
        for lo, hi in bands:
            if lo <= g <= hi:
                cnt[(lo, hi)] += 1
                break

    def uncovered(lo, hi):
        return [c for c in sorted(rank, key=lambda x: rank[x]) if lo <= rank[c] <= hi and c not in covered]

    print("=== Sentence bank analysis ===")
    print(f"sentences: {len(sents)} | with English: {with_en} | distinct chars covered: {len(covered)} / {len(rank)} ranked\n")
    print("Sentences by GATING char (when a learner unlocks the sentence):")
    for lo, hi in bands:
        label = f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"
        print(f"  rank {label:>10}: {cnt[(lo, hi)]}")

    u1, u2, u3 = uncovered(1, 150), uncovered(151, 300), uncovered(301, 600)
    u4, u5 = uncovered(601, 1000), uncovered(1001, 1500)
    cap = lambda lst, n=50: " ".join(lst[:n]) + (f"  …(+{len(lst)-n})" if len(lst) > n else "")
    print("\nUNCOVERED common chars (fill these — highest priority first):")
    print(f"  P1  rank 1-150    ({len(u1):>3}): {' '.join(u1)}")
    print(f"  P1  rank 151-300  ({len(u2):>3}): {' '.join(u2)}")
    print(f"  P2  rank 301-600  ({len(u3):>3}): {' '.join(u3)}")
    print(f"  P3  rank 601-1000 ({len(u4):>3}): {cap(u4)}")
    print(f"  P4  rank 1001-1500({len(u5):>3}): {cap(u5)}")

    # ---- Coverage vs the TARGET (>= TARGET sentences per char) ----
    # Only ranked chars matter (unranked = too-rare; not a coverage goal).
    ranked_chars = sorted(rank, key=lambda c: rank[c])
    under = [c for c in ranked_chars if char_counts[c] < TARGET]
    target_bands = [(1, 150), (151, 300), (301, 600), (601, 1000), (1001, 1500), (1501, 3000), (3001, 10 ** 9)]

    def band_label(lo, hi):
        return f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"

    print(f"\n=== Coverage vs target ({TARGET}+ sentences / char) ===")
    print(f"Chars under {TARGET}: {len(under)} / {len(ranked_chars)} ranked")
    print(f"Worst offenders by rank band (count under {TARGET} | of band):")
    for lo, hi in target_bands:
        band = [c for c in ranked_chars if lo <= rank[c] <= hi]
        u = [c for c in band if char_counts[c] < TARGET]
        if band:
            print(f"  rank {band_label(lo, hi):>10}: {len(u):>4} under / {len(band):>4} chars")

    # Priority target set: lowest-rank (most common) under-target chars first.
    # These move the needle most. Show count + biggest deficit (TARGET - have).
    def fmt(c):
        return f"{c}(r{rank[c]},{char_counts[c]})"
    print(f"\nPRIORITY target chars for next batch (rank ↑ = fill first; shown as char(rank,have)):")
    print(f"  P1 rank 1-300    : {' '.join(fmt(c) for c in under if rank[c] <= 300) or '(all met)'}")
    p2 = [c for c in under if 301 <= rank[c] <= 600]
    p3 = [c for c in under if 601 <= rank[c] <= 1000]
    cap = lambda lst, n=60: " ".join(fmt(c) for c in lst[:n]) + (f"  …(+{len(lst)-n})" if len(lst) > n else "")
    print(f"  P2 rank 301-600  ({len(p2):>3}): {cap(p2)}")
    print(f"  P3 rank 601-1000 ({len(p3):>3}): {cap(p3)}")

    # Chars that HAVE sentences but lack a difficulty gradient (all clustered in
    # <=1 band, or never reach an easy band) — they need stepping spread, not just count.
    flat = []
    for c in ranked_chars:
        if char_counts[c] == 0:
            continue
        spread = sum(1 for n in char_band[c] if n > 0)
        if spread <= 1 and char_counts[c] >= 2:
            flat.append(c)
    print(f"\nChars lacking a difficulty gradient (>=2 sentences, all in ONE band): {len(flat)}")
    print(f"  first by rank: {' '.join(fmt(c) for c in sorted(flat, key=lambda c: rank[c])[:40])}")

    fragile = sum(1 for n in covered.values() if n == 1)
    print(f"\nFragile chars (appear in only 1 sentence): {fragile}")
    unranked = [s for s in sents if any(HAN.match(c) and c not in rank for c in s)]
    print(f"Sentences using an UNRANKED (likely too-rare) char: {len(unranked)}")


if __name__ == "__main__":
    main()
