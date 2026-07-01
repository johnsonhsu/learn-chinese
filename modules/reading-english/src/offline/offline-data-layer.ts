/**
 * Offline data layer for reading-english (issue #69).
 * Loads content.db (the shared curated bank sentences — Chinese prompt + English
 * answer) and tracks per-word READING mastery in a DISTINCT IndexedDB from
 * practice-english's spelling store (see user-store.ts). It is a pure consumer of
 * `content.db` — it ships NO DB of its own.
 *
 * Mirrors practice-english's data layer, but the public API is the reading track:
 * `getNextReadingSentence()` / `submitReadingResult()`. Reading progress is
 * computed only from THIS layer's own word store, never practice-english's.
 */

import { initSqlite, openDatabase, type SqlJsDatabase } from './sql-db.js';
import { loadDb, downloadAndStoreDb, getContentVersion, setContentVersion } from './db-store.js';
import { listProfiles, putProfile, getProfileWordStats, putProfileWordStats,
  getPref, setPref, type WordStatRecord, type Profile } from './user-store.js';
import { selectNextSentence, type Sentence, type ReadingQuestion } from '../cloze.js';

export interface WordStat {
  word: string;
  timesSeen: number;
  timesCorrect: number;
  timesIncorrect: number;
  streakCorrect: number;
  bestStreakCorrect: number;
  firstSeen: string;
  lastSeen: string;
  lastCorrect: string;
  recentResults: string;
}

function rowToWordStat(r: WordStatRecord): WordStat {
  return {
    word: String(r['character']),
    timesSeen: Number(r['times_seen'] ?? 0),
    timesCorrect: Number(r['times_correct'] ?? 0),
    timesIncorrect: Number(r['times_incorrect'] ?? 0),
    streakCorrect: Number(r['streak_correct'] ?? 0),
    bestStreakCorrect: Number(r['best_streak_correct'] ?? 0),
    firstSeen: String(r['first_seen'] ?? ''),
    lastSeen: String(r['last_seen'] ?? ''),
    lastCorrect: String(r['last_correct'] ?? ''),
    recentResults: String(r['recent_results'] ?? ''),
  };
}

export class OfflineDataLayer {
  private sentenceDb: SqlJsDatabase | null = null;
  private sentences: Sentence[] = [];
  private contentVersion: string | null = null;
  private userId = 0;
  private localUser: { id: number; name: string; displayName: string } = { id: 0, name: 'me', displayName: 'Me' };
  private wordStats: Map<string, WordStat> = new Map();
  private recentSentenceIds: number[] = [];

  async initialize(): Promise<void> {
    await initSqlite();

    let remoteVersion: string | null = null;
    try {
      const res = await fetch('/data/version.json', { cache: 'no-cache' });
      // Gate DB re-download on the DATA fingerprint `contentHash`, not per-build `version`.
      if (res.ok) {
        const j = (await res.json()) as { version?: string; contentHash?: string };
        remoteVersion = j.contentHash ?? j.version ?? null;
      }
    } catch { /* offline */ }

    const cachedVersion = await getContentVersion();
    let dbData = await loadDb('content');
    const needDownload = !dbData || (remoteVersion !== null && remoteVersion !== cachedVersion);

    if (needDownload) {
      const bust = remoteVersion ? `?v=${remoteVersion}` : '';
      dbData = await downloadAndStoreDb('content', `/data/content.db${bust}`);
      if (remoteVersion) await setContentVersion(remoteVersion);
    }

    this.contentVersion = remoteVersion ?? cachedVersion;
    this.sentenceDb = openDatabase(dbData!);

    // Load all sentences into memory for fast selection.
    const stmt = this.sentenceDb.prepare('SELECT id, sentence, english FROM bank_sentences ORDER BY id');
    while (stmt.step()) {
      const r = stmt.getAsObject() as { id: number; sentence: string; english: string };
      if (r.english) this.sentences.push({ id: r.id, chinese: r.sentence, english: r.english });
    }
    stmt.free();
  }

  get isReady(): boolean { return this.sentenceDb !== null; }
  get contentVersionId(): string | null { return this.contentVersion; }

  // --- Profile management (platform owns identity; we key our reading store by it) ---

  listProfiles(): Promise<Profile[]> { return listProfiles(); }

  async setActiveProfile(profileId: number): Promise<void> {
    const profiles = await listProfiles();
    const p = profiles.find((x) => x.id === profileId);
    // Ensure a profile row exists so per-profile reading stats stay attributable.
    if (!p) await putProfile({ id: profileId, name: 'me', createdAt: new Date().toISOString() });
    this.userId = profileId;
    this.localUser = { id: profileId, name: p?.name ?? 'me', displayName: p?.name ?? 'Me' };
    await this.loadWordStats();
  }

  getLocalUser() { return this.localUser; }

  // --- Settings prefs ---

  async getSettingsPrefs(): Promise<{ language: 'zh-TW' | 'en' }> {
    const language = (await getPref<string>('language')) as 'zh-TW' | 'en' | null;
    return { language: language || 'zh-TW' };
  }

  // --- Reading word stats (this layer's OWN store only) ---

  private async loadWordStats(): Promise<void> {
    const records = await getProfileWordStats(this.userId);
    this.wordStats.clear();
    for (const r of records) {
      const stat = rowToWordStat(r);
      this.wordStats.set(stat.word, stat);
    }
  }

  getWordStatsList(): WordStat[] {
    return [...this.wordStats.values()];
  }

  /** Words mastered for READING: ≥3 of the last 4 attempts correct (same rule as
   *  practice-english's spelling mastery, computed over the reading store). */
  getMasteredWords(): Set<string> {
    const mastered = new Set<string>();
    for (const s of this.wordStats.values()) {
      const codes = s.recentResults.split(',').filter(Boolean);
      if (codes.length < 3) continue;
      const last4 = codes.slice(-4);
      const correct = last4.filter((c) => c === 'C').length;
      if (correct >= 3) mastered.add(s.word);
    }
    return mastered;
  }

  // --- Reading practice ---

  getNextReadingSentence(): ReadingQuestion | null {
    const mastered = this.getMasteredWords();
    return selectNextSentence(this.sentences, mastered, this.recentSentenceIds);
  }

  /** Record one word's reading outcome into the READING store only. */
  async submitReadingResult(sentenceId: number, word: string, correct: boolean): Promise<void> {
    this.recentSentenceIds.push(sentenceId);
    if (this.recentSentenceIds.length > 30) this.recentSentenceIds.shift();

    const now = new Date().toISOString();
    const existing = this.wordStats.get(word);
    const code = correct ? 'C' : 'I';

    let updated: WordStat;
    if (existing) {
      const recent = (existing.recentResults ? existing.recentResults + ',' : '') + code;
      const recentTrimmed = recent.split(',').slice(-10).join(',');
      const streakCorrect = correct ? existing.streakCorrect + 1 : 0;
      updated = {
        ...existing,
        timesSeen: existing.timesSeen + 1,
        timesCorrect: existing.timesCorrect + (correct ? 1 : 0),
        timesIncorrect: existing.timesIncorrect + (correct ? 0 : 1),
        streakCorrect,
        bestStreakCorrect: Math.max(existing.bestStreakCorrect, streakCorrect),
        lastSeen: now,
        lastCorrect: correct ? now : existing.lastCorrect,
        recentResults: recentTrimmed,
      };
    } else {
      updated = {
        word,
        timesSeen: 1,
        timesCorrect: correct ? 1 : 0,
        timesIncorrect: correct ? 0 : 1,
        streakCorrect: correct ? 1 : 0,
        bestStreakCorrect: correct ? 1 : 0,
        firstSeen: now,
        lastSeen: now,
        lastCorrect: correct ? now : '',
        recentResults: code,
      };
    }

    this.wordStats.set(word, updated);

    const record: WordStatRecord = {
      character: word,
      times_seen: updated.timesSeen,
      times_correct: updated.timesCorrect,
      times_incorrect: updated.timesIncorrect,
      streak_correct: updated.streakCorrect,
      best_streak_correct: updated.bestStreakCorrect,
      first_seen: updated.firstSeen,
      last_seen: updated.lastSeen,
      last_correct: updated.lastCorrect,
      recent_results: updated.recentResults,
    };
    await putProfileWordStats(this.userId, [record]);
  }

  // --- Stats summary for landing page ---

  getSummary(): { totalSeen: number; totalMastered: number; totalSentences: number } {
    const mastered = this.getMasteredWords();
    return {
      totalSeen: this.wordStats.size,
      totalMastered: mastered.size,
      totalSentences: this.sentences.length,
    };
  }

  setLanguagePref(language: string): Promise<void> { return setPref('language', language); }
}
