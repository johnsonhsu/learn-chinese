import { lazy, Suspense } from "react";
import "./DevNotes.css";

/* ─────────────────────────────────────────────────────────────────────────
   Dev-notes hub (`?devnotes`) — an internal index of reference pages. It grows:
   add an entry to NOTES for the hub, and a `?devnotes=<slug>` sub-page below.
   Reached only by direct URL (like `?ui`); deliberately unlinked from the app.
   ──────────────────────────────────────────────────────────────────────── */

type Category = "attract" | "money" | "oow";

interface HubEntry {
  glyph: string;
  tag: string;
  category: Category;
  title: string;
  desc: string;
  href: string;
  external?: boolean;
}

const NOTES: HubEntry[] = [
  {
    glyph: "介",
    tag: "Interface",
    category: "oow",
    title: "UI Components",
    desc: "The shared component gallery & styleguide — buttons, cards, char-tiles, tokens.",
    href: "?devnotes=ui",
  },
  {
    glyph: "橫",
    tag: "Design",
    category: "attract",
    title: "Landscape design",
    desc: "Landscape-native redesign reference — the two-pane rethink (epic #152).",
    href: "?devnotes=landscape",
  },
  {
    glyph: "策",
    tag: "Strategy",
    category: "money",
    title: "Top 10 growth ideas",
    desc: "Ranked bets to attract users, monetize, and add out-of-world features.",
    href: "?devnotes=ideas",
  },
];

// The styleguide + landscape pages are `?devnotes` sub-pages too now; they stay
// their own lazy chunks (not bundled into DevNotes).
const Styleguide = lazy(() => import("./Styleguide.tsx"));
const LandscapePreview = lazy(() => import("./LandscapePreview.tsx"));

function devnotesPage(): string {
  const params = new URLSearchParams(location.search);
  // `?devnotes=<slug>` is canonical; `?ui` / `?ui=landscape` are legacy aliases.
  if (params.has("devnotes")) return params.get("devnotes") ?? "";
  if (params.has("ui")) return params.get("ui") === "landscape" ? "landscape" : "ui";
  return "";
}

export default function DevNotes() {
  const page = devnotesPage();
  if (page === "ui" || page === "landscape") {
    return (
      <Suspense fallback={<div className="loading" />}>
        {page === "landscape" ? <LandscapePreview /> : <Styleguide />}
      </Suspense>
    );
  }
  if (page === "ideas") return <IdeasPage />;
  return <Hub />;
}

/* ── hub ──────────────────────────────────────────────────────────────── */

function Hub() {
  return (
    <div className="dn-root">
      <header className="dn-masthead">
        <div className="dn-deco" aria-hidden="true">
          記
        </div>
        <div className="dn-wrap">
          <p className="dn-eyebrow">
            Dev notes · <b>internal reference</b>
          </p>
          <h1>Studio notebook</h1>
          <p className="dn-dek">
            A small, growing index of reference pages for this project — design surfaces, component
            galleries, and strategy notes. Reached by direct URL only.
          </p>
          <a className="dn-back" href="?app">
            ← Open the app
          </a>
        </div>
      </header>

      <div className="dn-wrap">
        <div className="dn-grid">
          {NOTES.map((n) => (
            <a
              key={n.href}
              className={`dn-card ${n.category}`}
              href={n.href}
              {...(n.external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              <span className="dn-card-glyph" aria-hidden="true">
                {n.glyph}
              </span>
              <span className="dn-card-body">
                <span className="dn-card-tag">{n.tag}</span>
                <h3>{n.title}</h3>
                <p>{n.desc}</p>
                {n.external ? <span className="dn-card-ext">opens externally ↗</span> : null}
              </span>
            </a>
          ))}
        </div>
        <p className="dn-hub-foot">
          This page grows — new reference surfaces get added here as they land.
        </p>
      </div>
    </div>
  );
}

/* ── ideas page (ported from the growth/monetization strategy artifact) ──── */

interface Idea {
  rank: number;
  category: Category;
  type: string;
  title: string;
  oneLiner: string;
  idea: string;
  works: string[];
  fails: string[];
  impact: number;
  effort: number;
  fit: "High" | "Med" | "Low";
  build: string;
  ticket?: number;
}

const IDEAS: Idea[] = [
  {
    rank: 1,
    category: "attract",
    type: "Attract",
    title: "Shareable progress cards",
    oneLiner: "Turn a kid's character wall into a one-tap image parents post to LINE.",
    idea: "When a profile hits a milestone, render its mastered characters as a beautiful “character wall” image and let a parent share or save it in one tap. Every proud post is a free, perfectly-targeted ad.",
    works: [
      "Taiwanese & heritage parents share kids' wins constantly (LINE, FB) — self-targeting reach.",
      "The artifact is genuinely giftable, not a spammy badge.",
      "100% client-side (canvas) — fits local-first, near-zero cost.",
    ],
    fails: [
      "The card must feel share-worthy — the design bar is high.",
      "Kid-progress sharing has privacy optics — keep it PII-free (chars + count only).",
      "Virality is never guaranteed; treat it as a tailwind.",
    ],
    impact: 4,
    effort: 2,
    fit: "High",
    build:
      "A <canvas> composes mastered chars from my-characters data + a QR/URL back to the app, exported via the Web Share API or download. No server.",
    ticket: 165,
  },
  {
    rank: 2,
    category: "attract",
    type: "Attract",
    title: "Free zhuyin worksheet generator",
    oneLiner: "A public, no-install printable that ranks for “免費注音練習”.",
    idea: "Expose the copybook grid engine as a public web tool: type characters, get a printable zhuyin practice sheet. It answers huge evergreen parent/teacher search intent and funnels traffic into the app.",
    works: [
      "Parents & teachers Google printable 注音 practice daily — compounding organic demand.",
      "Zero signup friction; showcases the core competency for free.",
      "Static + client-side — fits the model, free to serve.",
    ],
    fails: [
      "Printable-only users may never install the app.",
      "SEO is a slow burn — months before it compounds.",
      "Needs real zh-TW landing copy + a strong install CTA to convert.",
    ],
    impact: 4,
    effort: 3,
    fit: "High",
    build:
      "A public /worksheet route reusing the copybook grid rendering; static shell + client. Sitemap, zh-TW meta, and a “get the app” CTA + QR.",
    ticket: 166,
  },
  {
    rank: 3,
    category: "money",
    type: "Monetize",
    title: "Unlock-code packs & “Supporter”",
    oneLiner: "You already ship the unlock primitive (code 9980). Now sell codes.",
    idea: "Formalize utils/unlocks.ts into a product: a one-time “Supporter pack” that unlocks all foil themes + a supporter badge, sold as digital gift codes. No accounts, no subscriptions.",
    works: [
      "The unlock mechanism already exists and is validated client-side — arch-native.",
      "One-time purchase suits families better than a subscription.",
      "Zero billing infra (Ko-fi / Gumroad / 蝦皮); pure margin on cosmetics.",
    ],
    fails: [
      "Client-side codes are shareable — accept mild leakage, or add light edge validation.",
      "Cosmetic-only revenue has a low ceiling.",
      "Still needs a storefront somewhere off-app.",
    ],
    impact: 3,
    effort: 2,
    fit: "High",
    build:
      "Batch-generate codes into CODE_FEATURES; add a “Supporter” bundle grant; sell codes off-platform. Optional Worker validation later.",
  },
  {
    rank: 4,
    category: "attract",
    type: "Attract",
    title: "QR classroom / teacher-seed mode",
    oneLiner: "One teacher = 30 devices. Seed a word-set by QR.",
    idea: "Let a teacher build a word-set and generate a QR that seeds it onto student devices via a URL param — leaning on the QR + demo-seeding you already have. Opens the heritage-school / 補習班 channel.",
    works: [
      "Teachers are force-multipliers — one adoption seeds a class.",
      "週末中文學校 + 補習班 are motivated, underserved, zhuyin-native — ignored by Duolingo.",
      "The QR + seeding tech already exists (utils/qr.ts, demo seed).",
    ],
    fails: [
      "Local-first means no student-progress visibility without a backend.",
      "Classroom device availability varies.",
      "Needs a simple teacher-facing set builder.",
    ],
    impact: 4,
    effort: 3,
    fit: "Med",
    build:
      "Extend utils/qr.ts + demo seeding into a ?seed=<encoded set> boot path; a lightweight set-builder screen. Progress-sync deferred to an optional Worker.",
  },
  {
    rank: 5,
    category: "money",
    type: "Monetize",
    title: "Premium curated content packs",
    oneLiner: "Sell the moat: hand-curated, Taiwan-authentic content.",
    idea: "Purchasable expansion packs (TOCFL levels, night-market/food, festivals, graded story-reading sets) delivered as signed content bundles merged into the local DB on unlock.",
    works: [
      "Manually-curated authentic content IS the differentiator and hardest to copy.",
      "Supports recurring drops → repeat revenue, no subscription.",
      "Higher willingness-to-pay than cosmetics; aligns with your curation strength.",
    ],
    fails: [
      "Content is hand-curated and slow — that throughput is the real cap.",
      "Needs a bundle delivery + merge path plus code-gating.",
      "Static bundles can be pirated once unlocked.",
    ],
    impact: 4,
    effort: 4,
    fit: "Med",
    build:
      "Package content.db fragments as signed bundles; fetch + merge into the offline store on code unlock, reusing the additive-by-id sync. Gate via unlocks.ts.",
  },
  {
    rank: 6,
    category: "attract",
    type: "Attract",
    title: "Referral unlock loop",
    oneLiner: "“Invite a friend, unlock a theme” — compounds #1 and #3.",
    idea: "A personal invite code; when friends install, the sharer auto-unlocks a premium theme. Bolts onto the sharing loop and the unlock primitive.",
    works: [
      "Cheap and on-brand — rewards are cosmetic unlocks you already ship.",
      "Compounds the viral-card and code systems into a flywheel.",
      "Word-of-mouth is the right channel for a tight niche.",
    ],
    fails: [
      "Honest attribution needs a tiny backend (or a manual code-swap).",
      "Underperforms without a strong base share-loop first — do #1 first.",
      "Reward abuse (self-referral) if verification is weak.",
    ],
    impact: 3,
    effort: 3,
    fit: "Med",
    build:
      "Invite code → verify installs via a small Worker on the existing CF edge → grant an unlock. Or an offline “hand out a spare code” approximation.",
  },
  {
    rank: 7,
    category: "attract",
    type: "Attract",
    title: "App / Play Store presence",
    oneLiner: "Meet parents where they actually search for kids' apps.",
    idea: "Wrap the PWA (TWA/Bubblewrap for Play, PWABuilder/Capacitor for iOS) pointing at the same Pages URL; do ASO for 注音 / 繁體中文 / kids. Web stays the source of truth.",
    works: [
      "Stores are where parents look for a kids' learning app — a surface a URL can't reach.",
      "The zhuyin/Taiwan niche is thin in the stores — easy to rank.",
      "Wrapping keeps one codebase; web remains canonical.",
    ],
    fails: [
      "Store review + ongoing maintenance overhead.",
      "Apple's 30% cut and IAP rules bite if you monetize in-app.",
      "PWA-in-store can feel second-class; scope carefully.",
    ],
    impact: 3,
    effort: 4,
    fit: "Med",
    build:
      "Bubblewrap/PWABuilder wrappers over the Pages URL + store listings. Keep purchases off-app (web codes) to sidestep IAP cuts where rules allow.",
  },
  {
    rank: 8,
    category: "oow",
    type: "Out-of-world",
    title: "Physical keepsakes (print-on-demand)",
    oneLiner: "Turn the digital character wall into a poster on the fridge.",
    idea: "Reuse the #1 canvas artwork to offer a print-on-demand poster or reward stickers of the characters a child mastered — a physical reward tier beyond the screen.",
    works: [
      "Parents love tangible keepsakes; a physical reward reinforces learning.",
      "New margin beyond software, and a real differentiator.",
      "Naturally seasonal (“look what I learned this year”).",
    ],
    fails: [
      "Fulfillment/logistics + POD integration is a different business.",
      "Thin margins after shipping (Taiwan/US split).",
      "Support burden; depends on #1 shipping first.",
    ],
    impact: 3,
    effort: 4,
    fit: "Med",
    build:
      "#1's canvas → hi-res export → a print-on-demand API checkout. Start with one SKU (the character-wall poster).",
  },
  {
    rank: 9,
    category: "oow",
    type: "Out-of-world",
    title: "Speaking & pronunciation practice",
    oneLiner: "The missing modality — but it fights offline-first.",
    idea: "An opt-in, online-only mode: Web Speech API STT + a Taiwan-Mandarin TTS voice scores pronunciation (tones, zhuyin) of the char/sentence being practiced. Closes the biggest gap in a read/write app.",
    works: [
      "Speaking is the single biggest missing modality — high perceived value.",
      "Pronunciation feedback commands real willingness-to-pay.",
      "A genuine differentiator for Taiwan-accent Mandarin.",
    ],
    fails: [
      "Needs online APIs → breaks the offline-first soul; must be strictly opt-in.",
      "Kid-speech STT is genuinely hard → frustrating false negatives.",
      "Taiwan-accent STT/TTS quality + cost; runs against the deliberate LLM skepticism.",
    ],
    impact: 5,
    effort: 5,
    fit: "Low",
    build:
      "A separate opt-in online module: Web Speech API + a TTS voice, scoring against expected zhuyin/tone. Keep the core app fully offline — an add-on, never a dependency.",
  },
  {
    rank: 10,
    category: "money",
    type: "Monetize",
    title: "B2B licensing + teacher dashboard",
    oneLiner: "Highest revenue ceiling — and the biggest architectural departure.",
    idea: "Accounts + a Worker/D1 backend so schools and 補習班 buy seats and teachers see student progress — the full institutional product. The most money on the table, and the sharpest turn from local-first-only.",
    works: [
      "Institutions have real budgets and buy bulk seats; retention is contractual.",
      "Taiwan-focus + zhuyin IS a heritage-school curriculum — fit is there.",
      "Highest LTV of anything on this list.",
    ],
    fails: [
      "Requires accounts + backend + sync → no longer purely local-first (a pivot).",
      "Long B2B sales cycles; support/SLA burden.",
      "Scope creep can swallow the roadmap.",
    ],
    impact: 5,
    effort: 5,
    fit: "Low",
    build:
      "Pilot one heritage school first. Then add auth + a CF Worker/D1 progress store (the feedback backend proves the edge is viable) + a minimal teacher dashboard. Commit only if the pilot validates demand.",
  },
];

const LENS = [
  {
    cls: "moat",
    k: "The moat",
    p: "Local-first, offline, private, and hand-curated Taiwan-authentic content (zhuyin, Traditional, 台/臺 respected). The hardest thing to copy — and the thing to monetize.",
  },
  {
    cls: "tension",
    k: "The tension",
    p: "Every “obvious” SaaS move — accounts, dashboards, subscriptions, AI chat — needs a server and erodes the offline soul. Client-side ideas score higher; backend ones are flagged as bets.",
  },
  {
    cls: "niche",
    k: "The niche truth",
    p: "You won't out-scale Duolingo. Win by owning the segment they ignore: Traditional-Chinese / Taiwan / zhuyin — heritage families abroad and Taiwan parents.",
  },
  {
    cls: "edge",
    k: "The foothold",
    p: "The feedback backend already puts a Cloudflare edge in play. So a light Worker/D1 isn't unthinkable — it lowers the cost of the few ideas that want a sliver of server.",
  },
];

const PICKS = [
  {
    rk: "BET #1",
    h: "Shareable progress cards",
    p: "The acquisition engine. Cheap, on-grain, self-targeting. Ship first — everything else compounds on it.",
  },
  {
    rk: "BET #2",
    h: "Zhuyin worksheet SEO tool",
    p: "The evergreen top-of-funnel. Start the slow-burn organic clock now.",
  },
  {
    rk: "BET #3",
    h: "Unlock-code “Supporter” pack",
    p: "First real revenue with almost no new architecture — the primitive already ships.",
  },
];

function Dots({ value, kind }: { value: number; kind: "impact" | "effort" }) {
  return (
    <span className={`dn-bar dn-bar--${kind}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : ""} />
      ))}
    </span>
  );
}

function Fit({ level }: { level: "High" | "Med" | "Low" }) {
  const cls = level === "High" ? "high" : level === "Med" ? "med" : "low";
  return <span className={`dn-fit dn-fit-${cls}`}>{level.toUpperCase()}</span>;
}

function typeClass(category: Category): string {
  return category === "attract" ? "dn-t-attract" : category === "money" ? "dn-t-money" : "dn-t-oow";
}

function IdeasPage() {
  return (
    <div className="dn-root">
      <header className="dn-masthead">
        <div className="dn-deco" aria-hidden="true">
          策
        </div>
        <div className="dn-wrap">
          <p className="dn-eyebrow">
            Product strategy · <b>Grow · Monetize · Surprise</b>
          </p>
          <h1>10 bets for the zhuyin app</h1>
          <p className="dn-dek">
            Ten ways to attract users, earn revenue, and add out-of-the-world features — each ranked
            and rated for how well it fits a local-first, no-server, hand-curated Taiwan/zhuyin
            product. Not generic app-growth advice.
          </p>
          <a className="dn-back" href="?devnotes">
            ← Dev notes
          </a>
        </div>
      </header>

      <div className="dn-wrap">
        {/* lens */}
        <h2 className="dn-section-h" style={{ marginTop: "clamp(30px,5vw,50px)" }}>
          The lens I ranked through
        </h2>
        <div className="dn-lens">
          {LENS.map((l) => (
            <div key={l.cls} className={`dn-note ${l.cls}`}>
              <p className="k">{l.k}</p>
              <p>{l.p}</p>
            </div>
          ))}
        </div>

        {/* legend + table */}
        <h2 className="dn-section-h" style={{ marginBottom: 10 }}>
          Ranked at a glance
        </h2>
        <div className="dn-legend">
          <span className="li">
            <b>Impact</b> <Dots value={3} kind="impact" /> upside (users / revenue)
          </span>
          <span className="li">
            <b>Effort</b> <Dots value={3} kind="effort" /> build cost & complexity
          </span>
          <span className="li">
            <b>Fit</b> <Fit level="High" />
            <Fit level="Med" />
            <Fit level="Low" /> — with local-first / no-server
          </span>
        </div>
        <div className="dn-tablewrap">
          <table className="dn-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Idea</th>
                <th>Type</th>
                <th>Impact</th>
                <th>Effort</th>
                <th>Fit</th>
              </tr>
            </thead>
            <tbody>
              {IDEAS.map((it) => (
                <tr key={it.rank}>
                  <td className="rk">{it.rank}</td>
                  <td className="idea">
                    <a href={`#i${it.rank}`}>{it.title}</a>
                  </td>
                  <td>
                    <span className={`dn-typetag ${typeClass(it.category)}`}>{it.type}</span>
                  </td>
                  <td>
                    <Dots value={it.impact} kind="impact" />
                  </td>
                  <td>
                    <Dots value={it.effort} kind="effort" />
                  </td>
                  <td>
                    <Fit level={it.fit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dn-table-note">
          Rank weighs all three axes plus strategic coherence — the top is where upside meets low
          cost meets the client-side grain. The bottom two are high-ceiling bets that require a
          backend. Bets #1 and #2 are now specced tickets (#165, #166).
        </p>

        {/* cards */}
        <section className="dn-cards">
          {IDEAS.map((it) => (
            <article key={it.rank} className={`dn-icard ${it.category}`} id={`i${it.rank}`}>
              <div className="dn-chead">
                <div className="dn-chop">{it.rank}</div>
                <div className="dn-ctitle">
                  <h3>
                    {it.title}
                    <span className={`dn-typetag ${typeClass(it.category)}`}>{it.type}</span>
                    {it.ticket ? (
                      <a
                        className="dn-ticket"
                        href={`https://github.com/johnsonhsu/learn-chinese/issues/${it.ticket}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        🎫 #{it.ticket}
                      </a>
                    ) : null}
                  </h3>
                  <p className="dn-oneliner">{it.oneLiner}</p>
                </div>
              </div>
              <p className="dn-idea-txt">{it.idea}</p>
              <div className="dn-cols">
                <div className="dn-col works">
                  <p className="h">Why it works</p>
                  <ul>
                    {it.works.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div className="dn-col fails">
                  <p className="h">Why it fails</p>
                  <ul>
                    {it.fails.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="dn-cfoot">
                <span className="dn-ratecell">
                  Impact <Dots value={it.impact} kind="impact" />
                  <span className="dn-rnum">{it.impact}/5</span>
                </span>
                <span className="dn-ratecell">
                  Effort <Dots value={it.effort} kind="effort" />
                  <span className="dn-rnum">{it.effort}/5</span>
                </span>
                <span className="dn-ratecell">
                  Fit <Fit level={it.fit} />
                </span>
              </div>
              <p className="dn-build">
                <b>How to build → </b>
                {it.build}
              </p>
            </article>
          ))}
        </section>

        {/* closing */}
        <section className="dn-close">
          <h2>If I were you: the next 90 days</h2>
          <p className="sub">
            Build the flywheel that needs zero backend — acquisition and revenue that respect the
            local-first grain. Prove the loop, then decide on the bigger bets.
          </p>
          <div className="dn-picks">
            {PICKS.map((p) => (
              <div key={p.rk} className="dn-pick">
                <p className="p-rk">{p.rk}</p>
                <h4>{p.h}</h4>
                <p>{p.p}</p>
              </div>
            ))}
          </div>
          <p className="after">
            <b>Then reassess.</b> If the loop works, #4 (QR classroom) opens the school channel and
            #5 (content packs) monetizes the moat. Hold #9 (speaking) and #10 (B2B dashboard) until
            a real signal justifies adding a server — they're the only two that trade away the
            offline-first identity, so they should be conscious bets, never drift.
          </p>
        </section>

        <footer className="dn-foot">
          Ten bets · ranked for a local-first, no-server, hand-curated Taiwan/zhuyin product
        </footer>
      </div>
    </div>
  );
}
