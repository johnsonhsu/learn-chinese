import { Router } from "express";
import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  initDatabase,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryWords,
  addWordToCategory,
  removeWordFromCategory,
  reorderCategoryWords,
} from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDbPath = join(__dirname, "..", "..", "..", "platform", "platform.db");

export const routes = Router();

// --- Categories ---

routes.get("/categories", (_req, res) => {
  res.json(getAllCategories());
});

routes.get("/categories/:id/words", (req, res) => {
  const id = Number(req.params.id);
  const words = getCategoryWords(id);

  // Enrich with TOCFL level from platform dictionary
  const pdb = new Database(platformDbPath, { readonly: true });
  const getLevel = pdb.prepare(
    "SELECT level FROM dict_words WHERE word = ? AND level_source = 'TOCFL' AND dictionary_id = 1 LIMIT 1",
  );
  const enriched = words.map((w) => {
    const row = getLevel.get(w.word) as { level: string } | undefined;
    return { ...w, tocflLevel: row?.level || "" };
  });
  pdb.close();

  res.json(enriched);
});

// --- Admin: Categories CRUD ---

routes.post("/admin/categories", (req, res) => {
  const { nameZh, nameEn, icon, color } = req.body;
  if (!nameZh?.trim() || !nameEn?.trim())
    return res.status(400).json({ error: "nameZh and nameEn required" });
  const cat = createCategory(nameZh.trim(), nameEn.trim(), icon || "", color || "#4a90d9");
  res.status(201).json(cat);
});

routes.patch("/admin/categories/:id", (req, res) => {
  const id = Number(req.params.id);
  updateCategory(id, req.body);
  res.json({ ok: true });
});

routes.delete("/admin/categories/:id", (req, res) => {
  deleteCategory(Number(req.params.id));
  res.json({ ok: true });
});

// --- Admin: Category Words ---

routes.post("/admin/categories/:id/words", (req, res) => {
  const categoryId = Number(req.params.id);
  const { word, definition, zhuyin, pinyin } = req.body;
  if (!word?.trim()) return res.status(400).json({ error: "word required" });
  addWordToCategory(categoryId, word.trim(), definition || "", zhuyin || "", pinyin || "");
  res.json(getCategoryWords(categoryId));
});

routes.put("/admin/categories/:id/reorder", (req, res) => {
  const categoryId = Number(req.params.id);
  const { wordIds } = req.body;
  if (!Array.isArray(wordIds)) return res.status(400).json({ error: "wordIds array required" });
  reorderCategoryWords(categoryId, wordIds);
  res.json(getCategoryWords(categoryId));
});

routes.delete("/admin/categories/:catId/words/:wordId", (req, res) => {
  const catId = Number(req.params.catId);
  const wordId = Number(req.params.wordId);
  removeWordFromCategory(catId, wordId);
  res.json({ ok: true });
});

// --- Search platform dictionary for adding words ---

routes.get("/admin/dict-search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  const pdb = new Database(platformDbPath, { readonly: true });
  try {
    const rows = pdb
      .prepare(
        `
      SELECT w.word, w.definition, w.grammar, w.level,
             p_zh.value as zhuyin, p_py.value as pinyin
      FROM dict_words w
      LEFT JOIN dict_word_pronunciations p_zh ON p_zh.word_id = w.id AND p_zh.type = 'zhuyin'
      LEFT JOIN dict_word_pronunciations p_py ON p_py.word_id = w.id AND p_py.type = 'pinyin'
      WHERE w.word LIKE ? OR w.definition LIKE ?
      LIMIT 20
    `,
      )
      .all(`%${q}%`, `%${q}%`) as Record<string, unknown>[];
    res.json(rows);
  } finally {
    pdb.close();
  }
});

export function initDb() {
  initDatabase();
}
