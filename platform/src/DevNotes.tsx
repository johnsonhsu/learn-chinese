/**
 * Dev Notes hub (dev-only reference, reachable ONLY at `/?devnotes` — never linked
 * from the app UI, exactly like `?ui`). It's the landing page for the internal
 * reference pages we keep around:
 *   - UI Components  → /?ui              (the styleguide / component gallery)
 *   - Landscape Design → /?ui=landscape  (the landscape redesign reference, #152)
 *   - 10 Ideas       → /?devnotes=ideas  (product / eng brainstorm — this file)
 *
 * `App.tsx` dispatches: bare `?devnotes` renders the hub; `?devnotes=ideas`
 * renders the ideas page (mirrors how `?ui` vs `?ui=landscape` works). Adding a
 * new notes page = one entry in PAGES below + (optionally) a new `page` branch.
 *
 * Self-contained: its own scoped styles, no dependency on the module CSS, so it
 * renders identically regardless of the active theme. NOT shipped in the app nav.
 */

interface PageLink {
  href: string;
  emoji: string;
  title: string;
  blurb: string;
}

const PAGES: PageLink[] = [
  { href: '/?ui', emoji: '🎨', title: 'UI Components', blurb: 'The living styleguide: shared UI kit, design tokens, and the theme inspector (preview every theme surface-by-surface).' },
  { href: '/?ui=landscape', emoji: '📐', title: 'Landscape Design', blurb: 'The landscape-orientation redesign reference (epic #152) — how the centered columns and writing pad adapt in landscape.' },
  { href: '/?devnotes=ideas', emoji: '💡', title: '10 Ideas', blurb: 'A running brainstorm of product & engineering ideas, grounded in the current codebase. A draft to react to — curator-editable.' },
];

interface Idea {
  title: string;
  blurb: string;
  grounded: string;
}

// A FIRST-DRAFT brainstorm grounded in the current app (a Taiwan-Traditional
// learning PWA). Dev notes, not shipped copy — reshape / replace freely.
const IDEAS: Idea[] = [
  {
    title: 'Review Due Today',
    blurb: 'A home-screen entry that surfaces the characters whose retention has decayed below threshold and launches a focused review session — turning the forgetting curve into a daily nudge.',
    grounded: 'mastery.ts already models per-char retention decay (decay_per_day); char-knowledge condition 2 uses it. Just expose "N chars fading → review".',
  },
  {
    title: '“Fix my mistakes” drill',
    blurb: 'A one-tap session that pulls exactly the characters you recently got wrong, so misses get re-drilled while they still sting.',
    grounded: 'character_stats already records last_incorrect + recent_results per char; filter recent "I" and feed the existing practice flow.',
  },
  {
    title: 'Speaking / pronunciation practice',
    blurb: 'Add the inverse of listening: record yourself saying a word and self-check against the zhuyin + audio. Rounds out reading + writing with speaking.',
    grounded: 'TTS + voices are wired (utils/voices, practice-english audio); this adds mic capture + a self-rating, no new curriculum.',
  },
  {
    title: 'Streaks & a daily goal',
    blurb: 'A gentle habit loop on the My Characters dashboard — a streak counter and an adjustable daily target (chars practiced / minutes), celebrated but never punitive.',
    grounded: 'Per-profile stats + the my-characters dashboard exist; add a streak derived from lastSeen dates + a per-profile goal lever.',
  },
  {
    title: 'Sentence-QA → curation queue',
    blurb: 'Feed the local-LLM sentence-QA harness (#74) output into an in-admin worklist: divergent / major-severity sentences rise to the top for the curator to accept, edit, or drop.',
    grounded: 'The #74 harness already emits per-sentence verdicts + cross-model divergence; wire its JSONL into the Sentence Bank admin as a review lane.',
  },
  {
    title: 'Reading difficulty bands',
    blurb: 'Let Reading Chinese / English pick sentences by difficulty tier (easy → hard) so a beginner isn’t handed a 15-char sentence on day one.',
    grounded: 'content-admin already computes bankDifficulty() (rarest-char-gated); surface it as a band selector in the reading modules.',
  },
  {
    title: 'Fully-offline TTS voice',
    blurb: 'Bundle a small on-device Mandarin voice so audio works with zero network — matching the offline-first promise on platforms where Web Speech needs a connection.',
    grounded: 'App is offline-first (baked DBs, service worker); voices util centralizes speech — add a bundled-voice fallback path.',
  },
  {
    title: 'Parent / teacher progress snapshot',
    blurb: 'A read-only, human-readable progress summary (chars known, level, recent activity) a learner can share with a parent or teacher — no account needed.',
    grounded: 'JSON backup/export already exists; add a rendered snapshot view over the same per-profile stats.',
  },
  {
    title: 'Adaptive re-placement',
    blurb: 'Periodically offer a quick mini-placement to recenter the learner’s level as skills grow (or fade after a break), instead of a one-time placement at signup.',
    grounded: 'PlacementTest + computeUserLevel exist; trigger a short re-check when known-count drifts far from the current level window.',
  },
  {
    title: 'Handwriting leniency setting',
    blurb: 'A per-profile stroke-tolerance lever — a forgiving “kid mode” vs a strict mode — so young learners aren’t blocked by exact stroke matching.',
    grounded: 'HanziWriter quiz + the device-level levers system already exist; add a tolerance lever the WritingCanvas passes through.',
  },
];

function Hub() {
  return (
    <div className="dn">
      <style>{STYLES}</style>
      <header className="dn-head">
        <h1>Dev Notes</h1>
        <p className="dn-sub">Internal reference pages — reachable only at <code>/?devnotes</code>, never linked from the app UI.</p>
      </header>
      <div className="dn-cards">
        {PAGES.map((p) => (
          <a className="dn-card" href={p.href} key={p.href}>
            <div className="dn-card-emoji" aria-hidden>{p.emoji}</div>
            <div className="dn-card-title">{p.title}</div>
            <div className="dn-card-blurb">{p.blurb}</div>
            <div className="dn-card-href">{p.href}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Ideas() {
  return (
    <div className="dn">
      <style>{STYLES}</style>
      <header className="dn-head">
        <a className="dn-back" href="/?devnotes">← Dev Notes</a>
        <h1>10 Ideas</h1>
        <p className="dn-sub">
          <span className="dn-tag">DRAFT</span> A running brainstorm grounded in the current codebase — dev notes, not shipped copy. Reshape, reorder, or replace freely.
        </p>
      </header>
      <ol className="dn-ideas">
        {IDEAS.map((idea, i) => (
          <li className="dn-idea" key={i}>
            <div className="dn-idea-num">{i + 1}</div>
            <div className="dn-idea-body">
              <div className="dn-idea-title">{idea.title}</div>
              <div className="dn-idea-blurb">{idea.blurb}</div>
              <div className="dn-idea-grounded"><span>grounded in</span> {idea.grounded}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function DevNotes({ page }: { page: string | null }) {
  return page === 'ideas' ? <Ideas /> : <Hub />;
}

const STYLES = `
.dn{--dn-bg:#0f1320;--dn-card:#171c2b;--dn-line:#28304a;--dn-txt:#e7ebf5;--dn-dim:#93a0bd;--dn-accent:#8b9cff;--dn-tag:#d9a441;
  min-height:100vh;margin:0;background:radial-gradient(1200px 600px at 50% -10%,#1a2136,var(--dn-bg));color:var(--dn-txt);
  font:15px/1.6 system-ui,-apple-system,"Noto Sans TC",sans-serif;padding:40px 20px 80px}
.dn *{box-sizing:border-box}
.dn-head{max-width:900px;margin:0 auto 28px}
.dn-head h1{font-size:34px;margin:8px 0 6px;letter-spacing:-.5px;color:var(--dn-txt)}
.dn-sub{color:var(--dn-dim);margin:0;max-width:70ch}
.dn-sub code{background:var(--dn-card);border:1px solid var(--dn-line);border-radius:5px;padding:1px 6px;color:var(--dn-accent)}
.dn-back{color:var(--dn-accent);text-decoration:none;font-size:13px;display:inline-block;margin-bottom:6px}
.dn-back:hover{text-decoration:underline}
.dn-tag{background:rgba(217,164,65,.16);color:var(--dn-tag);border-radius:5px;padding:1px 7px;font-size:11px;font-weight:700;margin-right:6px;vertical-align:2px}
.dn-cards{max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.dn-card{display:block;background:var(--dn-card);border:1px solid var(--dn-line);border-radius:14px;padding:20px;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s,box-shadow .15s}
.dn-card:hover{border-color:var(--dn-accent);transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.35)}
.dn-card-emoji{font-size:30px;margin-bottom:10px}
.dn-card-title{font-size:18px;font-weight:700;margin-bottom:6px}
.dn-card-blurb{color:var(--dn-dim);font-size:13.5px}
.dn-card-href{color:var(--dn-accent);font-size:12px;margin-top:12px;font-family:ui-monospace,monospace}
.dn-ideas{max-width:900px;margin:0 auto;list-style:none;padding:0;display:grid;gap:12px}
.dn-idea{display:flex;gap:16px;background:var(--dn-card);border:1px solid var(--dn-line);border-radius:12px;padding:16px 18px}
.dn-idea-num{flex:0 0 auto;width:30px;height:30px;border-radius:8px;background:rgba(139,156,255,.14);color:var(--dn-accent);font-weight:800;display:flex;align-items:center;justify-content:center}
.dn-idea-title{font-size:16.5px;font-weight:700;margin-bottom:3px}
.dn-idea-blurb{color:var(--dn-txt);opacity:.92}
.dn-idea-grounded{color:var(--dn-dim);font-size:12.5px;margin-top:8px;border-top:1px dashed var(--dn-line);padding-top:8px}
.dn-idea-grounded span{color:var(--dn-accent);font-weight:600;text-transform:uppercase;font-size:10.5px;letter-spacing:.5px;margin-right:6px}
`;
