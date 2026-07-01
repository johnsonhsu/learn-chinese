const BASE = "/api/writing-challenge";

export interface ProfileData {
  id: number;
  currentLevel: number;
  assessedLevel: number;
  curriculumPosition: number;
  knownWords: string[];
  stats: {
    totalPracticed: number;
    streakDays: number;
    lastPracticeDate: string;
  };
}

export interface Sentence {
  trad: string;
  english: string;
}

export type CharResult = "perfect" | "correct" | "incorrect" | "skip";

export interface CharAttemptResult {
  char: string;
  result: CharResult;
  failedStrokes: number;
  hintUsed: boolean;
  durationMs: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export const getProfile = (userId: number) => request<ProfileData>(`/profile?userId=${userId}`);

export const startAssessment = (userId: number) =>
  request<{ sentence: Sentence; step: number; totalSteps: number }>("/assessment/start", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });

export const submitAssessment = (userId: number, charResults: CharAttemptResult[]) =>
  request<{
    done: boolean;
    sentence?: Sentence;
    step?: number;
    totalSteps?: number;
    assessedLevel?: number;
    knownChars?: string[];
  }>("/assessment/submit", { method: "POST", body: JSON.stringify({ userId, charResults }) });

export const getModuleSettings = () => request<Record<string, string>>("/settings");

// --- Practice ---

export interface NextSentenceResponse {
  sessionId: number;
  sentenceId: number;
  text: string;
  definition: string;
  templatePattern: string;
  slotFills: { name: string; value: string }[];
  zhuyin: string;
  targetChar: string;
  targetChars: string[];
  level: number;
  knownInLevel: number;
  totalInLevel: number;
  charRanks: Record<string, number>;
  charZhuyin: Record<string, string>;
  charMastery: Record<string, number>;
  fluency: number;
  totalKnown: number;
  aboveLevelThreshold: number;
}

export interface SentenceResultResponse {
  level: number;
  knownInLevel: number;
  totalInLevel: number;
  fluency?: number;
  totalKnown?: number;
}

// --- Offline layer integration ---

interface OfflineLayer {
  getNextSentence(): Promise<NextSentenceResponse>;
  submitResult(
    _sentenceId: number,
    _durationMs: number,
    _charResults: CharAttemptResult[],
  ): Promise<SentenceResultResponse>;
}

let _offlineLayer: OfflineLayer | null = null;

export function setOfflineLayer(layer: OfflineLayer | null) {
  _offlineLayer = layer;
}

const _serverGetNextSentence = (userId: number) =>
  request<NextSentenceResponse>("/practice/next", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });

const _serverSubmitResult = (
  userId: number,
  sentenceId: number,
  durationMs: number,
  charResults: CharAttemptResult[],
) =>
  request<SentenceResultResponse>("/practice/result", {
    method: "POST",
    body: JSON.stringify({ userId, sentenceId, durationMs, charResults }),
  });

export const getNextSentence = async (userId: number): Promise<NextSentenceResponse> => {
  // Local-first: the on-device data layer is the primary source when ready.
  if (_offlineLayer) return _offlineLayer.getNextSentence();
  return _serverGetNextSentence(userId);
};

export const submitResult = async (
  userId: number,
  sentenceId: number,
  durationMs: number,
  charResults: CharAttemptResult[],
): Promise<SentenceResultResponse> => {
  if (_offlineLayer) return _offlineLayer.submitResult(sentenceId, durationMs, charResults);
  return _serverSubmitResult(userId, sentenceId, durationMs, charResults);
};

const _serverReportSentence = (
  userId: number,
  sentenceText: string,
  english: string,
  templatePattern: string,
  slotFills: { name: string; value: string }[],
  reason: string,
) =>
  request<{ id: number }>("/report-sentence", {
    method: "POST",
    body: JSON.stringify({
      userId,
      sentenceText,
      english,
      templatePattern,
      slotFills: JSON.stringify(slotFills),
      reason,
    }),
  });

export const reportSentence = async (
  userId: number,
  sentenceText: string,
  english: string,
  templatePattern: string,
  slotFills: { name: string; value: string }[],
  reason: string,
): Promise<{ id: number }> => {
  if (!navigator.onLine && _offlineLayer) {
    const { enqueueSync } = await import("../../../../platform/src/offline/sync-queue.js");
    await enqueueSync("report_sentence", {
      userId,
      sentenceText,
      english,
      templatePattern,
      slotFills: JSON.stringify(slotFills),
      reason,
    });
    return { id: Date.now() };
  }
  try {
    return await _serverReportSentence(
      userId,
      sentenceText,
      english,
      templatePattern,
      slotFills,
      reason,
    );
  } catch (e) {
    if (_offlineLayer) {
      const { enqueueSync } = await import("../../../../platform/src/offline/sync-queue.js");
      await enqueueSync("report_sentence", {
        userId,
        sentenceText,
        english,
        templatePattern,
        slotFills: JSON.stringify(slotFills),
        reason,
      });
      return { id: Date.now() };
    }
    throw e;
  }
};
