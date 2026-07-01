/**
 * Reading-chinese data seam. Reading reuses the SAME sentence-generator engine
 * and the SAME NextSentenceResponse shape as writing-challenge (issue #65), so we
 * re-export those types rather than fork them. The difference is purely which
 * stat track the on-device layer reads/writes: reading routes to the offline
 * layer's reading-skill methods (getNextReadingSentence / submitReadingResult),
 * which NEVER touch the writing character_stats.
 */

export type {
  NextSentenceResponse,
  SentenceResultResponse,
  CharAttemptResult,
  CharResult,
} from '@modules/writing-challenge';

import type {
  NextSentenceResponse,
  SentenceResultResponse,
  CharAttemptResult,
} from '@modules/writing-challenge';
import type { OfflineDataLayer } from '@platform/offline/offline-data-layer.ts';

/** Next reading sentence from the on-device reading track. */
export function getNextReadingSentence(dataLayer: OfflineDataLayer): Promise<NextSentenceResponse> {
  return dataLayer.getNextReadingSentence();
}

/** Write a finished reading session to the reading track ONLY. */
export function submitReadingResult(
  dataLayer: OfflineDataLayer,
  sentenceId: number,
  durationMs: number,
  charResults: CharAttemptResult[],
): Promise<SentenceResultResponse> {
  return dataLayer.submitReadingResult(sentenceId, durationMs, charResults);
}
