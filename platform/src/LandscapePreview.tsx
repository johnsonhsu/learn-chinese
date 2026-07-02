import "./LandscapePreview.css";

/**
 * Landscape-native redesign — reference page. Reached at `/?ui=landscape` (a
 * sub-page of the styleguide, linked from its header). A ported copy of the
 * design proposal for epic #152: per-screen portrait→landscape wireframes and
 * the layout principles. Static/presentational; scoped under `.lsp-root`.
 */
export default function LandscapePreview() {
  return (
    <div className="lsp-root">
      <header className="lsp-masthead">
        <div className="lsp-wrap">
          <a className="lsp-back" href="?ui">
            ← UI components
          </a>
          <p className="lsp-eyebrow" style={{ marginTop: 20 }}>
            Design proposal · epic #152
          </p>
          <h1>
            Landscape isn't portrait, <span className="lsp-em">stretched.</span>
          </h1>
          <p className="lsp-deck">
            Every screen is laid out for a thumb scrolling <strong>down a narrow phone</strong> —
            elements stack top&nbsp;to&nbsp;bottom. Rotate the device and that same column just gets
            wider, marooned in dead space. A <strong>landscape&#8209;native</strong> mode instead
            places elements for the wide canvas:{" "}
            <strong>context on one side, action on the other</strong>, so you see more and scroll
            less.
          </p>
          <p className="lsp-note">
            <span className="lsp-dot" style={{ background: "var(--lsp-cyan)" }} /> Portrait stays
            exactly as it is — everything here is additive, behind{" "}
            <code>@media (orientation: landscape)</code>.
          </p>
        </div>
      </header>

      <section>
        <div className="lsp-wrap">
          <p className="lsp-kicker">Four rules</p>
          <h2>What "landscape&#8209;native" means here</h2>
          <p className="lsp-thesis">
            Not new features — a different <b>arrangement</b> and a different <b>reach</b> for the
            same screens.
          </p>
          <ul className="lsp-principles">
            <li>
              <h3>Two panes, not one column</h3>
              <p>
                Pair the context (what you're working on) with the action (what you do) side by
                side, instead of stacking them.
              </p>
            </li>
            <li>
              <h3>Fill the width, kill the scroll</h3>
              <p>
                The tall thing — the writing pad, the tile pool, the character grid — takes the wide
                half. Nothing important scrolls out of view.
              </p>
            </li>
            <li>
              <h3>Action on the right</h3>
              <p>
                The pad, tiles, and primary control sit under the thumb on the right; prompt and
                secondary controls rest on the left.
              </p>
            </li>
            <li>
              <h3>Portrait is untouched</h3>
              <p>
                Same layout, pixel&#8209;identical. Reuses the orientation&#8209;gated pattern
                shipped for the app shell (#145).
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div className="lsp-wrap">
          <p className="lsp-kicker">Screen 01 · shipped</p>
          <h2>Writing Challenge</h2>
          <p className="lsp-thesis">
            <b>Sentence + zhuyin on the left; the writing pad on the right, and bigger.</b> Live in
            landscape today (#153).
          </p>
          <div className="lsp-compare">
            <div className="lsp-stage" style={{ flex: "0 0 auto" }}>
              <p className="lsp-stage-label lsp-today">
                <span className="lsp-dot" /> Portrait · today
              </p>
              <div className="lsp-device lsp-portrait">
                <div className="lsp-screen">
                  <div className="lsp-rg" style={{ height: 34 }}>
                    prompt · audio + meaning
                  </div>
                  <div className="lsp-rg" style={{ height: 26 }}>
                    zhuyin row
                  </div>
                  <div className="lsp-rg lsp-hot lsp-grow">writing pad (320px)</div>
                  <div className="lsp-rg" style={{ height: 34 }}>
                    hint · peek · skip
                  </div>
                </div>
              </div>
            </div>
            <div className="lsp-stage">
              <p className="lsp-stage-label lsp-next">
                <span className="lsp-dot" /> Landscape · shipped
              </p>
              <div className="lsp-device lsp-landscape">
                <div className="lsp-screen">
                  <div className="lsp-col" style={{ flex: 1.05 }}>
                    <div className="lsp-rg" style={{ height: 38 }}>
                      prompt · audio + meaning
                    </div>
                    <div className="lsp-rg lsp-grow">zhuyin row</div>
                    <div className="lsp-rg" style={{ height: 40 }}>
                      hint · peek · skip
                    </div>
                  </div>
                  <div className="lsp-rg lsp-hot" style={{ flex: 0.95 }}>
                    writing pad — taller, thumb&#8209;side
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="lsp-moves">
            The pad claims the <b>full height</b> it never had when stacked, and the sentence you're
            transcribing stays <b>next to it</b> instead of scrolling away above it. One persistent
            HanziWriter, resized by CSS, never remounted (cardinal rule #4).
          </p>
        </div>
      </section>

      <section>
        <div className="lsp-wrap">
          <p className="lsp-kicker">Screen 02</p>
          <h2>Reading — Chinese &amp; English</h2>
          <p className="lsp-thesis">
            <b>Prompt on the left; the shuffled tile pool spreads across the right.</b>
          </p>
          <div className="lsp-compare">
            <div className="lsp-stage" style={{ flex: "0 0 auto" }}>
              <p className="lsp-stage-label lsp-today">
                <span className="lsp-dot" /> Portrait · today
              </p>
              <div className="lsp-device lsp-portrait">
                <div className="lsp-screen">
                  <div className="lsp-rg" style={{ height: 40 }}>
                    audio + English
                  </div>
                  <div className="lsp-rg" style={{ height: 22 }}>
                    answer / progress
                  </div>
                  <div className="lsp-rg lsp-hot lsp-grow lsp-tiles">
                    <Tiles n={9} />
                  </div>
                </div>
              </div>
            </div>
            <div className="lsp-stage">
              <p className="lsp-stage-label lsp-next">
                <span className="lsp-dot" /> Landscape · proposed
              </p>
              <div className="lsp-device lsp-landscape">
                <div className="lsp-screen">
                  <div className="lsp-col" style={{ flex: 0.85 }}>
                    <div className="lsp-rg lsp-grow">audio + English prompt</div>
                    <div className="lsp-rg" style={{ height: 30 }}>
                      answer / progress
                    </div>
                  </div>
                  <div className="lsp-rg lsp-hot lsp-tiles" style={{ flex: 1.15 }}>
                    <Tiles n={12} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="lsp-moves">
            The tap&#8209;to&#8209;reconstruct pool uses the width instead of wrapping into a tall
            block, so the prompt and the tiles are both fully visible while you build the sentence.
          </p>
        </div>
      </section>

      <section>
        <div className="lsp-wrap">
          <p className="lsp-kicker">Screen 03 · issue #146</p>
          <h2>My Characters — the dashboard</h2>
          <p className="lsp-thesis">
            <b>
              Stats + toggle become a left rail that stays put; the character grid fills the rest.
            </b>
          </p>
          <div className="lsp-compare">
            <div className="lsp-stage" style={{ flex: "0 0 auto" }}>
              <p className="lsp-stage-label lsp-today">
                <span className="lsp-dot" /> Portrait · today
              </p>
              <div className="lsp-device lsp-portrait">
                <div className="lsp-screen">
                  <div className="lsp-row" style={{ height: 30 }}>
                    <div className="lsp-rg lsp-grow">stat</div>
                    <div className="lsp-rg lsp-grow">stat</div>
                    <div className="lsp-rg lsp-grow">stat</div>
                  </div>
                  <div className="lsp-rg" style={{ height: 16 }}>
                    Known
                  </div>
                  <div className="lsp-rg lsp-hot lsp-tiles lsp-dense" style={{ flex: 1.2 }}>
                    <Tiles n={8} />
                  </div>
                  <div className="lsp-rg" style={{ height: 16 }}>
                    Learning ↓ (scrolls)
                  </div>
                </div>
              </div>
            </div>
            <div className="lsp-stage">
              <p className="lsp-stage-label lsp-next">
                <span className="lsp-dot" /> Landscape · proposed
              </p>
              <div className="lsp-device lsp-landscape">
                <div className="lsp-screen">
                  <div
                    className="lsp-col lsp-act"
                    style={{ flex: 0.5, borderRadius: 6, padding: 7 }}
                  >
                    <div className="lsp-rg" style={{ height: 22, border: 0, color: "#e7d5fb" }}>
                      summary
                    </div>
                    <div className="lsp-rg lsp-grow">stats · streak · retention</div>
                    <div className="lsp-rg" style={{ height: 26 }}>
                      grid ⇄ table
                    </div>
                  </div>
                  <div className="lsp-rg lsp-hot lsp-tiles lsp-dense" style={{ flex: 1.5 }}>
                    <Tiles n={16} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="lsp-moves">
            Your progress summary and the view toggle stay <b>pinned on the left</b> while the grid
            scrolls on the right — many more characters per row, far fewer rows to scroll through.
          </p>
        </div>
      </section>

      <section>
        <div className="lsp-wrap">
          <p className="lsp-kicker">Screens 04 &amp; 05</p>
          <h2>Home grid &amp; Settings</h2>
          <p className="lsp-thesis">
            <b>The lighter wins:</b> the module picker and the settings / onboarding forms just want
            the width — a grid and a two&#8209;column form instead of one long stack.
          </p>
          <div className="lsp-compare">
            <div className="lsp-stage">
              <p className="lsp-stage-label lsp-next">
                <span className="lsp-dot" /> Home · modules
              </p>
              <div className="lsp-device lsp-landscape">
                <div className="lsp-screen" style={{ padding: 9 }}>
                  <div className="lsp-rg" style={{ flex: "0 0 26%", writingMode: "vertical-rl" }}>
                    welcome · level
                  </div>
                  <div
                    className="lsp-row lsp-grow"
                    style={{ flexWrap: "wrap", alignContent: "flex-start" }}
                  >
                    <div className="lsp-rg lsp-act" style={{ flex: "1 1 40%", minHeight: 52 }}>
                      module
                    </div>
                    <div className="lsp-rg lsp-act" style={{ flex: "1 1 40%", minHeight: 52 }}>
                      module
                    </div>
                    <div className="lsp-rg lsp-act" style={{ flex: "1 1 40%", minHeight: 52 }}>
                      module
                    </div>
                    <div className="lsp-rg lsp-act" style={{ flex: "1 1 40%", minHeight: 52 }}>
                      module
                    </div>
                  </div>
                </div>
              </div>
              <p className="lsp-moves" style={{ fontSize: 14 }}>
                All modules on screen at once — no scroll to reach the last card.
              </p>
            </div>
            <div className="lsp-stage">
              <p className="lsp-stage-label lsp-next">
                <span className="lsp-dot" /> Settings · onboarding
              </p>
              <div className="lsp-device lsp-landscape">
                <div className="lsp-screen" style={{ padding: 9 }}>
                  <div className="lsp-col lsp-grow">
                    <div className="lsp-rg lsp-grow">section</div>
                    <div className="lsp-rg lsp-grow">section</div>
                  </div>
                  <div className="lsp-col lsp-grow">
                    <div className="lsp-rg lsp-grow">section</div>
                    <div className="lsp-rg lsp-grow">section</div>
                  </div>
                </div>
              </div>
              <p className="lsp-moves" style={{ fontSize: 14 }}>
                Two columns; onboarding's choices fit one view without scrolling.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="lsp-wrap">
          <p className="lsp-kicker">How it ships · epic #152</p>
          <h2>One shared split, then screen by screen</h2>
          <p className="lsp-thesis">
            A small reusable landscape split (context | action) that screens opt into, plus
            per&#8209;screen rules — <b>all</b> gated behind{" "}
            <code>@media (orientation: landscape)</code>, portrait pixel&#8209;identical. Phased so
            each screen is its own reviewable PR.
          </p>
          <div className="lsp-plan">
            <div className="lsp-phase">
              <span className="lsp-n">1</span>
              <p>
                <b>Writing Challenge</b> — the 2&#8209;pane, and the proof of the pattern.{" "}
                <span className="lsp-done">✓ shipped (#153)</span>
              </p>
            </div>
            <div className="lsp-phase">
              <span className="lsp-n">2</span>
              <p>
                <b>Reading</b> (Chinese + English) — prompt | tile pool.{" "}
                <span>Reuses the pattern.</span>
              </p>
            </div>
            <div className="lsp-phase">
              <span className="lsp-n">3</span>
              <p>
                <b>My Characters</b> (#146) — stats rail | grid.
              </p>
            </div>
            <div className="lsp-phase">
              <span className="lsp-n">4</span>
              <p>
                <b>Home grid &amp; Settings / onboarding</b> — the light wins.{" "}
                <span>Mostly width + column count.</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Small wireframe "tile" swatches for the shuffled-pool / character-grid mocks. */
function Tiles({ n }: { n: number }) {
  return (
    <>
      {[...Array(n).keys()].map((i) => (
        <span key={i} className="lsp-tile" />
      ))}
    </>
  );
}
