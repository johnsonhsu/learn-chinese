/**
 * Three Worlds — interactive design exploration (dev-only, reachable ONLY at
 * `/?devnote=three-worlds`, never linked from the app UI). A single phone mock
 * that switches between three proposed design *worlds* live — Draft (precision),
 * Arcade (play), Studio (art) — each changing palette, layout, type and motion,
 * not just colour. One real interaction per world:
 *   · Draft  — tap the "today" sheet to SEAL it (ghost → inked → sealed).
 *   · Arcade — tap 開始 to gain XP + build a combo.
 *   · Studio — tap the glyph to replay the ink diffusion.
 *
 * Design note, not shipped product surface. Self-contained scoped styles
 * (`.tw-*`), no dependency on module/theme CSS, so it renders identically
 * regardless of the active theme. Gated in App.tsx behind `?devnote` (mirrors `?ui`).
 */
import { useState } from "react";

type World = "draft" | "arcade" | "studio";

interface WorldInfo {
  id: World;
  tag: string;
  glyph: string;
  name: string;
  ethos: string;
  sig: string;
  accent: string;
  chips: { hex: string; label: string }[];
}

const WORLDS: WorldInfo[] = [
  {
    id: "draft",
    tag: "Precision",
    glyph: "摹",
    name: "The Drafting Table",
    ethos:
      "Learning framed as drafting. The 田字格 practice grid is the layout. Flush-left numbered sheets, metrics in mono, one structural ink. For the older learner and the serious streak.",
    sig: "Signature — mastery is a print: a glyph travels ghost → drafted → inked → sealed. Status is the character’s own rendering, legible in greyscale.",
    accent: "#16324F",
    chips: [
      { hex: "#EBEEEC", label: "draft white" },
      { hex: "#16324F", label: "prussian" },
      { hex: "#2F8F6F", label: "jade" },
      { hex: "#D6472F", label: "cinnabar" },
      { hex: "#E0A02E", label: "amber" },
    ],
  },
  {
    id: "arcade",
    tag: "Play",
    glyph: "闖",
    name: "The Arcade",
    ethos:
      "Learning as a game you charge through. XP, a streak flame, a daily quest, character-modes with progress rings. Loud, warm, generous with reward — for kids and the family profiles the demo already seeds.",
    sig: "Signature — the character is a target: land the stroke, chain a combo, fill the ring, keep the streak. Progress is celebrated, not just recorded.",
    accent: "#c0397e",
    chips: [
      { hex: "#141026", label: "night violet" },
      { hex: "#FFC24D", label: "amber" },
      { hex: "#29E7E7", label: "cyan" },
      { hex: "#FF3D9A", label: "magenta" },
      { hex: "#8BEF5A", label: "lime" },
    ],
  },
  {
    id: "studio",
    tag: "Art",
    glyph: "硯",
    name: "The Ink Studio",
    ethos:
      "Learning as brush art and focus. A single oversized character fills the screen as ink on charcoal; modules become a quiet vertical list of “studies.” Almost no chrome — gallery calm. A premium / focus mode.",
    sig: "Signature — one character, full screen. Stroke replays diffuse like wet ink; mastery earns a small cinnabar seal pressed in the corner. Nothing competes with the glyph.",
    accent: "#9A7A2E",
    chips: [
      { hex: "#17181A", label: "charcoal" },
      { hex: "#EDE9E0", label: "bone ink" },
      { hex: "#C9A24A", label: "antique gold" },
      { hex: "#C4442E", label: "seal" },
    ],
  },
];

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 3l16 9-16 9z" />
    </svg>
  );
}

export default function ThreeWorlds() {
  const [world, setWorld] = useState<World>("draft");
  const [sealed, setSealed] = useState(false);
  const [xp, setXp] = useState(720);
  const [combo, setCombo] = useState(4);
  const [toast, setToast] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);

  const info = WORLDS.find((w) => w.id === world) ?? WORLDS[0];

  const gainXp = () => {
    setXp((v) => (v >= 1000 ? 60 : Math.min(1000, v + 60)));
    setCombo((c) => c + 1);
    setToast("+60 XP");
    window.setTimeout(() => setToast(null), 1300);
  };

  const xpPct = Math.min(100, Math.round((xp / 1000) * 100));

  return (
    <div className="tw">
      <style>{TW_STYLES}</style>
      <header className="tw-head">
        <a className="tw-back" href="/?devnotes">
          ← Dev Notes
        </a>
        <div className="tw-titlerow">
          <h1>Three Worlds</h1>
          <span className="tw-adv">interactive design note · tap the phone</span>
        </div>
        <p className="tw-sub">
          One phone, three proposed design <b>worlds</b> — each changing palette, layout, type and
          motion, not just colour. Switch below; each has one live interaction.
        </p>
      </header>

      <div className="tw-switch" role="group" aria-label="Choose a design world">
        {WORLDS.map((w) => (
          <button
            key={w.id}
            className={`tw-switch-btn${world === w.id ? " is-on" : ""}`}
            aria-pressed={world === w.id}
            onClick={() => setWorld(w.id)}
          >
            <span className="tw-switch-glyph">{w.glyph}</span>
            <span className="tw-switch-name">{w.name.replace("The ", "")}</span>
            <span className="tw-switch-tag">{w.tag}</span>
          </button>
        ))}
      </div>

      <div className="tw-stage">
        {/* ── PHONE ── */}
        <div className={`tw-phone tw-${world}`}>
          <div className="tw-scr">
            <div className="tw-status">
              <span>9:41</span>
              <span className="tw-dots">
                <i />
                <i />
                <i />
              </span>
            </div>

            {world === "draft" && (
              <div className="tw-body">
                <div className="tw-d-eye">習字 · workbook</div>
                <div className="tw-d-h">Draft</div>
                <div className="tw-d-stat">
                  LV 4 · rank #312 · {sealed ? "93" : "92"}% inked · {sealed ? 11 : 12} due
                </div>
                <button
                  className={`tw-sheet tw-sheet--hot${sealed ? " tw-sheet--sealed" : ""}`}
                  onClick={() => setSealed((s) => !s)}
                >
                  <span className="tw-no">今</span>
                  <span className="tw-sg">寫</span>
                  <span className="tw-sm">
                    <b>寫字練習</b>
                    <span>{sealed ? "sealed ✓ · tap to undo" : "12 due · tap to seal"}</span>
                  </span>
                  {sealed && <span className="tw-seal-badge">精</span>}
                </button>
                <div className="tw-sheet">
                  <span className="tw-no">01</span>
                  <span className="tw-sg">讀</span>
                  <span className="tw-sm">
                    <b>讀中文</b>
                    <span>8 due</span>
                  </span>
                </div>
                <div className="tw-sheet">
                  <span className="tw-no">02</span>
                  <span className="tw-sg">詞</span>
                  <span className="tw-sm">
                    <b>詞組</b>
                    <span>ready</span>
                  </span>
                </div>
                <div className="tw-sheet">
                  <span className="tw-no">03</span>
                  <span className="tw-sg">字</span>
                  <span className="tw-sm">
                    <b>我的字</b>
                    <span>312 sealed</span>
                  </span>
                </div>
              </div>
            )}

            {world === "arcade" && (
              <div className="tw-body">
                <div className="tw-a-top">
                  <span className="tw-a-av" />
                  <span className="tw-a-xp">
                    <span className="tw-a-xprow">
                      <span>LV 4</span>
                      <span>{xp} / 1000 XP</span>
                    </span>
                    <span className="tw-a-bar">
                      <i style={{ width: `${xpPct}%` }} />
                    </span>
                  </span>
                  <span className="tw-a-pill">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFC24D"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-1-3 2 1 4 4 4 8a8 8 0 1 1-14-3c1 3 3 3 3 3 0-3 2-4 3-6z" />
                    </svg>
                    7
                  </span>
                </div>
                <div className="tw-quest">
                  <div className="tw-qk">每日任務 · daily quest</div>
                  <div className="tw-qh">寫 5 個字 · write 5 characters</div>
                  <button className="tw-cta" onClick={gainXp}>
                    開始 <PlayIcon />
                  </button>
                  {toast && (
                    <span className="tw-toast">
                      {toast} · COMBO ×{combo}
                    </span>
                  )}
                </div>
                <div className="tw-grid2">
                  <div className="tw-mode tw-mode--cyan">
                    <span className="tw-lv">4</span>
                    <span className="tw-disc">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#29E7E7"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16z" />
                      </svg>
                    </span>
                    <div className="tw-mh">寫字</div>
                    <span className="tw-mp">
                      <i style={{ width: "80%" }} />
                    </span>
                  </div>
                  <div className="tw-mode tw-mode--mag">
                    <span className="tw-lv">3</span>
                    <span className="tw-disc">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FF3D9A"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M4 5h16M4 12h16M4 19h10" />
                      </svg>
                    </span>
                    <div className="tw-mh">詞組</div>
                    <span className="tw-mp">
                      <i style={{ width: "55%" }} />
                    </span>
                  </div>
                  <div className="tw-mode tw-mode--lime">
                    <span className="tw-lv">5</span>
                    <span className="tw-disc">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#8BEF5A"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M4 6h16v12H4zM4 10h16" />
                      </svg>
                    </span>
                    <div className="tw-mh">讀中文</div>
                    <span className="tw-mp">
                      <i style={{ width: "40%" }} />
                    </span>
                  </div>
                  <div className="tw-mode tw-mode--amber">
                    <span className="tw-lv">2</span>
                    <span className="tw-disc">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FFC24D"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5z" />
                      </svg>
                    </span>
                    <div className="tw-mh">我的字</div>
                    <span className="tw-mp">
                      <i style={{ width: "66%" }} />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {world === "studio" && (
              <div className="tw-body tw-body--studio">
                <div className="tw-hero">
                  <div className="tw-cap">今日 · today</div>
                  <button
                    className="tw-glyph-btn"
                    onClick={() => setReplay((r) => r + 1)}
                    aria-label="Replay ink"
                  >
                    <span className="tw-big" key={replay}>
                      學<span className="tw-seal-c">習</span>
                    </span>
                  </button>
                  <div className="tw-rd">xué · to learn</div>
                </div>
                <div className="tw-rule" />
                <div className="tw-study">
                  <span className="tw-t">
                    寫字<small>writing</small>
                  </span>
                  <span className="tw-u">
                    <i style={{ width: "80%" }} />
                  </span>
                  <span className="tw-c">80%</span>
                </div>
                <div className="tw-study">
                  <span className="tw-t">
                    讀本<small>reading</small>
                  </span>
                  <span className="tw-u">
                    <i style={{ width: "52%" }} />
                  </span>
                  <span className="tw-c">52%</span>
                </div>
                <div className="tw-study">
                  <span className="tw-t">
                    詞組<small>vocabulary</small>
                  </span>
                  <span className="tw-u">
                    <i style={{ width: "40%" }} />
                  </span>
                  <span className="tw-c">40%</span>
                </div>
                <div className="tw-study">
                  <span className="tw-t">
                    字庫<small>my characters</small>
                  </span>
                  <span className="tw-u">
                    <i style={{ width: "66%" }} />
                  </span>
                  <span className="tw-c">312</span>
                </div>
              </div>
            )}

            <div className="tw-nav">
              {world === "draft" && (
                <>
                  <span className="on">家</span>
                  <span>字</span>
                  <span>讀</span>
                  <span>設</span>
                </>
              )}
              {world === "arcade" && (
                <>
                  <span className="on">玩</span>
                  <span>字庫</span>
                  <span className="fab">
                    <PlayIcon />
                  </span>
                  <span>排行</span>
                  <span>我</span>
                </>
              )}
              {world === "studio" && (
                <>
                  <span className="on">⌂</span>
                  <span>≡</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── INFO ── */}
        <div className="tw-info">
          <div className="tw-info-tag" style={{ color: info.accent }}>
            {info.glyph} · {info.tag}
          </div>
          <h2>{info.name}</h2>
          <p className="tw-ethos">{info.ethos}</p>
          <div className="tw-block-h">Palette</div>
          <div className="tw-chips">
            {info.chips.map((c) => (
              <span className="tw-chip" key={c.label}>
                <i style={{ background: c.hex }} />
                {c.label}
              </span>
            ))}
          </div>
          <p className="tw-sig">{info.sig}</p>
        </div>
      </div>

      <p className="tw-foot">
        Design note · no implementation on the real app surfaces · phone is a static specimen with
        one live interaction per world · system font stacks approximate the named production faces.
        The full write-up lives in the exploration deck.
      </p>
    </div>
  );
}

const TW_STYLES = `
.tw{--bg:#E7E9E8;--panel:#F3F5F4;--ink:#17191C;--ink2:#3C4249;--muted:#68707A;--line:rgba(23,25,28,.12);--line2:rgba(23,25,28,.22);--spark:#C6512F;
  --f-disp:"Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;--f-body:system-ui,-apple-system,"Noto Sans TC",sans-serif;
  --f-mono:ui-monospace,"SF Mono",Menlo,monospace;--f-serif:"Iowan Old Style","Palatino Linotype",Georgia,"Songti TC",serif;
  --f-round:"SF Pro Rounded","Nunito",var(--f-body);--f-han:"Kaiti TC","STKaiti",KaiTi,"Songti TC","Noto Serif TC",serif;--f-han-ui:"PingFang TC","Noto Sans TC",system-ui,sans-serif;
  min-height:100vh;margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:16px;line-height:1.6;padding:38px 20px 80px}
.tw *{box-sizing:border-box}
.tw :focus-visible{outline:3px solid var(--spark);outline-offset:2px}
.tw-head{max-width:1040px;margin:0 auto 20px}
.tw-back{color:var(--spark);text-decoration:none;font-size:13px;font-family:var(--f-mono)}
.tw-back:hover{text-decoration:underline}
.tw-titlerow{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:8px}
.tw-titlerow h1{font-family:var(--f-disp);font-weight:800;letter-spacing:-.03em;font-size:36px;margin:0;color:var(--ink)}
.tw-adv{font-family:var(--f-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line2);border-radius:999px;padding:2px 10px}
.tw-sub{color:var(--ink2);margin:10px 0 0;max-width:64ch}
.tw-switch{max-width:1040px;margin:22px auto 0;display:flex;gap:8px;flex-wrap:wrap}
.tw-switch-btn{flex:1 1 150px;min-height:56px;display:flex;flex-direction:column;align-items:flex-start;gap:1px;background:var(--panel);border:1px solid var(--line2);border-radius:12px;padding:9px 14px;cursor:pointer;text-align:left;transition:border-color .15s,transform .12s}
.tw-switch-btn:hover{transform:translateY(-1px)}
.tw-switch-btn.is-on{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.tw-switch-glyph{font-family:var(--f-han);font-size:18px;line-height:1;color:var(--ink)}
.tw-switch-name{font-weight:700;font-size:14px;color:var(--ink)}
.tw-switch-tag{font-family:var(--f-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.tw-stage{max-width:1040px;margin:26px auto 0;display:flex;gap:clamp(24px,5vw,56px);align-items:flex-start;flex-wrap:wrap}
.tw-info{flex:1 1 300px;min-width:280px}
.tw-info-tag{font-family:var(--f-mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase}
.tw-info h2{font-family:var(--f-han-ui);font-size:26px;margin:8px 0 0;letter-spacing:-.01em;color:var(--ink)}
.tw-ethos{color:var(--ink2);font-size:15px;margin:12px 0 0;max-width:50ch}
.tw-block-h{font-family:var(--f-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:22px 0 9px}
.tw-chips{display:flex;flex-wrap:wrap;gap:7px}
.tw-chip{display:flex;align-items:center;gap:7px;border:1px solid var(--line2);background:var(--panel);padding:5px 9px;font-family:var(--f-mono);font-size:11px;border-radius:4px}
.tw-chip i{width:13px;height:13px;border-radius:2px;display:block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.tw-sig{border-left:3px solid var(--spark);padding:2px 0 2px 16px;margin:22px 0 0;font-size:14px;color:var(--ink2)}
.tw-foot{max-width:1040px;margin:40px auto 0;font-family:var(--f-mono);font-size:11.5px;color:var(--muted);line-height:1.7;border-top:1px solid var(--line2);padding-top:18px}

/* ── phone frame (shared) ── */
.tw-phone{width:300px;flex:none;border-radius:34px;padding:9px;background:#0c0d0f;box-shadow:0 30px 60px -30px rgba(23,25,28,.5),0 0 0 1px rgba(23,25,28,.1)}
.tw-scr{border-radius:26px;overflow:hidden;position:relative;height:600px;display:flex;flex-direction:column}
.tw-status{display:flex;justify-content:space-between;align-items:center;padding:12px 18px 4px;font-family:var(--f-mono);font-size:11px;font-weight:600}
.tw-dots{display:flex;gap:4px}.tw-dots i{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.8}
.tw-body{flex:1;overflow:hidden;padding:6px 16px 0}
.tw-nav{margin-top:auto;display:flex;justify-content:space-around;align-items:center;padding:11px 10px;font-family:var(--f-han-ui);font-size:12px}
.tw-nav span{display:flex;align-items:center;justify-content:center}

/* ── WORLD: DRAFT ── */
.tw-draft .tw-scr{background:repeating-linear-gradient(0deg,rgba(22,50,79,.06) 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,rgba(22,50,79,.06) 0 1px,transparent 1px 22px),#EBEEEC;color:#16324F}
.tw-draft .tw-status{color:#16324F}
.tw-d-eye{font-family:var(--f-mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#566A72}
.tw-d-h{font-family:var(--f-disp);font-weight:800;font-size:30px;letter-spacing:-.03em;color:#16324F;line-height:1;margin-top:3px}
.tw-d-stat{font-family:var(--f-mono);font-size:11px;color:#566A72;margin-top:8px}
.tw-sheet{position:relative;border:1.5px solid #16324F;background:#F6F8F6;padding:12px 13px;margin-top:10px;display:flex;align-items:center;gap:11px;width:100%;text-align:left;font:inherit;color:inherit}
button.tw-sheet{cursor:pointer}
.tw-sheet .tw-no{position:absolute;top:-1.5px;left:-1.5px;background:#16324F;color:#F6F8F6;font-family:var(--f-mono);font-size:9px;padding:2px 6px}
.tw-sheet .tw-sg{font-family:var(--f-han);font-size:26px;color:#16324F;padding-left:20px}
.tw-sheet .tw-sm{margin-left:auto;text-align:right}
.tw-sheet .tw-sm b{font-family:var(--f-han-ui);font-size:13px;display:block;color:#16324F}
.tw-sheet .tw-sm span{font-family:var(--f-mono);font-size:9.5px;color:#566A72}
.tw-sheet--hot{border-color:#D6472F}
.tw-sheet--sealed{border-color:#2F8F6F}
.tw-seal-badge{position:absolute;right:-10px;bottom:-10px;width:34px;height:34px;background:#D6472F;color:#fff;display:grid;place-items:center;font-family:var(--f-han-ui);font-weight:700;font-size:15px;transform:rotate(-6deg);box-shadow:0 0 0 3px #EBEEEC}
.tw-draft .tw-nav{background:#F6F8F6;border-top:1.5px solid #16324F;color:#566A72}
.tw-draft .tw-nav .on{color:#16324F;border-bottom:2px solid #D6472F;padding-bottom:1px}

/* ── WORLD: ARCADE ── */
.tw-arcade .tw-scr{background:radial-gradient(120% 60% at 50% 0%,#251b45 0%,#141026 60%);color:#F5F1FF;font-family:var(--f-round)}
.tw-arcade .tw-status{color:#F5F1FF}
.tw-a-top{display:flex;align-items:center;gap:9px;margin-top:2px}
.tw-a-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#FF3D9A,#FFC24D);flex:none;box-shadow:0 0 0 2px rgba(245,241,255,.2)}
.tw-a-xp{flex:1}
.tw-a-xprow{display:flex;justify-content:space-between;font-size:10px;font-weight:800}
.tw-a-bar{display:block;height:9px;border-radius:6px;background:rgba(255,255,255,.1);margin-top:3px;overflow:hidden}
.tw-a-bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#8BEF5A,#29E7E7);transition:width .5s cubic-bezier(.2,.8,.3,1)}
.tw-a-pill{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:800;background:rgba(255,255,255,.08);border-radius:20px;padding:5px 9px}
.tw-a-pill svg{width:14px;height:14px}
.tw-quest{position:relative;margin-top:12px;border-radius:18px;padding:14px;background:linear-gradient(135deg,rgba(255,61,154,.13),rgba(41,231,231,.1));border:1px solid rgba(255,255,255,.15)}
.tw-qk{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#FFC24D}
.tw-qh{font-family:var(--f-han-ui);font-weight:800;font-size:18px;margin-top:2px}
.tw-cta{margin-top:11px;display:inline-flex;align-items:center;gap:6px;background:#FFC24D;color:#241a05;font-weight:800;font-size:13px;border:0;border-radius:12px;padding:9px 16px;cursor:pointer;font-family:var(--f-round)}
.tw-toast{position:absolute;top:12px;right:12px;background:#8BEF5A;color:#0c2400;font-family:var(--f-mono);font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px}
.tw-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.tw-mode{position:relative;border-radius:16px;padding:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.tw-disc{width:38px;height:38px;border-radius:12px;display:grid;place-items:center}
.tw-disc svg{width:20px;height:20px}
.tw-mh{font-family:var(--f-han-ui);font-weight:800;font-size:14px;margin-top:9px}
.tw-mp{display:block;height:6px;border-radius:4px;background:rgba(255,255,255,.1);margin-top:8px;overflow:hidden}
.tw-mp i{display:block;height:100%;border-radius:4px}
.tw-lv{position:absolute;top:10px;right:10px;font-size:10px;font-weight:800;font-family:var(--f-mono)}
.tw-mode--cyan .tw-disc{background:rgba(41,231,231,.12);box-shadow:inset 0 0 0 1.5px #29E7E7}.tw-mode--cyan .tw-mp i{background:#29E7E7;width:80%}.tw-mode--cyan .tw-lv{color:#29E7E7}
.tw-mode--mag .tw-disc{background:rgba(255,61,154,.12);box-shadow:inset 0 0 0 1.5px #FF3D9A}.tw-mode--mag .tw-mp i{background:#FF3D9A}.tw-mode--mag .tw-lv{color:#FF3D9A}
.tw-mode--lime .tw-disc{background:rgba(139,239,90,.12);box-shadow:inset 0 0 0 1.5px #8BEF5A}.tw-mode--lime .tw-mp i{background:#8BEF5A}.tw-mode--lime .tw-lv{color:#8BEF5A}
.tw-mode--amber .tw-disc{background:rgba(255,194,77,.12);box-shadow:inset 0 0 0 1.5px #FFC24D}.tw-mode--amber .tw-mp i{background:#FFC24D}.tw-mode--amber .tw-lv{color:#FFC24D}
.tw-arcade .tw-nav{background:#0f0b1f;border-top:1px solid rgba(255,255,255,.08);color:#8b83a8}
.tw-arcade .tw-nav .on{color:#29E7E7}
.tw-arcade .tw-nav .fab{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FF3D9A,#FFC24D);color:#241a05;margin-top:-20px;box-shadow:0 8px 20px -6px rgba(255,61,154,.6)}

/* ── WORLD: STUDIO ── */
.tw-studio .tw-scr{background:radial-gradient(140% 70% at 50% -10%,#232426 0%,#17181A 60%);color:#EDE9E0;font-family:var(--f-serif)}
.tw-studio .tw-status{color:#8f8a80;font-family:var(--f-mono)}
.tw-hero{text-align:center;padding:14px 0 6px}
.tw-cap{font-family:var(--f-mono);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#8f8a80}
.tw-glyph-btn{background:none;border:0;padding:0;cursor:pointer;display:inline-block}
.tw-big{font-family:var(--f-han);font-size:150px;line-height:.92;color:#EDE9E0;position:relative;display:inline-block;text-shadow:0 6px 40px rgba(0,0,0,.5)}
.tw-seal-c{position:absolute;right:-6px;bottom:14px;width:30px;height:30px;background:#C4442E;color:#fff;display:grid;place-items:center;font-family:var(--f-han-ui);font-weight:700;font-size:15px;transform:rotate(-6deg)}
.tw-rd{font-style:italic;font-size:15px;color:#C9A24A;margin-top:2px}
.tw-rule{height:1px;background:linear-gradient(90deg,transparent,rgba(201,162,74,.4),transparent);margin:14px 4px}
.tw-study{display:flex;align-items:baseline;gap:12px;padding:12px 2px;border-bottom:1px solid rgba(255,255,255,.06)}
.tw-study .tw-t{font-size:18px;color:#EDE9E0}
.tw-study .tw-t small{font-family:var(--f-mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#8f8a80;display:block;margin-top:1px}
.tw-study .tw-u{flex:1;height:1px;background:rgba(255,255,255,.08);position:relative;align-self:center}
.tw-study .tw-u i{position:absolute;left:0;top:0;height:1px;background:#C9A24A}
.tw-study .tw-c{font-family:var(--f-mono);font-size:11px;color:#8f8a80}
.tw-studio .tw-nav{border-top:1px solid rgba(255,255,255,.06);color:#8f8a80;gap:40px;justify-content:center}
.tw-studio .tw-nav .on{color:#C9A24A}

@media(prefers-reduced-motion:no-preference){
  .tw-big{animation:tw-ink 1s ease both}
  @keyframes tw-ink{from{opacity:0;filter:blur(4px)}to{opacity:1;filter:none}}
  .tw-seal-badge{animation:tw-stamp .4s cubic-bezier(.2,1.4,.4,1) both}
  @keyframes tw-stamp{from{transform:rotate(-6deg) scale(1.9);opacity:0}to{transform:rotate(-6deg) scale(1);opacity:1}}
}
@media(max-width:560px){.tw-big{font-size:120px}}
`;
