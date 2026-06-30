import { useState, useEffect, useMemo } from 'react';
import { useAdminRead } from './admin-read.ts';

interface CharRow {
  char: string;
  rank: number;
  level: string;
  count: number;
  avgDiff: number | null;
  dist: number[];
}

interface BankSentence {
  id: number;
  sentence: string;
  english: string;
  // Server (/api) and the on-device data layer BOTH attach this per sentence,
  // computed with the project formula: round(maxCharRank*0.6 + avgCharRank*0.4)
  // over the sentence's Han chars, unranked char = 6000. Reused as-is here.
  difficulty?: number;
}

// Count of Han ideographs in a sentence (strips punctuation / whitespace / latin).
function hanLen(s: string): number {
  return (s.match(/[一-鿿]/g) || []).length;
}

// Columns the "View all" table can sort by.
type AllSortKey = 'sentence' | 'english' | 'len' | 'difficulty';

const BANDS = [
  { lo: 1,    hi: 150,  label: 'P1 1–150' },
  { lo: 151,  hi: 300,  label: 'P2 151–300' },
  { lo: 301,  hi: 600,  label: 'P3 301–600' },
  { lo: 601,  hi: 1000, label: 'P4 601–1000' },
  { lo: 1001, hi: 1500, label: 'P5 1001–1500' },
  { lo: 1501, hi: 2000, label: 'P6 1501–2000' },
];

function coverageColor(count: number, target: number): string {
  if (count === 0) return '#9E9E9E';
  if (count >= target) return '#43A047';
  const pct = count / target;
  if (pct >= 0.6) return '#7CB342';
  if (pct >= 0.3) return '#F9A825';
  if (pct >= 0.08) return '#EF6C00';
  return '#C62828';
}

// All prompt-generator slider settings, captured as a plain value so the prompt
// can be (re)built from any coverage snapshot — not just current React state.
interface PromptSettings {
  target: number;
  sentenceCount: number;
  // Indices into BANDS whose rank ranges are unioned to form the char pool the
  // gap-targeter draws from. Empty = treat as "all bands" (see inBandPool).
  bands: number[];
  numCharsTarget: number;
  minChars: number;
  maxChars: number;
}

// Is `rank` inside the union of the selected bands' ranges? Empty selection
// falls back to "all bands" so generation never silently produces nothing.
function inBandPool(rank: number, bands: number[]): boolean {
  const active = bands.length ? bands : BANDS.map((_, i) => i);
  return active.some(i => {
    const b = BANDS[i];
    return b && rank >= b.lo && rank <= b.hi;
  });
}

// Pick the worst-gap target chars for a given coverage snapshot + settings.
// Pure: takes coverage rows in, returns the targeted chars with per-char minimums.
// Shared by the displayed-prompt useMemo AND the async batch loop, so a run that
// re-fetches coverage mid-loop targets the still-worst gaps without touching state.
function pickPromptTargets(
  coverage: CharRow[],
  s: PromptSettings,
): (CharRow & { gap: number; minimum: number })[] {
  const under = coverage
    .filter(c => c.count < s.target && inBandPool(c.rank, s.bands))
    .sort((a, b) => a.count - b.count || a.rank - b.rank);

  const selected = under.slice(0, s.numCharsTarget);
  if (!selected.length) return [];

  const totalGap = selected.reduce((sum, c) => sum + (s.target - c.count), 0);
  const budget = s.sentenceCount * 0.75;

  return selected.map(c => {
    const gap = s.target - c.count;
    const raw = Math.round(budget * gap / totalGap);
    const minimum = Math.max(6, Math.min(20, raw));
    return { ...c, gap, minimum };
  });
}

// Build the full Gemini prompt text from a coverage snapshot + settings. The one
// source of truth for prompt construction: the on-screen `generatedPrompt` memo
// and every batch-loop iteration both call this, so the displayed prompt and the
// prompt actually sent are guaranteed identical for the same inputs.
function buildPrompt(coverage: CharRow[], s: PromptSettings): string {
  const targets = pickPromptTargets(coverage, s);
  if (!targets.length) return '— No gaps found at current settings —';
  const rows = targets.map(c => `| ${c.char} | ${c.minimum} |`).join('\n');
  return `You are generating Traditional Chinese sentence pairs for a language learning app.

**Output format — pipe-separated, one pair per line:**
\`\`\`
Chinese sentence | English translation
\`\`\`
No numbers. No labels. No extra text.

**Rules:**
- Traditional Chinese only (台灣用語 — natural spoken Taiwan Mandarin)
- ${s.minChars}–${s.maxChars} characters per sentence
- Every sentence must contain at least one target character below
- Natural register — how people actually talk, not textbook phrases

**Target characters — minimum sentences each must appear in (every sentence ≥${s.minChars} chars):**

| Character | Min. sentences |
|-----------|----------------|
${rows}

One sentence may cover multiple targets — that counts for all of them. Generate exactly **${s.sentenceCount} pairs** total.

**Examples (note length — all are ${s.minChars}+ characters):**
\`\`\`
你找到你要的東西了嗎？ | Did you find what you were looking for?
她女兒今年才七歲就很懂事了。 | Her daughter is only seven but already very mature.
這條魚看起來非常新鮮好吃。 | This fish looks very fresh and delicious.
你今天早上吃了什麼早餐呢？ | What did you have for breakfast this morning?
\`\`\`

Generate ${s.sentenceCount} pairs now:`;
}

// DEV-only writer for the bank mutation + Gemini routes (import / ai-generate).
// READS go through useAdminRead() so they also work on-device; these POSTs have
// no production route and are gated behind `mode === 'dev'` in the UI.
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, init);
  if (!r.ok) {
    // Surface the server's JSON { error } message when present (e.g. "GEMINI_API_KEY
    // not configured") instead of a bare status code, so failures are legible.
    const msg = await r
      .clone()
      .json()
      .then((b: { error?: string }) => b?.error)
      .catch(() => undefined);
    throw new Error(msg || `${r.status}`);
  }
  return r.json();
}

/**
 * The admin screen runs pre-profile, so there's no active user to read a BYO
 * Gemini key from. Fall back to any per-profile key saved in localStorage
 * (`lc-gemini-key-u<id>`, written by platform Settings). The proxy still prefers
 * the server secret when no client key is sent; this just lets a device with a
 * saved key generate without a server secret configured.
 */
function findSavedGeminiKey(): string {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /^lc-gemini-key-u\d+$/.test(k)) {
      const v = localStorage.getItem(k)?.trim();
      if (v) return v;
    }
  }
  return '';
}

// Non-blocking delay for pacing/backoff. The batch loop is already async, so we
// just `await sleep(ms)` between steps — the UI stays responsive and progress
// state keeps rendering.
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// A 429 from the ai-generate proxy is a transient rate-limit, not a real error.
// The proxy surfaces the upstream status/message in the thrown Error text (see
// apiFetch — it forwards the server's { error } or the bare status), so match on
// "429" appearing in the message.
function isRateLimit(e: unknown): boolean {
  return e instanceof Error && /429/.test(e.message);
}

export function SentenceBankPanel() {
  // Single env-aware read accessor: dev → /api fetch, on-device → baked DB,
  // SAME shapes. `mode` gates the DEV-only write affordances (Import/Generate).
  const { mode, read } = useAdminRead();
  const isDev = mode === 'dev';
  const [chars, setChars] = useState<CharRow[]>([]);
  const [totalSentences, setTotalSentences] = useState(0);
  const [target, setTarget] = useState(50);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'summary' | 'overview' | 'grid' | 'gaps' | 'prompt' | 'import'>('summary');
  const [gapBand, setGapBand] = useState<number | null>(null);
  const [gridBand, setGridBand] = useState<number | null>(null);
  const [selectedChar, setSelectedChar] = useState<CharRow | null>(null);
  const [charSentences, setCharSentences] = useState<BankSentence[]>([]);
  const [charLoading, setCharLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // "View all" full-window modal: lists every bank sentence. Fetches lazily on
  // open via the env-aware read accessor (dev /api + on-device) with a high
  // limit so the server/data-layer returns the whole bank in one shot.
  const [showAll, setShowAll] = useState(false);
  const [allSentences, setAllSentences] = useState<BankSentence[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  // "View all" table sort + search (client-side over the loaded ~10k rows).
  const [allSearch, setAllSearch] = useState('');
  const [allSort, setAllSort] = useState<{ key: AllSortKey; dir: 'asc' | 'desc' }>(
    { key: 'difficulty', dir: 'asc' },
  );
  // Prompt generator
  const [sentenceCount, setSentenceCount] = useState(100);
  // Char pool = union of the selected rank bands (indices into BANDS). Default
  // P3 (rank 301–600).
  const [promptBands, setPromptBands] = useState<number[]>([2]);
  const [numCharsTarget, setNumCharsTarget] = useState(12);
  const [minChars, setMinChars] = useState(12);
  const [maxChars, setMaxChars] = useState(18);
  const [copied, setCopied] = useState(false);
  const [genOutput, setGenOutput] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  // AI provider for bank generation. Gemini = BYO/dev key; Cloudflare = Workers
  // AI via the dev server's CF_ACCOUNT_ID + CF_AI_TOKEN .env creds. Selectable so
  // the user can rotate when one provider's free quota is exhausted.
  const [provider, setProvider] = useState<'gemini' | 'cloudflare'>('gemini');
  // Batch auto-fill loop: each run rebuilds the prompt from POST-import coverage,
  // generates, imports, re-fetches coverage — so successive runs chase the gaps
  // still worst after the previous import.
  const [batchRuns, setBatchRuns] = useState(5);
  // Pacing: wait this many seconds AFTER each run's import + coverage refresh,
  // BEFORE the next run's Gemini call — keeps calls under the free-tier
  // per-minute limit. Tunable 0–60s, default 5s.
  const [batchDelaySec, setBatchDelaySec] = useState(5);
  const [batchActive, setBatchActive] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchError, setBatchError] = useState('');
  const [batchLog, setBatchLog] = useState<
    { run: number; added: number; updated: number; skipped: number; total: number }[]
  >([]);
  const [batchTotals, setBatchTotals] = useState({ added: 0, updated: 0, skipped: 0 });
  // Gemini key gating: the saved per-profile key (from Settings) and its
  // validity, probed via the copybook test-key proxy. 'absent' = no key saved.
  const [savedKey] = useState(findSavedGeminiKey);
  const [keyStatus, setKeyStatus] = useState<
    'absent' | 'checking' | 'valid' | 'invalid'
  >(savedKey ? 'checking' : 'absent');
  // Import
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number; updated: number; skipped: number;
    filtered: number; sent: number; total: number;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      read<CharRow[]>('/content/admin/char-coverage'),
      read<{ total: number }>('/content/admin/bank-sentences?limit=1'),
    ]).then(([coverage, bankInfo]) => {
      setChars(coverage);
      setTotalSentences(bankInfo.total);
      setLoading(false);
    }).catch(console.error);
  }, [refreshKey, read]);

  useEffect(() => {
    if (!selectedChar) { setCharSentences([]); return; }
    setCharLoading(true);
    read<{ sentences: BankSentence[] }>(
      `/content/admin/bank-sentences?q=${encodeURIComponent(selectedChar.char)}&limit=500`
    ).then(data => {
      setCharSentences(data.sentences.filter(s => s.sentence.includes(selectedChar.char)));
      setCharLoading(false);
    }).catch(console.error);
  }, [selectedChar, read]);

  // Load EVERY bank sentence when the "View all" modal opens. Empty q +
  // high limit → the read accessor (getBankSentences on-device, /api in dev,
  // both capped server-side at 50k) returns the whole bank newest-first.
  useEffect(() => {
    if (!showAll) return;
    setAllLoading(true);
    read<{ sentences: BankSentence[] }>(
      '/content/admin/bank-sentences?q=&limit=50000'
    ).then(data => {
      setAllSentences(data.sentences);
      setAllLoading(false);
    }).catch(err => { console.error(err); setAllLoading(false); });
  }, [showAll, refreshKey, read]);

  // Validate the saved Gemini key via the copybook test-key proxy (browsers
  // can't call Gemini directly — CORS). Runs on mount and whenever the saved
  // key changes; only a 'reason: ok' response enables the Generate button. The
  // key is sent transiently and never logged. This runs independently of the
  // rest of the panel so it never blocks the UI.
  useEffect(() => {
    // The test-key proxy is a dev-server route; skip the probe on-device where
    // generation is hidden anyway.
    if (!isDev) return;
    if (!savedKey) { setKeyStatus('absent'); return; }
    let cancelled = false;
    setKeyStatus('checking');
    fetch('/api/copybook/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: savedKey }),
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((data: { reason?: string }) => {
        if (!cancelled) setKeyStatus(data.reason === 'ok' ? 'valid' : 'invalid');
      })
      .catch(() => { if (!cancelled) setKeyStatus('invalid'); });
    return () => { cancelled = true; };
  }, [savedKey, isDev]);

  // In dev, bank-gen runs against the dev Express server, which falls back to its
  // own .env GEMINI_API_KEY when no BYO key is saved — so a missing BYO key must
  // NOT disable Generate in dev. (Production has no bank-gen route at all.)
  const devKeyFallback = import.meta.env.DEV && keyStatus === 'absent';
  // Cloudflare generation uses the dev server's CF_ACCOUNT_ID + CF_AI_TOKEN .env
  // creds (no client/Gemini key), so in dev it's always enabled; the server
  // returns a clear 503 if those creds are missing.
  const canGenerate =
    (provider === 'cloudflare' && import.meta.env.DEV) ||
    keyStatus === 'valid' ||
    devKeyFallback;

  const bandStats = useMemo(() => BANDS.map((band, index) => {
    const bc = chars.filter(c => c.rank >= band.lo && c.rank <= band.hi);
    const atTarget = bc.filter(c => c.count >= target).length;
    const partial  = bc.filter(c => c.count > 0 && c.count < target).length;
    const zero     = bc.filter(c => c.count === 0).length;
    const gap      = bc.reduce((s, c) => s + Math.max(0, target - c.count), 0);
    return { ...band, index, total: bc.length, atTarget, partial, zero, gap };
  }), [chars, target]);

  const healthSummary = useMemo(() => {
    const p1 = bandStats[0];  // rank 1-150
    const p2 = bandStats[1];  // rank 151-300
    const p1p2Zero    = p1.zero + p2.zero;
    const p1p2Fragile = chars.filter(c => c.count > 0 && c.count <= 4 && c.rank <= 300);
    const p1p2Critical = chars
      .filter(c => c.count < 10 && c.rank <= 300)
      .sort((a, b) => a.count - b.count || a.rank - b.rank);
    const p1p2HalfWay = chars.filter(c => {
      const pct = c.count / target;
      return pct >= 0.5 && pct < 1.0 && c.rank <= 300;
    });
    const p34Gap = bandStats.slice(2, 4).reduce((s, b) => s + b.gap, 0);
    const coveredAll = chars.filter(c => c.count > 0 && c.rank <= 1500);
    const avgSentences = coveredAll.length
      ? Math.round(coveredAll.reduce((s, c) => s + c.count, 0) / coveredAll.length)
      : 0;

    type Item = { text: string; sub?: string; chars?: CharRow[] };
    const good: Item[] = [];
    const neutral: Item[] = [];
    const bad: Item[] = [];

    // ── Good ──
    good.push({ text: `${totalSentences.toLocaleString()} sentences in the bank` });
    if (p1.atTarget > 0) {
      const pct = Math.round((p1.atTarget / p1.total) * 100);
      good.push({ text: `P1 ${pct}% complete`, sub: `${p1.atTarget} / ${p1.total} common chars at ≥${target}` });
    }
    if (p1p2Zero === 0)
      good.push({ text: 'Every P1/P2 char appears in at least 1 sentence' });
    const totalAtTarget = chars.filter(c => c.count >= target).length;
    if (totalAtTarget > 0)
      good.push({ text: `${totalAtTarget} chars fully covered`, sub: `≥${target} sentences each` });

    // ── Neutral ──
    if (p1p2HalfWay.length > 0)
      neutral.push({ text: `${p1p2HalfWay.length} P1/P2 chars past halfway`, sub: `≥${Math.round(target * 0.5)} sentences — within reach` });
    neutral.push({ text: `Avg ${avgSentences} sentences per covered char`, sub: `rank ≤1500` });
    if (p34Gap > 0)
      neutral.push({ text: `P3/P4 gap: ${p34Gap.toLocaleString()} sentences`, sub: 'rank 301–1000 — not urgent' });
    const p5gap = bandStats[4]?.gap ?? 0;
    if (p5gap > 0)
      neutral.push({ text: `P5 gap: ${p5gap.toLocaleString()} sentences`, sub: 'rank 1001–1500 — long-tail' });

    // ── Bad ──
    if (p1p2Critical.length > 0)
      bad.push({
        text: `${p1p2Critical.length} P1/P2 chars have <10 sentences`,
        sub: 'highest priority — common chars learners hit early',
        chars: p1p2Critical.slice(0, 16),
      });
    if (p1p2Fragile.length > 0)
      bad.push({
        text: `${p1p2Fragile.length} fragile P1/P2 chars (≤4 sentences)`,
        sub: 'one dedup sweep away from dropping to zero',
        chars: p1p2Fragile.slice(0, 12),
      });
    if (p1p2Zero > 0)
      bad.push({ text: `${p1p2Zero} P1/P2 chars have zero sentences`, sub: 'uncovered — learners will never see them' });
    bad.push({ text: `P1 still needs ${p1.gap.toLocaleString()} more sentences to reach target`, sub: `${p1.total - p1.atTarget} chars below ≥${target}` });

    return { good, neutral, bad };
  }, [bandStats, chars, target, totalSentences]);

  const gaps = useMemo(() => {
    let under = chars.filter(c => c.count < target);
    if (gapBand !== null) {
      const b = BANDS[gapBand];
      under = under.filter(c => c.rank >= b.lo && c.rank <= b.hi);
    }
    return under.sort((a, b) => a.rank - b.rank);
  }, [chars, target, gapBand]);

  const gridChars = useMemo(() => {
    const base = gridBand !== null
      ? chars.filter(c => c.rank >= BANDS[gridBand].lo && c.rank <= BANDS[gridBand].hi)
      : chars.filter(c => c.rank <= 2000);
    return [...base].sort((a, b) => a.rank - b.rank);
  }, [chars, gridBand]);

  // "View all" rows after client-side search + sort. Char length comes from
  // hanLen; difficulty is the value the read accessor already attaches (project
  // formula). Search keeps a row if the (case-insensitive) query is a substring
  // of EITHER the Chinese sentence OR the English. ~10k rows sorts fine inline.
  const allRows = useMemo(() => {
    const q = allSearch.trim().toLowerCase();
    const filtered = q
      ? allSentences.filter(
          s =>
            s.sentence.toLowerCase().includes(q) ||
            (s.english ?? '').toLowerCase().includes(q),
        )
      : allSentences;
    const { key, dir } = allSort;
    const mul = dir === 'asc' ? 1 : -1;
    const cmp = (a: BankSentence, b: BankSentence) => {
      switch (key) {
        case 'sentence': return a.sentence.localeCompare(b.sentence, 'zh-Hant') * mul;
        case 'english':  return (a.english ?? '').localeCompare(b.english ?? '') * mul;
        case 'len':      return (hanLen(a.sentence) - hanLen(b.sentence)) * mul;
        case 'difficulty': return ((a.difficulty ?? 0) - (b.difficulty ?? 0)) * mul;
      }
    };
    // Copy before sort so we never mutate the loaded array in place.
    return [...filtered].sort(cmp);
  }, [allSentences, allSearch, allSort]);

  // Click a header: toggle direction if it's the active column, else select it
  // (sentence/english default A→Z asc; numeric columns default ascending too).
  function toggleAllSort(key: AllSortKey) {
    setAllSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }

  // The slider settings as one value — the single input to buildPrompt /
  // pickPromptTargets, shared by the displayed prompt and the batch loop.
  const promptSettings = useMemo<PromptSettings>(
    () => ({ target, sentenceCount, bands: promptBands, numCharsTarget, minChars, maxChars }),
    [target, sentenceCount, promptBands, numCharsTarget, minChars, maxChars],
  );

  // Prompt generator targets (for the on-screen chips) — same picker the loop uses.
  const promptTargets = useMemo(
    () => pickPromptTargets(chars, promptSettings),
    [chars, promptSettings],
  );

  const generatedPrompt = useMemo(
    () => buildPrompt(chars, promptSettings),
    [chars, promptSettings],
  );

  // Count only CJK ideograph chars (strips all punctuation, whitespace, latin)
  function cjkLen(s: string) { return (s.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length; }

  // Parse and pre-filter import text client-side
  const importPreview = useMemo(() => {
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    let valid = 0, tooShort = 0;
    for (const line of lines) {
      const zh = line.split('|')[0].trim();
      if (cjkLen(zh) > 6) valid++; else tooShort++;
    }
    return { total: lines.length, valid, tooShort };
  }, [importText]);

  // Shared import: parse + client-side filter, POST to the bank endpoint, and
  // record the result. Used by BOTH the Import view's button (passing the
  // pasted textarea) and the Prompt view's direct-import button (passing the
  // Gemini output) — so the fetch lives in exactly one place.
  async function importLines(text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const kept: string[] = [];
    let filtered = 0;
    for (const line of lines) {
      const zh = line.split('|')[0].trim();
      if (cjkLen(zh) > 6) kept.push(line);
      else filtered++;
    }
    if (!kept.length) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await apiFetch<{ added: number; updated: number; skipped: number; parsed: number; total: number }>(
        '/content/admin/bank-sentences',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: kept.join('\n') }) }
      );
      setImportResult({ added: res.added, updated: res.updated, skipped: res.skipped, filtered, sent: kept.length, total: res.total });
      setTotalSentences(res.total);
      setRefreshKey(k => k + 1);   // re-fetch coverage data
    } catch (e) {
      console.error(e);
    } finally {
      setImporting(false);
    }
  }

  function runImport() { return importLines(importText); }

  // Filter + POST one batch of lines to the bank, returning the server result so
  // the loop can accumulate totals. Mirrors importLines' client-side ≤6-CJK drop
  // but does NOT touch importResult/refreshKey — the loop owns coverage refresh
  // and its own progress/result state.
  async function importBatch(text: string) {
    const kept = text
      .split('\n').map(l => l.trim()).filter(Boolean)
      .filter(line => cjkLen(line.split('|')[0].trim()) > 6);
    if (!kept.length) return { added: 0, updated: 0, skipped: 0, total: totalSentences };
    return apiFetch<{ added: number; updated: number; skipped: number; parsed: number; total: number }>(
      '/content/admin/bank-sentences',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: kept.join('\n') }) },
    );
  }

  // Batch auto-fill loop. Each iteration drives the next from POST-import
  // coverage: fetch coverage → buildPrompt(freshCoverage, settings) → Gemini →
  // import → re-fetch coverage → repeat. We read coverage straight off the fetch
  // (not React state) so there are no stale-closure / async-setState hazards.
  // Stops gracefully on 2 consecutive failures. Settings are snapshotted up front.
  async function runBatch() {
    if (batchActive || !canGenerate) return;
    const n = Math.max(1, Math.min(20, Math.round(batchRuns)));
    const settings = promptSettings;   // freeze slider state for the whole batch
    setBatchActive(true);
    setBatchError('');
    setBatchLog([]);
    setBatchTotals({ added: 0, updated: 0, skipped: 0 });
    setBatchProgress({ current: 0, total: n });

    // Start from a fresh coverage snapshot rather than possibly-stale state.
    let coverage: CharRow[];
    try {
      coverage = await read<CharRow[]>('/content/admin/char-coverage');
    } catch (e) {
      setBatchError(`Coverage fetch failed: ${(e as Error).message}`);
      setBatchActive(false);
      return;
    }

    // Inter-run pacing: wait this long after each import/coverage-refresh before
    // the next run's Gemini call. Clamp 0–60s; default already in that range.
    const delayMs = Math.max(0, Math.min(60, Math.round(batchDelaySec))) * 1000;
    // 429 backoff schedule: retry the SAME run after these waits (ms). A 429 is a
    // transient per-minute rate-limit, so backing off and retrying usually clears
    // it; if it still 429s after the last attempt it's likely the daily quota.
    const RATELIMIT_BACKOFFS = [30_000, 60_000];

    // ai-generate with 429 backoff/retry. Resolves with the generated text, or
    // throws — a non-429 error throws immediately (counts toward the consecutive-
    // failure stop), a persistent 429 throws a tagged Error the loop treats as a
    // graceful quota stop. `runNo` is only for the status message.
    async function generateWithBackoff(prompt: string, runNo: number): Promise<string> {
      // attempt 0 = initial call; attempts 1..N retry after RATELIMIT_BACKOFFS[i-1].
      for (let attempt = 0; ; attempt++) {
        try {
          const gen = await apiFetch<{ text: string }>(
            '/content/admin/ai-generate',
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, prompt, apiKey: savedKey }) },
          );
          return gen.text;
        } catch (e) {
          if (!isRateLimit(e)) throw e;            // real error → normal failure path
          if (attempt >= RATELIMIT_BACKOFFS.length) {
            // Out of retries — likely daily-quota; signal a graceful stop.
            const quota = new Error('Gemini rate limit / quota exceeded — pause and try again later');
            (quota as Error & { rateLimitExhausted?: boolean }).rateLimitExhausted = true;
            throw quota;
          }
          const wait = RATELIMIT_BACKOFFS[attempt];
          setBatchError(`Rate-limited — waiting ${Math.round(wait / 1000)}s before retry… (run ${runNo})`);
          await sleep(wait);
        }
      }
    }

    let consecutiveFailures = 0;
    let lastTotal = totalSentences;
    try {
      for (let i = 0; i < n; i++) {
        setBatchProgress({ current: i + 1, total: n });
        try {
          // 1. Build the prompt from the CURRENT (freshly-fetched) coverage.
          const prompt = buildPrompt(coverage, settings);
          if (prompt.startsWith('— No gaps')) {
            setBatchError('No gaps left at current settings — stopping.');
            break;
          }
          // 2. Generate (with 429 backoff/retry). 3. Import.
          const genText = await generateWithBackoff(prompt, i + 1);
          const res = await importBatch(genText);
          lastTotal = res.total;
          setBatchLog(log => [...log, { run: i + 1, added: res.added, updated: res.updated, skipped: res.skipped, total: res.total }]);
          setBatchTotals(t => ({ added: t.added + res.added, updated: t.updated + res.updated, skipped: t.skipped + res.skipped }));
          setTotalSentences(res.total);
          // 4. Re-fetch coverage so the NEXT run's prompt targets the still-worst
          //    gaps after this import. Use the returned value directly.
          coverage = await read<CharRow[]>('/content/admin/char-coverage');
          // Surface the fresh coverage on-screen each run so the Gaps count + the
          // coverage views tick down live during the batch (the loop targets off
          // the local `coverage` var, so this state push is display-only — no race).
          setChars(coverage);
          consecutiveFailures = 0;
          // A clean run clears any stale rate-limit/backoff message.
          setBatchError('');
          // 5. Pace before the next run's Gemini call — wait until this import +
          //    coverage refresh is done, THEN delay, so calls stay under the
          //    per-minute limit. Skip the wait after the final run.
          if (delayMs > 0 && i < n - 1) {
            setBatchError(`Waiting ${Math.round(delayMs / 1000)}s before next run…`);
            await sleep(delayMs);
            setBatchError('');
          }
        } catch (e) {
          // Persistent 429 after backoff (or quota): stop gracefully, NOT counted
          // as a real failure — retrying won't help.
          if ((e as Error & { rateLimitExhausted?: boolean }).rateLimitExhausted) {
            setBatchError((e as Error).message);
            break;
          }
          consecutiveFailures++;
          setBatchError(`Run ${i + 1} failed: ${(e as Error).message}`);
          if (consecutiveFailures >= 2) {
            setBatchError(`Stopped after ${consecutiveFailures} consecutive failures — last: ${(e as Error).message}`);
            break;
          }
        }
      }
    } finally {
      // Surface the final coverage on-screen (prompt + stats reflect end state).
      setChars(coverage);
      setTotalSentences(lastTotal);
      setRefreshKey(k => k + 1);
      setBatchActive(false);
    }
  }

  const atTargetTotal = chars.filter(c => c.count >= target).length;
  const uncovered1500 = chars.filter(c => c.count === 0 && c.rank <= 1500).length;

  function selectChar(c: CharRow) {
    setSelectedChar(prev => prev?.char === c.char ? null : c);
  }

  // Toggle one rank band in/out of the char pool. Order-independent set of
  // BANDS indices; the targeter unions whatever's selected (empty → all).
  function toggleBand(i: number) {
    setPromptBands(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort((a, b) => a - b),
    );
  }
  // Human-readable description of the active pool for the targets heading.
  const poolLabel = promptBands.length
    ? promptBands.map(i => BANDS[i].label.split(' ')[0]).join(' + ')
    : 'all bands';

  const legendItems = [
    { label: `≥${target}`,   color: '#43A047' },
    { label: `${Math.round(target * 0.6)}+`,  color: '#7CB342' },
    { label: `${Math.round(target * 0.3)}+`,  color: '#F9A825' },
    { label: '1+',           color: '#EF6C00' },
    { label: '0',            color: '#9E9E9E' },
  ];

  if (loading) return <div className="admin-empty">Loading coverage data…</div>;

  return (
    <div className="sba">

      {/* ── Summary ── */}
      <div className="sba-summary">
        <div className="sba-stat">
          <span className="sba-stat-n">{totalSentences.toLocaleString()}</span>
          <span className="sba-stat-l">sentences</span>
        </div>
        <div className="sba-stat">
          <span className="sba-stat-n" style={{ color: '#43A047' }}>{atTargetTotal.toLocaleString()}</span>
          <span className="sba-stat-l">chars at target</span>
        </div>
        <div className="sba-stat">
          <span className="sba-stat-n" style={{ color: '#9E9E9E' }}>{uncovered1500}</span>
          <span className="sba-stat-l">uncovered ≤1500</span>
        </div>
        <div className="sba-target-row">
          <label>Target</label>
          <input
            type="range" min="10" max="100" step="5" value={target}
            onChange={e => setTarget(Number(e.target.value))}
          />
          <span className="sba-target-val">≥{target}</span>
        </div>
        <button className="sba-viewall-btn" onClick={() => setShowAll(true)}>View all sentences</button>
        <button className="sba-refresh-btn" onClick={() => { setSelectedChar(null); setRefreshKey(k => k + 1); }} title="Refresh">↻</button>
      </div>

      {/* ── Sub-tabs ── */}
      {/* Import writes to the bank via the dev server (no prod route), so it's
          DEV-only — on-device the tab is omitted entirely and only the read
          views (Summary/Bands/Grid/Gaps/Prompt) show. */}
      <div className="admin-tabs" style={{ marginTop: 8, marginBottom: 0 }}>
        {(['summary', 'overview', 'grid', 'gaps', 'prompt', ...(isDev ? ['import'] as const : [])] as const).map(v => (
          <button
            key={v}
            className={`admin-tab${view === v ? ' active' : ''}`}
            onClick={() => { setView(v); if (v !== 'import') setImportResult(null); }}
          >
            {v === 'summary' ? 'Summary'
              : v === 'overview' ? 'Bands'
              : v === 'grid' ? 'Grid'
              : v === 'gaps' ? `Gaps (${gaps.length})`
              : v === 'prompt' ? 'Prompt'
              : 'Import'}
          </button>
        ))}
      </div>

      {/* ── Summary ── */}
      {view === 'summary' && (
        <div className="sba-summary-view">
          {([
            { key: 'good',    label: '✓ Good',             items: healthSummary.good,    cls: 'sba-card--good' },
            { key: 'neutral', label: '~ Neutral',           items: healthSummary.neutral, cls: 'sba-card--neutral' },
            { key: 'bad',     label: '✗ Needs attention',   items: healthSummary.bad,     cls: 'sba-card--bad' },
          ] as const).map(section => (
            <div key={section.key} className={`sba-health-card ${section.cls}`}>
              <div className="sba-health-title">{section.label}</div>
              {section.items.map((item, i) => (
                <div key={i} className="sba-health-item">
                  <div className="sba-health-text">{item.text}</div>
                  {item.sub && <div className="sba-health-sub">{item.sub}</div>}
                  {'chars' in item && item.chars && item.chars.length > 0 && (
                    <div className="sba-health-chars">
                      {item.chars.map(c => (
                        <button
                          key={c.char}
                          className="sba-health-chip"
                          style={{ borderColor: coverageColor(c.count, target) }}
                          onClick={() => { selectChar(c); }}
                          title={`rank ${c.rank} — ${c.count} sentences`}
                        >
                          <span className="sba-chip-char">{c.char}</span>
                          <span className="sba-chip-meta" style={{ color: coverageColor(c.count, target) }}>{c.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {section.items.length === 0 && (
                <div className="sba-health-sub" style={{ padding: '8px 0' }}>Nothing here — keep going!</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Overview ── */}
      {view === 'overview' && (
        <div className="sba-bands">
          {bandStats.map(b => {
            const atPct      = b.total ? (b.atTarget / b.total) * 100 : 0;
            const partialPct = b.total ? (b.partial  / b.total) * 100 : 0;
            return (
              <div key={b.label} className="sba-band">
                <div className="sba-band-label">{b.label}</div>
                <div className="sba-band-bar">
                  <div className="sba-bar-at"     style={{ width: `${atPct}%` }} />
                  <div className="sba-bar-partial" style={{ width: `${partialPct}%` }} />
                </div>
                <div className="sba-band-info">
                  <span className="sba-band-at">{b.atTarget}<span className="sba-muted">/{b.total}</span></span>
                  <span className="sba-muted">gap {b.gap.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Coverage Grid ── */}
      {view === 'grid' && (
        <div className="sba-grid-view">
          <div className="sba-toolbar">
            <div className="sba-band-filter">
              <button className={`sba-filter-btn${gridBand === null ? ' active' : ''}`} onClick={() => setGridBand(null)}>All</button>
              {BANDS.map((b, i) => (
                <button key={i} className={`sba-filter-btn${gridBand === i ? ' active' : ''}`} onClick={() => setGridBand(i)}>
                  {b.label.split(' ')[0]}
                </button>
              ))}
            </div>
            <div className="sba-legend">
              {legendItems.map(item => (
                <span key={item.label} className="sba-legend-item">
                  <span className="sba-legend-dot" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="sba-grid">
            {gridChars.map(c => (
              <button
                key={c.char}
                className={`sba-cell${selectedChar?.char === c.char ? ' sba-cell--selected' : ''}`}
                style={{ background: coverageColor(c.count, target) }}
                onClick={() => selectChar(c)}
                title={`${c.char}  rank ${c.rank}  ${c.count} sentences`}
              >
                {c.char}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Gaps Table ── */}
      {view === 'gaps' && (
        <div className="sba-gaps-view">
          <div className="sba-band-filter" style={{ marginBottom: 12 }}>
            <button className={`sba-filter-btn${gapBand === null ? ' active' : ''}`} onClick={() => setGapBand(null)}>All</button>
            {BANDS.map((b, i) => (
              <button key={i} className={`sba-filter-btn${gapBand === i ? ' active' : ''}`} onClick={() => setGapBand(i)}>
                {b.label.split(' ')[0]} ({bandStats[i].total - bandStats[i].atTarget})
              </button>
            ))}
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Char</th>
                <th>Have</th>
                <th>Need</th>
                <th>Avg diff</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map(c => (
                <tr
                  key={c.char}
                  className={`admin-clickable-row${selectedChar?.char === c.char ? ' sba-row-active' : ''}`}
                  onClick={() => selectChar(c)}
                >
                  <td className="sba-muted">{c.rank}</td>
                  <td className="sba-char-big">{c.char}</td>
                  <td>
                    <div className="sba-inline-bar">
                      <div className="sba-inline-fill" style={{
                        width: `${Math.min(100, (c.count / target) * 100)}%`,
                        background: coverageColor(c.count, target),
                      }} />
                    </div>
                    <span style={{ color: coverageColor(c.count, target) }}>{c.count}</span>
                  </td>
                  <td>{target - c.count}</td>
                  <td className="sba-muted">{c.avgDiff ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Prompt Generator ── */}
      {view === 'prompt' && (
        <div className="sba-prompt-view">
          <div className="sba-prompt-controls">
            <div className="sba-prompt-control">
              <label>Sentences to request</label>
              <input
                type="range" min="50" max="400" step="50" value={sentenceCount}
                onChange={e => setSentenceCount(Number(e.target.value))}
              />
              <span className="sba-target-val">{sentenceCount}</span>
            </div>
            <div className="sba-prompt-control">
              <label>Chars to target</label>
              <input
                type="range" min="1" max="20" step="1" value={numCharsTarget}
                onChange={e => setNumCharsTarget(Number(e.target.value))}
              />
              <span className="sba-target-val">{numCharsTarget}</span>
            </div>
            <div className="sba-prompt-control">
              <label>Min chars / sentence</label>
              <input
                type="range" min="4" max="30" step="1" value={minChars}
                // Clamp so min can't exceed max.
                onChange={e => setMinChars(Math.min(Number(e.target.value), maxChars))}
              />
              <span className="sba-target-val">{minChars}</span>
            </div>
            <div className="sba-prompt-control">
              <label>Max chars / sentence</label>
              <input
                type="range" min="4" max="30" step="1" value={maxChars}
                // Clamp so max can't drop below min.
                onChange={e => setMaxChars(Math.max(Number(e.target.value), minChars))}
              />
              <span className="sba-target-val">{maxChars}</span>
            </div>
            <div className="sba-prompt-control" style={{ alignItems: 'flex-start' }}>
              <label style={{ paddingTop: 4 }}>Char pool</label>
              {/* Multi-select rank bands — the union of the checked bands' rank
                  ranges is the pool the gap-targeter draws from. Any combination
                  is allowed; an empty selection falls back to all bands. Reuses
                  the .sba-filter-btn pill (active = checked) like the Grid/Gaps
                  band filters. */}
              <div className="sba-band-filter">
                <button
                  type="button"
                  className={`sba-filter-btn${promptBands.length === 0 ? ' active' : ''}`}
                  onClick={() => setPromptBands([])}
                  title="Use every rank band (1–2000)"
                >
                  All
                </button>
                {BANDS.map((b, i) => {
                  const [tag, range] = b.label.split(' ');
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`sba-filter-btn${promptBands.includes(i) ? ' active' : ''}`}
                      onClick={() => toggleBand(i)}
                    >
                      {tag} · {range}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="sba-prompt-targets">
            <h4 className="sba-prompt-targets-title">
              {promptTargets.length} chars targeted — covering worst gaps in {poolLabel}
            </h4>
            <div className="sba-target-chips">
              {promptTargets.map(c => (
                <div key={c.char} className="sba-target-chip" style={{ borderColor: coverageColor(c.count, target) }}>
                  <span className="sba-chip-char">{c.char}</span>
                  <span className="sba-chip-meta">
                    <span style={{ color: coverageColor(c.count, target) }}>{c.count}</span>
                    {' → '}
                    <strong>×{c.minimum}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="sba-prompt-box">
            <div className="sba-prompt-box-header">
              <span className="sba-muted">Generated prompt</span>
              <button
                className="sba-copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(generatedPrompt).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <textarea className="sba-prompt-textarea" readOnly value={generatedPrompt} />
          </div>

          {/* Generation writes to the bank + calls the dev server / Gemini — no
              prod route — so the whole section is DEV-only. On-device the Prompt
              view still works as a read tool: build the prompt, copy it out. */}
          {isDev && (
          <div className="sba-gemini-section">
            {/* Provider toggle: rotate between Gemini (BYO/dev key) and Cloudflare
                Workers AI (dev-server .env creds) when one quota is exhausted. */}
            <div className="sba-provider-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <label className="sba-muted">Provider</label>
              {(['gemini', 'cloudflare'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`sba-filter-btn${provider === p ? ' active' : ''}`}
                  disabled={batchActive || genLoading}
                  onClick={() => setProvider(p)}
                >
                  {p === 'gemini' ? 'Gemini' : 'Cloudflare'}
                </button>
              ))}
            </div>
            <button
              className="sba-gemini-btn"
              disabled={batchActive || genLoading || !promptTargets.length || !canGenerate}
              title={
                canGenerate ? undefined
                  : keyStatus === 'checking' ? 'Checking your saved Gemini key…'
                  : keyStatus === 'invalid' ? 'Saved Gemini key is invalid'
                  : 'Save a Gemini key in Settings to enable'
              }
              onClick={async () => {
                setGenOutput('');
                setGenError('');
                setGenLoading(true);
                try {
                  // Gemini: the button is only enabled once the saved per-profile
                  // key has validated via the test-key proxy, so send it directly.
                  // Cloudflare: the server uses its own .env creds (apiKey ignored).
                  const res = await apiFetch<{ text: string }>(
                    '/content/admin/ai-generate',
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ provider, prompt: generatedPrompt, apiKey: savedKey }),
                    }
                  );
                  setGenOutput(res.text);
                } catch (e) {
                  setGenError(`${provider === 'cloudflare' ? 'Cloudflare' : 'Gemini'} error: ${(e as Error).message}`);
                } finally {
                  setGenLoading(false);
                }
              }}
            >
              {genLoading ? '⏳ Generating…' : provider === 'cloudflare' ? '✦ Generate with Cloudflare' : '✦ Generate with Gemini'}
            </button>

            <span className="sba-gemini-key-status sba-muted" style={{ marginLeft: 10 }}>
              {provider === 'cloudflare' ? '✓ Using dev-server Cloudflare Workers AI'
                : keyStatus === 'checking' ? 'Checking Gemini key…'
                : keyStatus === 'valid' ? '✓ Gemini key valid'
                : keyStatus === 'invalid' ? '✕ Gemini key invalid — check it in Settings'
                : devKeyFallback ? '✓ Using dev-server Gemini key'
                : 'Save a Gemini key in Settings to enable'}
            </span>

            {/* Batch auto-fill: loop N times, each run rebuilding the prompt from
                coverage refreshed AFTER the previous import — so the worst gaps
                are chased iteratively. DEV-only (lives inside this isDev block);
                gated behind the same usable-key check + not-already-running. */}
            <div className="sba-batch" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label className="sba-muted"># of runs</label>
              <input
                type="number" min={1} max={20} step={1} value={batchRuns}
                disabled={batchActive}
                onChange={e => setBatchRuns(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                style={{ width: 64 }}
              />
              <label className="sba-muted">delay between runs (sec)</label>
              <input
                type="number" min={0} max={60} step={1} value={batchDelaySec}
                disabled={batchActive}
                onChange={e => setBatchDelaySec(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
                style={{ width: 64 }}
                title="Wait this long after each import before the next Gemini call — spaces calls under the free-tier per-minute limit"
              />
              <button
                className="sba-gemini-btn"
                disabled={batchActive || genLoading || !promptTargets.length || !canGenerate}
                title={
                  canGenerate ? undefined
                    : keyStatus === 'checking' ? 'Checking your saved Gemini key…'
                    : keyStatus === 'invalid' ? 'Saved Gemini key is invalid'
                    : 'Save a Gemini key in Settings to enable'
                }
                onClick={runBatch}
              >
                {batchActive
                  ? `⏳ Run ${batchProgress.current} / ${batchProgress.total}`
                  : '⟳ Run batch'}
              </button>
              {(batchActive || batchLog.length > 0) && (
                <span className="sba-muted">
                  cumulative: <span className="sba-green">+{batchTotals.added} added</span>
                  {', '}
                  <span style={{ color: '#1976D2' }}>{batchTotals.updated} filled</span>
                  {', '}
                  {batchTotals.skipped} skipped
                </span>
              )}
            </div>

            {batchError && <div className="sba-gen-error">{batchError}</div>}

            {batchLog.length > 0 && (
              <div className="sba-import-preview" style={{ marginTop: 8, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                {batchLog.map(r => (
                  <span key={r.run}>
                    Run {r.run}: <span className="sba-green">+{r.added}</span>
                    {', '}<span style={{ color: '#1976D2' }}>{r.updated} filled</span>
                    {', '}<span className="sba-muted">{r.skipped} skipped</span>
                    {' — bank total '}{r.total.toLocaleString()}
                  </span>
                ))}
              </div>
            )}

            {genError && <div className="sba-gen-error">{genError}</div>}

            {genOutput && (
              <div className="sba-gen-output">
                <div className="sba-prompt-box-header">
                  <span className="sba-muted">
                    Gemini output — {genOutput.split('\n').filter(l => l.includes('|')).length} pairs
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="sba-copy-btn"
                      disabled={importing || genLoading || !genOutput.trim()}
                      onClick={() => importLines(genOutput)}
                    >
                      {importing ? 'Importing…' : 'Import now'}
                    </button>
                    <button
                      className="sba-copy-btn"
                      onClick={() => { setImportText(genOutput); setView('import'); }}
                    >
                      Send to Import →
                    </button>
                  </div>
                </div>
                <textarea className="sba-prompt-textarea sba-gen-textarea" readOnly value={genOutput} />
                {importResult && (
                  <div className="sba-import-preview" style={{ marginTop: 8 }}>
                    <span className="sba-green">✓ {importResult.added} added</span>
                    <span style={{ color: '#1976D2' }}>{importResult.updated} English filled</span>
                    <span className="sba-muted">{importResult.skipped} skipped</span>
                    {importResult.filtered > 0 && (
                      <span className="sba-warn">{importResult.filtered} too short</span>
                    )}
                    <span>bank total {importResult.total.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* ── Import ── */}
      {view === 'import' && (
        <div className="sba-import-view">
          <p className="sba-import-hint">
            Paste AI output below — one <code>Chinese | English</code> pair per line.
            Sentences with ≤6 CJK characters (punctuation excluded) are silently dropped.
          </p>

          <textarea
            className="sba-import-textarea"
            placeholder={'她女兒今年七歲了。 | Her daughter turned seven this year.\n這條魚看起來很新鮮。 | This fish looks very fresh.\n…'}
            value={importText}
            onChange={e => { setImportText(e.target.value); setImportResult(null); }}
            spellCheck={false}
          />

          {importText.trim() && !importResult && (
            <div className="sba-import-preview">
              <span>{importPreview.total} lines pasted</span>
              <span className="sba-green">✓ {importPreview.valid} valid (≥7 CJK chars)</span>
              {importPreview.tooShort > 0 && (
                <span className="sba-warn">✕ {importPreview.tooShort} too short — will be dropped</span>
              )}
            </div>
          )}

          <button
            className="sba-import-btn"
            disabled={importing || importPreview.valid === 0}
            onClick={runImport}
          >
            {importing ? 'Importing…' : `Import ${importPreview.valid} sentences`}
          </button>

          {importResult && (
            <div className="sba-import-report">
              <div className="sba-report-title">Import complete</div>
              <div className="sba-report-grid">
                <span className="sba-report-label">Pasted lines</span>
                <span className="sba-report-val">{importResult.sent + importResult.filtered}</span>

                <span className="sba-report-label sba-warn">Too short (dropped)</span>
                <span className="sba-report-val sba-warn">{importResult.filtered}</span>

                <span className="sba-report-label">Sent to server</span>
                <span className="sba-report-val">{importResult.sent}</span>

                <span className="sba-report-divider" />
                <span className="sba-report-divider" />

                <span className="sba-report-label sba-green">Added</span>
                <span className="sba-report-val sba-green">{importResult.added}</span>

                <span className="sba-report-label" style={{ color: '#1976D2' }}>English filled</span>
                <span className="sba-report-val" style={{ color: '#1976D2' }}>{importResult.updated}</span>

                <span className="sba-report-label sba-muted">Duplicate (skipped)</span>
                <span className="sba-report-val sba-muted">{importResult.skipped}</span>

                <span className="sba-report-divider" />
                <span className="sba-report-divider" />

                <span className="sba-report-label" style={{ fontWeight: 700 }}>Bank total</span>
                <span className="sba-report-val" style={{ fontWeight: 700 }}>{importResult.total.toLocaleString()}</span>
              </div>
              <button className="sba-clear-btn" onClick={() => { setImportText(''); setImportResult(null); }}>
                Clear &amp; import more
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Char Detail Panel ── */}
      {view === 'grid' && selectedChar && (
        <div className="sba-grid-backdrop" onClick={() => setSelectedChar(null)} />
      )}
      {selectedChar && (
        <div className={`sba-detail${view === 'grid' ? ' sba-detail--popup' : ''}`}>
          <div className="sba-detail-head">
            <span className="sba-detail-char">{selectedChar.char}</span>
            <div className="sba-detail-meta">
              <span>rank {selectedChar.rank}</span>
              {selectedChar.level && <span>TOCFL {selectedChar.level}</span>}
              <span style={{ color: coverageColor(selectedChar.count, target), fontWeight: 700 }}>
                {selectedChar.count} / {target}
              </span>
              {selectedChar.avgDiff !== null && <span>avg diff {selectedChar.avgDiff}</span>}
            </div>
            <button className="sba-close-btn" onClick={() => setSelectedChar(null)}>✕</button>
          </div>
          {charLoading
            ? <div className="sba-muted" style={{ padding: '12px 0' }}>Loading…</div>
            : charSentences.length === 0
              ? <div className="sba-muted" style={{ padding: '12px 0' }}>No sentences yet.</div>
              : (
                <div className="sba-sentence-list">
                  {charSentences.map(s => (
                    <div key={s.id} className="sba-sentence">
                      <span className="sba-sent-zh">{s.sentence}</span>
                      {s.english && <span className="sba-sent-en">{s.english}</span>}
                    </div>
                  ))}
                </div>
              )
          }
        </div>
      )}

      {/* ── View-all full-window modal ── */}
      {/* Read-only list of EVERY bank sentence (Chinese + English) with the
          total count. Reuses the import/coverage modal chrome (.bank-grid-*)
          and the per-char list-row styling (.sba-sentence). Works in dev and
          on-device because it fetches through the env-aware read accessor. */}
      {showAll && (
        <div
          className="bank-grid-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowAll(false); }}
          // Full-viewport overlay so the modal can fill the available height
          // regardless of how the panel's own .bank-grid-* CSS sizes things.
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', padding: 24, boxSizing: 'border-box' }}
        >
          <div
            className="bank-grid-modal"
            // Flex column that fills the overlay: header + search are fixed
            // height, the table region flexes and scrolls internally.
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, maxHeight: '100%', overflow: 'hidden' }}
          >
            <div className="bank-grid-header" style={{ flex: '0 0 auto' }}>
              <strong>
                All bank sentences — {allLoading ? '…' : allRows.length.toLocaleString()}
                {!allLoading && allSearch.trim() && ` of ${allSentences.length.toLocaleString()}`} shown
              </strong>
              <button className="bank-grid-close" onClick={() => setShowAll(false)} title="Close">✕</button>
            </div>

            {/* Search — filters on Chinese AND English (substring, case-insensitive). */}
            <div style={{ flex: '0 0 auto', padding: '8px 0' }}>
              <input
                type="search"
                value={allSearch}
                onChange={e => setAllSearch(e.target.value)}
                placeholder="Search Chinese or English…"
                spellCheck={false}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
                  fontSize: 14, border: '1px solid #ccc', borderRadius: 6, outline: 'none',
                }}
              />
            </div>

            {/* Internally-scrolling table region: grows to fill the modal, sticky header. */}
            <div
              className="bank-grid-scroll"
              style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}
            >
              {allLoading
                ? <div className="sba-muted" style={{ padding: '16px 0' }}>Loading…</div>
                : allSentences.length === 0
                  ? <div className="sba-muted" style={{ padding: '16px 0' }}>Bank is empty.</div>
                  : allRows.length === 0
                    ? <div className="sba-muted" style={{ padding: '16px 0' }}>No sentences match "{allSearch}".</div>
                    : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                        <thead>
                          <tr>
                            {([
                              { key: 'sentence',   label: 'Chinese sentence', align: 'left' as const,  width: 'auto' },
                              { key: 'english',    label: 'English',          align: 'left' as const,  width: 'auto' },
                              { key: 'len',        label: 'Char length',      align: 'right' as const, width: 110 },
                              { key: 'difficulty', label: 'Difficulty',       align: 'right' as const, width: 110 },
                            ] as const).map(col => {
                              const active = allSort.key === col.key;
                              return (
                                <th
                                  key={col.key}
                                  onClick={() => toggleAllSort(col.key)}
                                  title={`Sort by ${col.label}`}
                                  style={{
                                    position: 'sticky', top: 0, zIndex: 1,
                                    background: '#f4f4f5',
                                    textAlign: col.align,
                                    width: col.width === 'auto' ? undefined : col.width,
                                    padding: '8px 12px',
                                    borderBottom: '2px solid #d4d4d8',
                                    cursor: 'pointer', userSelect: 'none',
                                    whiteSpace: 'nowrap',
                                    fontWeight: active ? 700 : 600,
                                    color: active ? '#18181b' : '#52525b',
                                  }}
                                >
                                  {col.label}
                                  <span style={{ marginLeft: 4, opacity: active ? 1 : 0.25 }}>
                                    {active ? (allSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                                  </span>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {allRows.map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '6px 12px' }} lang="zh-Hant">{s.sentence}</td>
                              <td style={{ padding: '6px 12px', color: '#52525b' }}>{s.english || '—'}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {hanLen(s.sentence)}
                              </td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {s.difficulty ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
