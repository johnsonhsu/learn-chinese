/**
 * Platform-owned CONTENT admin routes — bank CRUD + char coverage/ranking/TOCFL
 * levels + AI generation, all backed by the shared content.db accessor
 * (@shared/character-stats/content-db).
 *
 * These used to live in the writing-challenge module server, but the curriculum
 * content is platform-owned now, so the routes move here and writing-challenge
 * becomes a pure consumer. Mounted at /api/content by platform/server/index.ts.
 *
 * Char ranking is computed by the shared ranker over platform.db; the ranking
 * weight levers still live in the writing-challenge module_settings table (read
 * read-only here) so dev ranking matches the on-device shipped settings.
 */

import { Router } from "express";
import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  addBankSentences,
  getBankSentenceCount,
  getAllBankSentences,
  deleteAllBankSentences,
  searchBankSentences,
  updateBankSentence,
  deleteBankSentence,
  deleteBankSentences,
  restoreBankFromBaked,
  getCharTocflLevels,
} from "@shared/character-stats/content-db";
import { getRankedChars as getRankedCharsShared } from "@shared/character-stats/char-ranker";
import type { DbQueryProvider, RankedChar } from "@shared/character-stats/types";
import { loadEnv } from "../../modules/copybook/server/env.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dirname, "..");
const repoRoot = join(platformRoot, "..");
const PLATFORM_DB_PATH = join(platformRoot, "platform.db");
const MODULE_SETTINGS_DB_PATH = join(
  repoRoot,
  "modules",
  "writing-challenge",
  "writing-challenge.db",
);

export const contentAdminRoutes = Router();

// --- DbQueryProvider wrapper for better-sqlite3 (read-only) ---

function betterSqliteProvider(db: InstanceType<typeof Database>): DbQueryProvider {
  return {
    queryAll: <T>(sql: string, params?: unknown[]) => db.prepare(sql).all(...(params || [])) as T[],
    queryOne: <T>(sql: string, params?: unknown[]) =>
      db.prepare(sql).get(...(params || [])) as T | undefined,
    run: (sql: string, params?: unknown[]) => {
      const r = db.prepare(sql).run(...(params || []));
      return { changes: r.changes, lastId: Number(r.lastInsertRowid) };
    },
  };
}

/** Ranking-weight levers from the writing-challenge module_settings table. */
function getRankSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const mdb = new Database(MODULE_SETTINGS_DB_PATH, { readonly: true });
    const rows = mdb.prepare("SELECT key, value FROM module_settings").all() as {
      key: string;
      value: string;
    }[];
    for (const r of rows) out[r.key] = r.value;
    mdb.close();
  } catch {
    /* module DB absent — ranker falls back to its own defaults */
  }
  return out;
}

// --- Char ranking (cached) ---

let rankedCharsCache: RankedChar[] | null = null;

function getRankedChars(): RankedChar[] {
  if (rankedCharsCache) return rankedCharsCache;
  const settings = getRankSettings();
  const pdb = new Database(PLATFORM_DB_PATH, { readonly: true });
  try {
    rankedCharsCache = getRankedCharsShared(betterSqliteProvider(pdb), settings);
  } finally {
    pdb.close();
  }
  return rankedCharsCache;
}

export function clearContentRankCache() {
  rankedCharsCache = null;
}

// --- Bank curation difficulty ---

// Difficulty for curation: the rarest char gates the sentence (you can't do it
// until you know its hardest char), blended with the average rarity. Higher = harder.
function bankDifficulty(sentence: string, rankMap: Map<string, number>): number {
  const chars = [...new Set([...sentence].filter((c) => /[一-鿿]/.test(c)))];
  if (!chars.length) return 0;
  const ranks = chars.map((c) => rankMap.get(c) ?? 6000);
  const max = Math.max(...ranks);
  const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  return Math.round(max * 0.6 + avg * 0.4);
}

// --- Char TOCFL levels ---

let tocflCharLevelCache: Record<string, string> | null = null;
contentAdminRoutes.get("/admin/char-tocfl-levels", (_req, res) => {
  if (!tocflCharLevelCache) tocflCharLevelCache = getCharTocflLevels();
  res.json(tocflCharLevelCache);
});

// --- Sentence Bank: reads ---

contentAdminRoutes.get("/admin/bank-sentences", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 200;
  const rankMap = new Map(getRankedChars().map((c) => [c.char, c.rank]));
  const sentences = searchBankSentences(q, limit).map((s) => ({
    ...s,
    difficulty: bankDifficulty(s.sentence, rankMap),
  }));
  res.json({ total: getBankSentenceCount(), sentences });
});

// Full character ranking dump (for bank analysis / curation tooling).
contentAdminRoutes.get("/admin/char-ranking", (_req, res) => {
  res.json(getRankedChars());
});

// Per-character coverage: rank + TOCFL level + how many bank sentences use it and
// the average difficulty of those sentences. For the in-app coverage grid.
contentAdminRoutes.get("/admin/char-coverage", (_req, res) => {
  const ranked = getRankedChars();
  const rankMap = new Map(ranked.map((c) => [c.char, c.rank]));
  // 5 difficulty bands (400 wide): <400, 400-800, 800-1200, 1200-1600, 1600+
  const stats = new Map<string, { count: number; sumDiff: number; dist: number[] }>();
  for (const s of getAllBankSentences()) {
    const diff = bankDifficulty(s.sentence, rankMap);
    const band = Math.min(4, Math.floor(diff / 400));
    for (const c of new Set([...s.sentence].filter((ch) => /[一-鿿]/.test(ch)))) {
      const st = stats.get(c) || { count: 0, sumDiff: 0, dist: [0, 0, 0, 0, 0] };
      st.count++;
      st.sumDiff += diff;
      st.dist[band]++;
      stats.set(c, st);
    }
  }
  const rows = ranked.map((r) => {
    const st = stats.get(r.char);
    return {
      char: r.char,
      rank: r.rank,
      level: r.tocflLevel ?? "",
      count: st?.count ?? 0,
      avgDiff: st ? Math.round(st.sumDiff / st.count) : null,
      dist: st?.dist ?? [0, 0, 0, 0, 0],
    };
  });
  res.json(rows);
});

// --- Sentence Bank: writes ---

contentAdminRoutes.put("/admin/bank-sentences/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { sentence, english } = req.body;
  if (typeof sentence !== "string") return res.status(400).json({ error: "sentence required" });
  const ok = updateBankSentence(id, sentence, english ?? "");
  if (!ok) return res.status(400).json({ error: "update failed (empty or duplicate sentence)" });
  res.json({ ok: true });
});

contentAdminRoutes.delete("/admin/bank-sentences/:id", (req, res) => {
  deleteBankSentence(parseInt(req.params.id, 10));
  res.json({ ok: true, total: getBankSentenceCount() });
});

contentAdminRoutes.post("/admin/bank-sentences", (req, res) => {
  const { text } = req.body;
  if (typeof text !== "string") return res.status(400).json({ error: "text required" });
  const han = /[一-鿿]/;
  const rows: { sentence: string; english: string }[] = [];
  for (const line of text.split("\n")) {
    const p = line.split("|").map((s) => s.trim());
    // accept "sentence | english" or just "sentence"
    if (p.length >= 2) rows.push({ sentence: p[0], english: p.slice(1).join("|").trim() });
    else if (p.length === 1 && p[0]) rows.push({ sentence: p[0], english: "" });
  }
  const clean = rows.filter((r) => han.test(r.sentence));
  const result = addBankSentences(clean);
  res.json({ ...result, parsed: clean.length, total: getBankSentenceCount() });
});

contentAdminRoutes.post("/admin/bank-sentences/bulk-delete", (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
    : [];
  deleteBankSentences(ids);
  res.json({ ok: true, deleted: ids.length, total: getBankSentenceCount() });
});

contentAdminRoutes.post("/admin/bank-sentences/restore-default", (_req, res) => {
  res.json(restoreBankFromBaked());
});

contentAdminRoutes.delete("/admin/bank-sentences", (_req, res) => {
  deleteAllBankSentences();
  res.json({ ok: true, total: 0 });
});

// --- AI generation (dev-only; no production route) ---

// Workers AI model to use for Cloudflare generation. Llama 3.3 70B (fp8-fast) is
// a strong instruction-follower that handles Chinese well; output may lean
// Simplified, but the import auto-converts Simplified->Traditional (台/臺
// preserved) and the prompt few-shots Taiwan style, so it stays clean.
const CF_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Tagged error carrying the HTTP status the route should return.
function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

// Call Google Gemini with a raw prompt. apiKey = BYO key from the client when
// present, else GEMINI_API_KEY from .env.
async function generateGemini(prompt: string, bodyKey: string): Promise<string> {
  const apiKey = bodyKey || process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw httpError(
      503,
      "No Gemini key — set GEMINI_API_KEY in your dev .env or save a key in Settings",
    );

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let r: Response;
  try {
    r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 16384 },
      }),
    });
  } catch (e) {
    throw httpError(502, `Could not reach Gemini: ${(e as Error).message}`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw httpError(502, `Gemini ${r.status}: ${body.slice(0, 300)}`);
  }
  const data = (await r.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw httpError(502, "Gemini returned no text");
  return text;
}

// Call Cloudflare Workers AI via its REST API.
async function generateCloudflare(prompt: string): Promise<string> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_AI_TOKEN;
  if (!accountId || !token) {
    throw httpError(
      503,
      "No Cloudflare Workers AI config — set CF_ACCOUNT_ID and CF_AI_TOKEN in your dev .env",
    );
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_AI_MODEL}`;
  let r: Response;
  try {
    r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 16384,
      }),
    });
  } catch (e) {
    throw httpError(502, `Could not reach Cloudflare: ${(e as Error).message}`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw httpError(502, `Cloudflare ${r.status}: ${body.slice(0, 300)}`);
  }
  const data = (await r.json().catch(() => null)) as {
    result?: { response?: string };
    success?: boolean;
    errors?: { message?: string }[];
  } | null;
  if (data && data.success === false) {
    const msg =
      data.errors
        ?.map((e) => e.message)
        .filter(Boolean)
        .join("; ") || "unknown error";
    throw httpError(502, `Cloudflare error: ${msg.slice(0, 300)}`);
  }
  const text = data?.result?.response;
  if (typeof text !== "string") throw httpError(502, "Cloudflare returned no text");
  return text;
}

// POST /api/content/admin/ai-generate
// Body: { provider?: 'gemini' | 'cloudflare', prompt: string, apiKey?: string }
// DEV-ONLY: bank sentences are generated locally on the Mac, baked into the
// shipped content.db, then deployed — there is NO production proxy for this route.
contentAdminRoutes.post("/admin/ai-generate", async (req, res) => {
  loadEnv();

  const provider = req.body?.provider === "cloudflare" ? "cloudflare" : "gemini";
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const text =
      provider === "cloudflare"
        ? await generateCloudflare(prompt)
        : await generateGemini(
            prompt,
            typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "",
          );
    res.json({ text });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    res.status(status).json({ error: (e as Error).message });
  }
});
