/**
 * DEMO-MODE PREDICATE — the single source of truth for "is this an isolated,
 * always-fresh demo session?". Imported by the low-level user-store (jar choice)
 * AND by demo.ts / useAppUpdate / DemoBadge / App.tsx, so the decision can NEVER
 * disagree across the app.
 *
 * Decided once at module load (the query params + standalone state don't change
 * within a page session). Memoized so every caller sees the same answer.
 *
 * Two ways a load is demo:
 *  1. `?demo` is present — the explicit "try it" link (any host).
 *  2. Issue #27 (demo-by-default): a PUBLIC, BROWSER (non-standalone) `?app`
 *     load on the DEPLOYED host. The publicly-shared `/?app` link (posted on
 *     PRs, used by LandingPage to re-enter from a browser tab) is the de-facto
 *     public demo, so it routes into the isolated demo jar too — NEVER the real
 *     `learning-chinese-user` jar.
 *
 * What is DELIBERATELY excluded (so the real store is never touched):
 *  - The INSTALLED PWA (standalone): keeps the real jar, normal update prompt.
 *  - DEV / LAN hosts: `?app` there is a developer using the real jar locally.
 *  - A plain browser tab with no `?app` on the deployed host never reaches the
 *    app at all (it gets the marketing landing — see shouldShowLanding()).
 *
 * No DOM/storage side effects here — pure predicate over location + matchMedia
 * so it's safe to import from any layer.
 */

/** Inputs the demo decision depends on — extracted so the rule is unit-testable. */
export interface DemoModeEnv {
  /** location.search (e.g. "?app&demo"). */
  search: string;
  /** location.hostname. */
  hostname: string;
  /** Running as an installed PWA (iOS navigator.standalone OR display-mode). */
  standalone: boolean;
}

/**
 * A dev / LAN / .local host — where `?app` is a developer driving the REAL jar,
 * not a public demo visitor. Mirrors the host check in App.tsx's shouldShowLanding().
 */
function isDevHost(host: string): boolean {
  return (
    host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' ||
    /^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /\.local$/.test(host)
  );
}

/**
 * The pure demo-mode rule. Given the environment, decide whether this is an
 * isolated, always-fresh demo session. Exported for unit tests; production code
 * uses the memoized {@link isDemoMode}.
 */
export function evaluateDemoMode(env: DemoModeEnv): boolean {
  const params = new URLSearchParams(env.search);
  // (1) Explicit demo link — honoured on every host (incl. dev/preview).
  if (params.has('demo')) return true;
  // (2) Demo-by-default: a public browser `?app` load on the deployed host.
  //     Standalone (installed) and dev/LAN hosts are excluded so the real jar
  //     and a developer's local jar are never re-routed or wiped.
  if (params.has('app') && !env.standalone && !isDevHost(env.hostname)) return true;
  return false;
}

function readEnv(): DemoModeEnv {
  let standalone = false;
  try {
    standalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
  } catch { /* no DOM (e.g. tests) — treat as browser */ }
  return {
    search: typeof location !== 'undefined' ? location.search : '',
    hostname: typeof location !== 'undefined' ? location.hostname : '',
    standalone,
  };
}

// Memoize: query params + standalone state are fixed for the page session, and
// the jar name in user-store is locked in at its module load — every later
// caller MUST see the same value.
let cached: boolean | null = null;

/** True when this load is an isolated, always-fresh demo session. */
export function isDemoMode(): boolean {
  if (cached === null) {
    try { cached = evaluateDemoMode(readEnv()); } catch { cached = false; }
  }
  return cached;
}
