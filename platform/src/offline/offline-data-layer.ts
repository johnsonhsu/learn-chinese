/**
 * Offline data layer — runs practice sessions entirely client-side
 * using sql.js databases cached in IndexedDB.
 */

import { initSqlite, openDatabase, sqlJsProvider, type SqlJsDatabase } from './sql-db.js';
import { loadDb, downloadAndStoreDb, getContentVersion, setContentVersion, type DownloadProgress } from './db-store.js';
import { listProfiles, putProfile, createProfile, deleteProfile, getProfileCharStats, putProfileCharStats, countProfileCharStats, getLegacyCharStats, getPref, setPref, deletePref, listPrefKeys, type CharStatRecord } from './user-store.js';
import { loadStrokeData } from './stroke-data.js';
import { getRankedChars } from '@shared/character-stats/char-ranker';
import { getTargetChars, computeUserLevel } from '@shared/character-stats/char-knowledge';
import { generateNextSentence } from '@shared/character-stats/sentence-generator';
import { masteryConfigFromSettings, computeMastery } from '@shared/character-stats/mastery';
import { pinyinToZhuyin, DISAMBIG } from '@shared/character-stats/zhuyin';
import type { DbQueryProvider, RankedChar, CharStat } from '@shared/character-stats/types';
import type { NextSentenceResponse, SentenceResultResponse, CharAttemptResult } from '../../../modules/writing-challenge/src/utils/api.js';

// --- snake_case DB row -> camelCase CharStat ---

interface CharStatRow {
  user_id: number;
  character: string;
  times_seen: number;
  times_perfect: number;
  times_correct: number;
  times_incorrect: number;
  times_hint_used: number;
  streak_perfect: number;
  streak_correct: number;
  streak_incorrect: number;
  best_streak_perfect: number;
  best_streak_correct: number;
  first_seen: string;
  last_seen: string;
  last_perfect: string;
  last_correct: string;
  last_incorrect: string;
  fastest_ms: number;
  slowest_ms: number;
  total_ms: number;
  last_result: string;
  last_failed_strokes: number;
  last_hint_used: number;
  first_result: string;
  recent_results: string;
}

/**
 * Pure boot-time profile-resolution rule (extracted so it's unit-testable without
 * IndexedDB; {@link OfflineDataLayer.resolveAutoProfileId} is the IO wrapper):
 *  - the stored last id, if it still names an existing profile;
 *  - else the only profile, when exactly one exists;
 *  - else none (multiple profiles, no valid last → show the picker).
 *
 * Demo mode (issue #27) reaches the last branch on purpose: ensureDemoSeed seeds
 * >1 preset and clears lastProfileId, so the demo lands on the profile picker.
 */
export function resolveAutoProfile(profileIds: number[], lastId: number | null): number | null {
  if (profileIds.length === 0) return null;
  if (lastId != null && profileIds.includes(lastId)) return lastId;
  if (profileIds.length === 1) return profileIds[0];
  return null;
}

function rowToCharStat(r: CharStatRow): CharStat {
  return {
    character: r.character,
    timesSeen: r.times_seen ?? 0,
    timesPerfect: r.times_perfect ?? 0,
    timesCorrect: r.times_correct ?? 0,
    timesIncorrect: r.times_incorrect ?? 0,
    timesHintUsed: r.times_hint_used ?? 0,
    streakPerfect: r.streak_perfect ?? 0,
    streakCorrect: r.streak_correct ?? 0,
    streakIncorrect: r.streak_incorrect ?? 0,
    bestStreakPerfect: r.best_streak_perfect ?? 0,
    bestStreakCorrect: r.best_streak_correct ?? 0,
    firstSeen: r.first_seen ?? '',
    lastSeen: r.last_seen ?? '',
    lastPerfect: r.last_perfect ?? '',
    lastCorrect: r.last_correct ?? '',
    lastIncorrect: r.last_incorrect ?? '',
    fastestMs: r.fastest_ms ?? 0,
    slowestMs: r.slowest_ms ?? 0,
    totalMs: r.total_ms ?? 0,
    avgMs: r.times_seen > 0 ? Math.round((r.total_ms ?? 0) / r.times_seen) : 0,
    lastResult: r.last_result ?? '',
    lastFailedStrokes: r.last_failed_strokes ?? 0,
    lastHintUsed: r.last_hint_used ?? 0,
    firstResult: r.first_result ?? '',
    recentResults: r.recent_results ?? '',
  };
}

/**
 * Aggregate download progress across the baked DB files fetched on a new-device
 * load (or contentHash change). Only emitted while a download is actually
 * happening — cached/instant loads never fire this.
 *   - `percent`: 0–100 overall, or null when total size is unknown (any file
 *     missing a Content-Length → indeterminate bar).
 *   - `loadedBytes` / `totalBytes`: aggregate byte counts (totalBytes null when
 *     indeterminate).
 *   - `fileIndex` / `fileCount`: which file of how many is downloading.
 */
export interface InitProgress {
  percent: number | null;
  loadedBytes: number;
  totalBytes: number | null;
  fileIndex: number;
  fileCount: number;
}

// --- OfflineDataLayer ---

export class OfflineDataLayer {
  private platformDb: SqlJsDatabase | null = null;
  private moduleDb: SqlJsDatabase | null = null;
  private contentDb: SqlJsDatabase | null = null;
  private wordSetsDb: SqlJsDatabase | null = null;
  private platformProvider: DbQueryProvider | null = null;
  private moduleProvider: DbQueryProvider | null = null;
  private contentProvider: DbQueryProvider | null = null;
  private wordSetsProvider: DbQueryProvider | null = null;
  private rankedCharsCache: RankedChar[] | null = null;
  /** Recently-shown practice sentence texts (most-recent last), so a reload/next
   *  won't serve the same sentence back-to-back. Per-session/in-memory only. */
  private recentSentences: string[] = [];
  private static readonly RECENT_SENTENCE_LIMIT = 3;
  /** Per-device lever overrides, layered over the shipped (Mac-baked) defaults. */
  private settingsOverrides: Record<string, string> = {};
  private contentVersion: string | null = null;
  private tocflCache: Record<string, string> | null = null;
  private strokeReady: Promise<boolean> | null = null;
  private userId: number;
  private localUser: { id: number; name: string; displayName: string } = { id: 0, name: 'me', displayName: '我' };

  // userId omitted => resolve the single local user during initialize().
  constructor(userId?: number) {
    this.userId = userId ?? 0;
  }

  async initialize(onProgress?: (p: InitProgress) => void): Promise<void> {
    await initSqlite();

    // What shipped-content snapshot does the server/bundle currently offer?
    let remoteVersion: string | null = null;
    try {
      const res = await fetch('/data/version.json', { cache: 'no-cache' });
      // Gate DB (re)download on the DATA fingerprint `contentHash`, NOT the
      // per-build `version` — otherwise every code-only deploy would force an
      // ~18MB DB re-download on every device. Fall back to `version` for old JSON.
      if (res.ok) {
        const j = (await res.json()) as { version?: string; contentHash?: string };
        remoteVersion = j.contentHash ?? j.version ?? null;
      }
    } catch { /* offline; fall back to whatever is cached */ }

    const cachedVersion = await getContentVersion();
    let platformData = await loadDb('platform');
    let moduleData = await loadDb('writing-challenge');
    let contentData = await loadDb('content');
    let wordSetsData = await loadDb('word-sets');

    // (Re)download content when nothing is cached or a newer version shipped.
    const needDownload =
      !platformData || !moduleData || !contentData || !wordSetsData ||
      (remoteVersion !== null && remoteVersion !== cachedVersion);

    if (needDownload) {
      // Cache-bust by version so a CDN can't serve a stale DB at the fixed path.
      const bust = remoteVersion ? `?v=${remoteVersion}` : '';
      // Aggregate progress across the baked DB files. Each file streams its own
      // loaded/total; we sum the latest report per file into an overall percent.
      // If ANY file lacks a Content-Length we drop to indeterminate (percent
      // null), since we can't know the overall total. The stroke bundle stays
      // background-loaded (its own toast) and is not part of this gate.
      const files = ['platform', 'writing-challenge', 'content', 'word-sets'] as const;
      const fileCount = files.length;
      const last: DownloadProgress[] = files.map(() => ({ loaded: 0, total: null, done: false }));
      const report = (fileIndex: number) => {
        if (!onProgress) return;
        const loadedBytes = last.reduce((n, p) => n + p.loaded, 0);
        const anyUnknown = last.some((p) => p.total === null);
        const totalBytes = anyUnknown ? null : last.reduce((n, p) => n + (p.total ?? 0), 0);
        const percent =
          totalBytes && totalBytes > 0
            ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
            : null;
        onProgress({ percent, loadedBytes, totalBytes, fileIndex, fileCount });
      };
      const track = (i: number) => (p: DownloadProgress) => { last[i] = p; report(i); };

      report(0);
      platformData = await downloadAndStoreDb('platform', `/data/platform.db${bust}`, track(0));
      moduleData = await downloadAndStoreDb('writing-challenge', `/data/writing-challenge.db${bust}`, track(1));
      contentData = await downloadAndStoreDb('content', `/data/content.db${bust}`, track(2));
      wordSetsData = await downloadAndStoreDb('word-sets', `/data/word-sets.db${bust}`, track(3));
      if (remoteVersion) await setContentVersion(remoteVersion);
    }

    this.contentVersion = remoteVersion ?? cachedVersion;
    this.platformDb = openDatabase(platformData!);
    this.moduleDb = openDatabase(moduleData!);
    this.contentDb = openDatabase(contentData!);
    this.wordSetsDb = openDatabase(wordSetsData!);
    this.platformProvider = sqlJsProvider(this.platformDb);
    this.moduleProvider = sqlJsProvider(this.moduleDb);
    this.contentProvider = sqlJsProvider(this.contentDb);
    this.wordSetsProvider = sqlJsProvider(this.wordSetsDb);

    // Per-device lever overrides (persist across content updates; in backups).
    this.settingsOverrides = (await getPref<Record<string, string>>('settingsOverrides')) || {};

    // Ensure a default profile exists, migrating any pre-profiles progress.
    // No profile is made active yet — the picker selects one (setActiveProfile).
    await this.ensureMigrated();
    await this.cleanOrphanPlacementFlags();

    // Load the offline stroke bundle in the background so boot isn't blocked by
    // the ~20MB download; charDataLoader falls back to CDN until it's ready.
    this.strokeReady = loadStrokeData({ version: remoteVersion ?? cachedVersion, forceDownload: needDownload })
      .then(() => true)
      .catch((e) => { console.error('Stroke data load failed:', e); return false; });
  }

  /** Resolves true once the offline stroke bundle is cached & in memory. */
  whenStrokeReady(): Promise<boolean> {
    return this.strokeReady ?? Promise.resolve(false);
  }

  /** Overwrite the in-memory character_stats with the active profile's records. */
  private async applyUserStats(): Promise<void> {
    if (!this.platformProvider) return;
    const records = await getProfileCharStats(this.userId);
    this.platformProvider.run('DELETE FROM character_stats WHERE user_id = ?', [this.userId]);
    for (const rec of records) {
      const row: Record<string, unknown> = { ...rec, user_id: this.userId };
      delete row.profileId; // storage-only key, not a character_stats column
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(',');
      const values = cols.map((c) => row[c] ?? null);
      this.platformProvider.run(
        `INSERT OR REPLACE INTO character_stats (${cols.join(',')}) VALUES (${placeholders})`,
        values,
      );
    }
    this.rankedCharsCache = null;
  }

  get contentVersionId(): string | null {
    return this.contentVersion;
  }

  /** Create a default profile (once), migrating any pre-profiles progress. */
  /** Remove placementDone:<id> flags for profiles that no longer exist, so a
   *  recreated/reused profile id isn't wrongly treated as already-placed. Heals
   *  devices where a profile was deleted before the delete-time cleanup existed. */
  private async cleanOrphanPlacementFlags(): Promise<void> {
    try {
      const ids = new Set((await listProfiles()).map((p) => p.id));
      for (const key of await listPrefKeys()) {
        const m = key.match(/^placementDone:(\d+)$/);
        if (m && !ids.has(Number(m[1]))) await deletePref(key);
      }
    } catch { /* best-effort */ }
  }

  private async ensureMigrated(): Promise<void> {
    if (!this.platformProvider) return;
    if (await getPref('profilesMigratedV2')) return;

    const legacy = await getLegacyCharStats();
    if (legacy.length > 0) {
      // v1 single-profile data → default profile, preserving all progress.
      const id = (legacy[0].user_id as number) || (await getPref<number>('localUserId')) || 1;
      const urow = this.platformProvider.queryOne<{ name: string; display_name: string }>(
        'SELECT name, display_name FROM users WHERE id = ?', [id],
      );
      const name = (await getPref<string>('displayName')) || urow?.display_name || urow?.name || '我';
      await putProfile({ id, name, createdAt: new Date().toISOString() });
      await putProfileCharStats(id, legacy);
    }
    // Fresh install (no legacy data): no profile is auto-created — the welcome
    // popup collects the user's name + language and creates the first profile.
    await setPref('profilesMigratedV2', '1');
  }

  /** Make a profile active: scope stats to it and replay its progress. */
  async setActiveProfile(profileId: number): Promise<void> {
    const p = (await listProfiles()).find((x) => x.id === profileId);
    this.userId = profileId;
    this.localUser = { id: profileId, name: p?.name ?? 'me', displayName: p?.name ?? '我' };
    this.rankedCharsCache = null;
    // Remember the last-used profile so the next boot auto-selects it.
    await setPref('lastProfileId', profileId);
    await this.applyUserStats();
  }

  /**
   * Resolve which profile (if any) to auto-select on boot. Reads IndexedDB then
   * applies the pure {@link resolveAutoProfile} rule. In demo mode ensureDemoSeed
   * deliberately clears lastProfileId with >1 preset profile, so this returns
   * null and the picker shows (issue #27); the real app keeps its last profile.
   */
  async resolveAutoProfileId(): Promise<number | null> {
    const profiles = await listProfiles();
    const last = await getPref<number>('lastProfileId');
    return resolveAutoProfile(profiles.map((p) => p.id), last);
  }

  // --- Profile management (device-local) ---

  listProfiles() { return listProfiles(); }
  createProfile(name: string) { return createProfile(name); }
  async deleteProfile(id: number) {
    await deleteProfile(id);
    // Clear per-profile prefs so a future profile reusing this id (or a re-created
    // one) isn't wrongly treated as already-placed.
    await deletePref(`placementDone:${id}`);
    // Don't auto-select a profile that no longer exists on the next boot.
    if ((await getPref<number>('lastProfileId')) === id) await deletePref('lastProfileId');
  }
  async renameProfile(id: number, name: string): Promise<void> {
    const p = (await listProfiles()).find((x) => x.id === id);
    if (p) await putProfile({ ...p, name });
    if (this.userId === id) this.localUser = { id, name, displayName: name };
  }

  get isReady(): boolean {
    return this.platformDb !== null && this.moduleDb !== null && this.contentDb !== null;
  }

  // --- Internal helpers ---

  /** Raw shipped (Mac-baked) module settings, no device overrides applied. */
  private getShippedSettings(): Record<string, string> {
    if (!this.moduleProvider) throw new Error('Not initialized');
    const rows = this.moduleProvider.queryAll<{ key: string; value: string }>(
      'SELECT key, value FROM module_settings',
    );
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return settings;
  }

  /** Effective settings the engine reads: shipped defaults + device overrides. */
  private getSettings(): Record<string, string> {
    return { ...this.getShippedSettings(), ...this.settingsOverrides };
  }

  private getCharacterStats(): CharStat[] {
    if (!this.platformProvider) throw new Error('Not initialized');
    const rows = this.platformProvider.queryAll<CharStatRow>(
      'SELECT * FROM character_stats WHERE user_id = ? ORDER BY last_seen DESC',
      [this.userId],
    );
    return rows.map(rowToCharStat);
  }

  private getRanked(): RankedChar[] {
    if (this.rankedCharsCache) return this.rankedCharsCache;
    if (!this.platformProvider) throw new Error('Not initialized');
    this.rankedCharsCache = getRankedChars(this.platformProvider, this.getSettings());
    return this.rankedCharsCache;
  }

  // --- Public API ---

  async getNextSentence(): Promise<NextSentenceResponse> {
    if (!this.platformProvider || !this.contentProvider) throw new Error('Not initialized');

    const settings = this.getSettings();
    const ranked = this.getRanked();
    const stats = this.getCharacterStats();

    const targetResult = getTargetChars(ranked, stats, settings);

    // Cut over to the sentence bank: practice sentences come from the curated
    // bank only (no template generation). Content is platform-owned (content.db).
    const bankSentences = this.contentProvider.queryAll<{ sentence: string; english: string }>(
      'SELECT sentence, english FROM bank_sentences',
    );

    const result = generateNextSentence({
      platformDb: this.platformProvider,
      contentDb: this.contentProvider,
      rankedChars: ranked,
      targetChars: targetResult.chars,
      level: targetResult.level,
      knownInLevel: targetResult.knownInLevel,
      totalInLevel: targetResult.totalInLevel,
      fluency: targetResult.fluency,
      totalKnown: targetResult.totalKnown,
      stats,
      settings,
      bankSentences,
      // Avoid repeating the last few sentences back-to-back on reload/next. The
      // generator falls back to a repeat if exclusion leaves no candidate.
      excludeSentences: this.recentSentences,
    });

    if (!result) throw new Error('No sentences available');

    // Remember this sentence so the next pick avoids it (bounded recent history).
    this.recentSentences.push(result.text);
    if (this.recentSentences.length > OfflineDataLayer.RECENT_SENTENCE_LIMIT) {
      this.recentSentences.shift();
    }

    return {
      sessionId: Date.now(),
      sentenceId: Date.now(),
      text: result.text,
      definition: result.english,
      templatePattern: result.templatePattern,
      slotFills: result.slotFills,
      zhuyin: '',
      targetChar: result.targetChar,
      targetChars: result.targetChars,
      level: result.level,
      knownInLevel: result.knownInLevel,
      totalInLevel: result.totalInLevel,
      charRanks: result.charRanks,
      charZhuyin: result.charZhuyin,
      charMastery: result.charMastery,
      fluency: result.fluency,
      totalKnown: result.totalKnown,
      aboveLevelThreshold: parseInt(settings['above_level_threshold'] || '30'),
    };
  }

  async submitResult(
    _sentenceId: number,
    _durationMs: number,
    charResults: CharAttemptResult[],
  ): Promise<SentenceResultResponse> {
    if (!this.platformProvider || !this.platformDb) throw new Error('Not initialized');

    const settings = this.getSettings();
    const now = new Date().toISOString();

    for (const cr of charResults) {
      const resultCode =
        cr.result === 'perfect'
          ? 'P'
          : cr.result === 'correct'
            ? 'C'
            : cr.result === 'skip'
              ? 'S'
              : 'I';

      const existing = this.platformProvider.queryOne<CharStatRow>(
        'SELECT * FROM character_stats WHERE user_id = ? AND character = ?',
        [this.userId, cr.char],
      );

      if (existing) {
        const isSkip = cr.result === 'skip';
        const streakPerfect = isSkip
          ? existing.streak_perfect
          : cr.result === 'perfect'
            ? existing.streak_perfect + 1
            : 0;
        const streakCorrect = isSkip
          ? existing.streak_correct
          : cr.result !== 'incorrect'
            ? existing.streak_correct + 1
            : 0;
        const streakIncorrect = isSkip
          ? existing.streak_incorrect
          : cr.result === 'incorrect'
            ? existing.streak_incorrect + 1
            : 0;
        const bestStreakPerfect = Math.max(existing.best_streak_perfect, streakPerfect);
        const bestStreakCorrect = Math.max(existing.best_streak_correct, streakCorrect);

        const fastestMs =
          cr.durationMs > 0
            ? existing.fastest_ms === 0
              ? cr.durationMs
              : Math.min(existing.fastest_ms, cr.durationMs)
            : existing.fastest_ms;
        const slowestMs =
          cr.durationMs > 0
            ? Math.max(existing.slowest_ms, cr.durationMs)
            : existing.slowest_ms;
        const addMs = cr.durationMs > 0 ? cr.durationMs : 0;

        const recent =
          (existing.recent_results ? existing.recent_results + ',' : '') + resultCode;
        const recentTrimmed = recent.split(',').slice(-10).join(',');

        this.platformProvider.run(
          `UPDATE character_stats SET
            times_seen = times_seen + 1,
            times_perfect = times_perfect + ?,
            times_correct = times_correct + ?,
            times_incorrect = times_incorrect + ?,
            times_hint_used = times_hint_used + ?,
            streak_perfect = ?, streak_correct = ?, streak_incorrect = ?,
            best_streak_perfect = ?, best_streak_correct = ?,
            last_seen = ?,
            last_perfect = CASE WHEN ? = 'P' THEN ? ELSE last_perfect END,
            last_correct = CASE WHEN ? != 'I' THEN ? ELSE last_correct END,
            last_incorrect = CASE WHEN ? = 'I' THEN ? ELSE last_incorrect END,
            fastest_ms = ?, slowest_ms = ?, total_ms = total_ms + ?,
            last_result = ?, last_failed_strokes = ?, last_hint_used = ?,
            recent_results = ?
          WHERE user_id = ? AND character = ?`,
          [
            cr.result === 'perfect' ? 1 : 0,
            cr.result === 'correct' ? 1 : 0,
            cr.result === 'incorrect' ? 1 : 0,
            cr.hintUsed ? 1 : 0,
            streakPerfect,
            streakCorrect,
            streakIncorrect,
            bestStreakPerfect,
            bestStreakCorrect,
            now,
            resultCode, now,
            resultCode, now,
            resultCode, now,
            fastestMs, slowestMs, addMs,
            cr.result, cr.failedStrokes, cr.hintUsed ? 1 : 0,
            recentTrimmed,
            this.userId,
            cr.char,
          ],
        );
      } else {
        this.platformProvider.run(
          `INSERT INTO character_stats (
            user_id, character,
            times_seen, times_perfect, times_correct, times_incorrect, times_hint_used,
            streak_perfect, streak_correct, streak_incorrect,
            best_streak_perfect, best_streak_correct,
            first_seen, last_seen, last_perfect, last_correct, last_incorrect,
            fastest_ms, slowest_ms, total_ms,
            last_result, last_failed_strokes, last_hint_used,
            first_result, recent_results
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.userId,
            cr.char,
            cr.result === 'perfect' ? 1 : 0,
            cr.result === 'correct' ? 1 : 0,
            cr.result === 'incorrect' ? 1 : 0,
            cr.hintUsed ? 1 : 0,
            cr.result === 'perfect' ? 1 : 0,
            cr.result !== 'incorrect' && cr.result !== 'skip' ? 1 : 0,
            cr.result === 'incorrect' ? 1 : 0,
            cr.result === 'perfect' ? 1 : 0,
            cr.result !== 'incorrect' && cr.result !== 'skip' ? 1 : 0,
            now, now,
            cr.result === 'perfect' ? now : '',
            cr.result !== 'incorrect' ? now : '',
            cr.result === 'incorrect' ? now : '',
            cr.durationMs > 0 ? cr.durationMs : 0,
            cr.durationMs > 0 ? cr.durationMs : 0,
            cr.durationMs > 0 ? cr.durationMs : 0,
            cr.result, cr.failedStrokes, cr.hintUsed ? 1 : 0,
            cr.result, resultCode,
          ],
        );
      }
    }

    // Persist only the affected character_stats rows to the user store
    // (NOT the whole platform DB — that's shipped, read-only content).
    const chars = [...new Set(charResults.map((c) => c.char))];
    if (chars.length > 0) {
      const ph = chars.map(() => '?').join(',');
      const updated = this.platformProvider.queryAll<CharStatRow>(
        `SELECT * FROM character_stats WHERE user_id = ? AND character IN (${ph})`,
        [this.userId, ...chars],
      );
      await putProfileCharStats(this.userId, updated as unknown as CharStatRecord[]);
    }

    // Recompute user level
    this.rankedCharsCache = null;
    const ranked = this.getRanked();
    const stats = this.getCharacterStats();
    const { level, knownInLevel, totalInLevel } = computeUserLevel(ranked, stats, settings);

    return { level, knownInLevel, totalInLevel };
  }

  // --- Public data accessors (replace server reads on the client) ---

  getLocalUser(): { id: number; name: string; displayName: string } {
    return this.localUser;
  }

  async getSettingsPrefs(): Promise<{ language: 'zh-TW' | 'en'; theme: 'dark' | 'light' }> {
    const language = (await getPref<string>('language')) as 'zh-TW' | 'en' | null;
    const theme = (await getPref<string>('theme')) as 'dark' | 'light' | null;
    return { language: language || 'zh-TW', theme: theme || 'dark' };
  }

  async updateSettingsPrefs(patch: Partial<{ language: string; theme: string; displayName: string }>): Promise<void> {
    if (patch.language !== undefined) await setPref('language', patch.language);
    if (patch.theme !== undefined) await setPref('theme', patch.theme);
    if (patch.displayName !== undefined) {
      await this.renameProfile(this.userId, patch.displayName);
    }
  }

  getModuleSettings(): Record<string, string> {
    return this.getSettings();
  }

  /**
   * Per-module enabled flags from the shipped (Mac-baked) platform.db
   * `module_config` table. Read-only on-device mirror of the dev admin's
   * `/api/admin/modules` enabled state — a module absent from the table
   * defaults to enabled (matches the server's `getModuleEnabled` default).
   */
  getModulesConfig(): Record<string, boolean> {
    if (!this.platformProvider) throw new Error('Not initialized');
    const rows = this.platformProvider.queryAll<{ name: string; enabled: number }>(
      'SELECT name, enabled FROM module_config',
    );
    const config: Record<string, boolean> = {};
    for (const r of rows) config[r.name] = r.enabled === 1;
    return config;
  }

  // --- Sentence Bank (read-only shipped content, for the admin Bank tab) ---
  //
  // On-device mirror of the dev server's writing-challenge admin reads. The
  // shapes below MUST match the Express routes' JSON exactly so the shared
  // admin panel renders identically on dev (/api) and on-device (this layer):
  //   GET /admin/char-coverage  -> CharCoverageRow[]   (see getBankCoverage)
  //   GET /admin/bank-sentences -> { total, sentences } (see getBankSentences)
  // The bank itself (bank_sentences) is baked into writing-challenge.db; the
  // char ranking comes from the same shared ranker the engine already uses.

  /** Difficulty score for one bank sentence (mirrors the server's bankDifficulty). */
  private bankDifficulty(sentence: string, rankMap: Map<string, number>): number {
    const chars = [...new Set([...sentence].filter((c) => /[一-鿿]/.test(c)))];
    if (!chars.length) return 0;
    const ranks = chars.map((c) => rankMap.get(c) ?? 6000);
    const max = Math.max(...ranks);
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    return Math.round(max * 0.6 + avg * 0.4);
  }

  /**
   * Per-character bank coverage: rank + TOCFL level + how many bank sentences
   * use the char and the avg difficulty of those sentences, plus a 5-bucket
   * difficulty distribution. Mirrors GET /admin/char-coverage row-for-row.
   */
  getBankCoverage(): {
    char: string; rank: number; level: string; count: number; avgDiff: number | null; dist: number[];
  }[] {
    if (!this.contentProvider) throw new Error('Not initialized');
    const ranked = this.getRanked();
    const rankMap = new Map(ranked.map((c) => [c.char, c.rank]));
    // 5 difficulty bands (400 wide): <400, 400-800, 800-1200, 1200-1600, 1600+
    const stats = new Map<string, { count: number; sumDiff: number; dist: number[] }>();
    const sentences = this.contentProvider.queryAll<{ sentence: string }>(
      'SELECT sentence FROM bank_sentences',
    );
    for (const s of sentences) {
      const diff = this.bankDifficulty(s.sentence, rankMap);
      const band = Math.min(4, Math.floor(diff / 400));
      for (const c of new Set([...s.sentence].filter((ch) => /[一-鿿]/.test(ch)))) {
        const st = stats.get(c) || { count: 0, sumDiff: 0, dist: [0, 0, 0, 0, 0] };
        st.count++; st.sumDiff += diff; st.dist[band]++; stats.set(c, st);
      }
    }
    return ranked.map((r) => {
      const st = stats.get(r.char);
      return {
        char: r.char,
        rank: r.rank,
        level: r.tocflLevel ?? '',
        count: st?.count ?? 0,
        avgDiff: st ? Math.round(st.sumDiff / st.count) : null,
        dist: st?.dist ?? [0, 0, 0, 0, 0],
      };
    });
  }

  /**
   * Search/list bank sentences. Mirrors GET /admin/bank-sentences: optional
   * `q` LIKE-matches sentence OR english, results are newest-first, capped by
   * `limit`, and each row carries a computed `difficulty`. Returns the bank
   * `total` alongside (the panel reads `.total` for its counter).
   */
  getBankSentences(q = '', limit = 200): {
    total: number;
    sentences: { id: number; sentence: string; english: string; difficulty: number }[];
  } {
    if (!this.contentProvider) throw new Error('Not initialized');
    const total = this.contentProvider.queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM bank_sentences',
    )?.c ?? 0;
    const lim = Math.max(1, Math.min(50000, limit || 200));
    let rows: { id: number; sentence: string; english: string }[];
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      rows = this.contentProvider.queryAll<{ id: number; sentence: string; english: string }>(
        'SELECT id, sentence, english FROM bank_sentences WHERE sentence LIKE ? OR english LIKE ? ORDER BY id DESC LIMIT ?',
        [like, like, lim],
      );
    } else {
      rows = this.contentProvider.queryAll<{ id: number; sentence: string; english: string }>(
        'SELECT id, sentence, english FROM bank_sentences ORDER BY id DESC LIMIT ?',
        [lim],
      );
    }
    const rankMap = new Map(this.getRanked().map((c) => [c.char, c.rank]));
    return {
      total,
      sentences: rows.map((s) => ({ ...s, difficulty: this.bankDifficulty(s.sentence, rankMap) })),
    };
  }

  // --- Levers (per-device setting overrides) ---

  /** Shipped (Mac-baked) defaults plus this device's overrides, for the UI. */
  getLevers(): { defaults: Record<string, string>; overrides: Record<string, string> } {
    return { defaults: this.getShippedSettings(), overrides: { ...this.settingsOverrides } };
  }

  /** Override one lever on this device. Persists and survives content updates. */
  async setLeverOverride(key: string, value: string): Promise<void> {
    this.settingsOverrides = { ...this.settingsOverrides, [key]: value };
    await setPref('settingsOverrides', this.settingsOverrides);
    this.rankedCharsCache = null; // ranking/level/targets depend on settings
  }

  /** Drop one override → that lever falls back to the shipped default. */
  async resetLeverOverride(key: string): Promise<void> {
    if (!(key in this.settingsOverrides)) return;
    const next = { ...this.settingsOverrides };
    delete next[key];
    this.settingsOverrides = next;
    await setPref('settingsOverrides', this.settingsOverrides);
    this.rankedCharsCache = null;
  }

  /** Drop all overrides → restore the shipped (Mac) defaults wholesale. */
  async resetAllLeverOverrides(): Promise<void> {
    this.settingsOverrides = {};
    await setPref('settingsOverrides', {});
    this.rankedCharsCache = null;
  }

  // --- New-user placement evaluation ---

  /** Unplaced = active profile has no stats and hasn't completed/skipped placement. */
  async needsPlacement(): Promise<boolean> {
    if (await getPref(`placementDone:${this.userId}`)) return false;
    return (await countProfileCharStats(this.userId)) === 0;
  }

  /** Mark placement complete or skipped for the active profile. */
  async setPlacementDone(): Promise<void> {
    await setPref(`placementDone:${this.userId}`, '1');
  }

  /**
   * Seed chars at/below the estimated frontier as "known" via synthetic perfect
   * history, so the existing level/known machinery places the user. Real practice
   * overwrites these rows, and 30-day recency/decay self-heals any over-placement.
   */
  async seedKnownFromPlacement(chars: string[]): Promise<void> {
    if (!this.platformProvider || chars.length === 0) return;
    const now = new Date().toISOString();
    const rows = chars.map((c) => ({
      character: c, user_id: this.userId,
      times_seen: 5, times_perfect: 5, times_correct: 0, times_incorrect: 0, times_hint_used: 0,
      streak_perfect: 5, streak_correct: 5, streak_incorrect: 0,
      best_streak_perfect: 5, best_streak_correct: 5,
      first_seen: now, last_seen: now, last_perfect: now, last_correct: now, last_incorrect: '',
      fastest_ms: 0, slowest_ms: 0, total_ms: 0,
      last_result: 'perfect', last_failed_strokes: 0, last_hint_used: 0,
      first_result: 'perfect', recent_results: 'P,P,P,P,P',
    }));
    for (const row of rows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(',');
      const values = cols.map((c) => (row as Record<string, unknown>)[c] ?? null);
      this.platformProvider.run(
        `INSERT OR REPLACE INTO character_stats (${cols.join(',')}) VALUES (${placeholders})`,
        values,
      );
    }
    await putProfileCharStats(this.userId, rows as unknown as CharStatRecord[]);
    this.rankedCharsCache = null;
  }

  getCharacterStatsList(): CharStat[] {
    return this.getCharacterStats();
  }

  getCharRanking(): RankedChar[] {
    return this.getRanked();
  }

  getCharTocflLevels(): Record<string, string> {
    if (this.tocflCache) return this.tocflCache;
    if (!this.contentProvider) return {};
    const order = ['第1級', '第1*級', '第2級', '第2*級', '第3級', '第3*級', '第4級', '第4*級', '第5級', '第6級', '第7級'];
    const rank: Record<string, number> = {};
    order.forEach((l, i) => { rank[l] = i; });
    const rows = this.contentProvider.queryAll<{ word: string; level: string }>(
      'SELECT word, level FROM tocfl_words',
    );
    const out: Record<string, string> = {};
    for (const { word, level } of rows) {
      for (const c of word) {
        if (/[一-鿿㐀-䶿]/.test(c)) {
          if (!out[c] || (rank[level] ?? 99) < (rank[out[c]] ?? 99)) out[c] = level;
        }
      }
    }
    this.tocflCache = out;
    return out;
  }

  /** Record a single character attempt (used by the standalone practice modal). */
  async recordAttempt(
    char: string,
    result: CharAttemptResult['result'],
    failedStrokes: number,
    hintUsed: boolean,
    durationMs: number,
  ): Promise<void> {
    await this.submitResult(0, durationMs, [{ char, result, failedStrokes, hintUsed, durationMs }]);
  }

  // --- Word Sets module (read-only shipped content) ---

  getWordSetCategories(): { id: number; nameZh: string; nameEn: string; icon: string; color: string; sortOrder: number; wordCount: number }[] {
    if (!this.wordSetsProvider) return [];
    const rows = this.wordSetsProvider.queryAll<{
      id: number; name_zh: string; name_en: string; icon: string; color: string; sort_order: number; word_count: number;
    }>(
      `SELECT c.id, c.name_zh, c.name_en, c.icon, c.color, c.sort_order,
              COUNT(cw.id) as word_count
       FROM categories c
       LEFT JOIN category_words cw ON cw.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order, c.name_en`,
    );
    return rows.map((r) => ({
      id: r.id, nameZh: r.name_zh, nameEn: r.name_en, icon: r.icon,
      color: r.color, sortOrder: r.sort_order, wordCount: r.word_count,
    }));
  }

  getWordSetCategoryWords(categoryId: number): { id: number; categoryId: number; word: string; definition: string; zhuyin: string; pinyin: string; sortOrder: number; tocflLevel: string }[] {
    if (!this.wordSetsProvider) return [];
    const rows = this.wordSetsProvider.queryAll<{
      id: number; category_id: number; word: string; definition: string; zhuyin: string; pinyin: string; sort_order: number;
    }>('SELECT * FROM category_words WHERE category_id = ? ORDER BY sort_order, word', [categoryId]);

    // Enrich with TOCFL level from the platform dictionary.
    const tocfl = new Map<string, string>();
    if (this.platformProvider && rows.length > 0) {
      const words = [...new Set(rows.map((r) => r.word))];
      const ph = words.map(() => '?').join(',');
      const lvls = this.platformProvider.queryAll<{ word: string; level: string }>(
        `SELECT word, level FROM dict_words WHERE dictionary_id = 1 AND level_source = 'TOCFL' AND word IN (${ph})`,
        words,
      );
      for (const r of lvls) if (!tocfl.has(r.word)) tocfl.set(r.word, r.level);
    }

    return rows.map((r) => ({
      id: r.id, categoryId: r.category_id, word: r.word, definition: r.definition,
      // Fall back to dictionary zhuyin when the stored value is empty (curation gaps).
      zhuyin: r.zhuyin || this.composeWordZhuyin(r.word),
      pinyin: r.pinyin, sortOrder: r.sort_order,
      tocflLevel: tocfl.get(r.word) || '',
    }));
  }

  /** Build a word's zhuyin from its characters (used when no stored zhuyin). */
  private composeWordZhuyin(word: string): string {
    const chars = [...word].filter((c) => /[一-鿿㐀-䶿]/.test(c));
    if (chars.length === 0) return '';
    return chars.map((c) => this.getCharZhuyin(c).replace(/\(.*\)$/, '')).join(' ').trim();
  }

  /** Per-char book-frequency ranks (matches the platform /api/char-ranks endpoint). */
  getCharFreqRanks(chars: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    if (!this.platformProvider || chars.length === 0) return out;
    const ph = chars.map(() => '?').join(',');
    const rows = this.platformProvider.queryAll<{ character: string; value: string }>(
      `SELECT c.character, m.value
       FROM dict_chars c
       JOIN dict_char_metadata m ON m.char_id = c.id
       WHERE c.dictionary_id = 1 AND m.key = 'freq_book_rank' AND c.character IN (${ph})`,
      chars,
    );
    for (const r of rows) out[r.character] = parseInt(r.value);
    return out;
  }

  getCharRank(char: string): number | null {
    if (!this.platformProvider) return null;
    return this.getRanked().find((r) => r.char === char)?.rank ?? null;
  }

  /** Zhuyin (bopomofo) for a single character — tocfl_words first, then dict pinyin. */
  getCharZhuyin(char: string): string {
    const hint = DISAMBIG[char];
    const decorate = (z: string) => (hint ? `${z}(${hint})` : z);
    if (this.contentProvider) {
      const row = this.contentProvider.queryOne<{ zhuyin: string }>(
        'SELECT zhuyin FROM tocfl_words WHERE word = ? AND LENGTH(word) = 1',
        [char],
      );
      if (row?.zhuyin) return decorate(row.zhuyin);
    }
    if (this.platformProvider) {
      const py = this.platformProvider.queryOne<{ value: string }>(
        `SELECT m.value FROM dict_chars c
         JOIN dict_char_metadata m ON m.char_id = c.id
         WHERE c.dictionary_id = 1 AND m.key = 'pinyin' AND c.character = ?`,
        [char],
      );
      if (py?.value) {
        const p = py.value.split(/[,\s\/]/)[0].trim();
        const zh = pinyinToZhuyin(p);
        if (zh && zh !== p) return decorate(zh);
      }
    }
    return '';
  }

  getCharMastery(char: string): number {
    if (!this.platformProvider) return 0;
    const settings = this.getSettings();
    const row = this.platformProvider.queryOne<CharStatRow>(
      'SELECT * FROM character_stats WHERE user_id = ? AND character = ?',
      [this.userId, char],
    );
    if (!row) return 0;
    return computeMastery(rowToCharStat(row), masteryConfigFromSettings(settings));
  }

  getDebugInfo(): {
    level: number;
    knownInLevel: number;
    totalInLevel: number;
    fluency: number;
    totalKnown: number;
    totalRanked: number;
    targetChars: string[];
    charMastery: Record<string, number>;
  } | null {
    if (!this.platformProvider) return null;
    const settings = this.getSettings();
    const ranked = this.getRanked();
    const stats = this.getCharacterStats();
    const { level, knownInLevel, totalInLevel, fluency, totalKnown, totalRanked } =
      computeUserLevel(ranked, stats, settings);
    const { chars: targetChars } = getTargetChars(ranked, stats, settings);

    const cfg = masteryConfigFromSettings(settings);
    const charMastery: Record<string, number> = {};
    for (const c of targetChars) {
      const stat = stats.find((s) => s.character === c);
      charMastery[c] = stat ? computeMastery(stat, cfg) : 0;
    }

    return {
      level,
      knownInLevel,
      totalInLevel,
      fluency,
      totalKnown,
      totalRanked,
      targetChars,
      charMastery,
    };
  }

  async refreshFromServer(): Promise<void> {
    // Pull the latest content version, then cache-bust the DB download.
    let v = '';
    try {
      const res = await fetch('/data/version.json', { cache: 'no-cache' });
      if (res.ok) {
        // Cache-bust by the DATA fingerprint (contentHash), not the per-build version.
        const j = (await res.json()) as { version?: string; contentHash?: string };
        const ver = j.contentHash ?? j.version;
        if (ver) { v = `?v=${ver}`; this.contentVersion = ver; await setContentVersion(ver); }
      }
    } catch { /* ignore */ }
    const platformData = await downloadAndStoreDb('platform', `/data/platform.db${v}`);
    const moduleData = await downloadAndStoreDb('writing-challenge', `/data/writing-challenge.db${v}`);
    const contentData = await downloadAndStoreDb('content', `/data/content.db${v}`);
    // Free the old sql.js WASM heaps before reopening — openDatabase allocates a
    // fresh ~18MB-each instance, and reassigning without close() leaks the old ones.
    this.platformDb?.close();
    this.moduleDb?.close();
    this.contentDb?.close();
    this.platformDb = openDatabase(platformData);
    this.moduleDb = openDatabase(moduleData);
    this.contentDb = openDatabase(contentData);
    this.platformProvider = sqlJsProvider(this.platformDb);
    this.moduleProvider = sqlJsProvider(this.moduleDb);
    this.contentProvider = sqlJsProvider(this.contentDb);
    this.rankedCharsCache = null;
    this.tocflCache = null;
    // Re-apply user progress over the refreshed content.
    await this.applyUserStats();
    // Refresh the stroke bundle too (force re-download to the latest version).
    await loadStrokeData({ version: this.contentVersion, forceDownload: true });
  }
}
