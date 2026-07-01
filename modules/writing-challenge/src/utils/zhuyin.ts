import cnchar from "cnchar";
import "cnchar-trad";
import { pinyinToZhuyin, DISAMBIG } from "@shared/character-stats/zhuyin";

export { pinyinToZhuyin } from "@shared/character-stats/zhuyin";

function toSimplified(char: string): string {
  try {
    const s = (
      cnchar as unknown as { convert: { tradToSimple: (_c: string) => string } }
    ).convert.tradToSimple(char);
    return s || char;
  } catch {
    return char;
  }
}

export function getZhuyin(char: string): string {
  try {
    const simplified = toSimplified(char);
    const result = cnchar.spell(simplified, "tone");
    let pinyin = typeof result === "string" ? result : (result as string[])[0];
    if (!pinyin) return char;
    // Some readings come back as comma-separated polyphones — take the first
    if (pinyin.includes(",")) pinyin = pinyin.split(",")[0].trim();
    if (pinyin.includes("|")) pinyin = pinyin.split("|")[0].trim();
    const zhuyin = pinyinToZhuyin(pinyin);
    if (!zhuyin || zhuyin === pinyin) {
      // pinyinToZhuyin couldn't map — return pinyin as fallback
      const hint = DISAMBIG[char];
      return hint ? `${pinyin}(${hint})` : pinyin || char;
    }
    const hint = DISAMBIG[char];
    return hint ? `${zhuyin}(${hint})` : zhuyin;
  } catch {
    return char;
  }
}

export function getPinyin(char: string): string {
  try {
    const simplified = toSimplified(char);
    const result = cnchar.spell(simplified, "tone");
    return typeof result === "string" ? result : (result as string[])[0] || "";
  } catch {
    return "";
  }
}
