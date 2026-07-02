/**
 * Local-LLM sentence-QA harness (issue #74) — a REVIEW AID, never an auto-gate.
 *
 * Runs every `bank_sentences` row (platform/content.db, READ-ONLY) through >=2
 * configurable LOCAL models (Ollama by default) and writes a structured per-
 * (sentence, model) quality verdict to a SEPARATE JSONL results store. It NEVER
 * writes content.db and never rewrites/converts any glyph (it may only *flag*
 * Simplified / Mainland-vocab leakage as an issue category). Deterministic
 * (temperature 0 + fixed seed), batched, and RESUMABLE (re-running skips already-
 * scored (sentence,model) pairs). The full ~11k pass is intentionally NOT run
 * here — validate with `--mock` and/or `--limit N`, then build the viewer with
 * `npm run sentence-qa:report`.
 *
 * Console output follows scripts/bank-audit.py discipline: COUNTS + IDS ONLY,
 * never sentence text (the results file + HTML viewer are where sentences live,
 * for the human curator to review).
 *
 *   npm run sentence-qa -- --mock --limit 20
 *   npm run sentence-qa -- --limit 50 --models llama-3-taiwan:8b,qwen2.5:7b
 *   npm run sentence-qa -- --endpoint http://localhost:11434 --out scripts/sentence-qa-results/results.jsonl
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const CONTENT_DB = join(REPO, 'platform', 'content.db');
const DEFAULT_OUT = join(REPO, 'scripts', 'sentence-qa-results', 'results.jsonl');
const DEFAULT_MODELS = ['llama-3-taiwan:8b', 'qwen2.5:7b'];
const DEFAULT_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const PROMPT_VERSION = 'v1';

type Verdict = 'ok' | 'issue';
type Severity = 'none' | 'minor' | 'major';

interface BankRow {
  id: number;
  sentence: string;
  english: string;
}
interface Judgment {
  verdict: Verdict;
  issue_categories: string[];
  severity: Severity;
  note: string;
}
interface ResultRecord extends Judgment {
  id: number;
  sentence: string;
  english: string;
  model: string;
  runtime: string;
  raw: string;
  prompt_version: string;
  seed: number;
  ts: string;
}

interface Options {
  models: string[];
  endpoint: string;
  out: string;
  limit: number | null;
  seed: number;
  mock: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    models: process.env.SENTENCE_QA_MODELS ? process.env.SENTENCE_QA_MODELS.split(',') : DEFAULT_MODELS,
    endpoint: DEFAULT_ENDPOINT,
    out: DEFAULT_OUT,
    limit: null,
    seed: 0,
    mock: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--mock') o.mock = true;
    else if (a === '--models') o.models = next().split(',').map((m) => m.trim()).filter(Boolean);
    else if (a === '--endpoint') o.endpoint = next();
    else if (a === '--out') o.out = next();
    else if (a === '--limit') o.limit = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === '--seed') o.seed = parseInt(next(), 10) || 0;
    else if (a === '--help' || a === '-h') {
      console.log('sentence-qa: --mock --limit N --models a,b --endpoint URL --out PATH --seed N');
      process.exit(0);
    }
  }
  return o;
}

// --- Model I/O -------------------------------------------------------------

function buildPrompt(row: BankRow): string {
  return `You are a Taiwan Mandarin (Traditional Chinese / 繁體中文, TAIWAN usage) QA reviewer.
Judge the SENTENCE for grammar, semantics (does it mean something sensible), and
naturalness for everyday Taiwan usage. Also flag Simplified characters (簡體字) or
Mainland-only vocabulary (大陸用語) a Taiwan reader would find wrong. Do NOT rewrite it — judge only.

SENTENCE: ${row.sentence}
ENGLISH GLOSS: ${row.english}

Respond with ONLY a JSON object, no other text:
{"verdict":"ok"|"issue","issue_categories":[],"severity":"none"|"minor"|"major","note":"<=15 words"}
Rules: verdict "ok" iff grammatical, meaningful, and natural Taiwan Traditional Chinese.
issue_categories drawn from ["grammar","semantics","naturalness","simplified-leak","mainland-vocab"] ([] when ok).
severity "none" when ok, "minor" for small awkwardness, "major" for wrong/broken.
JSON:`;
}

async function callOllama(endpoint: string, model: string, prompt: string, seed: number): Promise<string> {
  const res = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Deterministic: temperature 0 + fixed seed where the runtime supports it.
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0, seed } }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status} for ${model}`);
  const data = (await res.json()) as { response?: string };
  return data.response ?? '';
}

/** Extract the first JSON object from a model's text (models often wrap it in
 *  prose or ```fences```). Returns null if none parses. */
function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const obj = body.match(/\{[\s\S]*\}/);
  if (!obj) return null;
  try {
    const parsed = JSON.parse(obj[0]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const CATEGORIES = ['grammar', 'semantics', 'naturalness', 'simplified-leak', 'mainland-vocab', 'parse-error'];

/** Coerce arbitrary model JSON into a valid Judgment (defensive — models drift). */
function normalize(parsed: Record<string, unknown> | null): Judgment {
  if (!parsed) return { verdict: 'issue', issue_categories: ['parse-error'], severity: 'major', note: 'unparseable model output' };
  const verdict: Verdict = parsed.verdict === 'ok' ? 'ok' : 'issue';
  const sev = parsed.severity;
  const severity: Severity = sev === 'major' || sev === 'minor' || sev === 'none' ? sev : verdict === 'ok' ? 'none' : 'minor';
  const cats = Array.isArray(parsed.issue_categories)
    ? parsed.issue_categories.map(String).filter((c) => CATEGORIES.includes(c))
    : [];
  const note = typeof parsed.note === 'string' ? parsed.note.slice(0, 200) : '';
  return { verdict, issue_categories: verdict === 'ok' ? [] : cats, severity, note };
}

// --- Mock (deterministic; validates the read->judge->store path offline) ----

// A small set of common Simplified-ONLY glyphs so --mock can realistically flag a
// simplified-leak without pulling in OpenCC. NOT exhaustive — the real models do
// the actual detection; this only makes the offline dry-run demonstrate the path.
const SIMPLIFIED_SAMPLE = new Set([...'国这来时说对开关门见东车话语读写没师问题应该觉马鸟龙气长']);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mockJudge(row: BankRow, model: string, seed: number): Judgment {
  const simp = [...row.sentence].filter((c) => SIMPLIFIED_SAMPLE.has(c));
  if (simp.length) return { verdict: 'issue', issue_categories: ['simplified-leak'], severity: 'major', note: `mock: ${simp.length} simplified glyph(s)` };
  // Per-MODEL hash so different models diverge on some sentences (mirrors the
  // real cross-model disagreement the viewer surfaces).
  const h = hash(`${row.id}:${model}:${seed}`);
  if (h % 11 === 0) return { verdict: 'issue', issue_categories: ['naturalness'], severity: 'minor', note: 'mock: slightly unnatural phrasing' };
  if (h % 17 === 0) return { verdict: 'issue', issue_categories: ['grammar'], severity: 'major', note: 'mock: grammatical error' };
  return { verdict: 'ok', issue_categories: [], severity: 'none', note: 'mock: looks fine' };
}

// --- Resume store ----------------------------------------------------------

const pairKey = (id: number, model: string) => `${id} ${model}`;

function loadScoredPairs(out: string): Set<string> {
  const scored = new Set<string>();
  if (!existsSync(out)) return scored;
  for (const line of readFileSync(out, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as { id?: number; model?: string };
      if (typeof r.id === 'number' && typeof r.model === 'string') scored.add(pairKey(r.id, r.model));
    } catch {
      /* tolerate a partial trailing line from an interrupted run */
    }
  }
  return scored;
}

// --- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.models.length < 2) {
    console.warn(`⚠️  Only ${opts.models.length} model(s) configured; the cross-model view needs >=2. Continuing.`);
  }

  // READ-ONLY — the bank is sacrosanct; the harness must never write content.db.
  const db = new Database(CONTENT_DB, { readonly: true, fileMustExist: true });
  const sql = `SELECT id, sentence, COALESCE(english,'') AS english FROM bank_sentences ORDER BY id${opts.limit != null ? ` LIMIT ${opts.limit}` : ''}`;
  const rows = db.prepare(sql).all() as BankRow[];
  db.close();

  const outDir = dirname(opts.out);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const scored = loadScoredPairs(opts.out);

  console.log(`sentence-qa (${opts.mock ? 'MOCK' : `ollama @ ${opts.endpoint}`}) — ${rows.length} sentence(s) × ${opts.models.length} model(s), seed ${opts.seed}`);
  if (scored.size) console.log(`resume: ${scored.size} (sentence,model) pair(s) already scored — will skip`);

  const tally = { new: 0, skipped: 0, ok: 0, issue: 0 };
  const bySeverity: Record<Severity, number> = { none: 0, minor: 0, major: 0 };
  const perModel: Record<string, { ok: number; issue: number }> = {};
  for (const m of opts.models) perModel[m] = { ok: 0, issue: 0 };

  for (const row of rows) {
    for (const model of opts.models) {
      if (scored.has(pairKey(row.id, model))) { tally.skipped++; continue; }
      let raw = '';
      let judgment: Judgment;
      if (opts.mock) {
        judgment = mockJudge(row, model, opts.seed);
        raw = `mock:${JSON.stringify(judgment)}`;
      } else {
        try {
          raw = await callOllama(opts.endpoint, model, buildPrompt(row), opts.seed);
          judgment = normalize(extractJson(raw));
        } catch (e) {
          raw = String(e);
          judgment = { verdict: 'issue', issue_categories: ['parse-error'], severity: 'major', note: `runtime error: ${(e as Error).message}` };
        }
      }
      const rec: ResultRecord = {
        id: row.id, sentence: row.sentence, english: row.english,
        model, runtime: opts.mock ? 'mock' : 'ollama',
        ...judgment, raw,
        prompt_version: PROMPT_VERSION, seed: opts.seed, ts: new Date().toISOString(),
      };
      // Append per-record so an interrupted run is a valid checkpoint (resumable).
      appendFileSync(opts.out, JSON.stringify(rec) + '\n');
      scored.add(pairKey(row.id, model));
      tally.new++;
      tally[judgment.verdict]++;
      bySeverity[judgment.severity]++;
      perModel[model][judgment.verdict]++;
    }
  }

  // COUNTS + IDS ONLY — never print sentence text (bank-audit.py discipline).
  console.log(`\nscored ${tally.new} new, skipped ${tally.skipped}.  ok=${tally.ok} issue=${tally.issue}`);
  console.log(`severity: none=${bySeverity.none} minor=${bySeverity.minor} major=${bySeverity.major}`);
  for (const m of opts.models) console.log(`  ${m}: ok=${perModel[m].ok} issue=${perModel[m].issue}`);
  console.log(`\nresults → ${opts.out}`);
  console.log(`build the viewer:  npm run sentence-qa:report -- --in ${opts.out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
