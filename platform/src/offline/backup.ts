/**
 * Backup & restore — save the local account (profiles + writing history +
 * prefs/settings) to a file the user can store anywhere (iCloud Drive, Files,
 * AirDrop, email…), and restore it later or on another device.
 *
 * Pure local + browser APIs: no cloud, no account, works offline. The export
 * format is also the natural payload if we ever add automatic cloud sync.
 */

import {
  listProfiles, putProfile, getProfileCharStats, putProfileCharStats,
  getAllPrefs, setPref, type Profile, type CharStatRecord,
} from './user-store.js';
import { getUnlockedFeatures, setUnlockedFeatures } from '../utils/unlocks.js';
import { exportThemeState, importThemeState, type ThemeBackup } from '../theme/theme-store.js';

const FORMAT = 'learning-chinese-backup';
const FORMAT_VERSION = 1;

interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  profiles: Profile[];
  stats: Record<string, CharStatRecord[]>; // profileId -> rows
  prefs: Record<string, unknown>;
  // Device-level code-gated feature unlocks (e.g. 'premium'), so they travel to a
  // new install. Optional: old backups predate this field — treated as none.
  unlockedFeatures?: string[];
  // Theme selection state (device theme + per-profile overrides + per-profile
  // unlocks), so the chosen look travels with the account. Optional: old backups
  // predate this field — treated as none (→ default theme).
  themeState?: ThemeBackup;
}

async function buildBackup(): Promise<BackupFile> {
  const profiles = await listProfiles();
  const stats: Record<string, CharStatRecord[]> = {};
  for (const p of profiles) {
    stats[String(p.id)] = await getProfileCharStats(p.id);
  }
  const prefs = await getAllPrefs();
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    stats,
    prefs,
    unlockedFeatures: getUnlockedFeatures(),
    themeState: exportThemeState(profiles.map((p) => p.id)),
  };
}

/**
 * Export the account to a file and hand it to the OS share sheet (so the user
 * picks the destination); falls back to a direct download where Web Share with
 * files isn't supported.
 */
export async function exportBackup(): Promise<void> {
  const data = await buildBackup();
  const json = JSON.stringify(data, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `learning-chinese-backup-${date}.json`;
  const file = new File([json], filename, { type: 'application/json' });

  // Prefer the OS share sheet (Save to Files / iCloud, AirDrop, Mail…).
  const nav = navigator as Navigator & { canShare?: (_d: unknown) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Learning Chinese backup' });
      return;
    } catch (e) {
      // user cancelled, or share failed — fall through to download
      if ((e as Error).name === 'AbortError') return;
    }
  }
  // Fallback: trigger a download.
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface BackupProfileSummary { id: number; name: string; charCount: number; }
export interface BackupSummary {
  profiles: BackupProfileSummary[];
  hasPrefs: boolean;
  exportedAt: string;
  version: number;
}
export interface ImportSelection { profileIds: number[]; includePrefs: boolean; }

async function parseAndValidate(file: File): Promise<BackupFile> {
  const text = await file.text();
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid backup file');
  }
  if (data.format !== FORMAT || !Array.isArray(data.profiles)) {
    throw new Error('Not a valid Learning Chinese backup');
  }
  return data;
}

/** Read + validate a backup and summarize its contents WITHOUT importing. */
export async function parseBackup(file: File): Promise<BackupSummary> {
  const data = await parseAndValidate(file);
  const profiles: BackupProfileSummary[] = [...data.profiles]
    .sort((a, b) => a.id - b.id)
    .map((p) => ({ id: p.id, name: p.name, charCount: (data.stats?.[String(p.id)] ?? []).length }));
  return {
    profiles,
    hasPrefs: !!data.prefs && Object.keys(data.prefs).length > 0,
    exportedAt: data.exportedAt,
    version: data.version,
  };
}

/** Newer-wins-by-last_seen per-character merge for one profile. Returns rows written. */
async function mergeStatsGroup(profileId: number, rows: CharStatRecord[]): Promise<number> {
  const existing = await getProfileCharStats(profileId);
  const existingByChar = new Map(existing.map((r) => [r.character, r]));
  const winners: CharStatRecord[] = [];
  for (const row of rows) {
    const cur = existingByChar.get(row.character);
    const incomingSeen = String((row as Record<string, unknown>).last_seen ?? '');
    const currentSeen = cur ? String((cur as Record<string, unknown>).last_seen ?? '') : '';
    if (!cur || incomingSeen > currentSeen) winners.push(row);
  }
  if (winners.length) await putProfileCharStats(profileId, winners);
  return winners.length;
}

/**
 * Restore selected profiles (and optionally device-wide prefs) from a backup.
 * Per-character merge is newer-wins by last_seen; profiles are upserted by id.
 */
export async function importBackupSelective(
  file: File,
  opts: ImportSelection,
): Promise<{ profiles: number; chars: number }> {
  const data = await parseAndValidate(file);
  const wanted = new Set(opts.profileIds);
  const selectedProfiles = data.profiles.filter((p) => wanted.has(p.id));
  for (const p of selectedProfiles) await putProfile(p);

  let charCount = 0;
  for (const [profileIdStr, rows] of Object.entries(data.stats || {})) {
    if (!wanted.has(Number(profileIdStr))) continue;
    charCount += await mergeStatsGroup(Number(profileIdStr), rows);
  }

  // Prefs are device-wide (language, levers, word-bank edits) — all or nothing.
  // Code-gated feature unlocks ride along with prefs (also device-wide); merged,
  // never dropped. Old backups lack the field — treated as no unlocks.
  if (opts.includePrefs) {
    for (const [k, v] of Object.entries(data.prefs || {})) await setPref(k, v);
    if (Array.isArray(data.unlockedFeatures)) setUnlockedFeatures(data.unlockedFeatures);
    // Theme state rides with prefs (cosmetic, device/profile-level). The device
    // theme + per-profile unlocks restore as-is; per-profile theme OVERRIDES are
    // narrowed to the profiles actually being imported, so we never strand an
    // override on a profile that wasn't restored.
    if (data.themeState) {
      const themed: ThemeBackup = {
        device: data.themeState.device,
        profileThemes: Object.fromEntries(
          Object.entries(data.themeState.profileThemes || {}).filter(([id]) => wanted.has(Number(id))),
        ),
        profileUnlocks: data.themeState.profileUnlocks || {},
      };
      importThemeState(themed);
    }
  }

  return { profiles: selectedProfiles.length, chars: charCount };
}

/** Restore everything (all profiles + prefs). Thin wrapper over the selective path. */
export async function importBackup(file: File): Promise<{ profiles: number; chars: number }> {
  const data = await parseAndValidate(file);
  return importBackupSelective(file, { profileIds: data.profiles.map((p) => p.id), includePrefs: true });
}
