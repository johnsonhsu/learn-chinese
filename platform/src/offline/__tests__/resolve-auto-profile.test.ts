import { describe, it, expect } from 'vitest';
import { resolveAutoProfile } from '../offline-data-layer.ts';

// Guards the boot-time profile-resolution rule, including the demo-by-default
// divergence (issue #27): a demo load seeds >1 preset profile and clears the
// last-selected id, so the app lands on the profile PICKER (this rule returns
// null) instead of auto-entering a profile — while the real/installed app, which
// keeps a valid lastProfileId, still restores it.

describe('resolveAutoProfile', () => {
  it('restores the last-selected profile when it still exists (real app)', () => {
    expect(resolveAutoProfile([1, 2, 3], 2)).toBe(2);
  });

  it('auto-selects the sole profile when exactly one exists', () => {
    expect(resolveAutoProfile([7], null)).toBe(7);
    expect(resolveAutoProfile([7], 99)).toBe(7); // stale last → fall back to sole
  });

  it('shows the picker (null) with multiple profiles and no valid last — the demo case', () => {
    // ensureDemoSeed seeds 2 presets then clears lastProfileId → exactly this.
    expect(resolveAutoProfile([1, 2], null)).toBeNull();
    expect(resolveAutoProfile([1, 2], 99)).toBeNull(); // stale last is ignored
  });

  it('returns null when there are no profiles (→ WelcomePopup)', () => {
    expect(resolveAutoProfile([], null)).toBeNull();
    expect(resolveAutoProfile([], 1)).toBeNull();
  });
});
