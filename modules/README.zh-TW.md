# Modules

> English: [README.md](./README.md) ｜ 繁體中文（本文件）

> 持續維護的文件 — 隨著 app 演進而保持最新。在重大變更／部署時更新。

一個 **模組（module）** 是一個各自獨立的學習活動，由平台探索、列在主畫面上並掛載。模組共享平台的
profiles、語言、UI kit 與裝置端資料層；它們本身不管理這些。本文件涵蓋既有的七個模組、模組契約，
以及如何新增一個模組。

另見：[../architecture.zh-TW.md](../architecture.zh-TW.md)（端到端的模組系統）與
[../platform/src/ui/README.md](../platform/src/ui/README.md)（UI kit）。

---

## 既有的七個模組

### writing-challenge（✍️）— `modules/writing-challenge/`
旗艦模組。在銀行句子上做逐筆手寫練習，由 parity 選字智慧驅動（它向離線資料層詢問接下來要練什麼，
然後渲染一個句子供書寫）。它是最完整的模組，也是 **第一個遷移到共用 UI kit 上的模組**。
- `src/App.tsx` — 登陸畫面（`<ModuleScreen>` + `<Button>`）↔ 練習流程。
- `src/pages/PracticePage.tsx` — 打磨過的逐字書寫畫面（也被 copybook 重新匯出並重用）。
- `src/components/WritingCanvas.tsx` — HanziWriter 整合。
- `server/`（僅供開發）— 每個 profile／每個模組的路由（profile、字符統計、模組設定）。
  **課程內容已不再屬於本模組**——句子銀行、TOCFL 詞、`char_words` 現在是 **平台所擁有的**，
  存放於 `platform/content.db`（由平台的 `/api/content/admin/*` 路由策劃；見
  [../architecture.zh-TW.md §3.5](../architecture.zh-TW.md)）。本模組的開發伺服器透過
  `@shared/character-stats/content-db` 讀取那份內容，而非自己的 DB。
- 仍會出貨 `writing-challenge.db`，但它現在 **只** 帶有自己的 `module_settings`（+ 僅供開發的
  per-profile 表）——句子銀行／TOCFL 表在烘焙時被剝除，改由 `content.db` 出貨。

### word-sets（📚）— `modules/word-sets/`
瀏覽經策劃的詞彙分類；點一個詞以取得音訊 + 書寫練習。
- `src/App.tsx`、`src/pages/CategoryGrid.tsx`、`src/pages/WordList.tsx`。
- 透過 `useOffline()`（`@platform/offline`）讀取裝置端內容，並有一個供開發環境使用的伺服器後備
  （`src/utils/api.ts`）。
- `server/`（僅供開發）— 供 admin UI 使用的分類 + 詞的 CRUD。
- 出貨 `word-sets.db`，已烘焙以供離線使用。

### practice-english（🔤）— `modules/practice-english/`
英文克漏字拼字遊戲（填入缺漏字母），搭配螢幕鍵盤與音訊。
- `src/App.tsx`、`src/pages/LandingPage.tsx`、`src/pages/PracticePage.tsx`。
- `src/cloze.ts` — 把字母挖空的邏輯；`src/components/Keyboard.tsx`。
- 有 **自己的** 輕量 `src/offline/` provider（讀取平台所擁有的共用課程 `content.db`）；
  本身沒有出貨的 DB，也沒有伺服器路由。

### copybook（📝）— `modules/copybook/`
自帶文字的逐字書寫；貼上任意文字並書寫，或用 Gemini **Generate（產生）** 一個台灣繁體句子。
- `src/App.tsx`、`src/pages/InputPage.tsx`、`src/pages/PracticePage.tsx`。
- 重用 writing-challenge 的 `PracticePage` 作為書寫畫面。
- `server/gemini.ts` — **可攜式（portable）** 的 Gemini 產生器 + 驗證器（僅限繁體）。同時支撐開發用
  的 Express 路由（`server/index.ts`）與正式環境的 Cloudflare Pages Functions
  （`platform/functions/api/copybook/`）。
- 沒有出貨的 DB。

### my-characters（📊）— `modules/my-characters/`
你的個人進度儀表板。把你練過的每個字以統計表格與字塊網格呈現（熟練度／記憶分數、已會 vs 學習中），
並可點擊直接練習。
- `src/App.tsx` — 統計表格 ↔ 網格檢視，使用 `<CharTile>` 與共用的 `<PracticeModal>`。
- 透過 `useOffline()`（`@platform/offline`）讀取裝置端的字符統計與排名，並用共用熟練度引擎
  （`@shared/character-stats/mastery`）計分。
- 沒有出貨的 DB，也沒有伺服器路由——純粹是裝置端進度的消費者。

### reading-chinese（📖）— `modules/reading-chinese/`
閱讀理解練習。與 writing-challenge 的流程對映（英文提示 + 音訊 + 依序句子），但以**打散的可點選字塊池**
取代 HanziWriter 書寫板：依序點選句子的字來重組整句。**完全不使用 HanziWriter／WritingCanvas。**
- `src/App.tsx` — 登陸畫面（`<ModuleScreen>` + `<Button>` + `<CharTile>`）↔ 點選重組的
  `src/pages/ReadingPage.tsx`。
- 透過 `useOffline()` 的閱讀軌方法重用 BINDING 的 `generateNextSentence` 引擎與 `NextSentenceResponse`
  型別（不建第二個銀行）。純字池／自動略過過濾／點擊狀態機位於 `@shared/character-stats/reading`。
- **獨立的閱讀技能軌：** 記錄到資料層的閱讀統計（`character_stats_reading` / IndexedDB
  `profileStatsReading`），永不觸及書寫的 `character_stats`。閱讀等級／目標／熟練度由同一套純引擎從該切片
  計算。沒有出貨的 DB，也沒有伺服器路由。

### reading-english（📗）— `modules/reading-english/`
reading-chinese 的英文對應版本。相同的點選重組機制，但學習者是透過**依序**點選句子自身的**單字**塊
來重組一個銀行句子的**英文翻譯**。**完全不使用 HanziWriter。**
- `src/App.tsx` — 登陸畫面（`<ModuleScreen>` + `<Button>`）↔ 點選重組的 `src/pages/ReadingPage.tsx`。
- 如同 practice-english 般完全自足：擁有自己的 `src/offline/` 資料層 + `src/cloze.ts` 單字切詞器 +
  `src/speech.ts`（英文語音，共用 practice-english 的 `pe-en-voice` 裝置偏好）。純消費 `content.db` 的
  `bank_sentences.english`；不建第二個銀行、不用 LLM。
- 純字池／自動略過過濾／點擊狀態機是 reading-chinese 引擎的模組本地鏡像（`src/reading.ts`），泛化為
  以**單字**為單位並改用**熟練度**為基礎的自動略過判定；於快速層單元測試
  （`platform/src/offline/__tests__/reading-english-engine.test.ts`）。
- **獨立的閱讀／英文技能軌：** 每個單字記錄到自己的 IndexedDB（`learning-english-reading-user`），
  與 practice-english 的拼字儲存（`learning-english-user`）互不相交——閱讀 session 永不改動拼字統計，
  反之亦然（由 `reading-english-stat-isolation.test.ts` 守護）。自動略過會省略讀者已精熟的單字
  （最近 4 次中 ≥3 次正確，取自閱讀儲存）。沒有出貨的 DB，也沒有伺服器路由。

---

## 模組契約

### 1. `module.json`（必要）

```json
{
  "name": "my-module",
  "displayName": "My Module",
  "displayNameZh": "我的模組",
  "icon": "🎯",
  "apiPrefix": "/api/my-module",
  "dbFile": "my-module.db",
  "order": 5
}
```

| 欄位 | 是否必要 | 說明 |
|-------|----------|-------|
| `name` | 是 | 穩定的 id = 資料夾名稱；用作 registry／glob 的鍵 |
| `displayName` / `displayNameZh` | 是 | 主畫面標籤（EN / 繁中） |
| `icon` | 是 | 模組卡片上的 emoji |
| `apiPrefix` | 是 | `server/` 路由在開發伺服器上的掛載點 |
| `dbFile` | 僅當你出貨 DB 時 | 也要把它加進烘焙的 `sources` 清單（見下方） |
| `order` | 是 | 主畫面排序順序 |

### 2. `src/index.ts` — default export（必要）

平台的 glob 會取用 `src/index.ts` 的 **default export**，它必須是一個接收 `ModuleProps` 的 React 元件：

```ts
interface ModuleProps {
  userId: number;       // active profile id
  language: Language;   // 'zh-TW' | 'en' — UI language, owned by the platform
  onExit?: () => void;  // call to return to the home / module picker
}
```

```ts
// modules/my-module/src/index.ts
export { default } from './App.tsx';
```

額外的具名匯出（named exports）沒問題（writing-challenge 就匯出了它共用的 `PracticePage`）
——只有 `.default` 會註冊該模組。

### 3. `server/index.ts` — `routes` + `initDb`（選用，僅供開發）

如果你的模組需要開發期的伺服器路由（例如供 admin／策劃 UI 使用）：

```ts
import { Router } from 'express';
export const routes = Router();
routes.get('/something', (_req, res) => res.json({ ok: true }));
export function initDb() { /* migrations / seeding, called once at boot */ }
```

開發伺服器的 module-loader 會把 `routes` 掛載在你的 `apiPrefix`，並在啟動時呼叫 `initDb()`。
**這些路由在正式環境中不存在**（Cloudflare Pages 只提供靜態資源）。如果你在正式環境需要線上能力，
就在 `platform/functions/api/<module>/…` 下新增一個 Cloudflare Pages Function——並像 copybook 那樣，
重用你開發路由所用的同一個可攜式輔助函式（見 [../architecture.zh-TW.md §6](../architecture.zh-TW.md)）。

### 4. 使用平台的設施

- **UI kit** — `import { Button, ModuleScreen, Card, BackButton, CharTile } from '@platform/ui/index.ts'`。
  不要匯入此 kit 的 CSS（它由平台載入一次）。用 `var(--token)` 做樣式；絕不分叉設計 token。
  元件會自動繼承目前的主題（§5.5），不要手動套主題。細節：
  [../platform/src/ui/README.md](../platform/src/ui/README.md)。
- **離線資料** — `import { useOffline } from '@platform/offline/offline-context.tsx'` 以讀取裝置端
  內容（字符統計、排名、word sets、下一個句子），無須伺服器。（writing-challenge 與 word-sets 都這麼做。）
- **共用元件** — 例如 `@platform/components/PracticeModal.tsx`、`@platform/utils/speech.ts`。
- **i18n** — 維護一個模組本地的 `src/i18n/`（`en.ts` / `zh-TW.ts`），由 `language` prop 驅動，比照既有
  的模組。

### 5. 註冊到主畫面

平台只會列出 `platform/src/App.tsx` 中允許集合裡的模組：

```ts
const OFFLINE_READY_MODULES = new Set(['writing-challenge', 'word-sets', 'practice-english', 'copybook', 'my-characters', 'reading-chinese', 'reading-english']);
```

當你的模組能完全在裝置上運作後，把它的 `name` 加進這裡。

---

## 如何新增模組 — 操作步驟

1. **建立骨架** `modules/<name>/` 作為一個 workspace：
   ```
   modules/<name>/
   ├── module.json
   ├── package.json        (name it, set "type": "module")
   ├── tsconfig.json
   └── src/
       ├── index.ts        export { default } from './App.tsx'
       ├── App.tsx
       └── i18n/           en.ts, zh-TW.ts, index.ts
   ```

2. **撰寫 `module.json`**（見上方表格）。挑選下一個 `order`、一個唯一的 `name` 與 `apiPrefix`，
   以及一個 `icon`。

3. **用此 kit 建置主畫面**。依照
   [../platform/src/ui/README.md](../platform/src/ui/README.md)，一個登陸畫面是：
   ```tsx
   import { ModuleScreen, Button } from '@platform/ui/index.ts';

   export default function App({ userId, language, onExit }: {
     userId: number; language: Language; onExit?: () => void;
   }) {
     return (
       <LanguageContext.Provider value={language}>
         <ModuleScreen title={t('module.name')} onBack={onExit}>
           {/* module-specific content */}
           <Button variant="primary" onClick={onStart}>{t('module.start')}</Button>
         </ModuleScreen>
       </LanguageContext.Provider>
     );
   }
   ```
   返回鈕 **由模組擁有**：在主畫面把 `onExit` 傳給 `<ModuleScreen onBack>`；在更深層的畫面渲染一個
   `<BackButton>`（或不渲染）。平台不會替你畫任何返回鈕。把特製的元件（畫布、自訂切換鈕）保持為自訂
   ——只有通用的模式才屬於此 kit。

4. **讀取裝置端資料**：若你需要字符統計／下一個句子／word sets，透過 `useOffline()`。UI 文字則從 props
   讀取 `language`。

5. *（選用）* **新增伺服器路由** — 建立 `server/index.ts` 匯出 `routes`（一個 Express `Router`）與
   `initDb()` 供開發環境使用。若是正式環境的線上功能，則在 `platform/functions/api/<name>/` 下新增一個
   Pages Function，並重用一個可攜式輔助函式。

6. *（選用）* **出貨一個 DB** — 若你的模組需要自己的內容 DB，在 `module.json` 中設定 `dbFile`，把
   `<name>.db` 放到你的模組資料夾，並把它加進 `platform/scripts/bake-data.ts` 的 `sources` 陣列
   （並在離線資料層中載入它），如此它就會被烘焙進 `public/data/` 並快取以供離線使用。

7. **註冊** 模組的 `name` 到 `platform/src/App.tsx` 的 `OFFLINE_READY_MODULES` 中。它現在會出現在主畫面上。
