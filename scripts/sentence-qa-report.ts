/**
 * Viewer for the sentence-QA harness (issue #74). Reads a results JSONL file
 * (from `npm run sentence-qa`, or the committed sample fixture) and emits a
 * SELF-CONTAINED HTML report: per-sentence verdicts side-by-side across models,
 * cross-model DISAGREEMENT highlighted, with client-side filter + sort by
 * agreement / severity / issue category. Read-only; touches nothing but the
 * results file it's given. Console output is counts only.
 *
 *   npm run sentence-qa:report -- --in scripts/fixtures/sentence-qa-sample.jsonl
 *   npm run sentence-qa:report -- --in scripts/sentence-qa-results/results.jsonl --out report.html
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_IN = join(REPO, 'scripts', 'sentence-qa-results', 'results.jsonl');

interface Rec {
  id: number;
  sentence: string;
  english: string;
  model: string;
  verdict: 'ok' | 'issue';
  issue_categories: string[];
  severity: 'none' | 'minor' | 'major';
  note: string;
}
type Agreement = 'single' | 'all-ok' | 'all-issue' | 'divergent';
interface Grouped {
  id: number;
  sentence: string;
  english: string;
  byModel: Record<string, Rec>;
  agreement: Agreement;
  worst: 'none' | 'minor' | 'major';
  categories: string[];
}

function parseArgs(argv: string[]): { in: string; out: string } {
  let inPath = DEFAULT_IN;
  let outPath = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') inPath = argv[++i];
    else if (argv[i] === '--out') outPath = argv[++i];
  }
  if (!outPath) outPath = join(dirname(inPath), 'sentence-qa-report.html');
  return { in: inPath, out: outPath };
}

function readRecords(path: string): Rec[] {
  const out: Rec[] = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Rec;
    out.push(r);
  }
  return out;
}

const sevRank = { none: 0, minor: 1, major: 2 } as const;

function group(records: Rec[]): { rows: Grouped[]; models: string[] } {
  const models = [...new Set(records.map((r) => r.model))].sort();
  const byId = new Map<number, Grouped>();
  for (const r of records) {
    let g = byId.get(r.id);
    if (!g) {
      g = { id: r.id, sentence: r.sentence, english: r.english, byModel: {}, agreement: 'single', worst: 'none', categories: [] };
      byId.set(r.id, g);
    }
    g.byModel[r.model] = r;
  }
  for (const g of byId.values()) {
    const recs = Object.values(g.byModel);
    const verdicts = new Set(recs.map((r) => r.verdict));
    g.agreement = recs.length < 2 ? 'single' : verdicts.size > 1 ? 'divergent' : verdicts.has('issue') ? 'all-issue' : 'all-ok';
    g.worst = recs.reduce<'none' | 'minor' | 'major'>((w, r) => (sevRank[r.severity] > sevRank[w] ? r.severity : w), 'none');
    g.categories = [...new Set(recs.flatMap((r) => r.issue_categories))].sort();
  }
  // Divergent first, then by worst severity, then id — the highest-value review order.
  const agrRank = { divergent: 0, 'all-issue': 1, 'all-ok': 2, single: 3 } as const;
  const rows = [...byId.values()].sort(
    (a, b) => agrRank[a.agreement] - agrRank[b.agreement] || sevRank[b.worst] - sevRank[a.worst] || a.id - b.id,
  );
  return { rows, models };
}

function renderHtml(rows: Grouped[], models: string[], meta: { in: string; count: number }): string {
  const summary = {
    sentences: rows.length,
    divergent: rows.filter((r) => r.agreement === 'divergent').length,
    allIssue: rows.filter((r) => r.agreement === 'all-issue').length,
    allOk: rows.filter((r) => r.agreement === 'all-ok').length,
  };
  const cats = [...new Set(rows.flatMap((r) => r.categories))].sort();
  // Embed data safely inside a <script> block (guard the `<` that could close it).
  const dataJson = JSON.stringify({ rows, models }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sentence QA — cross-model review</title>
<style>
  :root{--bg:#0f1115;--card:#1a1e26;--line:#2a303c;--txt:#e6e9ef;--dim:#98a0b3;--ok:#3fb950;--minor:#d29922;--major:#f85149;--div:#a371f7}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.5 system-ui,"Noto Sans TC",sans-serif}
  header{padding:16px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
  h1{font-size:18px;margin:0 0 6px} .sub{color:var(--dim);font-size:12px}
  .stats{display:flex;gap:16px;margin-top:10px;flex-wrap:wrap}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px}
  .stat b{font-size:18px} .stat.div b{color:var(--div)}
  .controls{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center}
  select,input{background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font:inherit}
  .wrap{overflow-x:auto;padding:12px 20px 60px}
  table{border-collapse:collapse;width:100%;min-width:720px} th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--dim);font-weight:600;font-size:12px;position:sticky;top:120px;background:var(--bg)}
  tr.divergent{background:rgba(163,113,247,.08)} tr.divergent td:first-child{box-shadow:inset 3px 0 var(--div)}
  .zh{font-size:16px} .en{color:var(--dim);font-size:12px}
  .badge{display:inline-block;border-radius:5px;padding:1px 7px;font-size:11px;font-weight:600;white-space:nowrap}
  .v-ok{background:rgba(63,185,80,.15);color:var(--ok)} .v-issue{background:rgba(248,81,73,.15);color:var(--major)}
  .s-major{color:var(--major)} .s-minor{color:var(--minor)} .s-none{color:var(--dim)}
  .cats{color:var(--dim);font-size:11px;margin-top:2px} .note{color:var(--dim);font-size:11px;margin-top:2px;max-width:260px}
  .agr{font-size:11px;font-weight:600} .agr-divergent{color:var(--div)} .agr-all-issue{color:var(--major)} .agr-all-ok{color:var(--ok)} .agr-single{color:var(--dim)}
  .cell-empty{color:var(--line)}
</style></head><body>
<header>
  <h1>Sentence QA — cross-model review <span class="sub">(review aid — advisory only; never edits the bank)</span></h1>
  <div class="sub">source: ${escapeHtml(meta.in)} · ${meta.count} result rows · models: ${models.map(escapeHtml).join(', ')}</div>
  <div class="stats">
    <div class="stat"><b>${summary.sentences}</b> sentences</div>
    <div class="stat div"><b>${summary.divergent}</b> divergent</div>
    <div class="stat"><b>${summary.allIssue}</b> all-issue</div>
    <div class="stat"><b>${summary.allOk}</b> all-ok</div>
  </div>
  <div class="controls">
    <label>agreement <select id="f-agr"><option value="">all</option><option value="divergent">divergent</option><option value="all-issue">all-issue</option><option value="all-ok">all-ok</option><option value="single">single</option></select></label>
    <label>min severity <select id="f-sev"><option value="0">any</option><option value="1">minor+</option><option value="2">major</option></select></label>
    <label>category <select id="f-cat"><option value="">all</option>${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select></label>
    <label>sort <select id="f-sort"><option value="review">divergent → severity</option><option value="id">by id</option><option value="sev">severity</option></select></label>
    <input id="f-q" placeholder="filter text…" size="16"/>
  </div>
</header>
<div class="wrap"><table><thead><tr><th>id</th><th>sentence</th>${models.map((m) => `<th>${escapeHtml(m)}</th>`).join('')}<th>agreement</th></tr></thead><tbody id="tb"></tbody></table></div>
<script id="data" type="application/json">${dataJson}</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const SEV = {none:0,minor:1,major:2};
const f_agr=document.getElementById('f-agr'), f_sev=document.getElementById('f-sev'), f_cat=document.getElementById('f-cat'), f_sort=document.getElementById('f-sort'), f_q=document.getElementById('f-q'), tb=document.getElementById('tb');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function cell(r){ if(!r) return '<td class="cell-empty">—</td>';
  const cats = r.issue_categories.length?'<div class="cats">'+r.issue_categories.map(esc).join(', ')+'</div>':'';
  return '<td><span class="badge v-'+r.verdict+'">'+r.verdict+'</span> <span class="s-'+r.severity+'">'+r.severity+'</span>'+cats+(r.note?'<div class="note">'+esc(r.note)+'</div>':'')+'</td>';
}
function render(){
  const agr=f_agr.value, sev=+f_sev.value, cat=f_cat.value, q=f_q.value.trim(), sort=f_sort.value;
  let rows = DATA.rows.filter(r=>{
    if(agr && r.agreement!==agr) return false;
    if(sev && SEV[r.worst]<sev) return false;
    if(cat && !r.categories.includes(cat)) return false;
    if(q && !(r.sentence.includes(q)||r.english.toLowerCase().includes(q.toLowerCase())||String(r.id)===q)) return false;
    return true;
  });
  if(sort==='id') rows=rows.slice().sort((a,b)=>a.id-b.id);
  else if(sort==='sev') rows=rows.slice().sort((a,b)=>SEV[b.worst]-SEV[a.worst]||a.id-b.id);
  // 'review' order is the pre-sorted default from the generator.
  tb.innerHTML = rows.map(r=>'<tr class="'+(r.agreement==='divergent'?'divergent':'')+'"><td>'+r.id+'</td>'+
    '<td><div class="zh">'+esc(r.sentence)+'</div><div class="en">'+esc(r.english)+'</div></td>'+
    DATA.models.map(m=>cell(r.byModel[m])).join('')+
    '<td class="agr agr-'+r.agreement+'">'+r.agreement+'</td></tr>').join('') || '<tr><td colspan="9" style="color:var(--dim);padding:20px">no rows match</td></tr>';
}
for(const el of [f_agr,f_sev,f_cat,f_sort]) el.onchange=render;
f_q.oninput=render;
render();
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function main(): void {
  const { in: inPath, out } = parseArgs(process.argv.slice(2));
  if (!existsSync(inPath)) {
    console.error(`results file not found: ${inPath}\n  run the harness first (e.g. npm run sentence-qa -- --mock --limit 20) or point --in at the sample fixture.`);
    process.exit(1);
  }
  const records = readRecords(inPath);
  const { rows, models } = group(records);
  const outDir = dirname(out);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(out, renderHtml(rows, models, { in: inPath, count: records.length }));
  // Counts only — never echo sentence text.
  const divergent = rows.filter((r) => r.agreement === 'divergent').length;
  console.log(`report → ${out}`);
  console.log(`${rows.length} sentence(s), ${models.length} model(s), ${divergent} divergent — open the file in a browser.`);
}

main();
