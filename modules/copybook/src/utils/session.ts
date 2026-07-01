/* eslint-disable no-unused-vars -- callback arity matches shared types */

// Bridges the user's entered text into the shape the SHARED writing-challenge
// PracticePage consumes (NextSentenceResponse), and routes finished sessions
// back into the on-device progress store. This is what lets copybook reuse
// writing-challenge's polished writing screen verbatim — the entered text IS
// the "sentence" (there's no English definition, so the definition pill hides
// itself when `definition` is empty). The text is passed through one-to-one:
// same characters, same order, repeats preserved — no parsing or dedup.

import type {
  NextSentenceResponse,
  SentenceResultResponse,
  CharAttemptResult,
} from "@modules/writing-challenge";

// We only need the subset of the offline data layer that produces per-char
// metadata + records attempts. Declared structurally so copybook doesn't take a
// hard dependency on the platform's concrete class.
export interface SessionDataLayer {
  getCharRank(char: string): number | null;
  getCharZhuyin(char: string): string;
  getCharMastery(char: string): number;
  getModuleSettings(): Record<string, string>;
  getDebugInfo(): {
    level: number;
    knownInLevel: number;
    totalInLevel: number;
    fluency: number;
    totalKnown: number;
  } | null;
  submitResult(
    sentenceId: number,
    durationMs: number,
    charResults: CharAttemptResult[],
  ): Promise<SentenceResultResponse>;
}

// Build a `provideSession(userId)` for the shared PracticePage from the raw
// entered text. The component reads `text` (filtered for CJK) for the writing
// order, so passing the text verbatim preserves the user's exact characters,
// order, and repeats. The metadata maps below are keyed per distinct character
// (a lookup table), so iterating distinct chars is sufficient there.
export function makeProvideSession(
  dataLayer: SessionDataLayer | null,
  text: string,
): (_userId: number) => Promise<NextSentenceResponse> {
  return async () => {
    const charRanks: Record<string, number> = {};
    const charZhuyin: Record<string, string> = {};
    const charMastery: Record<string, number> = {};
    const distinctChars = [...new Set([...text])];

    if (dataLayer) {
      for (const c of distinctChars) {
        const rank = dataLayer.getCharRank(c);
        if (rank != null) charRanks[c] = rank;
        const zh = dataLayer.getCharZhuyin(c);
        if (zh) charZhuyin[c] = zh;
        charMastery[c] = dataLayer.getCharMastery(c);
      }
    }

    const info = dataLayer?.getDebugInfo() ?? null;
    const settings = dataLayer?.getModuleSettings() ?? {};
    const id = Date.now();

    return {
      sessionId: id,
      sentenceId: id,
      text,
      definition: "", // no English gloss for raw text → pill hides itself
      templatePattern: "",
      slotFills: [],
      zhuyin: "",
      targetChar: distinctChars[0] ?? "",
      targetChars: distinctChars,
      level: info?.level ?? 0,
      knownInLevel: info?.knownInLevel ?? 0,
      totalInLevel: info?.totalInLevel ?? 0,
      charRanks,
      charZhuyin,
      charMastery,
      fluency: info?.fluency ?? 0,
      totalKnown: info?.totalKnown ?? 0,
      aboveLevelThreshold: parseInt(settings["above_level_threshold"] || "30", 10),
    };
  };
}

// Record a finished session into the on-device progress store, then report the
// refreshed fluency/known counts for the completion screen.
export function makeSubmitSession(
  dataLayer: SessionDataLayer | null,
): (
  _userId: number,
  _sentenceId: number,
  _durationMs: number,
  _charResults: CharAttemptResult[],
) => Promise<SentenceResultResponse> {
  return async (_userId, sentenceId, durationMs, charResults) => {
    if (!dataLayer) {
      return { level: 0, knownInLevel: 0, totalInLevel: 0, fluency: 0, totalKnown: 0 };
    }
    const resp = await dataLayer.submitResult(sentenceId, durationMs, charResults);
    // Refresh derived counts so the done screen reflects what was just written.
    const info = dataLayer.getDebugInfo();
    return {
      ...resp,
      fluency: info?.fluency ?? resp.fluency,
      totalKnown: info?.totalKnown ?? resp.totalKnown,
    };
  };
}
