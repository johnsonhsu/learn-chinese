# `scripts/` — dev-only tooling

Ad-hoc analysis / curation helpers that run on the maintainer's machine. **None of
this ships in the client bundle or the offline app.** The Python analysis scripts
(`analyze-bank.py`, `bank-audit.py`, `bank-fix.py`) read `platform/content.db`
directly; the TS scripts run via `tsx`.

---

## Sentence-QA harness (issue #74) — local-LLM quality review aid

Runs every curated `bank_sentences` row through **≥2 local LLMs** and produces a
structured per-(sentence, model) quality verdict (grammar / semantics / naturalness
for **Taiwan Traditional Chinese**), plus a self-contained **HTML viewer** that
surfaces where the models **disagree**. It is a **review aid for the human curator,
never an auto-gate**.

**Guarantees**
- **Read-only on the bank** — `platform/content.db` is opened `readonly`; the harness
  **never** writes it and **never** rewrites/converts a glyph (台/臺 included). It may
  only *flag* Simplified / Mainland-vocab leakage as an issue category.
- **Local runtime only** — Ollama (`http://localhost:11434` by default); **no cloud LLM**.
- **Advisory only** — results live in a separate store; acting on them is a manual
  curation decision. The `test:data` deploy gate stays structural/privacy — LLM
  quality is never a deploy gate.
- **Deterministic** — temperature 0 + a fixed seed. **Batched + resumable** — re-running
  skips already-scored `(sentence, model)` pairs.
- The **full ~11k run is intentionally out of scope** here; this ships the harness
  READY and is demoed against a small committed fixture.

### Prerequisites (real run)
1. Install & start [Ollama](https://ollama.com) (`ollama serve`).
2. Pull the models you want to compare, e.g. a Taiwan-tuned model + a strong general
   Chinese model:
   ```
   ollama pull llama-3-taiwan:8b
   ollama pull qwen2.5:7b
   ```
   (No Ollama? Use `--mock` — a deterministic offline dry-run that exercises the whole
   read → judge → store → resume path with no model.)

### Run the harness
```
# offline dry-run (no LLM) over the first 20 sentences — validates the path:
npm run sentence-qa -- --mock --limit 20

# real run over the first 50 sentences with two local models:
npm run sentence-qa -- --limit 50 --models llama-3-taiwan:8b,qwen2.5:7b

# a full pass (later, separate effort) is just: npm run sentence-qa
```
| flag | default | meaning |
|------|---------|---------|
| `--mock` | off | deterministic canned verdicts; no network/model |
| `--limit N` | (all) | only the first N sentences (by id) |
| `--models a,b` | `llama-3-taiwan:8b,qwen2.5:7b` | comma-separated model list (**≥2** for the cross-model view) |
| `--endpoint URL` | `http://localhost:11434` | Ollama base URL |
| `--seed N` | `0` | deterministic seed passed to the runtime |
| `--out PATH` | `scripts/sentence-qa-results/results.jsonl` | JSONL results store |

Env overrides: `OLLAMA_ENDPOINT`, `SENTENCE_QA_MODELS` (comma-separated). Console output
is **counts + ids only** (never sentence text — mirrors `bank-audit.py`); the sentences
live in the results file + viewer, for the curator to read.

### Results store
JSONL (one record per `(sentence, model)`), written to `scripts/sentence-qa-results/`
(**gitignored** — real runs are local artifacts). One record:
```json
{"id":634,"sentence":"…","english":"…","model":"llama-3-taiwan:8b","runtime":"ollama",
 "verdict":"ok|issue","issue_categories":["grammar|semantics|naturalness|simplified-leak|mainland-vocab"],
 "severity":"none|minor|major","note":"…","raw":"<model output>","prompt_version":"v1","seed":0,"ts":"…"}
```

### View the results
```
npm run sentence-qa:report -- --in scripts/sentence-qa-results/results.jsonl
# → writes scripts/sentence-qa-results/sentence-qa-report.html — open it in a browser
```
The viewer joins the models per sentence, computes **agreement** (all-ok / all-issue /
**divergent**), sorts **divergent first**, and offers filter/sort by agreement, severity,
and issue category. It is a self-contained HTML file (no server, no external assets).

**Demo with no real run** — a committed sample fixture lets you see the viewer immediately:
```
npm run sentence-qa:report -- --in scripts/fixtures/sentence-qa-sample.jsonl
```
The fixture (`scripts/fixtures/sentence-qa-sample.jsonl`) hand-authors a handful of
sentences across both models, including cross-model disagreements and a Simplified-leak
that the Taiwan model flags but `qwen2.5` misses — the exact divergence the view exists
to surface.

### Files
- `scripts/sentence-qa.ts` — the harness (read → judge → JSONL, resumable).
- `scripts/sentence-qa-report.ts` — the HTML report generator.
- `scripts/fixtures/sentence-qa-sample.jsonl` — committed demo fixture.
- `scripts/sentence-qa-results/` — gitignored real-run output.
