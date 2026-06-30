# Learning Chinese

> English: [README.md](./README.md) ｜ 繁體中文（本文件）

> 持續維護的文件 — 隨著 app 演進而保持最新。在重大變更／部署時更新。

一個 **本地優先（local-first）、可離線運作的 PWA**，用來學習台灣實際使用的繁體中文
（繁體中文 + 注音／ㄅㄆㄇㄈ）。把它安裝到主畫面，無須帳號、無須伺服器、無須網路即可練習
——你所有的學習進度都存在自己的裝置上。本專案以 npm-workspace monorepo 建置，並以靜態資源
部署到 Cloudflare Pages。

技術深入細節請見 **[architecture.zh-TW.md](./architecture.zh-TW.md)**（英文版見
[ARCHITECTURE.md](./ARCHITECTURE.md)）；模組開發請見
**[modules/README.zh-TW.md](./modules/README.zh-TW.md)**。

---

## 功能說明 — 五個模組

主畫面是一個由各自獨立的學習活動組成的網格。你先選擇一個 profile（多位學習者可共用一台裝置），
然後再選擇模組：

- **Writing Challenge**（✍️ `writing-challenge`）— 核心模組。在真正的台灣繁體句子上做手寫／
  筆順練習，搭配逐筆驗證（HanziWriter）、注音提示與音訊。App 會挑選你*最需要*練的字，並找出一個
  自然的句子讓你在其中練習（見下方「智慧選字」）。
- **Word Sets**（📚 `word-sets`）— 瀏覽經過策劃的詞彙分類，附注音／拼音與 TOCFL 等級，點一個詞
  即可聽發音並練習書寫。
- **Practice English**（🔤 `practice-english`）— 一個英文克漏字拼字遊戲（填入缺漏的字母），
  搭配螢幕鍵盤與音訊。
- **Copybook**（📝 `copybook`）— 自帶文字的逐字書寫練習：貼上任意文字並逐字書寫。也可選擇用
  Gemini **Generate（產生）** 一個全新的台灣繁體句子。
- **My Characters**（📊 `my-characters`）— 你的個人進度儀表板：把你練過的每個字以統計表格與字塊
  網格呈現（熟練度／記憶分數、已會 vs 學習中），並可點擊直接練習。

**適合對象：** 為了台灣而學習繁體中文的學習者（以及家庭／孩童），他們想要由個人實際所需驅動的
專注手寫練習，並可在完全離線狀態下使用。

**登陸頁（Landing page）。** 在真正網域上以瀏覽器分頁造訪的人，會先看到一個行銷／安裝用的
**登陸頁**（`platform/src/LandingPage.tsx`，也可用 `?landing` 強制顯示），它唯一的任務就是
讓 app 被安裝到主畫面。它是一套大膽、深色、海軍藍（`#073464`）的 VCASS 風格識別，環繞著「讀＋寫」
的定位，並帶有一個互動式的 **讀文覆蓋率示範（read-along coverage demo）**：拖動滑桿設定你「認得」
多少個最常見的字，看著真實的台灣文字亮起來（含情境分頁與貼上自己文字的選項）。見
[architecture.zh-TW.md §9](./architecture.zh-TW.md)。

---

## UI 系統

每個畫面都由一個小型的 **共用 UI kit**（`platform/src/ui`）組成，因此整個 app 共享同一套外觀
——一種厚實、親切的 **「cartoon-candy（卡通糖果）」** 美學（奶油色面板、紫色邊框、可按壓的 3D
糖果按鈕並帶有彩色下緣）。

- `<Button variant="primary|secondary|ghost">` — 3D 糖果按鈕。
- `<ModuleScreen title onBack? children>` — 標準的模組主畫面外殼（返回膠囊鈕 + 奶油色卡片 + 標題）。
  一個模組的登陸畫面基本上就是 `<ModuleScreen title onBack={onExit}>…<Button/>…</ModuleScreen>`。
- `<Card>` / `<BackButton>` — 奶油色面板，以及每個模組共用的獨立返回膠囊鈕。
- `<CharTile>` — 共用的字符卡片（排名、等級、熟練度條、近期結果圓點、緞帶），在「我的字」、
  「接下來練」字片與 word-set 清單之間重用。

所有顏色／尺寸／字型都是 **只定義一次的 CSS custom properties**，宣告在 `platform/src/index.css`
的 `:root` 上；模組使用 `var(--token)` 而絕不另行分叉它們。此 kit 的樣式表由 `main.tsx` 匯入一次。
完整細節見 **[platform/src/ui/README.md](./platform/src/ui/README.md)**。

### 主題（Themes）

在 kit 之上還有一套由註冊表（registry）驅動的 **主題系統**（`platform/src/theme/`）：**Default**、
兩款付費皮膚 **Gold（暖金箔）** 與 **Silver（冷鉑金）**，外加三款免費皮膚 **Midnight（墨夜，深色 ink 模式）**、
**Sakura（櫻花，暖粉淺色）** 與 **Matcha（抹茶，鼠尾草綠淺色）**。一個主題就是 `themes.ts` 註冊表中的
一筆項目；其外觀是一個 `body[data-theme="<id>"]` 區塊——內嵌在 `index.css`（Gold/Silver），或放在獨立的
`theme/theme-<id>.css` 檔並於 `main.tsx` 匯入（Midnight/Sakura/Matcha）。Default 不設定任何 token
——它*就是* `:root` 的外觀。你可以在裝置設定中為 **整台裝置** 設定主題，或在某個 profile 的設定中
**針對該 profile** 設定；有效主題的解析為 `profileOverride ?? device ?? default`。三款新皮膚為免費；
只有 Gold/Silver 是付費的，**僅限裝置層級解鎖**，且各以**自己的代碼**、在付費**前置**之後解鎖——
先輸入 **`9000`**（授予前置，本身不顯示任何東西），再以 **`9900`** → Silver 及／或 **`9901`** → Gold，
**彼此獨立**，在裝置設定的 Device ID 下透過螢幕鍵盤（`CodeEntry`）輸入（`lc-unlocks`）。在 `9000` 之前
輸入 `99xx` 會**被當成一般無效代碼拒絕**——與未知代碼一樣的「代碼無效」訊息，**完全不暗示**該代碼是真的、
或存在前置代碼。沒有 per-profile 解鎖（profile 只能在裝置
已解鎖的主題之間*覆寫*）。解鎖後，主題選擇器**只列出可用的主題**（鎖住的付費皮膚不顯示），而 Profile
選擇器只在某 profile *自己的*覆寫為 Gold/Silver 時才顯示該 profile 的皇冠。所選主題與解鎖狀態都會隨
JSON 備份一起帶走。（開發用的 Admin 主控台同理解鎖：**`8000`** 前置再 **`8001`** 揭示。舊版總括代碼
`9999`／`8888` 已**移除**，但先前已兌換的裝置仍保有其解鎖。）細節見
[architecture.zh-TW.md §5.5–5.6](./architecture.zh-TW.md)。

---

## 「智慧選字」— 接下來練什麼

目標是 **練字，而不是練句子**：句子只是用來鑽練學習者所需特定字的自然載體。選字邏輯位於
`shared/src/sentence-generator.ts`（純函式，在裝置端與開發伺服器上執行結果完全相同），分兩個階段運作。

### 1. 挑選要練「哪個」字（parity 權重）

從學習者的 **目標字**（落在其等級附近視窗內的未知字 — 見 `shared/src/char-knowledge.ts`）中，
每個候選字會得到一個權重，混合了：

- **need（需求）** — 對低熟練度的字與從未見過的字較高（`parity_mastery_weight`），若最近答錯則加成
  （`parity_miss_boost`，會看最近幾次的結果）。need 有 **上限**（`parity_need_cap`），所以不會有任何
  一個字獨占。
- **recency / 防飢餓（anti-starvation）** — 一個字越久沒練（`lastSeen` 越舊），其 recency 乘數越高
  （`parity_recency_cap`），因此每個目標字最終都會輪回來。

接著用加權隨機挑出該字。重點在於 **parity 與覆蓋率**（把你需要的全部練到），而非變化性。

### 2. 挑選包含該字的最佳銀行句子

接著 App 會為銀行中所有*包含*所選字的句子評分，並挑出最合適的一句（同分時隨機）。評分為
**僅加分**——它會獎勵句子裡的*其他*字符合以下條件：

- 屬於目標池（`bank_pool_weight`），
- 已經熟練／已知，亦即在等級之內或以下（`bank_known_weight`），
- 其頻率排名與目標字 **接近**（`bank_near_weight` / `bank_near_scale`）。

對於超出等級或最近見過的字 **沒有任何懲罰**——歡迎跳躍與重複。若沒有任何目標字有銀行句子覆蓋，
則退而求其次，選整體評分最高的句子（以其最接近學習者等級的字為錨點）；最後的最後一招則是單獨呈現
最需要練的那個字。

### 句子銀行 — 「大腦」

練習句子來自一個 **經策劃的銀行**（`bank_sentences` 表，約 3,800 個自然的台灣繁體句子，每句大致
6–15 字）。範本／合併欄位（merge-field）的產生方式已被移除——銀行是練習句子的單一來源。
（策劃／填補流程：`npm run analyze-bank`。）

這個銀行——連同 TOCFL 詞表——是 **平台所擁有的課程內容（platform-owned curriculum）**，存放在它
自己的 `platform/content.db`（透過 `@shared/character-stats/content-db` 存取），以 `content.db` 出貨到
裝置。它過去存在於 `writing-challenge.db` 內；後來被抽離出來，讓每個模組都只是單一共用課程的純
*消費者*。每個 profile 的進度則維持獨立。在匯入時（以及透過離線 scrub，`scripts/bank-fix.py`），
每個句子都會被 **正規化為單一的台灣繁體形式**：簡體 → 繁體，但 台 *和* 臺 兩者都保留（永不轉換），
而無法書寫的異體字會被統一到其已排名、可書寫的形式（汙→污、秘→祕）。見
[architecture.zh-TW.md §3.5](./architecture.zh-TW.md)。

### 熟練度、等級與「已知」— 可調整的調節桿

以上一切都由設定（「levers，調節桿」）控制，並帶有合理的預設值，可在進階設定面板中針對每台裝置編輯：

- **字符排名**（`shared/src/char-ranker.ts`）— 每個 TOCFL 字符依據頻率排名與 TOCFL 等級的混合來排名
  （`rank_freq_weight` / `rank_level_weight`、`freq_model`）。
- **熟練度／記憶保留（retention）**（`shared/src/mastery.ts`）— 一個 0–100 的分數，由近期結果
  （依近期加權）、整體正確率與目前連勝（streak）算出，然後 **依距上次見過的時間衰減**（遺忘曲線）。
  調節桿：`weight_recent`、`weight_overall`、`weight_streak`、`correct_weight`、`streak_cap`、
  `decay_per_day`、`decay_mode`。
- **「已知（Known）」**（`shared/src/char-knowledge.ts`）— 一個字在 **全部** 符合以下條件時才算已知：
  (1) 最近 M 次嘗試中有 N 次正確／完美，(2) 記憶保留 ≥ 門檻，(3) 上次成功嘗試在 N 天內。
  調節桿：`known_recent_*`、`known_retention_*`、`known_recency_*`。
- **等級與流利度** — 等級是學習者在前 N 個排名字中已知 ≥ `level_known_pct`% 時的最高 N 值；
  流利度則是一條對所有已知字數量的 0–100 RPG 風格曲線。

### Gemini 驅動的「Generate」（copybook）

在 **copybook** 中，學習者可以產生一個全新句子，而不必貼上自己的文字。這是一個盡力而為（best-effort）
的線上便利功能：

- **自帶金鑰（BYO key），每個 profile 各自獨立** — 每個 profile 可儲存自己的 Gemini API 金鑰
  （在 Settings 中輸入並可測試）；Pages secret 也可作為後備（fallback）。
- **由伺服器代理（Server-proxied）** — 瀏覽器無法直接呼叫 Gemini（CORS／金鑰外洩風險），因此會
  經過一個 Cloudflare Pages Function（`platform/functions/api/copybook/generate.ts`），它重用了
  `modules/copybook/server/gemini.ts` 裡的可攜式（portable）產生器。
- **僅限繁體的驗證** — Gemini 偶爾會夾帶簡體字，因此每個候選句都會經過驗證（僅限繁體、包含目標字、
  6–15 個漢字），失敗時最多重試 3 次後才放棄。

---

## 測試

Vitest（TS）+ pytest（唯一的 Python 對等測試）。每個 PR 都會執行，並**作為每次部署的閘門**（見 [architecture.zh-TW.md §4.5](./architecture.zh-TW.md)）。

```bash
npm test           # 全部
npm run test:unit  # 快速單元測試（shared/ 引擎 + platform/src/）
npm run test:data  # 資料完整性閘門——bake 之後執行；檢查出貨產物
pytest test/test_glyph_canon.py    # 字形對等測試的 Python 端（需要：pip install opencc pytest）
```

- **引擎**——選句（目標字具「綁定性」、parity／涵蓋率）、熟練度／保留、「已知」／等級、字頻排名、注音。
- **字形正規化對等**——TS 匯入器（`canonicalizeTW`）與 Python 清理（`bank-fix.py canon()`）以同一份黃金樣本（`test/fixtures/glyph-canon.json`）核對，確保兩者不會漂移：保留 台/臺、變體統一（汙→污…）、簡體→繁體。
- **資料完整性閘門**——出貨的資料庫不含簡體／無法書寫的字形、參照完整、**不含任何個人資料**，且銀行句子用到的每個課程字都能離線書寫。
- *（主題解析測試——選擇、premium 解鎖、每個 profile 覆寫、`body[data-theme]` 套用——已寫好，將隨其所依賴的主題重構一起併入。）*

**測試紀律。** 把測試套件當成保養良好的機器：**任何**變更都要評估是否需要新增或更新測試，並在 issue／PR 中載明測試影響。資料完整性閘門會自動擋下壞內容的部署，但**單元 + 對等測試的涵蓋率是貢獻者的責任**——新引擎邏輯或修好的 bug，要在同一個 PR 內附上守護它的測試。

**每個 PR 都要有驗證步驟。** PR 範本的 **Verification** 區段在**每個** PR 都是必填（包含純文件 PR，它們綠燈即自動合併、無人工審查）。要同時寫下*我如何驗證*——這次變更實際跑過的檢查（`npm run test:unit` 一律執行；內容改動跑 `test:data`／`seed:dbs`；字形改動跑字形對等 pytest；用 `npx vite build`、絕不用 `npm run build`；UI／主題改動要在 preview 的 `?ui` Styleguide／`?app&demo` 做一次指名的視覺檢查）——以及*審查者如何驗證*：在 preview 上的具體重現步驟（路由 + 主題／元素 + 預期結果），也就是我們 PR 一直在用的「Review: …」一行說明。

## 部署

以靜態資源部署到 **Cloudflare Pages**——沒有正式環境（production）伺服器。**部署由 CI 驅動**（`.github/workflows/ci.yml`），並以測試 + 資料完整性檢查為閘門：

- **Pull request → preview。** CI 以 committed seeds 建置、執行閘門，部署一個 Cloudflare Pages **preview**，並在 PR 上留言網址——含 demo 連結 `…/?app&demo`。
- **合併到 `master` → production。** 相同的建置 + 閘門。此 Pages 專案為 *direct-upload*，production 分支是 **`learning-chinese`**（不是 `master`），因此 master push 部署 `--branch=learning-chinese`（→ `learnchinese.hsu.mobi`），PR 部署 `--branch=<PR head>`（→ preview）。
- **一次性設定：** repo secrets `CLOUDFLARE_API_TOKEN`（Pages:Edit）+ `CLOUDFLARE_ACCOUNT_ID`，並把 CF 專案的 production 分支設為 `learning-chinese`。
- **文件 PR 綠燈即合併。** **純文件** PR（README / ARCHITECTURE / CLAUDE.md / `.github/` 範本——不含原始碼、資料庫或 workflow 變更）只要 CI 綠燈即可**自動合併**，不需人工審查。**程式碼與內容（課程）PR 仍需審查**後才能合併。

**出貨變更**——沒有手動部署；開 PR、看 preview、合併：

**PR 標題慣例**——PR 標題用 `[PR-###][<type>][<issue#>] <title>`（例：`[PR-016][bug][14] Stroke-result fail + above-level read red`），讓 PR 清單一眼可掃、每個 PR 都對得上它的類型與 issue。`[PR-###]` 是 PR 編號補零至三位數；`[<type>]` 是 issue 類型標籤（`bug` / `enhancement` / `content` / `performance`）；`[<issue#>]` 是連結的 issue 編號（沒有就省略這個方括號）；`<title>` 是簡潔描述。由於 PR 編號要等建立後才有，**`gh pr create` 之後立刻用 `gh pr edit <n> --title …` 補上 `[PR-###]`**。

| 變更 | 步驟 |
|------|------|
| 程式碼 | PR → preview → 合併到 `master`。自動。 |
| 內容（`content.db` / 模組 DB） | 另外執行 `npm run seed:dbs`，commit `seed/*.db` + `content.db` → PR。閘門會重新檢查字形／涵蓋率／隱私。 |
| 筆順 override | 新增 `platform/public/stroke-data/<字>.json`；並把該字從閘門的 `STROKE_ALLOWLIST` 移除。 |
| Demo 資料 | 在 `platform/src/offline/demo.ts` 提升 `DEMO_VERSION`。 |

可重現建置：工作用的 `platform.db` / `writing-challenge.db` 存放本機進度、不進 git；CI 改以清理過、僅含內容的 **`seed/`** 資料庫建置。本機 build **不再自動部署**。手動緊急通道（部署一個 *preview*）：

```bash
npm run build --workspace=platform
npx wrangler pages deploy platform/dist --project-name=learning-chinese --branch=<你的分支>
```

**試用（免安裝）：** `learnchinese.hsu.mobi/?app&demo` 會以預設 demo profiles 啟動 app，並使用隔離的 demo 儲存（見 [architecture.zh-TW.md §4.6](./architecture.zh-TW.md)）。

- **`build`** 會烘焙（bake）出貨的資料庫 + `stroke-data.json` + `version.json`，然後執行
  `vite build`。每次 build 都會蓋上一個 **每次部署都全新的 `version`**（以及一個獨立的、僅關乎資料的
  `contentHash`），因此 app 內的「有新版本可用」橫幅會在每次部署時觸發，而裝置只有在*資料*真正改變時
  才會重新下載那約 18 MB 的資料庫。（見 [architecture.zh-TW.md §4](./architecture.zh-TW.md)。）
- **Gemini secret**（一次性設定，供正式環境的 copybook Generate 使用）：

  ```bash
  npx wrangler pages secret put GEMINI_API_KEY --project-name=learning-chinese
  ```

  （每個 profile 自帶的金鑰無須此設定即可運作；此 secret 是共用的後備。）
- **意見回饋功能**（app 內的 💬 widget）是 **siloed（孤島化）**——專屬的 D1 + R2 + 管理 secret，且沒有任何
  app／使用者／內容的 binding。其一次性佈建 runbook（`wrangler d1 create`／migration／`r2 bucket
  create`／`pages secret put FEEDBACK_ADMIN_SECRET`／加入 Pages bindings → 重新部署）見
  [architecture.zh-TW.md §6.5](./architecture.zh-TW.md)。

---

## 本機執行

```bash
npm install                  # 安裝所有 workspaces

npm run dev                  # 在 http://localhost:3000 啟動 Express + Vite 開發伺服器
                             #   （完整開發伺服器：各模組的 API + admin UI）

npm run build                # bake data + vite build（寫入 platform/dist）
npm -w platform run preview  # 提供正式環境建置版本（vite preview，:4173）
npm -w platform run bake:data  # 僅重新烘焙出貨的資料庫 / version.json
```

此 app 是本地優先的，因此其大部分功能完全不需要伺服器即可運作——開發伺服器（`:3000`）主要是用於
admin／策劃以及產生烘焙後的資料。

**選用的額外項目：**

- **供 Generate 使用的 `.env`** — 若想在本機未自帶金鑰的情況下使用 copybook 的 Generate，可在
  開發伺服器會讀取的 `.env` 中放入 `GEMINI_API_KEY=...`（當用戶端有自帶金鑰時，會以自帶金鑰優先）。
  `GEMINI_MODEL` 可選擇性地覆寫預設的 `gemini-2.5-flash`。

---

## 專案結構地圖

| 路徑 | 內容 |
|------|------|
| `shared/` | `@shared/character-stats` — 排名、熟練度、「已知」、選字（純函式） |
| `platform/` | PWA 外殼、離線資料層、UI kit、admin、bake／deploy、Pages Functions |
| `modules/*` | 五個學習活動（見 [modules/README.zh-TW.md](./modules/README.zh-TW.md)） |
| `ARCHITECTURE.md` / `architecture.zh-TW.md` | 技術架構（monorepo、模組系統、資料、部署） |
| `platform/src/ui/README.md` | 共用 UI kit 參考文件 |
