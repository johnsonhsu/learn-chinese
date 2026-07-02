/**
 * Marketing / install landing page — shown only to browser-tab visitors on the
 * real domain (see shouldShowLanding in App.tsx). Pure presentation: no data
 * layer, no offline boot. Bilingual with a live EN/中 toggle. The whole page is
 * a conversion surface whose single job is to get a PWA install ("Add to Home
 * Screen") so setup happens in the installed (standalone) app where on-device
 * data persists correctly.
 *
 * Visual direction: BOLD / DARK / energetic — modeled on the VCASS arts-school
 * site. Charcoal near-black field, warm cream text, ONE tan/gold/bronze accent,
 * and a single bright full-bleed gold band. Big, heavy, UPPERCASE display type.
 * The hero signature is a 2-up of two static 米字格 practice cells — 寫 (write)
 * and 讀 (read) in real calligraphy — the read+write duality at the heart of the
 * app, stated plainly. The centerpiece is a lined NOTEBOOK holding the live read-
 * along: a real Taiwan paragraph that "writes itself in" as you scroll into view
 * (reversing on scroll-up), with situation tabs and a coverage slider beneath.
 *
 * Install flow: we capture `beforeinstallprompt` (Chrome / Android / desktop)
 * and fire `prompt()` straight from the CTA. iOS Safari has no such event, so we
 * sniff for it and route the CTA to the exact manual steps (Share → Add to Home
 * Screen). Anything else falls back to those steps too — the CTA is never dead.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { RANKED, SITUATIONS } from './LandingReadData.ts';

type Lang = 'en' | 'zh-TW';

// Minimal shape of the Chrome-only beforeinstallprompt event.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const T = {
  en: {
    title: 'Learn Chinese',
    wordmark: '學中文',
    region: 'Traditional · Taiwan',
    // The PRODUCT tagline — what the app is, in the VCASS display voice. Carried
    // on the bright full-bleed band (the page's loudest line).
    tagline: 'Read the menu. Read the signs. Read Taiwan.',
    madeFor: 'Made for iPhone & iPad',
    // Hero headline. The script word is now STATIC "Read / Write" — the read+write
    // duality at the page's heart, stated plainly (no toggle animation).
    heroScript: 'Read / Write',
    // Two big lines: "中文 IN" on one line (中文 + the connector share a line,
    // never split into 中文 / IN / TAIWAN), then "TAIWAN" on the next.
    heroBig: '中文 in',
    heroBig2: 'Taiwan',
    sub: 'Learn Traditional characters most-used first, so the few hundred you start with unlock most of what you read every day. Fifteen minutes on your phone — no account, no ads.',
    // CTAs (dynamic by platform)
    ctaPrompt: 'Add to Home Screen',
    ctaIos: 'Add to Home Screen',
    ctaGeneric: 'Add to Home Screen',
    ctaInstalled: 'Open the app',
    ctaHint: 'Free · Offline · No account · No ads',

    // ── Section-nav menu (the ☰ in the top bar) ──
    menuLabel: 'Menu',
    menuTitle: 'Jump to',
    navTry: 'Try it',
    navMilestones: 'Milestones',
    navHow: 'How it works',
    navGet: 'Get the app',
    navTop: 'Top',

    // ── The notebook centerpiece ──
    bookTie: 'Learn to write a character and you never forget how to read it.',
    notebookHeader: 'Reading practice',

    // ── The 80/20 read-along demo ──
    readEyebrow: 'The 80/20 of Chinese',
    readHead: 'See how much you’d read.',
    readLede: 'Set how many of the most common characters you know, then watch real Taiwan text come into focus.',
    readSliderLabel: 'Characters you know',
    readUnit: 'readable',
    // Top stat pair: % readable (coverage). Drives the slider's aria-valuetext.
    readReadableLabel: (p: number) => `${p}% readable`,
    // The pad text is always the Brush 楷 face now — no font selector.
    // Situation tabs + the paste-your-own "Custom" tab.
    readTabsLabel: 'Choose a situation',
    // Slider tick markings. 1,000 is the hero milestone — knowing the ~1,000
    // most-common characters reads ~90%+ of everyday Taiwan text.
    readTick500: '500',
    readTick1000Badge: '1,000 chars ≈ 90% readable',
    readCustomTab: 'Custom',
    readCustomPlaceholder: 'Paste any Traditional Chinese — a menu, a text, an article — and see how much you could read right now.',
    readCustomEmpty: 'Paste some Chinese above to check it against your level.',
    // Demo hand-off (issue #66): a real link into the isolated `?app&demo` demo.
    // On a phone it opens the demo; on desktop the device gate hands it off with
    // a QR (the demo is a mobile PWA experience).
    demoCta: 'Try the live demo',
    demoCtaHint: 'Opens the app pre-loaded with progress — best on your phone.',

    // ── Fifteen minutes a day: A → B (no hard timeline — outcome, not a deadline) ──
    pitchEyebrow: 'Fifteen minutes a day',
    pitchA: 'Today the menu might as well be a wall.',
    pitchB: 'Keep showing up and you’re reading it, ordering, and texting a friend in Taipei.',
    pitchLead: 'Fifteen minutes a day. A handful of new characters at a time.',
    pitchBody: 'One short session — the kind you finish on the MRT. Show up daily and the characters stick, because each one comes back for review right when you’re about to forget it.',

    // ── Milestones: concrete reading outcomes at each character count ──
    mileEyebrow: 'Three milestones',
    m1n: '500', m1l: 'Everyday life', m1when: 'first milestone',
    m1d: 'Read most everyday text — menus, signs, messages — and order in Taipei without pointing.',
    m2n: '1,000', m2l: 'On your own', m2when: 'the big one',
    m2d: 'Read about 90% of everyday Traditional Chinese. The language stops being a wall, and you get by on your own.',
    m3n: '1,500', m3l: 'News & beyond', m3when: 'going further',
    m3d: 'Read everyday text comfortably and start making real headway on news, notices, and longer articles.',
    mileFoot: 'You don’t need 5,000 characters to live your life in 中文. You need the right few hundred, in the order that pays off fastest. How fast you get there is up to you.',

    // ── Proof: the app turns progress into a number ──
    proofEyebrow: 'Progress you can see',
    p1n: 'Known', p1d: 'Every character you’ve learned, counted — watch it climb past 500, then 1,000.',
    p2n: 'Retention', p2d: 'Spaced review tracks what’s actually stuck, so you know it’s in for good — not just seen once.',
    p3n: 'Level', p3d: 'One number for how far you’ve come — it climbs as you learn, based on the characters you can actually read right now.',

    // ── Why it works ──
    why: 'How it works',
    s1t: 'Frequency order', s1: 'You learn the most-used characters first, so a small set buys a huge amount of reading — fast.',
    s2t: 'Spaced repetition', s2: 'Each character comes back right before you’d forget it. The better you know it, the less it returns.',
    s3t: 'Write to remember', s3: 'Trace every character stroke by stroke on a real canvas, checked as you go. Writing it is what makes it stick.',

    // ── Reassurance ──
    reassureEyebrow: 'No catch',
    f1: 'Free, forever', f2: 'Works fully offline',
    f3: 'No account, no sign-up', f4: 'No ads, ever',
    f5: 'Your data stays on your device', f6: 'Real Taiwan Traditional + Zhuyin',

    // ── Final CTA ──
    finalEyebrow: 'Start {when}',
    finalLine: 'Add it to your Home Screen and write your first characters {when}.',
    // {when} = time-of-day word, swapped in at render by timeOfDayKey().
    when: { morning: 'this morning', day: 'today', night: 'tonight' },

    // ── Install instructions (iOS + generic fallback) ──
    installBarIos: 'Add to your Home Screen',
    installIntroIos: 'It runs like a real app and keeps every character you learn on your device. On your iPhone or iPad, in Safari:',
    i1: 'Tap the Share button', i1b: 'in the toolbar.',
    i2: 'Scroll down and tap “Add to Home Screen.”',
    i3: 'Open 學中文 from your Home Screen — that’s it.',
    installBarGeneric: 'Add to your Home Screen',
    installIntroGeneric: 'It installs like a real app and keeps every character you learn on your device:',
    g1: 'Open your browser menu (⋮ or the install icon in the address bar).',
    g2: 'Choose “Install” or “Add to Home Screen.”',
    g3: 'Open 學中文 from your Home Screen — that’s it.',
  },
  'zh-TW': {
    title: '學中文',
    wordmark: '學中文',
    region: '繁體 · 台灣',
    tagline: '看懂菜單、看懂招牌、看懂台灣。',
    madeFor: '專為 iPhone 與 iPad 打造',
    heroScript: '讀寫',
    heroBig: '中文在',
    heroBig2: '台灣',
    sub: '從最常用的繁體字開始學起，所以你最先學會的那幾百個字，就能看懂日常生活裡大部分的內容。每天用手機練十五分鐘，免註冊、無廣告。',
    ctaPrompt: '加入主畫面',
    ctaIos: '加入主畫面',
    ctaGeneric: '加入主畫面',
    ctaInstalled: '開啟 App',
    ctaHint: '免費 · 離線 · 免註冊 · 無廣告',

    // ── 區段導覽選單（頂部列的 ☰）──
    menuLabel: '選單',
    menuTitle: '跳到',
    navTry: '讀讀看',
    navMilestones: '里程碑',
    navHow: '怎麼運作',
    navGet: '下載 App',
    navTop: '回到頂端',

    bookTie: '學會怎麼寫，就再也不會忘記怎麼讀。',
    notebookHeader: '閱讀練習',

    readEyebrow: '先學最常用的字',
    readHead: '你能讀懂多少？',
    readLede: '設定你認識多少個最常用的字，看真正的台灣文字一個個亮起來。',
    readSliderLabel: '你認識的字',
    readUnit: '看得懂',
    readReadableLabel: (p: number) => `${p}% 讀得懂`,
    readTabsLabel: '選擇情境',
    // 滑桿刻度。1,000 是關鍵里程碑——認得最常用的約 1,000 個字，就能看懂約九成以上的日常台灣文字。
    readTick500: '500',
    readTick1000Badge: '1,000 字 ≈ 看得懂 90%',
    readCustomTab: '自訂',
    readCustomPlaceholder: '在這裡貼上任何繁體中文——菜單、訊息、文章都可以——看看以你現在的程度能讀懂多少。',
    readCustomEmpty: '在上方貼上中文，對照你現在的程度看看。',
    // Demo 連結（issue #66）：連到隔離的 `?app&demo` 示範。手機上會直接開啟示範；
    // 桌機則由裝置閘門以 QR code 轉交到手機（示範是手機 PWA 體驗）。
    demoCta: '打開線上示範',
    demoCtaHint: '會開啟預先載入進度的 App —— 用手機體驗最佳。',

    pitchEyebrow: '每天十五分鐘',
    pitchA: '今天，那份菜單還像一面看不懂的牆。',
    pitchB: '只要持續練下去，你就能看懂它、點餐，還能用中文傳訊息給台北的朋友。',
    pitchLead: '每天十五分鐘，一次幾個新字。',
    pitchBody: '一次短短的練習——搭捷運的時間就能做完。每天持續，字自然就記住了，因為每個字都會在你快要忘記的那一刻，剛好再出現一次。',

    mileEyebrow: '三個里程碑',
    m1n: '500', m1l: '日常文字', m1when: '第一個里程碑',
    m1d: '看懂大部分的日常文字——菜單、招牌、訊息。在台北點餐，不用再用手比。',
    m2n: '1,000', m2l: '自己搞定', m2when: '關鍵的一站',
    m2d: '看懂日常繁體中文約 90%。這個語言不再是一面牆，大部分情況你都能自己搞定。',
    m3n: '1,500', m3l: '新聞與正式書寫', m3when: '再往前走',
    m3d: '日常文字讀起來輕鬆自在，也開始能慢慢讀進新聞、公告和較長的文章。',
    mileFoot: '要用中文過生活，你不必學會五千個字。你需要的是對的那幾百個字——而且照著最划算的順序去學。至於要花多久，就看你自己了。',

    proofEyebrow: '進度看得見',
    p1n: '已學會', p1d: '你學會的每個字都會算進來。看著它超過 500，再超過 1,000。',
    p2n: '記憶率', p2d: '間隔複習會告訴你哪些字是真的記住了——不只是「看過一次」。',
    p3n: '等級', p3d: '把你的進度濃縮成一個分數——它會隨著你現在真正讀得懂的字，一路往上爬。',

    why: '為什麼有效',
    s1t: '頻率排序', s1: '先學最常用的字，所以一小組字就能換來大量的閱讀能力——而且很快。',
    s2t: '間隔複習', s2: '每個字都會在你快忘記前再出現。記得越熟，複習就越少；沒有一次練習被浪費。',
    s3t: '用寫的記住', s3: '在真實的畫布上一筆一畫描寫每個字，邊寫邊檢查。動手寫過，記得最牢。',

    reassureEyebrow: '沒有陷阱',
    f1: '永久免費', f2: '完全離線可用',
    f3: '免註冊、免帳號', f4: '永遠沒有廣告',
    f5: '資料留在你的裝置', f6: '真正的台灣繁體＋注音',

    finalEyebrow: '{when}就開始',
    finalLine: '把它加進主畫面，{when}就寫下你的第一個字。',
    // {when} 依使用者當下時段替換（見 timeOfDayKey）。
    when: { morning: '今早', day: '今天', night: '今晚' },

    installBarIos: '加入主畫面',
    installIntroIos: '它會像真正的 App 一樣運作，進度也都存在你的裝置上。在 iPhone 或 iPad 的 Safari 裡：',
    i1: '點一下工具列的「分享」按鈕', i1b: '。',
    i2: '往下滑，點一下「加入主畫面」。',
    i3: '從主畫面開啟「學中文」，就完成了。',
    installBarGeneric: '加入主畫面',
    installIntroGeneric: '它會像真正的 App 一樣安裝，進度也都存在你的裝置上：',
    g1: '打開瀏覽器選單（⋮ 或網址列的安裝圖示）。',
    g2: '選擇「安裝」或「加入主畫面」。',
    g3: '從主畫面開啟「學中文」，就完成了。',
  },
} as const;

// ── Read-along coverage engine ──────────────────────────────────────────────
// We score ANY Taiwan paragraph against the learner's "characters you know"
// level. RANKED (from LandingReadData) lists the 3,556 most-common characters
// in frequency order; we build a char→rank Map ONCE (rank = index + 1) so each
// lookup is O(1). rankOf returns Infinity for unranked/rare chars, so they're
// never lit at any slider value ("rare — you won't know these yet").
const RANK_MAP: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < RANKED.length; i++) {
    // Keep the FIRST (most-common) rank if a char somehow repeats.
    if (!m.has(RANKED[i])) m.set(RANKED[i], i + 1);
  }
  return m;
})();
const rankOf = (ch: string): number => RANK_MAP.get(ch) ?? Infinity;

// A CJK (Han) test: only these count toward the readable %; everything else
// (punctuation, spaces, latin, digits) is neutral — rendered plain, not scored.
// Covers the main CJK Unified block + Extension-A + compatibility ideographs.
function isHan(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff)
  );
}

// One scored character of a paragraph. kind drives rendering:
//   'lit'   — Han, rank ≤ known → fully inked (you can read it)
//   'dim'   — Han, rank > known OR rare/unranked → faded + blurred
//   'punct' — non-Han → plain, never counted
interface ScoredChar { c: string; kind: 'lit' | 'dim' | 'punct'; }
interface Scored { chars: ScoredChar[]; hanTotal: number; }

// Pure: turn a string + a known-level into scored chars + the Han denominator.
// (The lit/dim split depends on `known`, so callers re-derive lit per render;
//  here we tag rank vs. punct once and let the component decide lit via `known`.)
function scoreText(text: string, known: number): Scored {
  const chars: ScoredChar[] = [];
  let hanTotal = 0;
  // Iterate by code point so astral CJK chars aren't split.
  for (const c of Array.from(text)) {
    if (!isHan(c)) {
      chars.push({ c, kind: 'punct' });
      continue;
    }
    hanTotal++;
    chars.push({ c, kind: rankOf(c) <= known ? 'lit' : 'dim' });
  }
  return { chars, hanTotal };
}

// Clean 3-line hamburger for the top bar's menu affordance. Inherits currentColor
// (cream→gold on hover via .lp-burger), purely decorative — the button around it
// carries the aria-label, so this stays aria-hidden.
function MenuIcon() {
  return (
    <svg className="lp-burger-ico" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <line x1="3" y1="7" x2="21" y2="7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="3" y1="17" x2="21" y2="17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function IosShareIcon() {
  return (
    <svg className="lp-share-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 3.5v11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8 7l4-3.5L16 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 11H5.5a1.5 1.5 0 00-1.5 1.5V19A1.5 1.5 0 005.5 20.5h13A1.5 1.5 0 0020 19v-6.5A1.5 1.5 0 0018.5 11h-1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One static 米字格 practice cell holding a single finished glyph in real Han
// calligraphy (Songti/Kaiti via --lp-han). No animation — just clean ink in a
// guide cell. The hero pairs two of these (寫 + 讀) side by side so the cell
// states the read+write duality at the page's heart without any motion.
function PracticeCell({ glyph }: { glyph: string }) {
  return (
    <div className="lp-cell" aria-hidden="true">
      <svg className="lp-cell-grid" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="50" y1="0" x2="50" y2="100" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="0" y1="0" x2="100" y2="100" />
        <line x1="100" y1="0" x2="0" y2="100" />
      </svg>
      <span className="lp-cell-glyph" lang="zh-TW">{glyph}</span>
    </div>
  );
}

// The hero signature: a 2-up of two small static 米字格 cells — 讀 (read) then
// 寫 (write) — side by side. Order matches the "Read / Write" label above. Real
// calligraphy, no animation; the pairing IS the statement (you read and you write).
function PracticeCells() {
  return (
    <div className="lp-cells" aria-hidden="true">
      <PracticeCell glyph="讀" />
      <PracticeCell glyph="寫" />
    </div>
  );
}

// Apple-glyph device hint: iPhone + iPad outlines for the "Made for" badge.
function DevicesIcon() {
  return (
    <svg className="lp-devices-ico" viewBox="0 0 36 24" width="28" height="19" aria-hidden="true">
      <rect x="1" y="2" width="14" height="20" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="6" y1="19" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="18" y="5" width="17" height="14" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="20.4" y1="12" x2="20.4" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ── Scroll reveal ─────────────────────────────────────────────────────────
// One shared IntersectionObserver adds `.lp-in` to any `.lp-reveal` element the
// first time it enters the viewport, driving a subtle fade + slide-in via CSS.
// Reveal-once (we unobserve on enter) so it never flickers on scroll-back, and
// it's a no-op under prefers-reduced-motion (the CSS simply shows everything).
function useScrollReveal(deps: unknown[]) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.lp-reveal'));
    if (reduce || !('IntersectionObserver' in window)) {
      // No animation: make sure everything is visible regardless.
      nodes.forEach((n) => n.classList.add('lp-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('lp-in');
            io.unobserve(e.target); // reveal once
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    nodes.forEach((n) => {
      // Anything already on-screen at mount reveals immediately (no off-screen wait).
      if (n.getBoundingClientRect().top < window.innerHeight) n.classList.add('lp-in');
      else io.observe(n);
    });
    return () => io.disconnect();
    // Re-run when language or install state changes the rendered tree.
    // (react-hooks/exhaustive-deps isn't enabled in this repo's eslint config.)
  }, deps);
}

// ── Write-in on scroll ───────────────────────────────────────────────────
// The notebook's paragraph "writes itself in" as the section scrolls through
// the viewport — fitting for a writing app. CRUCIAL: it is driven by SCROLL
// PROGRESS (not a one-shot reveal), so it fills on scroll-down and REVERSES on
// scroll-up, and re-plays every time the notebook re-enters view (the old book
// "didn't reset on scroll-up" and felt dead).
//
// Mechanism: we map the notebook's position in the viewport to a 0..1 progress
// and write it to a CSS var (--lp-ink) on the notebook element. The paragraph's
// per-char ink reveal is keyed off that var (see .lp-note-para in index.css):
// each character un-blurs/fades-in as the wavefront (--lp-ink × charCount)
// passes it. The mapping is tuned so the write-in COMPLETES (progress = 1) the
// moment the pad is fully on screen: it starts as the pad's top edge enters from
// the viewport bottom and finishes as its bottom edge reaches the viewport
// bottom (= fully visible) — no further scrolling needed. Progress 0 = nothing
// written yet; 1 = fully inked. Because it's a pure read of scrollY each frame,
// scrolling back up un-writes it smoothly.
// We update on scroll/resize via rAF (one write per frame). The `count` dep
// re-measures when the active paragraph length changes (tab/lang/paste).
//
// No-op under prefers-reduced-motion or without rAF: we pin --lp-ink to 1 so
// the text is fully present, no write-in (handled by the CSS fallback too).
function useWriteIn(ref: RefObject<HTMLDivElement | null>, count: number, ready: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Until the brush font is loaded for this text, keep the ink wavefront at 0 so
    // NO character is revealed yet — the prose only appears once it's in the brush
    // face (no fallback→swap flash). When ready flips true, the normal scroll-driven
    // write-in takes over (or, under reduced motion, the text is shown at once).
    if (!ready) {
      el.style.setProperty('--lp-ink', '0');
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame !== 'function') {
      el.style.setProperty('--lp-ink', '1');
      return;
    }
    let raf = 0;
    const compute = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // The write-in plays as the notebook ENTERS the viewport and must finish
      // the instant the pad is fully on screen — not after extra scrolling.
      //   • START inking the moment the pad's top edge crosses into view from the
      //     bottom (r.top reaches the viewport bottom, vh).
      //   • COMPLETE (--lp-ink = 1) when the pad's BOTTOM edge reaches the bottom
      //     of the viewport — i.e. the pad has finished entering and is fully
      //     visible. At that moment r.top === vh − padHeight.
      // For a pad taller than the viewport, "fully visible" isn't reachable, so we
      // fall back to completing as the top reaches ~mid-screen — the write-in
      // still finishes well before you'd scroll the pad off the top.
      const padH = r.height || vh;
      const start = vh;                       // top entering from the bottom edge
      const end = Math.max(vh - padH, vh * 0.4); // bottom hits viewport bottom (clamped for tall pads)
      const span = start - end || 1;          // guard against divide-by-zero
      const p = (start - r.top) / span;
      const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
      el.style.setProperty('--lp-ink', String(clamped));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref, count, ready]);
}

// ── The notebook centerpiece ─────────────────────────────────────────────────
// The emotional heart of the page: a clean lined NOTEBOOK — a warm paper-cream
// notepad surface glowing on the dark charcoal field (a deliberate beat of light
// = "understanding"). Wide, well-proportioned, with a notepad header. The read-
// along lives ON the notebook:
//   • Situation tabs (School/Bank/Shopping/Doctor/News/Restaurant + Custom) swap
//     the paragraph; the slider value persists across tabs.
//   • A real Taiwan paragraph whose characters light up as the slider raises the
//     learner's known-character count. Lit chars (rank ≤ V) are full ink; dim
//     chars (rank > V) are faded + slightly blurred. The % readout = lit Han /
//     total Han, so the payoff lands in a realistic range.
//   • As the notebook scrolls into view, the paragraph "writes itself in" (a
//     handwriting/ink fill keyed off scroll progress — reverses on scroll-up,
//     re-plays on re-entry; see useWriteIn). The write-in is the ENTRANCE; once
//     present, the slider drives the lit/dim coverage. They layer cleanly: a
//     char must be BOTH written-in (entrance) AND lit (rank ≤ V) to read crisp.
//   • The coverage slider sits just ABOVE the situation pills (pad order: top
//     stats → slider → category pills → paragraph).
// A tie line under the notebook carries the learning→understanding throughline.
// The native range thumb is 26px wide (see .lp-read-slider::-webkit-slider-thumb
// in index.css). Its CENTER travels from +halfThumb to width−halfThumb, never to
// the literal track ends — that's the classic misalignment. We expose the half-
// thumb as a CSS var so the scale-mark row + the filled track can be inset by it
// on each side, making thumb / fill / marks line up at 0, 500, 1000, 1500 and between.
const THUMB = 26;
const HALF_THUMB = THUMB / 2; // 13px
// Max "characters you know" the slider reaches — past ~1,500 you cover ~95%+ of
// everyday Traditional text, so the demo tops out here. Scale marks: 0/500/1000/1500.
const SLIDER_MAX = 1500;

// The pad's Chinese text is ALWAYS the Brush 楷 face (handwritten) — the LXGW
// WenKai TC brush web font on this online landing, with a system-Kaiti fallback
// if offline (see useHandwritingWebFont + --lp-han-brush). There is no font
// selector; the paperpad is one consistent handwritten voice.
function OpenBook({ t, lang }: { t: (typeof T)[Lang]; lang: Lang }) {
  // `known` PERSISTS across tab switches — that's the whole point: one "chars you
  // know" level reveals different coverage per situation (300 ≈ 84% School but
  // ≈ 52% News). It is NOT reset when `tab` changes.
  // Starts at 0: the demo opens at 0% readable (every char dim) and the learner
  // reveals coverage by sliding up — at 0 the slider is just a normal slider at 0.
  const [known, setKnown] = useState(0);
  // Active tab: a SITUATIONS key, or 'custom' for the paste-your-own panel.
  const [tab, setTab] = useState<string>(SITUATIONS[0]?.key ?? 'custom');
  const [customText, setCustomText] = useState('');
  // Debounced copy of the textarea so scoring a few hundred chars stays smooth
  // while typing/pasting — the heavy render reads `customDebounced`, not raw input.
  const [customDebounced, setCustomDebounced] = useState('');
  const noteRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);

  // All tab keys in render order — drives ArrowLeft/Right roving focus.
  const tabKeys = useMemo(() => [...SITUATIONS.map((s) => s.key), 'custom'], []);

  // ARIA tablist keyboarding: Arrow keys move selection + focus, Home/End jump.
  function onTabKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const cur = tabKeys.indexOf(tab);
    if (cur < 0) return;
    let next = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % tabKeys.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur - 1 + tabKeys.length) % tabKeys.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabKeys.length - 1;
    else return;
    e.preventDefault();
    const key = tabKeys[next];
    setTab(key);
    // Move focus to the newly-selected tab (roving tabindex).
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`#lp-read-tab-${key}`)
      ?.focus();
  }

  useEffect(() => {
    const id = window.setTimeout(() => setCustomDebounced(customText), 120);
    return () => window.clearTimeout(id);
  }, [customText]);

  const isCustom = tab === 'custom';
  const activeText = isCustom
    ? customDebounced
    : (SITUATIONS.find((s) => s.key === tab) ?? SITUATIONS[0]).text;

  // Score the active paragraph against the (persisted) known-level. Memoized on
  // text + known so flipping tabs or nudging the slider only recomputes when it
  // must; keeps the custom panel responsive for a few hundred chars.
  const scored = useMemo(() => scoreText(activeText, known), [activeText, known]);
  const litCount = scored.chars.reduce((n, ch) => (ch.kind === 'lit' ? n + 1 : n), 0);
  const pct = scored.hanTotal > 0 ? Math.round((litCount / scored.hanTotal) * 100) : 0;
  const hasText = scored.hanTotal > 0;

  // Gate the prose on the Brush font being loaded FOR THIS TEXT. The webfont is
  // unicode-range subset, so we load() the exact glyphs of the active paragraph;
  // until they're in the brush face we keep the paragraph hidden (see render
  // guard below) so the chars never flash a fallback then swap. Falls open if the
  // Font Loading API or the CDN isn't available.
  const fontReady = useBrushFontReady(activeText);

  // Drive the scroll-progress write-in on the NOTEBOOK element. Re-measures when
  // the active paragraph length changes so the ink wavefront spans the new text.
  // Gated on fontReady: the write-in (and thus the reveal) only begins once the
  // brush glyphs are actually loaded, so by the time any char is visible it's
  // already in the brush face — no swap flash.
  useWriteIn(noteRef, scored.hanTotal, fontReady);

  return (
    <section id="try" className="lp-section lp-book-section lp-reveal" aria-labelledby="lp-read-head">
      <p className="lp-eyebrow">{t.readEyebrow}</p>
      <h2 id="lp-read-head" className="lp-read-head">{t.readHead}</h2>
      <p className="lp-read-lede">{t.readLede}</p>

      {/* The paperpad: a clean cream notepad surface on the navy field — a faint
          stack of sheets. --lp-han-count is the number of Han chars in the active
          paragraph; useWriteIn sets --lp-ink (0..1, scroll-driven) — together they
          place the ink wavefront. The prose is ALWAYS the Brush 楷 face. */}
      <div
        className="lp-note"
        ref={noteRef}
        style={{ '--lp-han-count': scored.hanTotal || 1 } as CSSProperties}
      >
        {/* Pad header: the two key numbers people care about, side by side —
            characters known (the slider value) and % readable (the coverage).
            Both update live with the slider; the readable figure carries aria-live. */}
        <div className="lp-note-head">
          <span className="lp-note-title">{t.notebookHeader}</span>
          <div className="lp-note-stats">
            <span className="lp-note-stat">
              {lang === 'zh-TW' && <span className="lp-note-stat-pre">認識</span>}
              <span className="lp-note-stat-num">{known.toLocaleString()}</span>
              <span className="lp-note-stat-unit">{lang === 'zh-TW' ? '字' : '字 known'}</span>
            </span>
            <span className="lp-note-stat lp-note-stat-pct" role="status" aria-live="polite">
              <span className="lp-note-stat-num">{pct}%</span>
              <span className="lp-note-stat-unit">{t.readUnit}</span>
            </span>
          </div>
        </div>

        <div className="lp-note-body">
          {/* The coverage slider — moved UP, just ABOVE the situation pills. The
              pad order is now: top stats (in the header) → slider → category pills
              → paragraph. Opens at 0 (0% readable, all dim); at 0 it's simply a
              normal slider at 0. */}
          <div className="lp-read-control">
            <label className="lp-read-sliderlabel" htmlFor="lp-read-slider">
              {t.readSliderLabel}
              <span className="lp-read-knownval">{known.toLocaleString()}</span>
            </label>
            <div className="lp-read-slider-wrap">
              <input
                id="lp-read-slider"
                className="lp-read-slider"
                type="range"
                min={0}
                max={SLIDER_MAX}
                step={10}
                value={known}
                onChange={(e) => setKnown(Number(e.target.value))}
                aria-valuetext={`${known.toLocaleString()} — ${t.readReadableLabel(pct)}`}
                lang={lang}
                // Fill fraction (0..1) for the tan track fill. The fill is drawn
                // within the same half-thumb inset as the marks (see CSS), so its
                // leading edge tracks the thumb center exactly at both ends.
                style={{ '--lp-fill': known / SLIDER_MAX } as CSSProperties}
              />
            </div>
            {/* Tick markings on the track. Inset by half the thumb width on each
                side so this layer spans the thumb's REAL center-travel (+13px …
                width−13px), not 0–100% of the track; each mark is centered on its
                travel point (value / SLIDER_MAX) so the ticks sit exactly under the
                thumb at that value. 500 is a subtler secondary tick; 1,000 is the
                hero milestone — a bold gold tick + a gold badge carrying the ≈90%
                payoff. 0 / 1,500 stay as light endpoint labels for context. */}
            <div
              className="lp-read-scale"
              aria-hidden="true"
              style={{ marginInline: `${HALF_THUMB}px` }}
            >
              {/* Endpoint labels (light). */}
              <span className="lp-read-tick-label" style={{ left: '0%' }}>0</span>
              <span className="lp-read-tick-label" style={{ left: '100%' }}>1,500</span>
              {/* 500 — subtle secondary tick + small label. */}
              <span
                className="lp-read-tick lp-read-tick-minor"
                style={{ left: `${(500 / SLIDER_MAX) * 100}%` }}
              >
                <span className="lp-read-tick-mark" />
                <span className="lp-read-tick-label">{t.readTick500}</span>
              </span>
              {/* 1,000 — the hero: bold gold tick + ≈90% badge. */}
              <span
                className="lp-read-tick lp-read-tick-hero"
                style={{ left: `${(1000 / SLIDER_MAX) * 100}%` }}
              >
                <span className="lp-read-tick-mark" />
                <span className="lp-read-tick-badge">{t.readTick1000Badge}</span>
              </span>
            </div>
          </div>

          {/* Situation tabs (+ Custom). Proper buttons, roving aria-selected; the
              row scrolls horizontally / wraps on narrow screens (no overflow). */}
          <div
            className="lp-read-tabs"
            role="tablist"
            aria-label={t.readTabsLabel}
            ref={tablistRef}
            onKeyDown={onTabKeyDown}
          >
            {SITUATIONS.map((s) => {
              const sel = tab === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  id={`lp-read-tab-${s.key}`}
                  aria-selected={sel}
                  aria-controls="lp-read-panel"
                  tabIndex={sel ? 0 : -1}
                  className={`lp-read-tab${sel ? ' is-active' : ''}`}
                  onClick={() => setTab(s.key)}
                >
                  {lang === 'zh-TW' ? s.zh : s.en}
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              id="lp-read-tab-custom"
              aria-selected={isCustom}
              aria-controls="lp-read-panel"
              tabIndex={isCustom ? 0 : -1}
              className={`lp-read-tab${isCustom ? ' is-active' : ''}`}
              onClick={() => setTab('custom')}
            >
              {t.readCustomTab}
            </button>
          </div>

          <div
            id="lp-read-panel"
            role="tabpanel"
            aria-labelledby={isCustom ? 'lp-read-tab-custom' : `lp-read-tab-${tab}`}
          >
            {isCustom && (
              <textarea
                className="lp-read-custom-input"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={t.readCustomPlaceholder}
                lang="zh-TW"
                rows={3}
                aria-label={t.readCustomTab}
              />
            )}

            {hasText ? (
              // Hold the chars back entirely until the brush font is loaded for
              // this text (fontReady). data-fontready=false makes the whole para
              // invisible (CSS), so no glyph paints in a fallback face — the prose
              // appears already-in-brush. Once ready, the scroll write-in reveals it.
              <p
                className="lp-read-para"
                lang="zh-TW"
                aria-label={t.readHead}
                data-fontready={fontReady ? 'true' : 'false'}
              >
                {(() => {
                  // Running Han index (excludes punctuation) so the write-in
                  // wavefront passes character-by-character across the prose.
                  // Punctuation rides the SAME --lp-i as the Han char just before
                  // it, so it writes in alongside its neighbours (not all at once).
                  let h = -1;
                  return scored.chars.map((ch, i) => {
                    if (ch.kind === 'punct') {
                      return (
                        <span
                          key={i}
                          className="lp-read-punct"
                          style={{ '--lp-i': Math.max(0, h) } as CSSProperties}
                          aria-hidden="true"
                        >
                          {ch.c}
                        </span>
                      );
                    }
                    h++;
                    return (
                      <span
                        key={i}
                        className={`lp-read-char${ch.kind === 'lit' ? ' is-lit' : ' is-dim'}`}
                        // --lp-i = this char's Han index; the write-in CSS compares
                        // it against (--lp-ink × --lp-han-count) to gate its entrance.
                        // The (i % 8) lit/dim stagger keeps the coverage wave from
                        // snapping in unison once written-in.
                        style={{ '--lp-i': h, transitionDelay: `${(i % 8) * 16}ms` } as CSSProperties}
                        aria-hidden="true"
                      >
                        {ch.c}
                      </span>
                    );
                  });
                })()}
              </p>
            ) : (
              <p className="lp-read-empty">{t.readCustomEmpty}</p>
            )}
          </div>
        </div>
      </div>

      {/* The throughline: learning to write → the page reads. */}
      <p className="lp-book-tie">{t.bookTie}</p>

      {/* Demo hand-off (issue #66). A REAL link into the isolated `?app&demo`
          demo — the read-along above is the preview, this is the real thing.
          It's a plain <a href> so on a phone it opens the demo directly, while
          on desktop the demo device gate (App.tsx / demo-mode.ts) intercepts the
          same URL and shows the "open it on your phone" QR fallback instead of a
          mobile-on-mouse session. */}
      <div className="lp-demo-cta">
        <a className="lp-cta lp-cta-light" href="?app&demo">
          {t.demoCta}
          <span className="lp-cta-arrow" aria-hidden="true">→</span>
        </a>
        <p className="lp-cta-hint">{t.demoCtaHint}</p>
      </div>
    </section>
  );
}

// ── Section nav: smooth-scroll to a section, offset by the fixed bar ─────────
// The top bar is position:fixed, so scrolling an element to the very top would
// hide its heading UNDER the bar. We read the bar's height from the --lp-bar-h
// CSS var (set per-breakpoint in index.css) and land the section that far down,
// plus a small breathing gap. Under prefers-reduced-motion we JUMP (behavior
// 'auto') instead of animating; otherwise we smooth-scroll. Falls back to a
// plain scrollIntoView if anything is missing.
function scrollToSectionId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
  // Resolve the fixed bar height (e.g. "56px") from the .lp root, with a fallback.
  const root = document.querySelector('.lp');
  const barH = root
    ? parseInt(getComputedStyle(root).getPropertyValue('--lp-bar-h')) || 56
    : 56;
  const top = el.getBoundingClientRect().top + window.scrollY - barH - 12;
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: Math.max(0, top), behavior });
  } else {
    el.scrollIntoView();
  }
}

// ── The section-nav menu (opened by the top bar's ☰) ─────────────────────────
// A clean panel anchored under the bar in the bar's navy/cream palette. Each
// item smooth-scrolls (bar-offset) to a section then closes the menu; the install
// CTA is the panel's primary action. Fully a11y: a backdrop catches outside
// clicks, Esc closes (and returns focus to the burger), focus moves into the
// panel on open, and the panel is keyboard-navigable (native buttons in order).
interface NavItem { id: string; label: string; }
// ── Section-nav DROPDOWN (the ☰) ─────────────────────────────────────────────
// A menu that flows DOWN from the top bar (no modal, no backdrop). It opens on
// HOVER of the wrap and on CLICK (which pins it open), and closes on un-hover
// (when not pinned), an outside click, or Esc. The button + panel share ONE
// .lp-menu wrap so moving from the button into the panel never closes it
// (mouseleave ignores descendants, even an absolutely-positioned one).
function NavDropdown({ items, title, menuLabel, cta }: {
  items: NavItem[];
  title: string;
  menuLabel: string;
  cta: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); setPinned(false); };

  // While open: an outside pointerdown or Esc closes (and unpins). Capture phase
  // so it runs before any item/section click elsewhere on the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setPinned(false); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setPinned(false); burgerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className="lp-menu"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
    >
      <button
        ref={burgerRef}
        type="button"
        className="lp-burger"
        aria-label={menuLabel}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="lp-navmenu"
        onClick={() => {
          // Click pins the menu open; clicking again (while pinned) closes it.
          if (open && pinned) close();
          else { setOpen(true); setPinned(true); }
        }}
      >
        <MenuIcon />
      </button>
      <div
        id="lp-navmenu"
        className={`lp-navmenu${open ? ' is-open' : ''}`}
        aria-label={title}
      >
        <p className="lp-navmenu-title">{title}</p>
        <nav className="lp-navmenu-list">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className="lp-navmenu-item"
              onClick={() => { close(); scrollToSectionId(it.id); }}
            >
              {it.label}
            </button>
          ))}
        </nav>
        {/* Clicking the CTA installs (its own onClick) and closes the menu. */}
        <div className="lp-navmenu-cta" onClick={close}>{cta}</div>
      </div>
    </div>
  );
}

// ── Brand-splash → bar-wordmark dock ─────────────────────────────────────────
// The large 學中文 splash SHRINKS INTO the bar's wordmark as you scroll — ONE
// element travelling, NOT a cross-fade. A single fixed copy (.lp-fly) is pinned
// to the bar wordmark's slot + size, then given a translate+scale that, at the
// top, places & enlarges it exactly onto the splash, easing to identity (the
// docked state) over the dock distance. The static splash word + the real bar
// wordmark are hidden while it flies (.lp.is-flying) and are the reduced-motion /
// no-JS fallback. Rects are measured once (and on resize / fonts-ready), so each
// scroll frame is just cheap arithmetic.
function useDockTransition(
  rootRef: RefObject<HTMLElement | null>,
  splashRef: RefObject<HTMLElement | null>,
  markRef: RefObject<HTMLElement | null>,
  flyRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const root = rootRef.current, splash = splashRef.current, mark = markRef.current, fly = flyRef.current;
    if (!root || !splash || !mark || !fly) return;
    // Reduced motion → keep the flyer still; the static splash + bar wordmark show
    // instead. We STILL track scroll to flip the bar's docked state (border/fill).
    const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let m: { dx: number; dy: number; scaleUp: number; dist: number } | null = null;
    let raf = 0;
    let docked = false;

    const apply = () => {
      raf = 0;
      if (!m) return;
      const p = Math.min(1, Math.max(0, window.scrollY / m.dist));
      if (motion) {
        const k = 1 - p; // 1 at the top (splash), 0 once docked
        fly.style.transform = `translate(${m.dx * k}px, ${m.dy * k}px) scale(${1 + (m.scaleUp - 1) * k})`;
      }
      // The bar only goes solid (fill + bottom border) ONCE the wordmark is fully
      // in place — never mid-flight.
      const nowDocked = p >= 1;
      if (nowDocked !== docked) { docked = nowDocked; root.classList.toggle('is-docked', docked); }
    };

    const measure = () => {
      const sy = window.scrollY;
      const s = splash.getBoundingClientRect();
      const d = mark.getBoundingClientRect();
      const splashFont = parseFloat(getComputedStyle(splash).fontSize) || s.height || 1;
      const dockFont = parseFloat(getComputedStyle(mark).fontSize) || d.height || 1;
      if (motion) {
        // Pin the flyer's base box to the bar wordmark slot (small, docked state).
        fly.style.left = `${d.left}px`;
        fly.style.top = `${d.top}px`;
        fly.style.fontSize = `${dockFont}px`;
      }
      m = {
        dx: s.left - d.left,                          // splash − dock (horizontal)
        dy: (s.top + sy) - d.top,                     // splash@scroll0 − dock (vertical)
        scaleUp: splashFont / dockFont,               // how much bigger the splash is
        dist: Math.max(140, (s.bottom + sy) - d.top), // scroll distance over which it docks
      };
      if (motion) root.classList.add('is-flying');
      apply();
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      root.classList.remove('is-flying', 'is-docked');
    };
  }, [rootRef, splashRef, markRef, flyRef]);
}

// Geo-ish default: Asian timezone or a Chinese browser language → 中文, else English.
// Time-of-day word for the install section, per the product's local-time logic:
//   06:00–10:59 → "this morning" / 今早 · 11:00–16:59 → "today" / 今天 ·
//   everything else (evening, night, pre-dawn) → "tonight" / 今晚.
function timeOfDayKey(): 'morning' | 'day' | 'night' {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  return 'night';
}

function defaultLang(): Lang {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.startsWith('Asia/')) return 'zh-TW';
  } catch { /* no Intl tz — fall through */ }
  if (navigator.language?.toLowerCase().startsWith('zh')) return 'zh-TW';
  return 'en';
}

function isIos(): boolean {
  const ua = navigator.userAgent || '';
  const iOsDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac but is touch-capable.
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOsDevice || iPadOs;
}

function isStandalone(): boolean {
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

type InstallState = 'prompt' | 'ios' | 'generic' | 'installed';

// jsDelivr CDN stylesheet for the paperpad's handwriting web font — LXGW WenKai
// TC (霞鶩文楷), an open-source (MIT) brush/楷 face with full Traditional coverage.
// The CSS is unicode-range SUBSET into 100+ @font-face slices with font-display:
// swap, so only the .woff2 slices covering glyphs actually shown on the page get
// downloaded (CJK fonts are huge; this keeps it light). Injected lazily at landing
// mount so it never touches the installed app's critical path — the standalone PWA
// never mounts this page and stays fully offline on system fonts. The pad's Brush
// 楷 stack falls back to system Kaiti if this fails or is offline (see index.css).
const HANDWRITING_FONT_HREF =
  'https://cdn.jsdelivr.net/npm/lxgw-wenkai-tc-webfont@1.2.0/lxgwwenkaitc-regular.css';

// The brush face's CSS family name, as declared by the LXGW WenKai TC webfont
// package's @font-face rules. We load() THIS family (with sample text) so the
// right unicode-range subset slices download before we reveal the prose.
const BRUSH_FAMILY = 'LXGW WenKai TC';

function useHandwritingWebFont() {
  useEffect(() => {
    const ID = 'lp-handwriting-font';
    // Idempotent: never inject twice (re-render / HMR / remount).
    if (document.getElementById(ID)) return;
    const link = document.createElement('link');
    link.id = ID;
    link.rel = 'stylesheet';
    link.href = HANDWRITING_FONT_HREF;
    // Non-blocking + resilient: if the CDN is unreachable, the pad keeps its
    // system-Kaiti fallback chain and nothing breaks.
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    // Intentionally NOT removed on unmount — the font stays cached so a remount
    // (e.g. lang change navigations) doesn't re-flash. It only loads on the
    // landing, so it never reaches the installed app shell either way.
  }, []);
}

// Gate the prose reveal on the BRUSH font being actually loaded for `sample`.
// The webfont stylesheet ships with font-display: swap and is unicode-range
// SUBSET, so the chars would otherwise flash in a fallback face then swap to the
// brush — a visible swap flash. To avoid it we (a) ask the browser to load the
// exact glyphs we're about to show — document.fonts.load('1em "LXGW WenKai TC"',
// sample) pulls only the needed subset slices — then (b) await document.fonts.ready
// to be sure the faces are applied, and only THEN report ready=true. The caller
// keeps the paragraph hidden (no write-in) until ready, so by the time the chars
// are on screen they're already in the brush face — no swap.
//
// Resilient by design: if the Font Loading API is missing, or the CDN never
// resolves, we report ready (true) anyway so the pad still shows on the system
// Kaiti fallback — we never trap the prose behind a font that won't arrive.
function useBrushFontReady(sample: string): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // No Font Loading API → can't gate; show immediately on the fallback chain.
    if (typeof document === 'undefined' || !('fonts' in document)) {
      setReady(true);
      return;
    }
    let cancelled = false;
    const deadline = Date.now() + 4000; // hard cap: never hide the prose forever
    const spec = `1em "${BRUSH_FAMILY}"`;
    const text = sample || '字';
    const done = () => { if (!cancelled) setReady(true); };

    // Attempt: ask the browser to load the EXACT glyphs we'll show (pulls only
    // the needed unicode-range subset slices), then confirm the face is actually
    // applied via fonts.check(). We retry on a short tick because the webfont
    // stylesheet is injected at runtime, so its @font-face rules may not be
    // registered the first time we ask (load() would resolve with no faces). We
    // stop the moment check() is true (font in place) or the deadline passes
    // (reveal on the system-Kaiti fallback — never trapped behind a stuck CDN).
    const attempt = () => {
      if (cancelled) return;
      Promise.resolve(document.fonts.load(spec, text)).then(
        () => {
          if (cancelled) return;
          if (document.fonts.check(spec, text)) { done(); return; }
          if (Date.now() >= deadline) { done(); return; }
          window.setTimeout(attempt, 80);
        },
        () => {
          if (cancelled) return;
          if (Date.now() >= deadline) { done(); return; }
          window.setTimeout(attempt, 80);
        },
      );
    };
    attempt();
    return () => { cancelled = true; };
  }, [sample]);
  return ready;
}

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>(defaultLang);
  const t = T[lang];
  // Time-of-day word (今早/今天/今晚 · this morning/today/tonight) for the install
  // section — reflects the visitor's local time.
  const whenWord = t.when[timeOfDayKey()];
  useEffect(() => { document.title = t.title; }, [t.title]);
  // Pull in the handwriting web font for the paperpad's Brush 楷 option.
  useHandwritingWebFont();

  // Install wiring. Start with a best-guess from the platform, then upgrade to
  // 'prompt' the moment Chrome/Android/desktop hands us a beforeinstallprompt.
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<InstallState>(() => {
    if (isStandalone()) return 'installed';
    if (isIos()) return 'ios';
    return 'generic';
  });

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault(); // keep the mini-infobar from auto-showing; we drive it
      deferred.current = e as BeforeInstallPromptEvent;
      setInstallState((s) => (s === 'installed' ? s : 'prompt'));
    }
    function onInstalled() {
      deferred.current = null;
      setInstallState('installed');
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (installState === 'installed') {
      // Already installed: re-enter the app from the browser tab.
      location.search = '?app';
      return;
    }
    const promptEvent = deferred.current;
    if (installState === 'prompt' && promptEvent) {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      deferred.current = null; // a prompt can only be used once
      if (outcome === 'accepted') setInstallState('installed');
      else setInstallState('generic'); // dismissed → show manual steps as a fallback
      return;
    }
    // iOS or any browser without a captured prompt → reveal the manual steps.
    document.getElementById('install')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Subtle scroll-reveal across the page; re-scan when the tree changes (lang /
  // install state can add or swap revealable nodes). No-op under reduced motion.
  useScrollReveal([lang, installState]);

  // Brand-splash → bar-wordmark dock: the big 學中文 shrinks into the bar wordmark,
  // and the bar flips to its solid/bordered state only once the wordmark lands.
  const lpRef = useRef<HTMLDivElement>(null);
  const splashRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const flyRef = useRef<HTMLSpanElement>(null);
  useDockTransition(lpRef, splashRef, markRef, flyRef);

  // ── Section-nav menu (the ☰) ──
  // Jump-to-section links shown in the bar-attached NavDropdown (which owns its
  // own open/pinned/hover/outside-click/Esc state).
  const navItems: NavItem[] = [
    { id: 'try', label: t.navTry },
    { id: 'milestones', label: t.navMilestones },
    { id: 'how', label: t.navHow },
    { id: 'install', label: t.navGet },
    { id: 'top', label: t.navTop },
  ];

  const ctaLabel =
    installState === 'installed' ? t.ctaInstalled :
    installState === 'prompt' ? t.ctaPrompt :
    installState === 'ios' ? t.ctaIos :
    t.ctaGeneric;

  function Cta({ block, light, onClick }: { block?: boolean; light?: boolean; onClick?: () => void }) {
    return (
      <button
        type="button"
        className={`lp-cta${block ? ' lp-cta-block' : ''}${light ? ' lp-cta-light' : ''}`}
        onClick={onClick ?? handleInstall}
      >
        {ctaLabel}
        <span className="lp-cta-arrow" aria-hidden="true">→</span>
      </button>
    );
  }

  return (
    <div className="lp" lang={lang} ref={lpRef}>
      {/* Fixed, compact top menu bar. Stays transparent over the hero while the
          wordmark docks, then snaps to a solid navy bar (.lp.is-docked, set by
          useDockTransition once the wordmark lands). The inner
          wrapper keeps the bar's contents on the same centered 760px column as the
          rest of the page while the bar background runs full-bleed. */}
      <header className="lp-bar">
        <div className="lp-bar-inner">
          {/* Hamburger + its bar-attached dropdown (hover opens · click pins ·
              outside-click/Esc closes) — see NavDropdown. */}
          <NavDropdown
            items={navItems}
            title={t.menuTitle}
            menuLabel={t.menuLabel}
            cta={<Cta block />}
          />
          <span className="lp-mark" ref={markRef}>{t.wordmark}</span>
          <div className="lp-bar-right">
            <span className="lp-bar-region">{t.region}</span>
            <div className="lp-langtoggle" role="group" aria-label="Language">
              <button className={`lp-lang-btn${lang === 'en' ? ' active' : ''}`} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
              <button className={`lp-lang-btn${lang === 'zh-TW' ? ' active' : ''}`} aria-pressed={lang === 'zh-TW'} onClick={() => setLang('zh-TW')}>中</button>
            </div>
          </div>
        </div>
      </header>

      {/* Brand splash: the large 學中文 that SHRINKS INTO the bar's wordmark as you
          scroll. useDockTransition drives a single fixed copy (.lp-fly) from this
          splash's spot+size down to the bar slot+size; the static splash word + the
          bar wordmark are hidden while it flies (and are the reduced-motion / no-JS
          fallback). The splash box stays in flow to reserve the height that pushes
          the hero down. */}
      <span className="lp-fly" ref={flyRef} aria-hidden="true">{t.wordmark}</span>
      <div  className="lp-splash" aria-hidden="true">
        <span className="lp-splash-word" ref={splashRef}>{t.wordmark}</span>
      </div>
      <section id="top" className="lp-hero">
        <h1 className="lp-title">
          {/* Static script word — the read+write duality stated plainly (no toggle). */}
          <span className="lp-title-script">{t.heroScript}</span>
          {/* "中文 in" share ONE line (never split 中文 / IN / TAIWAN); then "TAIWAN". */}
          <span className="lp-title-big lp-title-big-lead">{t.heroBig}</span>
          {'heroBig2' in t && t.heroBig2 ? <span className="lp-title-big">{t.heroBig2}</span> : null}
        </h1>
        <PracticeCells />
      </section>

      <section className="lp-leadrow">
        <p className="lp-sub">{t.sub}</p>
        <div className="lp-hero-cta">
          <Cta />
          <p className="lp-cta-hint">{t.ctaHint}</p>
        </div>
      </section>

      {/* Bright full-bleed gold band — the PRODUCT tagline, in VCASS's promo voice.
          (The "Made for iPhone & iPad" platform note lives small, in the install card.) */}
      <section className="lp-band">
        <div className="lp-band-inner">
          <span className="lp-band-text">{t.tagline}</span>
        </div>
      </section>

      {/* The centerpiece: a lined notebook holding the live read-along. The
          paragraph writes itself in on scroll (reverses on scroll-up); the
          situation tabs swap text and the bottom slider drives coverage.
          Holds the one and only read-along instance. Sits after the band. */}
      <OpenBook t={t} lang={lang} />

      <section id="how" className="lp-section lp-pitch-section lp-reveal">
        <p className="lp-eyebrow">{t.pitchEyebrow}</p>
        <div className="lp-pitch">
          <p className="lp-pitch-a">{t.pitchA}</p>
          <p className="lp-pitch-b">{t.pitchB}</p>
          <p className="lp-pitch-lead">{t.pitchLead}</p>
          <p className="lp-pitch-body">{t.pitchBody}</p>
        </div>
      </section>

      <section id="milestones" className="lp-section lp-reveal">
        <p className="lp-eyebrow">{t.mileEyebrow}</p>
        <div className="lp-miles">
          <div className="lp-mile">
            <span className="lp-mile-num">{t.m1n}</span>
            <span className="lp-mile-label">{t.m1l}</span>
            <span className="lp-mile-when">{t.m1when}</span>
            <span className="lp-mile-desc">{t.m1d}</span>
          </div>
          <div className="lp-mile">
            <span className="lp-mile-num">{t.m2n}</span>
            <span className="lp-mile-label">{t.m2l}</span>
            <span className="lp-mile-when">{t.m2when}</span>
            <span className="lp-mile-desc">{t.m2d}</span>
          </div>
          <div className="lp-mile">
            <span className="lp-mile-num">{t.m3n}</span>
            <span className="lp-mile-label">{t.m3l}</span>
            <span className="lp-mile-when">{t.m3when}</span>
            <span className="lp-mile-desc">{t.m3d}</span>
          </div>
        </div>
        <p className="lp-foot">{t.mileFoot}</p>
      </section>

      <section className="lp-section lp-reveal">
        <p className="lp-eyebrow">{t.proofEyebrow}</p>
        <dl className="lp-proof">
          <div className="lp-proof-item">
            <dt className="lp-proof-num">{t.p1n}</dt>
            <dd className="lp-proof-desc">{t.p1d}</dd>
          </div>
          <div className="lp-proof-item">
            <dt className="lp-proof-num">{t.p2n}</dt>
            <dd className="lp-proof-desc">{t.p2d}</dd>
          </div>
          <div className="lp-proof-item">
            <dt className="lp-proof-num">{t.p3n}</dt>
            <dd className="lp-proof-desc">{t.p3d}</dd>
          </div>
        </dl>
      </section>

      <section className="lp-section lp-reveal">
        <p className="lp-eyebrow">{t.why}</p>
        <ol className="lp-steps lp-reveal lp-reveal-stagger">
          <li className="lp-step">
            <span className="lp-step-num">01</span>
            <h3 className="lp-step-title">{t.s1t}</h3>
            <p className="lp-step-body">{t.s1}</p>
          </li>
          <li className="lp-step">
            <span className="lp-step-num">02</span>
            <h3 className="lp-step-title">{t.s2t}</h3>
            <p className="lp-step-body">{t.s2}</p>
          </li>
          <li className="lp-step">
            <span className="lp-step-num">03</span>
            <h3 className="lp-step-title">{t.s3t}</h3>
            <p className="lp-step-body">{t.s3}</p>
          </li>
        </ol>
      </section>

      <section className="lp-section lp-reveal">
        <p className="lp-eyebrow">{t.reassureEyebrow}</p>
        <ul className="lp-features">
          <li className="lp-feat">{t.f1}</li>
          <li className="lp-feat">{t.f2}</li>
          <li className="lp-feat">{t.f3}</li>
          <li className="lp-feat">{t.f4}</li>
          <li className="lp-feat">{t.f5}</li>
          <li className="lp-feat">{t.f6}</li>
        </ul>
      </section>

      <section className="lp-section lp-final-section lp-reveal" id="install">
        <p className="lp-eyebrow">{t.finalEyebrow.replace('{when}', whenWord)}</p>
        <div className="lp-install">
          <p className="lp-install-final">{t.finalLine.replace('{when}', whenWord)}</p>
          <p className="lp-madefor lp-madefor-install">
            <DevicesIcon />
            {t.madeFor}
          </p>
          <Cta block />
          {installState === 'ios' ? (
            <>
              <p className="lp-install-intro">{t.installIntroIos}</p>
              <ol className="lp-install-steps">
                <li><span className="lp-dot">1</span><span>{t.i1} <IosShareIcon /> {t.i1b}</span></li>
                <li><span className="lp-dot">2</span><span>{t.i2}</span></li>
                <li><span className="lp-dot">3</span><span>{t.i3}</span></li>
              </ol>
            </>
          ) : installState === 'prompt' ? null : (
            <>
              <p className="lp-install-intro">{t.installIntroGeneric}</p>
              <ol className="lp-install-steps">
                <li><span className="lp-dot">1</span><span>{t.g1}</span></li>
                <li><span className="lp-dot">2</span><span>{t.g2}</span></li>
                <li><span className="lp-dot">3</span><span>{t.g3}</span></li>
              </ol>
            </>
          )}
        </div>
      </section>

      <footer className="lp-footer">學中文 · Learn Chinese</footer>
    </div>
  );
}
