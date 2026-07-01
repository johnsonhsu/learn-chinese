# Architecture

> English: [ARCHITECTURE.md](./ARCHITECTURE.md) ｜ 繁體中文（本文件）

> 持續維護的文件 — 隨著 app 演進而保持最新。在重大變更／部署時更新。

這是 Learning Chinese PWA 的技術架構：一個離線優先（offline-first）、本地優先（local-first）的
繁體中文（台灣／注音ㄅㄆㄇㄈ）練習 app，以靜態資源出貨到 Cloudflare Pages。正式環境中
**沒有執行期伺服器（runtime server）**——部署後的 app 就是建置好的前端，外加少數幾個供 Gemini 代理
使用的 Cloudflare Pages Functions。本機的 Express 伺服器只存在於開發機器上，用於開發、admin／策劃，
以及產生出貨的資料。

---

## 1. Monorepo 佈局

npm workspaces（`workspaces: ["shared", "platform", "modules/*"]`）：

```
learning-chinese/
├── shared/                 @shared/character-stats — 純粹的橫切（cross-cutting）邏輯
│   └── src/
│       ├── index.ts            供開發伺服器使用的 Node DB 存取（better-sqlite3）
│       ├── content-db.ts       平台所擁有的「課程內容」存取器（content.db）— §3.5
│       ├── mastery.ts          熟練度 / 記憶保留評分（純函式，不含 Node）
│       ├── char-ranker.ts      頻率+TOCFL 字符排名（純函式）
│       ├── char-knowledge.ts   「已知」判準、等級、目標字視窗（純函式）
│       ├── sentence-generator.ts  parity 選字 + 銀行句子評分（純函式）
│       ├── zhuyin.ts           拼音→注音轉換 + 消歧義
│       └── types.ts            DbQueryProvider, RankedChar, CharStat, …
│
├── platform/               主應用程式（PWA 外殼、離線層、UI kit、admin）
│   ├── src/
│   │   ├── App.tsx             模組系統、畫面路由、設定、套用主題
│   │   ├── main.tsx            React 進入點；匯入 UI kit 樣式表一次
│   │   ├── index.css           標準的 :root 設計 token + 全域樣式 + 主題區塊
│   │   ├── LandingPage.tsx     行銷／安裝登陸頁（?landing）— §9
│   │   ├── LandingReadData.ts  登陸頁讀文示範用的排名 + 情境段落
│   │   ├── theme/              主題註冊表 + 解析／儲存 — §5.5
│   │   ├── ui/                 共用 UI kit（@platform/ui）— 見 ui/README.md
│   │   ├── offline/            本地優先資料層（sql.js + IndexedDB）
│   │   ├── admin/              僅供開發使用的策劃面板（或 admin 代碼解鎖 — §8）
│   │   ├── components/         共用的跨模組元件（PracticeModal, CodeEntry, ThemeSelect, …）
│   │   ├── i18n/               平台層級的 en / zh-TW 字串
│   │   └── utils/              speech、voices、device-id、geminiKey、unlocks（代碼閘門功能）
│   ├── functions/api/copybook/ Cloudflare Pages Functions（Gemini 代理）
│   ├── scripts/bake-data.ts    烘焙出貨的資料庫 + version.json
│   ├── server/index.ts         僅供開發使用的 Express + Vite middleware 伺服器（:3000）
│   ├── server/content-admin.ts 僅供開發的內容／句庫策劃路由（/api/content）— §8.4
│   ├── vite.config.ts          build、PWA、模組別名、__CONTENT_VERSION__
│   ├── platform.db             標準的平台 SQLite（字典、stats schema）
│   ├── content.db              標準的「課程內容」（bank_sentences、tocfl_words、char_words）
│   └── public/data/            烘焙輸出：*.db、stroke-data.json、version.json
│
└── modules/                各自獨立的學習活動
    ├── writing-challenge/      在銀行句子上做手寫 / 筆順練習
    ├── word-sets/              詞彙分類
    ├── practice-english/       英文克漏字拼字遊戲
    ├── copybook/               自帶文字逐字書寫 + Gemini 產生
    └── my-characters/          逐字進度儀表板（統計表格 + 字塊網格）
```

每個模組都是自己的 workspace，含有 `module.json`、`src/`（前端），以及選用的 `server/`
（僅供開發的 Express 路由）。`shared` 套件同時被以下兩者使用：Node 開發伺服器（透過 `src/index.ts`，
它以 better-sqlite3 開啟 `platform.db`），以及瀏覽器（透過純粹的子路徑匯出，例如
`@shared/character-stats/mastery`，不帶任何 Node 相依）。

### 路徑別名（Path aliases）

- `@platform/*` → `platform/src/*`（例如 `@platform/ui/index.ts`、
  `@platform/offline/offline-context.tsx`、`@platform/components/...`）。在
  `platform/vite.config.ts` 與 `platform/tsconfig.app.json` 中設定。
- `@modules/<name>` → `modules/<name>/src/index.ts`（由 `vite.config.ts` 掃描
  `../modules/*/src/index.ts` 自動探索）。
- `@shared/character-stats` 及其子路徑 → `shared` 套件的 `exports` 對應表
  （`./mastery`、`./types`、`./char-ranker`、`./char-knowledge`、`./sentence-generator`、`./zhuyin`、
  `./content-db`）。

---

## 2. 模組系統

模組是 **完全在建置期（build time）** 被探索並接好線的——並不需要往返伺服器才能得知有哪些模組存在。

### `module.json` manifest

每個模組都出貨一個 manifest，例如 `modules/writing-challenge/module.json`：

```json
{
  "name": "writing-challenge",
  "displayName": "Writing Challenge",
  "displayNameZh": "寫字挑戰",
  "icon": "✍️",
  "apiPrefix": "/api/writing-challenge",
  "dbFile": "writing-challenge.db",
  "order": 1
}
```

| 欄位            | 用途                                                           |
|-----------------|----------------------------------------------------------------|
| `name`          | 穩定的 id；與資料夾相符，用作 glob／registry 的鍵               |
| `displayName`   | 主畫面網格上的英文標籤                                         |
| `displayNameZh` | 繁體中文標籤                                                   |
| `icon`          | 顯示在模組卡片上的 emoji                                       |
| `apiPrefix`     | 開發伺服器掛載此模組 Express 路由的位置                        |
| `dbFile`        | （選用）模組自己的 SQLite 檔，烘焙以供離線使用                 |
| `order`         | 主畫面上的排序順序                                             |

`practice-english`、`copybook` 與 `my-characters` 省略 `dbFile`（它們讀取共用的銀行／裝置上進度，本身沒有出貨的 DB）。

### 前端自動探索（`platform/src/App.tsx`）

平台用兩個 `import.meta.glob` 呼叫找出模組：

```ts
// Lazy React components — the module's runtime entry.
const moduleImports = import.meta.glob<ModuleExport>('../../modules/*/src/index.ts');

// Manifests — read eagerly at build time, no server needed.
const manifestModules = import.meta.glob('../../modules/*/module.json', { eager: true });
```

Manifests 會依一個明確的允許集合（allow-set）過濾，並依 `order` 排序：

```ts
const OFFLINE_READY_MODULES = new Set(['writing-challenge', 'word-sets', 'practice-english', 'copybook', 'my-characters']);
```

只有在此集合中的模組才會出現在主畫面上。它是一個「完全在裝置上運作」模組的納入清單（inclusion list）
——**並不是**返回鈕的排除清單（見 §5）。

### 執行期進入點：`src/index.ts` 的 default export

每個模組的 `src/index.ts` 以 default export 匯出一個接收 `ModuleProps` 的 React 元件：

```ts
interface ModuleProps {
  userId: number;       // the active profile id
  language: Language;   // 'zh-TW' | 'en' — UI language, owned by the platform
  onExit?: () => void;  // return to the home / module picker
}
```

`App.tsx` 會延遲載入（lazy-load）所選模組，並把它渲染在一個 app 外殼內：

```tsx
<div className={`app-shell app-shell--${activeModule}`}>
  <ModuleComponent userId={user.id} language={language} onExit={onBack} />
</div>
```

平台把它的退出處理函式以 `onExit` 串入。它 **不會** 畫出返回鈕，也不維護任何模組層級的排除清單
——返回鈕由模組自行擁有（§5）。

### 伺服器端（僅供開發）：`server/index.ts` 的 `routes`

當開發用的 Express 伺服器啟動時，`platform/server/module-loader.ts` 會掃描 `modules/*`，讀取每個
`module.json`，動態匯入 `server/index.ts`，並收集 `{ manifest, routes, initDb }`。每個模組的
`routes`（一個 Express `Router`）會被掛載在其 `apiPrefix`，而 `initDb()` 會在啟動時呼叫一次：

```ts
for (const mod of modules) {
  app.use(mod.manifest.apiPrefix, mod.routes);
}
```

因此一個模組的伺服器契約是：`export const routes = Router()` 與 `export function initDb() {…}`。
在正式環境中這些路由不會執行；需要線上能力的模組改用 Cloudflare Pages Function（§6）。

---

## 3. 本地優先資料

部署後的 app **完全在用戶端（client-side）執行**。所有練習都針對以 [sql.js](https://github.com/sql-js/sql.js)
（WASM）載入瀏覽器的 SQLite 資料庫進行，而每台裝置的使用者進度則存在 IndexedDB 中。

```
                 build time                          runtime (browser)
  canonical DBs ──bake-data.ts──▶ public/data/*.db ──fetch──▶ IndexedDB cache
  (platform.db,                   + version.json              │
   *.db per module)                                           ▼
                                                       sql.js (WASM) in memory
                                                              │
                                  DbQueryProvider ◀───────────┘
                                       │
        @shared/character-stats (ranker, knowledge, mastery, generator)
                                       │
                                  React UI
```

### sql.js + `DbQueryProvider`

`platform/src/offline/sql-db.ts` 初始化 sql.js（其 WASM 透過 `sql.js/dist/sql-wasm.wasm?url` 與 app
一同打包，因此完全離線運作——不需 CDN），並把一個 `Database` 包進 `DbQueryProvider`——這是一個小型的
`queryAll / queryOne / run` 介面（`shared/src/types.ts`），由瀏覽器（sql.js）與開發伺服器
（better-sqlite3）**雙方共用**。所有純粹的共用邏輯都針對此介面撰寫，因此同一套排名／選字程式碼在兩處
執行結果完全相同。

### 離線資料層

`platform/src/offline/offline-data-layer.ts`（`OfflineDataLayer`）是執行期的核心。在 `initialize()` 時它會：

1. 啟動 sql.js。
2. 載入四個出貨 DB（`platform`、`content`、`writing-challenge`、`word-sets`）——若已快取則從 IndexedDB
   載入，否則從 `/data/<name>.db` 下載並儲存（`db-store.ts`）。課程內容（`bank_sentences`、
   `tocfl_words`、`char_words`）存放於 **`content.db`**（§3.5），而非 writing-challenge 模組 DB。
3. 載入離線的筆順資料 bundle（`stroke-data.ts`）。
4. 解析出唯一的本機裝置使用者，並對外提供 profiles、字符統計、排名、levers（設定）、等級、目標字，
   以及 `generateNextSentence`。

`OfflineProvider` / `useOffline`（`offline-context.tsx`）包住這一切並對整個 app 提供，且在 `isReady`
之前不渲染任何內容。

### 筆順渲染 — `WritingCanvas` + hanzi-writer（切勿逐字重新掛載）

`components/WritingCanvas.tsx` 以
[hanzi-writer](https://github.com/chanind/hanzi-writer) 渲染離線筆順資料。**hanzi-writer 沒有
`destroy()`，而且每次 `HanziWriter.create()` 都會永久洩漏兩個全域 `document` 監聽器**
（`mouseup`／`touchend`）。因此 canvas 只 **建立** 每個 `HanziWriter` **一次**，並透過在常駐
實例上呼叫 `writer.setCharacter()` + 重新 `quiz()` 來以命令式驅動字符變更：

- **陷阱：切勿用逐字符的 React `key` 重新掛載 `WritingCanvas`。** 舊有的逐字符 `key` 重新掛載
  （位於練習頁／`PracticeModal`）已被移除，因為它會重跑 `create()`——**每次** 換字都洩漏一對監聽器。
  建立 effect 現在只依結構性設定（size／模式／leniency）為鍵，且清理時呼叫 `cancelQuiz()`，使被遺棄的
  quiz 那些洩漏的全域監聽器變成無作用，而非劫持當前活躍的 canvas。
- 新增的 **`quizSession`** prop 讓父層能要求對 *同一個* 字形重新 quiz（失敗後的必須重練，或連續重複的
  字符）——這些是單純比較 `character` 會漏掉的情況——而不必重建 writer。
- **例外：** `PlacementTest.tsx` 刻意保留其 `key={seq}` 重新掛載。該接縫會重跑安置頁的掛載 effect 以
  抓取下一題並重置頁面狀態（屬 PracticePage 層級、沒有命令式重載 hook 的工作），且每 **題** 觸發一次
  （一次性導引中約 10 次，而非每字符），因此 writer 的耗損可忽略不計。

### 每台裝置的儲存

- **內容**（字典、句子銀行、TOCFL 詞、word sets、筆順資料）：唯讀、出貨、快取在 IndexedDB 資料庫
  `learning-chinese-dbs` → object store `databases`。已快取的內容版本記錄於 `metadata` store。
- **使用者資料**（profiles、每字統計、偏好設定、lever 覆寫）：屬於每台裝置，永不上傳。烘焙出的
  `platform.db` 快照在烘焙時 **會被清除（scrubbed）** 所有個人列（§4），因此全新安裝時是空白起步；
  既有裝置則在 IndexedDB 中保留各自的進度。
- 備份／還原是手動的 JSON 匯出／匯入（`offline/backup.ts`），並在 Device Settings 中提供選擇性的
  逐 profile 還原。備份也會帶上裝置層級的功能解鎖與主題狀態（§5.5），因此所選外觀與任何付費解鎖
  都會隨帳號一起帶走。

#### 連線衛生（記憶體洩漏修正）

IndexedDB 連線與記憶體中的 sql.js heap 都是長壽且容易洩漏的——以下是刻意的修正，並非附帶現象：

- **每個 store 池化單一 `IDBDatabase`。** `offline/user-store.ts` 與 `offline/db-store.ts` 各自
  **memoize 單一個開啟的連線**（快取一個 `dbPromise`）並在所有 helper 間重用。先前每次呼叫都會開啟
  ——且從不關閉——一個全新的 `IDBDatabase`，因此熱路徑（`recordAttempt` → `putProfileCharStats`、
  `getPref`／`setPref`）會不斷累積開啟的連線。該快取會在 `onversionchange`（先 `close()`，所以同源升級
  不會被擋）與 `onclose` 時丟棄，且被拒絕的 open 永不快取，因此下次呼叫會乾淨地重新開啟。
- **sql.js 先關閉再重開。** `OfflineDataLayer.refreshFromServer()` 現在會在以刷新後的位元組重開
  `platform`／`module`／`content` 三個 `Database` **之前先 `.close()` 舊的**。每次 `openDatabase` 都會
  配置一個全新的約 18 MB WASM heap，因此未關閉就重新指派會在每次內容刷新時洩漏先前的 heap。

> **雲端同步是「計畫中」，尚未建置。** 目前唯一的跨裝置傳輸就是上述手動 JSON 備份／還原。程式中有一個
> 為未來同步而搭好的離線變更佇列（`offline/sync-queue.ts`），但沒有任何伺服器端點消費它，正式環境中
> 也沒有任何東西會上傳使用者資料。

---

## 3.5 課程內容 — 平台所擁有的 `content.db`

**課程內容**——練習句子銀行（`bank_sentences`）、TOCFL 詞表（`tocfl_words`）及其逐字索引
（`char_words`）——是 **平台所擁有的**，存放在它自己的標準 DB **`platform/content.db`**。它過去存在於
`modules/writing-challenge/writing-challenge.db` 內；後來被抽離出來，讓每個模組都只是單一共用課程的
純*消費者*（writing-challenge 鑽練它、practice-english 讀取它做克漏字、開發用 admin 策劃它）。

- **存取器** 是 `shared/src/content-db.ts`，匯出為 `@shared/character-stats/content-db`。它以
  better-sqlite3 開啟 `content.db`（僅 Node 端——開發伺服器 + scripts），冪等地確保 schema，並提供
  銀行 CRUD（`addBankSentences`、`getAllBankSentences`、`searchBankSentences`、`updateBankSentence`、
  `deleteBankSentence(s)`、`restoreBankFromBaked` …）以及 TOCFL 輔助函式（`getTocflWords`、
  `getCharTocflLevels`、`getCharZhuyin`）。
- **消費者：** 開發用 content-admin 路由（`platform/server/content-admin.ts`，§8.4）與
  writing-challenge 的開發伺服器（`server/word-selector.ts`、`import-tocfl.ts`、`tag-grammar.ts`）
  都**只**透過此存取器、或直接開啟 `content.db` 來讀寫內容——絕不碰模組 DB。
- **出貨：** 烘焙（§4）會把 `content.db` 快照成 `/data/content.db`；離線資料層把它當作 `content` DB
  載入。**writing-challenge 快照會被剝除** `bank_sentences`、`char_words`、`tocfl_words`（它現在只
  帶有自己的 `module_settings` + 僅供開發的 per-profile 表）。
- **進度維持獨立。** 每個 profile 的進度（字符統計、設定、lever 覆寫）**不在**這裡——它存放於
  `platform.db` + 裝置端 IndexedDB user-store，內容抽離完全不影響它。

### 字形正規化 — 單一的台灣繁體標準形式

**匯入路徑**（`content-db.ts` 的 `canonicalizeTW()`，由 `addBankSentences` 執行）與 **離線 scrub**
（`scripts/bank-fix.py` 的 `canon()`）共用*同一套*正規化，因此銀行永遠只儲存每個字的單一標準字形：

1. **簡體 → 繁體（台灣標準）**：透過 OpenCC（JS 用 `cn`→`tw`、Python 用 `s2tw`），讓產生器夾帶的
   簡體永遠進不了銀行。
2. **台 與 臺 兩者都保留——永不轉換。** OpenCC 會把 台→臺，所以兩者都用私用區（PUA）哨符
   （`U+E000` / `U+E001`）在 OpenCC 過程中屏蔽起來，之後再原樣還原。兩者都是有效的台灣形式。
3. **無法書寫的異體字會被統一到其已排名 + 可書寫的標準形式**：透過共用的 `VARIANT_MAP`
   （`汙→污`、`祕←秘`）。該異體字既不在字符排名中、也不在 hanzi-writer 筆順資料中，App 根本畫不出來
   ——因此把它折疊進那個*確實*已排名且可書寫的標準形式。

`bank-fix.py` 另外還會合併正規化後相撞的列（刪除重複者），是冪等的，會先備份 DB，且只回報數量。
它針對 `platform/content.db` 執行。

---

## 4. Bake／deploy 資料管線

`platform/scripts/bake-data.ts`（透過 `npm -w platform run bake:data` 執行，並自動作為 `build` 的
前半部）產生出貨的內容：

1. **快照各 DB** — 對每個來源（`platform.db`、**`content.db`**、`writing-challenge.db`、`word-sets.db`），
   它使用 better-sqlite3 的線上 `backup()` API（因此即使開發伺服器正在執行，WAL 內容也會被納入、快照仍
   一致），產出到 `public/data/<name>.db`。
2. **清除平台快照** — 刪除 `character_stats`、`users` 與 `user_settings`，然後做 `VACUUM`，因此部署後
   的 app **只出貨內容**，永不出貨任何人的進度。
3. **從 writing-challenge 快照剝除內容** — 丟棄 `bank_sentences`、`char_words`、`tocfl_words` 後做
   `VACUUM`，因為那份課程是平台所擁有的、改由 `content.db` 出貨（§3.5）。模組 DB 隨後只帶有自己的
   `module_settings`（+ 僅供開發的 per-profile 表）；舊的已快取模組 DB 會在下一次 `contentHash`
   變動時自然失效並重新下載。
4. **烘焙筆順資料** — 建置 `public/data/stroke-data.json`，這是一個單一 bundle，把每個字典字符對應到其
   hanzi-writer 筆順資料，並套用來自 `public/stroke-data/` 的本地台灣筆順變體覆寫。這就是讓手寫練習能
   離線運作的關鍵。
5. **寫入 `version.json`**，含兩個不同的指紋（fingerprint）：

```jsonc
{
  "version":     "<sha256(contentHash + builtAt)>",  // per-BUILD, always unique
  "contentHash": "<sha256 of the per-file hashes>",   // data-only fingerprint
  "files":       { "platform": { size, hash }, … },
  "builtAt":     "<ISO timestamp>"
}
```

### `version` vs `contentHash` — 為何要兩個

- **`contentHash`** 只在 **烘焙出的資料改變時** 才改變。離線層用 `contentHash` 來控制那（約 18 MB 的）
  DB 重新下載閘門——因此只改程式碼的部署 **不會** 強迫每台裝置重新下載資料庫。沒有 `contentHash` 的舊
  `version.json` 檔會退回使用 `version`。
- **`version`** 把一個全新的 build 時間戳記摺進內容雜湊裡，因此 **每一次** build／deploy 都會得到一個
  獨特的值——即使資料與程式碼都沒變也是如此。這就是 `vite.config.ts` 烘焙進 bundle 的 `__CONTENT_VERSION__`
  全域變數，也是裝置對伺服器的比對 + Settings 的「有可用更新」顯示所讀取的值。在 JS 中引用它，會讓 bundle
  在任何部署時都產生位元組變化，因此 service worker 的更新偵測（以及「有新版本」橫幅）會正確觸發。

```
                bake-data.ts
                     │
       ┌─────────────┼──────────────────┐
       ▼             ▼                   ▼
  contentHash    version           __CONTENT_VERSION__ (vite define)
  (data only)    (per build)             │
       │             │                    └── baked into JS bundle
       ▼             ▼                        → SW update banner fires per deploy
  gates DB      device-vs-server
  re-download   compare + Settings display
```

PWA service worker（`vite-plugin-pwa`，`registerType: 'prompt'`）會預先快取 app 外殼 + sql.js WASM，
並且 **等待** 而非靜默替換，因此 app 可以顯示「有新版本可用」橫幅。`/data/*` 資源刻意 **不** 被
Workbox 快取（資料層在 IndexedDB 中自行管理它們）；`/data/version.json` 不快取，因此存活性／版本探測
（liveness/version pokes）會打到網路。

---

## 4.5 測試與 CI/CD

測試使用 **Vitest**（TypeScript，根目錄 `vitest.config.ts`）加上 Python 字形清理的**單一 pytest**。
指令：`npm test`（全部）、`npm run test:unit`（`shared/` + `platform/src/`，快速）、
`npm run test:data`（部署閘門）。共三層：

- **純邏輯單元（`shared/src/__tests__`）**——引擎：`sentence-generator`（**綁定**不變量——所選目標字
  必定出現在回傳文字中——加上以 seeded RNG 測 parity／涵蓋率）、`mastery`、`char-knowledge`、
  `char-ranker`、`zhuyin`。`DbQueryProvider` 以記憶體假物件代替；`Date.now()` 以
  `vi.setSystemTime` 控制；RNG 以 seeded `Math.random` stub 控制。
- **字形正規化對等**——`canonicalizeTW()`（TS 匯入器，由 `content-db.ts` 匯出）與
  `bank-fix.py canon()` 是同一條規則的兩個實作，**必須一致**。兩者都對同一份黃金樣本
  （`test/fixtures/glyph-canon.json`）執行：保留 台/臺、`VARIANT_MAP` 統一、簡體→繁體、冪等。
  `bank-fix.py` 具破壞性的流程以 `__main__` 包住，讓測試能匯入 `canon()`；Python 測試會
  `pytest.importorskip("opencc")`，因此本機未裝 opencc 時自動略過。
- **資料完整性部署閘門（`platform/test/data-integrity.test.ts`）**——對**烘焙後**的
  `platform/public/data/*`（即出貨內容）執行：SQLite `integrity_check`；銀行句子無簡體／無法書寫的
  字形（`canon(s) === s`）且參照完整；快照**不含個人資料**（`platform.db` 已清除使用者／統計，
  `writing-challenge.db` 僅留 `module_settings`）；且銀行句子用到的每個課程字都有內建筆順資料
  （可離線書寫），並附一份小而有記錄的 allowlist 收容無任何開放資料集涵蓋的字。見 §3.5／字形正規化說明。

**測試紀律——貢獻者的責任。** 上述閘門守護的是*出貨資料*，無法攔截引擎的回歸。因此**任何**變更都要評估是否需要新增或更新測試，並把測試影響記在 issue spec／PR 裡；新引擎邏輯或修好的 bug，會在同一個 PR 內附上守護它的單元／對等測試。把測試套件維持成保養良好的機器是貢獻者的工作，不是靠部署閘門兜底的。

**CI/CD —— `.github/workflows/ci.yml`。** 單一 job，觸發於 `pull_request` 與 `push: master`：
`npm ci` → 單元測試 → Python 對等測試（`pip install opencc pytest`）→ `npm run build -w platform`
→ **資料完整性閘門** → `cloudflare/wrangler-action` 部署 →（僅 PR）留言 preview + `/?app&demo` 網址。
任一步驟失敗都會在部署前中止，因此壞內容／程式碼無法出貨。

Cloudflare 以部署的 `--branch` 是否等於專案的 **production 分支** 來判定 preview／production；此
*direct-upload*（無 Git 連接）Pages 專案的 production 分支是 **`learning-chinese`**（不是 `master`）。
因此 workflow 在 `master` push 時傳 `--branch=learning-chinese`（→ **production**，
`learnchinese.hsu.mobi`），PR 時傳 `--branch=<PR head>`（→ 有獨立網址的 **preview**）。兩者相同的
建置 + 閘門——正式環境只是鏡像 preview 流程。**一次性設定：** repo secrets `CLOUDFLARE_API_TOKEN`
（Pages:Edit）+ `CLOUDFLARE_ACCOUNT_ID`，並把 CF 專案 production 分支設為 `learning-chinese`。
（token 注意：貼進 token secret 的非 ASCII 字元會讓 wrangler 在送出前以 `ByteString` header 錯誤失敗
——重新產生並貼上乾淨的 token。）

**可重現建置 + seeds。** `bake-data.ts` 優先讀取存在的工作用 DB，否則讀取 committed 的僅含內容
**seed**（`seed/platform.db`、`seed/writing-challenge.db`），讓 CI 不需 gitignore 掉的工作用 DB
（內含開發者 profile 的進度）也能建置。`npm run seed:dbs` 會重新產生 seeds，並套用與 `bake` 相同的
個人資料清理。`content.db` 與 `word-sets.db` 為純內容，直接 commit 在其工作路徑；
`platform/public/stroke-data/`（手作台灣筆順 override 為/說/齣…）也會 commit，讓 CI 一併打包。
**沒有**本機自動部署——部署只透過 CI 發生。

**變更後重新部署**（沒有手動部署——開 PR、看 preview、合併）：
- **程式碼變更** → PR → preview → 合併到 `master` → production。自動。
- **課程／內容變更**（用 dev admin 改 `content.db`，或重建模組 DB）：另外執行 **`npm run seed:dbs`**
  並 commit 更新後的 `seed/*.db` + `content.db`，讓 CI 建置新內容；閘門會重新檢查字形／涵蓋率／隱私。
- **新增筆順 override**：把 `<字>.json` 放進 `platform/public/stroke-data/`，下次 bake 會打包；
  接著把該字從閘門的 `STROKE_ALLOWLIST` 移除，使涵蓋率被強制檢查。
- **Demo 資料變更**：在 `platform/src/offline/demo.ts` 提升 `DEMO_VERSION`，讓每位回訪的 demo 訪客重新種子。

## 4.6 Demo／「試用」模式

`/?app&demo` 會啟動真正的 local-first app 並預先種入預設 profiles——免安裝的公開試用（行銷網站連到此）。
`?app` 讓 app 略過行銷 landing（`App.tsx` 的 `shouldShowLanding`）；`?demo`（於 `platform/src/offline/demo.ts`
讀取）做兩件事：

1. **隔離儲存。** IndexedDB 以 **origin** 為界（非 path），所以真實網域上的 `?demo` 否則會與已安裝使用者
   共用、甚至覆蓋其資料。改由 `user-store.ts` 在 `?demo` 時開啟獨立 DB `learning-chinese-user-demo`，
   種子／清除永不觸及真實使用者。
2. **種子 + 版本檢查。** `ensureDemoSeed()`（於 `OfflineProvider` 在 `initialize()` 後呼叫）以字頻排名
   在執行期合成 Beginner（約 120 個已知字）+ Intermediate（約 700）profiles（`getCharRanking` +
   `seedKnownFromPlacement`），並蓋上 `__demoVersion` pref。同版本的回訪者保留其 session；提升
   `DEMO_VERSION` 則讓所有人重新種子。無需維護打包資料集。（純 `/?demo` 或 `/try` 需要改一行
   `shouldShowLanding` 或加 `_redirects`——為避免在主題重構進行中動到 `App.tsx`，刻意延後。）

**裝置閘門——僅限手機／觸控（#66）。** 示範是手機 PWA 體驗（安裝 + 觸控介面），所以在示範路徑上的
**桌機**訪客會被擋在示範之外，改看到「用手機開啟」的 QR 面板，而不是一個滑鼠驅動的破碎示範。這個閘門
是與 `evaluateDemoMode` **分離**的判斷式，所以 jar 隔離不變：桌機示範訪客**仍然**是示範 session（隔離的
`-demo` jar）——app 只是不為他們**啟動**示範，因此絕不會被導向真實的 `learning-chinese-user` jar。
`demo-mode.ts` 匯出 `isDemoDeviceAllowed(DeviceEnv)`（純函式——`pointer: coarse` 或 `hover: none` 或
`ontouchstart`／`maxTouchPoints > 0`；能力偵測，**非** UA 字串嗅探），以及記憶化的
`isDemoDeviceGated()` = `isDemoMode() && !isDemoDeviceAllowedNow()`。被擋時，`App.tsx` 會渲染 lazy 的
`DemoGate`（QR 來自 `utils/qr.ts` 那個無相依、自帶的產生器，且 lazy 載入，永不進入 app shell）取代
`<AppInner>`。真實／已安裝 app、dev／LAN host 與 `?landing` **永不**被擋。**僅限用戶端**——靜態 Pages
沒有執行期伺服器可強制裝置閘門，這是瀏覽器端的能力檢查。應用內的 **landing**（`LandingPage.tsx`）以
「打開線上示範」CTA（位於讀文筆記本下方，en + zh-TW）連到示範（`?app&demo`）；桌機上該連結會落在 QR
fallback，而非死路。

---

## 5. UI kit（`platform/src/ui`）

每個模組都據以組合的共用設計基本元件（design primitives），而非自行重新實作那套「cartoon-candy」外觀。
完整細節見 **`platform/src/ui/README.md`**；簡述如下：

- `<Button variant="primary|secondary|ghost">` — 3D 糖果按鈕。
- `<ModuleScreen title onBack? backLabel? children>` — 標準的模組 **主畫面** 外殼（返回膠囊鈕 +
  奶油色卡片 + 標題）。返回膠囊鈕 **只在有給 `onBack` 時** 才渲染。
- `<Card>` — 用於整頁畫面以外處的奶油色面板外觀。
- `<BackButton>` — 供非主畫面使用的 **共用** 獨立返回膠囊鈕（每個模組重用的同一個元件，而非各自特製）。
- `<CharTile>` — 共用的字符卡片（排名／等級／熟練度條／近期結果圓點／緞帶），由「我的字」、「接下來練」
  字片與 word-set 清單重用；也會套用主題（§5.5）。
- Barrel：`import { Button, ModuleScreen, Card, BackButton, CharTile } from '@platform/ui/index.ts'`。

**設計 token 是單一真實來源（single source of truth）**：所有顏色／尺寸／字型都是
`platform/src/index.css` 中 `:root` 上的 CSS custom properties（奶油色表面 `#FFF8E0`、紫色邊框
`#5A1A96`、深青色 `--bg`、`--font`、`--radius`、`--shadow3d` 等）。模組使用 `var(--token)`，且不得分叉
或重新宣告它們。此 kit 的樣式表 `ui-kit.css` 由 `main.tsx` **匯入一次**；模組絕不匯入它。它的選擇器以
`.app-shell` 為前綴，因此能在模組的 scoped CSS reset 中存活。

**返回鈕由模組擁有。** 平台傳遞 `onExit`，本身不畫任何返回鈕；每個畫面自行決定是否顯示返回鈕（透過把
`onBack` 傳給 `<ModuleScreen>` 或渲染 `<BackButton>`）。平台沒有任何返回鈕排除清單。

---

## 5.5 主題系統（`platform/src/theme`）

一套由註冊表（registry）驅動的主題系統，在預設外觀之上疊加一層可選的替代皮膚。今天出貨六款主題——
**Default**、兩款付費 foil 皮膚 **Gold**（暖金箔）與 **Silver**（冷鉑金），以及三款免費皮膚
**Midnight**（墨夜，深色 ink 模式）、**Sakura**（櫻花，暖粉淺色）與 **Matcha**（抹茶，鼠尾草綠淺色）
——新增一款只需在註冊表中加一筆。

- **契約 + 目錄** 是 `theme/themes.ts`：一個 `THEME_TOKENS` 允許清單（一個主題可設定的具名 CSS custom
  properties——背景、foil 家族、卡片臉／框／字形、按鈕家族、文字家族／縮放／字重，以及模組選擇的
  `arrangement`）加上 `THEMES` 註冊表（`id`、`name`、`premium`、`arrangement`）。**Default** 不設定任何
  token——`:root` 的編輯設計值即為其外觀，因此預設外觀與導入主題前位元組完全相同。
- **Token 值存在 CSS 中**，不在註冊表裡：每款非預設主題都是一個 `body[data-theme="<id>"] { … }`
  區塊——可內嵌在 `index.css`（Gold/Silver），或放在獨立的 `theme/theme-<id>.css` 檔並於
  `main.tsx` 匯入（Midnight/Sakura/Matcha），把較大的免費皮膚移出全域樣式表，同時仍贏得 cascade
  （在 `index.css` 之後匯入）。兩種方式都純粹疊加在預設外觀之上，且範圍鎖在 `data-theme` 屬性後面，
  絕不會洩漏到預設外觀。cascade、`::before/::after`、media query 與動畫都原生運作。
- **套用**（`App.tsx`）：有效主題 id 寫入單一的 `<body data-theme="<id>">` 屬性（`default` 則整個移除）。
  這 **取代了舊有的臨時 `data-premium` 疊層**（以及「唯一指定裝置」的 `isGoldDevice()` / `GOLD_DEVICE_ID`
  閘門）——兩者皆已移除。
- **解析 + 儲存**（`theme/theme-store.ts`）：兩個層級，與英文語音選擇的方式對應——
  - **裝置主題** — 整台裝置的單一選擇（`localStorage` `lc-gold-mode`，沿用舊鍵，讓既有裝置保留其選擇），
    由每個 profile 共享。
  - **Profile 覆寫** — 可選的逐 profile 選擇（`localStorage` `lc-theme-u<id>`）；`null`／不存在 → 繼承裝置主題。
  - **有效主題 = `profileOverride ?? deviceTheme ?? 'default'`**（`resolveEffectiveTheme`），帶有安全網：
    若解析出的主題是付費的、但付費 **在此裝置上未解鎖**，則退回 `default`（因此被撤銷的解鎖、或還原的備份，
    絕不會渲染出使用者無法觸及的受限外觀）。
- **付費閘門。** Gold/Silver 是**唯二**的 `premium: true` 主題，各自以**自己的代碼獨立**、**僅限裝置層級**
  解鎖（§5.6），且都**閘控在付費前置代碼 `9000` 之後**：先兌換 `9000`，再以 **`9900` → Silver**、
  **`9901` → Gold**（每個主題項帶有 `unlockFeature` 鍵——Silver ← `theme-silver`、Gold ← `theme-gold`）。
  `9000` 本身**不顯示任何主題**；在 `9000` 之前輸入 `99xx` 會**被當成一般無效代碼拒絕**（與未知代碼相同的
  「代碼無效」，不暗示其為真——見 §5.6）。*向後相容：* 已存有舊版
  總括 `premium` 旗標（已停用的 `9999`）的裝置仍保有**兩款**金屬皮膚。以上皆透過 `utils/unlocks.ts`
  `lc-unlocks`，在裝置設定的 Device ID 下兌換，套用到每個 profile。Midnight/Sakura/Matcha 是
  `premium: false`，因此一律可用，不需任何代碼。**沒有 per-profile 解鎖**：profile 只能在裝置已可用的主題之間
  *覆寫*（`theme-store.ts` 的 `isThemeAvailable()` 為逐主題判斷；`isDevicePremiumUnlocked()` 為粗略的
  「任一金屬皮膚」訊號）。因此主題選擇器（`components/ThemeSelect.tsx`）**只列出可用的主題**——Default
  與三款免費皮膚一律顯示，兌換 `9900` 後加上 Silver、兌換 `9901` 後加上 Gold，**彼此獨立**；鎖住的付費皮膚**完全不顯示**（沒有鎖定徽章、也沒有選取即兌換）。
  **Profile 選擇器** 只在某 profile *自己的*覆寫為 Gold/Silver 時才顯示其皇冠（`👑` 金／`♔` 銀）——
  僅僅繼承付費*裝置*主題（沒有覆寫）的 profile 則沒有。
- **備份。** 主題狀態——裝置主題與逐 profile 覆寫——會被序列化進 JSON 備份（`exportThemeState` /
  `importThemeState`），讓所選外觀隨帳號帶走。裝置付費解鎖則在備份的功能解鎖集合（`lc-unlocks`）中帶走，
  還原時加性合併（never dropped）。

---

## 5.6 代碼輸入鍵盤（`platform/src/components/CodeEntry.tsx`）

一個可重用的螢幕 **4 位數字鍵盤**，用來兌換簡短的功能代碼。它渲染一個 0–9 鍵盤（加退格鍵）與一個
4 格進度指示器，在第 4 個數字落定的那一刻自動送出，然後顯示一個 **會自動消失的結果 modal**（約 2.2 秒，
點按也會關閉）。實體鍵盤輸入同樣可用（0–9 / Backspace / Escape）。

此鍵盤是 **與供應者無關（provider-agnostic）** 的——它不知道一個代碼代表什麼。呼叫端傳入 `onSubmit(code)`，
它在自己的作用域內兌換該代碼並回傳一個**可辨識的 `CodeResult`**——`{ status: 'granted', feature }`、
`{ status: 'prerequisite-missing', required }` 或 `{ status: 'unknown' }`。鍵盤把每個 `granted` 的 feature
對應成各自的成功訊息 + emoji，並在 `granted` 時觸發 `onUnlocked(feature)`。但 **`prerequisite-missing` 與
`unknown` 渲染完全相同**——通用的「代碼無效」❌——這是刻意的（以模糊求安全）：在前置之前輸入的有效但鎖定的
代碼（如 `9000` 前的 `9900`）與真正的無效代碼無從分辨，**完全不暗示**該代碼是真的或存在前置代碼。兩者皆不授予任何東西。

代碼集中在一處，`utils/unlocks.ts` 的 `CODE_FEATURES`，是一套**兩階、前置鏈結**的方案。每個系列以一個
**前置代碼**開頭，授予一個*本身不顯示任何東西*的旗標；功能代碼在該前置旗標出現前一律**被拒絕**（不授予任何
東西——且在鍵盤上顯示為一般的「代碼無效」，見下）：

- **付費系列** — **`9000`** 授予 `premium-prereq`（前置，本身不顯示任何東西）；**`9900`** → `theme-silver`（Silver）、
  **`9901`** → `theme-gold`（Gold），兩者都需先有 `9000`（否則為前置缺失）。獨立地解鎖 Gold/Silver 主題（§5.5）。
- **Admin 系列** — **`8000`** 授予 `admin-prereq`（前置，本身不顯示任何東西）；**`8001`** → `admin`，需先有 `8000`。
  `8001` 即**已停用的 `8888`** 過去的 Admin 選單揭示功能（§8）。
- **已移除：** `9999`（舊版總括付費）與 `8888` 不再兌換。*向後相容：* 已存有 `premium` 的裝置保有兩款金屬皮膚；
  已存有 `admin` 的裝置保有 Admin 選單——閘門直接尊重這些鍵。

`redeemCode` 為閘門邏輯區分三種結果（granted／prerequisite-missing／unknown），但 **鍵盤將
`prerequisite-missing` 渲染得與 `unknown` 完全相同**——通用的「代碼無效」——因此有效但鎖定的代碼
**完全不暗示**其為真或存在前置代碼（以模糊求安全，issue #40 修訂）。由 **裝置設定**（裝置作用域兌換，
透過 `redeemCode` → `lc-unlocks`）與主題解鎖流程使用。

---

## 6. Cloudflare Pages Functions — Gemini 代理

正式環境中唯一的伺服器端程式碼。copybook 模組的「Generate」按鈕需要呼叫 Gemini，而瀏覽器無法直接做到
（CORS），且必須不外洩金鑰。有兩個 Pages Functions 位於 `platform/functions/api/copybook/`：

- `generate.ts` → `POST /api/copybook/generate` — 產生一個經驗證的台灣繁體句子。
- `test-key.ts` → `POST /api/copybook/test-key` — 探測使用者提供的 Gemini 金鑰是否有效（一個免費的
  models-list GET；不耗用任何 generate 配額）。

兩者都 **重用同一個可攜式輔助函式** `modules/copybook/server/gemini.ts`（無相依、使用全域 `fetch`），
它同時也支撐 `modules/copybook/server/index.ts` 中的開發用 Express 路由。沒有任何邏輯被重複實作。

```
browser (copybook "Generate")
   │  POST /api/copybook/generate  { targetChar, knownChars, level, rankCeiling, apiKey? }
   ▼
Cloudflare Pages Function (functions/api/copybook/generate.ts)
   │  apiKey = client BYO key  ||  env.GEMINI_API_KEY (encrypted Pages secret)
   ▼
modules/copybook/server/gemini.ts → Google Gemini generateContent
   │  validate: Traditional-only (reject Simplified leaks), contains target char,
   │  6–15 Han chars; retry up to 3×
   ▼
{ sentence } | { error }
```

金鑰是每個 profile 自帶（在請求中暫時傳送，僅儲存在裝置上）以及／或是 Pages secret `GEMINI_API_KEY`。
金鑰只用於該單一請求，且永不在伺服器端記錄或持久化。這些 functions 位於 `platform/tsconfig` 的 include
之外，所以 `tsc`／vite 會忽略它們；wrangler 會在部署時編譯它們。預設模型是 `gemini-2.5-flash`
（可透過 `GEMINI_MODEL` 覆寫）。

---

## 6.5 意見回饋（siloed）

> English: [ARCHITECTURE.md "Feedback (siloed)"](./ARCHITECTURE.md)

app 內的意見回饋（feedback）功能讓使用者可以從 app 的任何畫面送出一則分類後的回報，並讓擁有者有一個
triage（分流）檢視。它最重要的特性是 **siloed（孤島化）**：正式環境的端點綁定到一個**只存放回饋的專屬
D1 資料庫與 R2 bucket**，而且該 Function 上**沒有任何 app／使用者／內容的 binding**，因此從回饋的程式碼
路徑「在物理上」就無法觸及 app 資料。開發環境的鏡像也以同樣方式孤島化（自己的 SQLite 檔）。此功能不與
`platform.db`／`content.db`／裝置上的 user store 共用任何連線、檔案或程式碼路徑。

### 回饋 widget（`platform/src/FeedbackWidget.tsx`）

一個全域的浮動 💬 按鈕，位於右下角，**只在 app shell（`App.tsx`）掛載一次**，因此在整個 app 中都存在。
它刻意**不**出現在行銷登陸頁。點開後是一個對話框，包含：**分類**（`bug`／`suggestion`／`content`／
`confusing`／`other`）、**嚴重度**分段（`low`／`medium`／`high`）、自由輸入的**訊息**（上限 4000 字），
以及一個**附上截圖**的勾選框。

- **僅限線上。** 送出回饋需要網路；離線時送出按鈕會停用（以 `online`／`offline` 監聽追蹤
  `navigator.onLine`）。
- **延遲載入的截圖管線。** DOM 轉圖片的函式庫（`html-to-image`）**只在真正擷取截圖時才動態 import**，
  因此永不進入離線 app shell 的關鍵路徑或 precache。擷取會把 `document.body` 渲染成一張縮小的 JPEG
  （以 `pixelRatio` 把最長邊縮到約 900px 等效、品質從 0.7 起跳），並**逐步降低品質直到落在約 300 KB 的
  目標以下**；若仍塞不下就優雅地捨棄（回饋照樣送出——缺少截圖從來不是錯誤）。
- **不含 PII 的上下文。** 除了訊息之外，widget 只擷取非個人的上下文：目前的**畫面**
  （`body[data-screen]`）、目前**模組**、app **版本**（`__CONTENT_VERSION__`）、**數字 profile id**、
  **主題**、**語言**、**viewport** 尺寸、**online** 狀態、**user-agent**，以及一個**時間戳**。沒有顯示
  名稱、沒有學習統計、沒有字符／句子——除了數字 profile id 以外，app 與使用者資料一律不送出。

### 正式環境 API — Cloudflare Pages Functions（`platform/functions/api/feedback/`）

| 路由 | Method | 對象 | 作用 |
|------|--------|------|------|
| `/api/feedback`（`index.ts`） | `POST` | **公開** | 送出。經驗證 + 大小上限（共用輔助函式）+ 每 IP 限流；資料列存入 D1、截圖位元組存入 R2（key `feedback/<id>.<ext>`），資料列只保留 R2 key。 |
| `/api/feedback`（`index.ts`） | `GET` | **管理** | 列出供 triage（`?status=` 篩選、`?limit=`），並附每個狀態的計數。列表回應不含截圖。 |
| `/api/feedback/:id`（`[id].ts`） | `PATCH` | **管理** | 設定單列的生命週期狀態（`new`／`triaged`／`in-progress`／`resolved`／`wontfix`）。 |
| `/api/feedback/:id/screenshot`（`[id]/screenshot.ts`） | `GET` | **管理** | 從 R2 串流該列的截圖位元組。 |

與 Gemini 代理一樣，這些 functions 位於 `platform/tsconfig` 的 include 之外（所以 `tsc`／vite 會忽略
它們），由 wrangler 在部署時編譯。

- **為何 siloed。** 送出／管理的 Functions **只**宣告 `FEEDBACK_DB`（D1）與 `FEEDBACK_R2`（R2）兩個
  binding，外加 `FEEDBACK_ADMIN_SECRET`。它沒有綁定任何 app 資料庫，所以回饋端點原則上就無法讀寫
  app／使用者／內容資料——孤島化是由「缺少 binding」來強制的，而非靠慣例。截圖存在 R2（而非內嵌於 D1）
  以保持資料列精簡；若未綁定 R2，回饋仍可正常儲存。
- **每 IP 限流。** POST handler 以 `cf-connecting-ip` 為單位限流，使用一張小的 `rate_hits` D1 表
  （60 秒滑動視窗、每次 POST 清掃；超過上限 → HTTP 429）。它是**盡力而為**——表缺失或暫時性錯誤都不會
  擋住正常的送出。
- **管理閘門。** `GET`／`PATCH`／截圖路由由共用 secret（`FEEDBACK_ADMIN_SECRET`）把關，以
  `x-feedback-admin-secret` header 提供（截圖 `<img>` 則用 `?secret=`），以近乎定時的方式比對。若 secret
  未設定，讀取／更新路由就是**關閉（403），絕不開放**——fail-safe。
- **驗證契約**是可攜式輔助函式 `platform/server/feedback-shared.ts`（不含 Node／Worker import，兩個
  runtime 共用——與 copybook 的 Gemini 輔助函式同一模式）。它要求一個已知分類 + 非空訊息、對每個欄位都有
  硬性大小上限、對序列化後的上下文 JSON 有 8 KB 上限，且只在截圖看起來像
  `image/(png|jpeg|webp)` data URL 且在上限內時才接受（否則捨棄，從不視為錯誤）。

### Schema（`platform/functions/migrations/0001_init.sql`）

D1 migration 建立單一張 `feedback` 表（`id`、`created_at`、`category`、`option`、`message`、`screen`、
`context_json`、`screenshot_key` → R2 key 或 `NULL`、`ua`、`app_version`、`profile_id` → 僅數字、
`status`）加上 status／created-at 索引，以及 `rate_hits` 限流帳本表。開發鏡像建立相同的結構（以內嵌的
`screenshot` 欄取代 R2 key）。

### 管理 triage 面板（`platform/src/admin/FeedbackPanel.tsx`）

Admin 主控台（§8）底下的一個**僅供開發**面板。擁有者輸入一次管理 secret（保存在 `localStorage`）；面板
接著讀取受管理閘門保護的端點，以最新優先顯示回饋，並提供**依狀態的篩選 chips**（與計數）、行內**狀態變更**
（`PATCH`）、每列一行的**不含 PII 上下文**，以及延遲載入的**截圖縮圖**（點擊放大）——後者經由截圖路由取得。
從它無法觸及任何 app／使用者／內容相關資料。

### 開發用 Express 鏡像（`platform/server/feedback-*.ts`）

為了讓整個送出 → triage 流程在本機**完全無須 Cloudflare 佈建**即可運作，開發用 Express 伺服器（§7）原封
不動地鏡像正式環境的契約：

- `feedback-routes.ts` — 相同的四條路由（`POST` 公開；`GET`／`PATCH`／`:id/screenshot` 由開發 `.env` 的
  `FEEDBACK_ADMIN_SECRET` 把關）、相同的驗證，以及一個記憶體內的每 IP 限流器。
- `feedback-db.ts` — 一條**獨立的** `better-sqlite3` 連線連到 `platform/feedback.db`，與
  `platform.db`／`content.db` 在物理上分離。沒有任何 app 程式碼 import 此模組；它是正式環境 D1 資料庫的
  開發雙生。
- `feedback-shared.ts` — 上述的共用驗證／secret 輔助函式，開發與正式環境共用。

### 佈建 runbook（正式環境一次性設定——由帳號擁有者執行）

孤島化的 D1／R2／secret／Pages binding **不會**由部署管線建立；它們是一次性的手動設定。（在它們存在之前，
正式環境的回饋端點沒有可綁定的對象；開發鏡像則完全不需要這些。）

```bash
# 1. 建立專屬的 D1 資料庫（只存放回饋）。
npx wrangler d1 create feedback

# 2. 對它套用 schema（建立 feedback + rate_hits 兩張表）。
npx wrangler d1 execute feedback --remote \
  --file=platform/functions/migrations/0001_init.sql

# 3. 建立專屬的 R2 bucket 存放截圖。
npx wrangler r2 bucket create learning-chinese-feedback

# 4. 設定管理 secret（任意隨機字串；用來把關讀取／triage 路由）。
npx wrangler pages secret put FEEDBACK_ADMIN_SECRET --project-name=learning-chinese
```

接著，在 Pages 專案中（**Settings → Functions → bindings**），加入 **D1 binding `FEEDBACK_DB`**（→
`feedback` 資料庫）與 **R2 binding `FEEDBACK_R2`**（→ `learning-chinese-feedback` bucket），然後**重新
部署**。binding 刻意只限這兩個加上那個 secret——正是這份「缺少」讓功能保持孤島化。

---

## 7. 開發伺服器（僅供開發）

`platform/server/index.ts` 以 Vite 的 middleware 模式執行一個 Express 伺服器（`:3000`）。它載入各模組
的伺服器、提供共用的平台路由（字典瀏覽、字符統計、字符排名、供 PWA 使用的 DB 快照），並驅動 admin／策劃
UI。**這一切都不在正式環境執行**——它的存在是為了開發此 app，以及產生／策劃那些會被烘焙並出貨的資料。

### 7.1 獨立的句庫管理伺服器（`platform/server/bank-admin.ts`）—— issue #49

改程式碼時 `:3000` 會不斷重啟／熱重載，連帶讓**句庫管理介面**一起中斷，打斷策劃工作（匯入 AI 批次、
缺口填補的 prompt 迴圈、多回合批次自動填補、瀏覽涵蓋率）。`bank-admin.ts` 是一個**獨立、僅供開發**的
Express 程序，在自己的連接埠（`BANK_ADMIN_PORT`，預設 **3100**）上**只**提供句庫管理介面，因此 `:3000`
重啟時策劃工作仍持續。以 `npm run dev:bank-admin` 啟動。

它重用與 `:3000` 完全相同的元件，不另外分叉：
- 在 `/api/content` 掛載 `contentAdminRoutes`（`server/content-admin.ts`，§8.4）——完整的句庫 CRUD +
  涵蓋率／排名／TOCFL 等級 + AI 生成；
- 在 `/api/copybook` 掛載 copybook 模組的 `routes`，供 Prompt 分頁用的 Gemini 金鑰驗證探針
  （`POST /api/copybook/test-key`）；
- 提供一個極小的獨立 Vite 進入點（`bank-admin.html` → `src/bank-admin-main.tsx`），只渲染
  `<SentenceBankPanel />`（六個分頁 + 「檢視全部」彈窗 + 單字詳情）。它使用 `appType: 'custom'`，
  避免 Vite 自動提供完整 app 的 `index.html`；UI 與 `/api/content/*` 提供於**同源**，因此面板的同源
  `fetch('/api'+path)` 能解析。開發模式下 `useAdminRead` 走 `/api` 讀取路徑、完全不碰離線資料層，
  因此**不需要 `OfflineProvider`**（不啟動 sql.js／IndexedDB）。

**並行（方案一）。** 兩個伺服器都以 WAL 模式讀寫開啟 `content.db`。WAL 允許跨程序的並行讀取 + 單一寫入；
`shared/src/content-db.ts` 的 `getDb()` 也設定了 `PRAGMA busy_timeout = 5000`，因此短暫的寫入鎖會**重試**
而非立即丟出 `SQLITE_BUSY`——對單一策劃者的工作量綽綽有餘。編輯落在同一個 `content.db`，因此正常的
策劃 → `npm run seed:dbs` → 提交流程不變。既有的注意事項延伸為：**提交 `content.db` 前先停掉兩個伺服器**
（或確保都未在寫入）——伺服器持有時（WAL）絕不要提交 `.db`。

**安全。** 僅供開發；預設綁定 **`127.0.0.1`（localhost）**，不是 `0.0.0.0`，因此未驗證的 admin／AI 路由
不會暴露在區域網路上。永不部署。

---

## 8. Admin 與裝置設定

共有兩個不同的設定介面，由不同畫面進入、對象也不同：

- **裝置設定（Device Settings）**——位於選 profile 前的啟動畫面上、屬於整個帳號／裝置層級的畫面。隨時可用，
  且會在正式環境出貨。
- **Admin 主控台**——策劃／除錯用的後台。它對話的是開發 Express 伺服器的 `/api/admin/*`、`/api/content/*`
  與各模組路由，這些在正式（純 Pages）部署中 **並不存在**。其進入按鈕在 `import.meta.env.DEV` 下、**或**
  在 `admin` 功能經代碼 `8000` 再 `8001`（§5.6；`8001` 即已停用的 `8888` 之功能）解鎖後渲染——因此它可以在正式版建置上被開啟，但它驅動的路由只在
  開發伺服器上才解析得到。

### 8.1 裝置設定（`platform/src/App.tsx` 中的 `DeviceSettings`）

由 **Profile Picker** 上的齒輪按鈕進入（在尚無任何 profile 的首次啟動 `WelcomePopup` 上也有）——也就是在
*選擇 profile 之前*，因為這裡的一切都屬於裝置或帳號層級，而非單一 profile。返回會回到選擇器。各區塊由上到下：

| 區塊 | 功能 | 備註／限制 |
|------|------|------------|
| **語言**（Language） | App 介面語言切換（`繁體中文` / `English`）。寫入帳號 `settings.language`。 | 永遠顯示。 |
| **主題**（`settings.theme`） | **裝置層級** 主題選擇器（`ThemeSelect`，scope=`device`）——每個 profile 的預設外觀。Default 免費；**Gold/Silver 是付費的**，各自要在裝置層級兌換自己的代碼（付費前置 `9000`，再 `9900` → Silver／`9901` → Gold，於下方 Device ID 下兌換）**之後** 才會列出——鎖住的皮膚在這裡完全不顯示。透過 `setDeviceTheme` → `localStorage` `lc-gold-mode` 持久化。 | 永遠顯示，每台裝置皆然。解析 + 儲存見 §5.5。（取代了舊有的僅 gold 裝置「尊榮模式」切換。） |
| **備份與還原**（Backup & Restore） | **立即備份** 匯出所有 profiles + 偏好設定 + 主題狀態 + 解鎖的 JSON（`exportBackup`）。**從檔案還原** 解析備份檔（`parseBackup`）後開啟一個 modal，做**選擇性**的逐 profile 還原，並附一個可選的「包含偏好設定」開關（`importBackupSelective`）；成功後重新載入。 | 使用者資料屬於各裝置且永不上傳（§3）；這個手動 JSON 檔是唯一的轉移途徑。 |
| **App 版本**（`settings.update`） | **立即更新應用程式** 會清除快取並重新載入（`onForceUpdate`），只有在來源可連線時才啟用（一次 no-store 的 `GET /data/version.json` 探測；離線時停用，並附重試連結）。顯示 **裝置版本**（`__CONTENT_VERSION__`，建置時烘焙）、**伺服器版本**（來自同一次探測）並附上已是最新／有可用更新的提示，以及 **裝置 ID**（在 `localStorage` `lc-device-id` 中讀取或建立的 UUID；點一下即複製——供客服支援用）。也含 **輸入代碼** 連結 → `CodeEntry` 鍵盤（§5.6），在裝置作用域兌換 admin（`8000`→`8001`）與 premium（`9000`→`9900`/`9901`）代碼系列。 | 版本字串顯示時截為 8 字元。`version` 與 `contentHash` 的差異見 §4。 |
| **進階設定**（`settings.advanced`） | **寫字挑戰** → 開啟 **Levers** 面板（§8.2）。**英文練習** → 開啟裝置 **英文語音** 面板（§8.3）。 | 這兩項永遠顯示。 |
| *（受閘門的按鈕）* | **UI 元件** → Styleguide（僅開發）。**管理（Admin）** → Admin 主控台（§8.4）。 | Styleguide **只**在 `import.meta.env.DEV` 下渲染；**Admin** 在 `import.meta.env.DEV` 下、**或** `admin` 功能經代碼 `8000` 再 `8001` 解鎖後渲染。 |

注意：**單一 profile** 的設定畫面（`AppSettings`，在選定 profile 後由主畫面進入）是另一個獨立畫面，內含顯示
名稱、一個逐 profile 的 **主題** 覆寫（`ThemeSelect`，scope=`profile`，附「使用裝置設定」的繼承選項）、
該 profile 的英文語音覆寫、該 profile 的 **Gemini API 金鑰** 欄位 + **測試** 按鈕（透過
`POST /api/copybook/test-key` 代理探測金鑰——因為瀏覽器無法直接呼叫 Gemini；金鑰僅存在裝置上的
`localStorage` `lc-gemini-key-u<id>`），以及「重做分級測驗」。

### 8.2 Levers 面板（`platform/src/LeversPanel.tsx`）

這是 Mac admin 所暴露的 writing-challenge 引擎設定的「app 內、裝置上」分身。出貨（Mac 烘焙）的值即為預設；
此處的修改會以**每裝置覆寫**（`offline-data-layer.setLeverOverride`）的形式儲存，能跨內容更新保留，並隨備份
一起帶走。每個被覆寫的 lever 會顯示徽章 + 重設（↺）；「全部重設」可恢復預設。只顯示**仍在使用**的 levers，
分組為：**選字平衡**（parity_*）、**排序**（`freq_model`、`rank_freq_weight`）、**程度與目標字**
（`level_known_pct`、`target_*`、`above_level_threshold`）、**「已會」判定**（`known_*`）、**熟練度計分**
（`weight_*`、`correct_weight`、`streak_cap`、`decay_*`），以及**筆畫辨識**（`stroke_leniency`、
`strokes_per_fail`）。也可作為進階使用者的捷徑，從分級測驗的齒輪進入（返回會回到測驗）。

### 8.3 英文語音面板（`platform/src/EnglishVoicePanel.tsx`）

設定 Practice-English 模組的**整台裝置預設** Web-Speech 語音（`getDeviceVoice` / `setDeviceVoice`，附試聽）。
每個 profile 可在自己的 profile 設定中覆寫它。

### 8.4 Admin 主控台（`platform/src/admin/AdminPage.tsx`）——僅供開發

由裝置設定中的 Admin 按鈕開啟（在 `import.meta.env.DEV` 下、或 `admin` 功能經代碼 `8000` 再 `8001` 解鎖後顯示）。
它呼叫的所有路由都只由 **開發 Express 伺服器** 提供，因此即使在已用代碼解鎖的正式版建置上，這些面板也
沒有後端可對話。標頭有一個 **Debug Overlay** 切換（齒輪），透過 `/api/platform-settings` 讀寫平台設定
`debug_overlay`。註：內容／策劃路由現已位於 `/api/content/admin/*` 之下（平台所擁有的內容，§3.5），而
逐 profile／逐模組的路由仍在 `/api/writing-challenge/*`。共五個頂層分頁：

| 分頁 | 顯示／功能 | 資料與開發 API |
|------|------------|----------------|
| **Users**（`UsersPanel`） | 列出裝置上的 profiles（id、名稱、語言、主題、建立時間）；可刪除使用者（需確認）。點一列 → 詳情，含 **Overview** 分頁與 **Stroke Practice** 分頁：逐字符的熟練度表（rank、TOCFL 程度、今日／記憶分數長條、出現次數、P/C/I、連續、平均 ms、近期結果圓點），可排序；另含程度／總計摘要。 | `/api/admin/users`、`DELETE /api/admin/users/:id`；詳情拉取 `/api/writing-challenge/admin/user-stats`、`/settings`、`/debug-info`（逐 profile／逐模組）以及 `/api/content/admin/char-tocfl-levels`、`/api/content/admin/char-ranking`（平台內容）。分數由 `@shared/character-stats/mastery` 在前端計算。 |
| **Modules**（`ModulesPanel`） | 啟用／停用每個已安裝模組（切換）；點一個模組 → 進入它自己的 admin（Stroke Practice 或 Word Sets；其他顯示「No settings」）。 | `/api/admin/modules`、`PATCH /api/admin/modules/:name`。 |
| **Dictionary**（`DictionaryPanel`） | 瀏覽已匯入的字典（字／詞／連結／筆畫數量）。鑽入某字典：**Chars**（網格附筆畫數 + TOCFL，點擊顯示 hanzi-writer 動畫 + 靜態預覽，依 **Frequency** 或 **Blended** rank 排序）、**Words**（表格）、**TOCFL only** 篩選、搜尋、分頁。 | `/api/dictionaries`、`…/chars`、`…/words`、`…/char/:id`；blended 排序用 `/api/writing-challenge/admin/char-ranking`。 |
| **SQL**（`SqlBrowser`） | 對平台 DB 與每個模組 DB 的原始 SQL 瀏覽器。側欄列出各 DB 與資料表（點資料表 → `SELECT * … LIMIT 50`）；textarea 執行任意 SQL（Cmd/Ctrl+Enter）；顯示結果或錯誤。 | `/api/admin/databases`、`POST /api/admin/sql/tables`、`POST /api/admin/sql/query`。**對本機開發 DB 執行任意 SQL**——這也是它僅供開發的另一個原因。 |
| **Sentence Bank**（`SentenceBankPanel`） | 平台所擁有句庫（`content.db`，§3.5）對照排名字表的覆蓋率儀表板。子分頁：**Summary**（good／neutral／needs-attention 健康卡片，缺口字可點擊）、**Bands**（P1–P6 覆蓋長條）、**Grid**（逐字覆蓋熱力網格）、**Gaps**（未達標表）、**Prompt**（建立補缺口的生成提示——可調數量／目標字數／字池——可複製外帶，**外加一個「Generate with Gemini」按鈕**）、**Import**（貼上 `中文 \| English` 句對；前端會預先過濾 ≤6 個 CJK 字的句子；回報新增／補齊／略過——伺服器在匯入時會正規化每一句，§3.5）。 | `/api/content/admin/char-coverage`、`…/bank-sentences`（GET/POST）。**「Generate with Gemini」→ `POST /api/content/admin/ai-generate`，此路由只存在於開發伺服器**，且需要開發 `.env` 中的 `GEMINI_API_KEY`（或存在 `localStorage` 的某個 per-profile 金鑰，作為 BYO 後備被取用）。 |

模組層級的 admin 畫面為：**Stroke Practice**（`StrokePracticeAdmin`）——完整的 writing-challenge 引擎設定
（筆畫辨識、熟練度計分公式 + 權重、「已會」判定、選字／排序、目標字、parity 選字）**外加一個內嵌的完整句庫
編輯器**（`SentenceBankEditor`：貼上／匯入檔案／匯出、還原出貨預設、全部清除、行內編輯 + 批次刪除網格，以及一個
字符覆蓋率 modal）。以及 **Word Sets**（`WordSetsAdmin`）——建立／刪除詞彙分類，並透過字典搜尋或手動輸入把詞加入
分類，附上／下移調整順序。

> **開發 vs 正式，一句話：** 裝置設定、Levers 面板、英文語音面板會在正式環境出貨並執行。Admin 主控台的
> *按鈕* 可在正式環境開啟（開發版建置，或 `8000`+`8001` 的 admin 解鎖），但它背後的路由——`/api/admin/*`、
> `/api/writing-challenge/admin/*`、`/api/content/admin/*`（平台所擁有的內容／句庫策劃，§3.5）、
> `/api/dictionaries` 與 `/api/platform-settings`——**僅由開發 Express 伺服器（§7）提供**，因此沒有它
> 主控台就無法運作；正式環境中伺服器端只有 copybook 的 Gemini Pages Functions（§6）存在。

> 註：策劃用的內容路由現已移至 `/api/content/admin/*`（平台所擁有的內容，§3.5），而逐 profile／逐模組的
> 路由仍維持在 `/api/writing-challenge/*` 之下。

---

## 9. 行銷／安裝登陸頁（`platform/src/LandingPage.tsx`）

一個獨立的行銷頁，**只對真正網域上的瀏覽器分頁訪客**顯示——它唯一的任務就是促成 PWA 安裝，好讓設定發生在
已安裝（standalone）的 app 中，使裝置端資料能正確留存。`App.tsx` 中的 `shouldShowLanding()` 負責路由：
`?landing` 強制顯示、`?app` 強制顯示真正的 app，其餘情況則在非開發主機且 **未** 以 standalone 執行時顯示。
它是純呈現——沒有資料層、沒有離線啟動——並以 lazy-load 載入，因此絕不拖累 app 外殼。

- **視覺識別** — 一套大膽、深色的 **VCASS 風格** 處理：深 **海軍藍場（`#073464`）**、暖奶油色文字、
  一個古銅／金色強調色、一道明亮的滿版色帶，以及厚重的大寫展示字體。Hero 直白地陳述 app 的
  **讀 + 寫** 定位（寫 / 讀 米字格格子）。
- **讀文覆蓋率示範** — 核心：一個橫線筆記本承載著一段真實台灣文字，會隨捲動「自己寫進去」。一個覆蓋率
  滑桿設定你「認得」多少個最常見字；即時的頻率排名（`LandingReadData.ts`——`RANKED` 為依頻率排序的字）
  點亮可讀的字並顯示一個覆蓋率 %。**情境分頁**（學校／銀行／購物／看醫生／新聞／餐廳）切換段落，而一個
  **Custom** 分頁讓訪客貼上自己的繁體文字以對照等級。
- **字型。** 紙墊以一種手寫的 Brush 楷體渲染中文——這個線上登陸頁所用的 **LXGW WenKai TC** brush web font
  （jsDelivr、unicode-range 子集切片），離線時退回系統楷體。web font 在*這裡*沒問題，因為登陸頁是線上的；
  離線的 app 外殼則刻意 **不** 依賴 web font。
- **安裝流程** — 捕捉 `beforeinstallprompt`（Chrome／Android／桌面）並從 CTA 觸發 `prompt()`；iOS Safari
  （沒有這個事件）會被偵測並導向手動的「分享 → 加入主畫面」步驟，因此 CTA 永遠不會失效。
- favicon 與 OG／社群預覽已重新塑造為海軍藍／中 的識別。
