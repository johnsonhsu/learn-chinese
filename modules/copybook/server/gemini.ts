/**
 * Portable Gemini sentence generator for the copybook module.
 *
 * Pure + dependency-free (uses Node's global `fetch`) so the same logic can back
 * either the dev Express route (modules/copybook/server/index.ts) or a Cloudflare
 * Pages Function in prod — the only thing the caller supplies is the API key/model.
 *
 * It builds a Taiwan-Traditional prompt seeded by the user's level / known chars /
 * target char, calls Gemini's generateContent REST endpoint, then VALIDATES the
 * output (Traditional-only, contains the target char, sane length) and retries a
 * few times before giving up. Gemini occasionally leaks Simplified characters, so
 * the Traditional-only check is mandatory.
 */

const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Cheapest validity probe: the models-list endpoint. It does NOT generate, so it
// never burns generateContent quota. The key rides in the `key` query param
// (Google's documented form for this GET); the key is used transiently and NEVER
// logged anywhere.
const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// gemini-2.5-flash is a stable, free-tier Flash model (verified June 2026). The
// older gemini-2.0-flash was discontinued; this is the safe current default.
const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface GenerateSeed {
  /** The character the sentence must contain. */
  targetChar: string;
  /** A sample of characters the user already knows (used as a vocabulary hint). */
  knownChars?: string[];
  /** User's current level (rank index), for prompt flavour. */
  level?: number;
  /** Frequency-rank ceiling: prefer chars at/below this rank for difficulty. */
  rankCeiling?: number;
}

export interface GenerateResult {
  sentence: string;
}

/**
 * Result of probing a Gemini key for validity (see testKey).
 * - ok            → 200, the key works.
 * - invalid       → 400/403, the key is malformed or unauthorized.
 * - rate_limited  → 429, throttled; the key is probably valid, just over quota.
 * - error         → network failure / unexpected status; couldn't determine.
 */
export interface TestKeyResult {
  valid: boolean;
  reason: 'ok' | 'invalid' | 'rate_limited' | 'error';
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

// --- Few-shot examples: natural everyday Taiwan-Mandarin, Traditional, 6–15 chars.
// Hardcoded so the helper stays portable (no filesystem dep). These mirror the
// banked gold corpus style (sentence-bank-accepted.tsv).
const FEW_SHOT = [
  '其實那家手搖飲的珍奶並不好喝。',
  '如果無聊的話，我們可以去逛夜市。',
  '垃圾車快來了，趕快將垃圾拿出去。',
  '台灣的民眾真的很熱情也很願意幫忙。',
];

// Curated set of Simplified-ONLY characters (forms that do not exist in
// Traditional text). Gemini sometimes leaks these; any hit means reject. This is
// intentionally a high-signal subset of common simplifications — it does not need
// to be exhaustive to catch the typical leakage, and avoids a heavy OpenCC-style dep.
const SIMPLIFIED_ONLY = new Set(
  [
    '们', '这', '么', '说', '没', '会', '时', '过', '还', '后', '边', '动', '问',
    '间', '样', '现', '点', '电', '话', '车', '门', '见', '让', '觉', '应', '该',
    '亲', '爱', '热', '欢', '业', '东', '西', '买', '卖', '钱', '银', '铁', '钟',
    '飞', '机', '场', '务', '员', '总', '经', '区', '医', '药', '语', '词', '读',
    '书', '画', '图', '纸', '笔', '记', '识', '认', '课', '题', '习', '学', '题',
    '国', '园', '团', '圆', '马', '鸟', '鱼', '龙', '凤', '风', '云', '气', '汉',
    '难', '韩', '钱', '银', '铜', '锅', '锁', '钥', '银', '镜', '钉', '针', '钓',
    '丰', '产', '严', '丧', '个', '丽', '举', '义', '乌', '乐', '乔', '习', '乡',
    '书', '买', '乱', '争', '亏', '亚', '产', '亩', '亲', '亿', '仅', '从', '仑',
    '仓', '仪', '们', '价', '众', '优', '会', '伞', '伟', '传', '伤', '伦', '伪',
    '体', '佣', '侠', '侣', '侥', '侦', '侧', '侨', '侩', '侪', '侬', '俣', '俦',
    '俨', '债', '倾', '偬', '偻', '储', '催', '傧', '傩', '儿', '兑', '兰', '关',
    '兴', '兹', '养', '兽', '冁', '内', '冈', '册', '军', '农', '冯', '冲', '决',
    '况', '冻', '净', '凄', '凉', '减', '凑', '凛', '凤', '凫', '凭', '凯', '击',
    '凶', '刘', '则', '刚', '创', '删', '别', '刬', '刭', '刹', '刽', '刿', '剀',
    '剂', '剐', '剑', '剥', '剧', '劝', '办', '务', '劢', '动', '励', '劲', '劳',
    '势', '勋', '勐', '勚', '匦', '匮', '区', '医', '华', '协', '单', '卖', '卢',
    '卤', '卫', '却', '厂', '厅', '历', '厉', '压', '厌', '厍', '厐', '厕', '厢',
    '厣', '厦', '厨', '厩', '厮', '县', '参', '叆', '叇', '双', '发', '变', '叙',
    '叠', '叶', '号', '叹', '叽', '吓', '吕', '吗', '吣', '吨', '听', '启', '吴',
    '呒', '呓', '呕', '呖', '呗', '员', '呙', '呛', '呜', '咏', '咙', '咛', '咝',
    '响', '哑', '哓', '哔', '哕', '哗', '哙', '哜', '哝', '哟', '唛', '唝', '唠',
  ],
);

function hasSimplifiedOnly(s: string): boolean {
  for (const ch of s) {
    if (SIMPLIFIED_ONLY.has(ch)) return true;
  }
  return false;
}

function countHan(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (/[一-鿿㐀-䶿]/.test(ch)) n++;
  }
  return n;
}

/**
 * Strip surrounding quotes / whitespace / markdown fences / trailing translations
 * so we keep only the bare sentence.
 */
export function cleanCandidate(raw: string): string {
  let s = (raw || '').trim();
  // Drop markdown code fences.
  s = s.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  // Take the first non-empty line (the model sometimes adds pinyin/english below).
  const firstLine = s.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (firstLine) s = firstLine;
  // Strip wrapping quotes/brackets.
  s = s.replace(/^["'「『（(\[]+/, '').replace(/["'」』）)\]]+$/, '').trim();
  return s;
}

/**
 * Validate a cleaned candidate. Returns the reason it's invalid, or null if OK.
 */
export function validateCandidate(s: string, targetChar: string): string | null {
  if (!s) return 'empty';
  if (hasSimplifiedOnly(s)) return 'contains Simplified characters';
  if (targetChar && !s.includes(targetChar)) return `missing target char ${targetChar}`;
  const han = countHan(s);
  if (han < 6) return `too short (${han} Han chars)`;
  if (han > 15) return `too long (${han} Han chars)`;
  return null;
}

function buildPrompt(seed: GenerateSeed): string {
  const { targetChar, knownChars = [], rankCeiling } = seed;
  const ceiling = rankCeiling && rankCeiling > 0 ? rankCeiling : 1500;
  const vocab = knownChars.slice(0, 60).join('');
  const examples = FEW_SHOT.map((e) => `- ${e}`).join('\n');

  return `You write natural, everyday Taiwan Mandarin sentences in Traditional Chinese (繁體中文).

Write ONE sentence that:
- sounds like something a real person in Taiwan would casually say or write;
- contains the character 「${targetChar}」 at least once;
- is between 6 and 14 Chinese characters long;
- uses mostly common characters at or below frequency rank ${ceiling};
- is written in Traditional Chinese ONLY — never Simplified characters.

${vocab ? `The learner already knows these characters, prefer reusing them: ${vocab}\n` : ''}Here are examples of the natural Taiwan style we want:
${examples}

Output ONLY the single sentence. No pinyin, no zhuyin, no English, no quotation marks, no explanation.`;
}

/**
 * Call Gemini with the given prompt and return the raw candidate text.
 */
async function callGemini(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(GEMINI_ENDPOINT(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 80 },
      }),
    });
  } catch (e) {
    throw new GeminiError(`Could not reach Gemini: ${(e as Error).message}`, 502);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GeminiError(
      `Gemini API error ${res.status}: ${body.slice(0, 200)}`,
      res.status === 429 ? 429 : 502,
    );
  }

  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new GeminiError('Gemini returned no text', 502);
  }
  return text;
}

/**
 * Generate ONE validated Taiwan-Traditional sentence seeded by `seed`.
 * Retries up to `maxAttempts` times on validation failure.
 *
 * @throws GeminiError when the key is missing, the API fails, or all attempts
 *   fail validation. The `.status` is suitable to pass straight to res.status().
 */
export async function generateSentence(
  seed: GenerateSeed,
  opts: { apiKey?: string; model?: string; maxAttempts?: number } = {},
): Promise<GenerateResult> {
  const apiKey = opts.apiKey;
  if (!apiKey) {
    throw new GeminiError('Gemini key not configured', 503);
  }
  if (!seed.targetChar) {
    throw new GeminiError('targetChar required', 400);
  }

  const model = opts.model || DEFAULT_MODEL;
  const maxAttempts = opts.maxAttempts ?? 3;
  const prompt = buildPrompt(seed);

  let lastReason = 'unknown';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const raw = await callGemini(prompt, apiKey, model);
    const candidate = cleanCandidate(raw);
    const reason = validateCandidate(candidate, seed.targetChar);
    if (!reason) {
      return { sentence: candidate };
    }
    lastReason = reason;
  }

  throw new GeminiError(
    `Could not generate a valid sentence (${lastReason})`,
    502,
  );
}

/**
 * Probe whether `apiKey` is a valid Gemini key WITHOUT spending generate quota.
 *
 * Hits the models-list endpoint (a free metadata GET) and maps the HTTP status:
 *   200       → { valid: true,  reason: 'ok' }
 *   400 | 403 → { valid: false, reason: 'invalid' }       (bad / unauthorized key)
 *   429       → { valid: true,  reason: 'rate_limited' }   (throttled; key likely OK)
 *   other     → { valid: false, reason: 'error' }          (server returned something odd)
 * A network failure also resolves to { valid: false, reason: 'error' } — this
 * function does not throw, so callers get a structured result every time.
 *
 * SECURITY: the key is sent transiently for this one request and is NEVER logged.
 */
export async function testKey(apiKey: string): Promise<TestKeyResult> {
  if (!apiKey) {
    // Treat an empty key as invalid rather than throwing — endpoints guard for
    // presence separately, but this keeps the helper total.
    return { valid: false, reason: 'invalid' };
  }

  let res: Response;
  try {
    res = await fetch(
      `${GEMINI_MODELS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
    );
  } catch {
    // Network / DNS / fetch failure — couldn't determine validity. Never log the key.
    return { valid: false, reason: 'error' };
  }

  if (res.ok) return { valid: true, reason: 'ok' };
  if (res.status === 429) return { valid: true, reason: 'rate_limited' };
  if (res.status === 400 || res.status === 403) return { valid: false, reason: 'invalid' };
  return { valid: false, reason: 'error' };
}
