// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDeviceTheme, setDeviceTheme,
  getProfileTheme, setProfileTheme,
  resolveEffectiveTheme, isThemeAvailable, isDevicePremiumUnlocked,
  applyThemeToBody, exportThemeState, importThemeState,
} from '../theme-store.js';
import { getTheme, isThemeId, THEMES, DEFAULT_THEME_ID, ROOT_THEME_ID } from '../themes.js';
import { setUnlockedFeatures } from '../../utils/unlocks.js';

// Assert against the exported ids, not literals — the default SELECTION
// (DEFAULT_THEME_ID) and the bare :root baseline (ROOT_THEME_ID) are distinct and
// their values may change; the behavior contract should not.

beforeEach(() => {
  localStorage.clear();
  delete document.body.dataset.theme;
});

describe('theme registry', () => {
  it('resolves known ids and falls back to the default selection for unknown/legacy', () => {
    expect(getTheme('midnight').id).toBe('midnight');
    expect(getTheme('nope').id).toBe(DEFAULT_THEME_ID);
    expect(getTheme(null).id).toBe(DEFAULT_THEME_ID);
  });

  it('isThemeId recognises only registered ids', () => {
    expect(isThemeId('gold')).toBe(true);
    expect(isThemeId('off')).toBe(false); // legacy premium-off sentinel
    expect(isThemeId(null)).toBe(false);
  });

  it('marks gold/silver premium and the rest free', () => {
    expect(THEMES.find((t) => t.id === 'gold')!.premium).toBe(true);
    expect(THEMES.find((t) => t.id === DEFAULT_THEME_ID)!.premium).toBe(false);
  });
});

describe('device theme persistence', () => {
  it('defaults to the default selection when unset', () => {
    expect(getDeviceTheme()).toBe(DEFAULT_THEME_ID);
  });

  it('round-trips a non-default theme', () => {
    setDeviceTheme('midnight');
    expect(getDeviceTheme()).toBe('midnight');
  });

  it('clears the stored key when set to the default selection', () => {
    setDeviceTheme('midnight');
    setDeviceTheme(DEFAULT_THEME_ID);
    expect(getDeviceTheme()).toBe(DEFAULT_THEME_ID);
    expect(localStorage.getItem('lc-gold-mode')).toBeNull();
  });

  it('ignores unknown ids', () => {
    setDeviceTheme('bogus');
    expect(getDeviceTheme()).toBe(DEFAULT_THEME_ID);
  });
});

describe('per-profile override', () => {
  it('is null until set, then round-trips, keyed by profile', () => {
    expect(getProfileTheme(1)).toBeNull();
    setProfileTheme(1, 'sakura');
    expect(getProfileTheme(1)).toBe('sakura');
    expect(getProfileTheme(2)).toBeNull();
  });

  it('clears with null/empty', () => {
    setProfileTheme(1, 'sakura');
    setProfileTheme(1, null);
    expect(getProfileTheme(1)).toBeNull();
  });
});

describe('resolveEffectiveTheme', () => {
  it('is the default selection with nothing chosen', () => {
    expect(resolveEffectiveTheme(1)).toBe(DEFAULT_THEME_ID);
  });

  it('uses the device theme when there is no profile override', () => {
    setDeviceTheme('midnight');
    expect(resolveEffectiveTheme(1)).toBe('midnight');
  });

  it('profile override beats the device theme', () => {
    setDeviceTheme('midnight');
    setProfileTheme(1, 'sakura');
    expect(resolveEffectiveTheme(1)).toBe('sakura');
    expect(resolveEffectiveTheme(2)).toBe('midnight'); // other profile inherits device
  });

  it('ignores a profile override when profileId is null', () => {
    setDeviceTheme('midnight');
    setProfileTheme(1, 'sakura');
    expect(resolveEffectiveTheme(null)).toBe('midnight');
  });

  it('SAFETY NET: a premium theme without the device unlock resolves to the default selection', () => {
    setDeviceTheme('gold'); // premium
    expect(isDevicePremiumUnlocked()).toBe(false);
    expect(resolveEffectiveTheme(1)).toBe(DEFAULT_THEME_ID);
  });

  it('renders a premium theme once premium is unlocked on the device', () => {
    setDeviceTheme('gold');
    setUnlockedFeatures(['premium']);
    expect(isDevicePremiumUnlocked()).toBe(true);
    expect(isThemeAvailable(getTheme('gold'))).toBe(true);
    expect(resolveEffectiveTheme(1)).toBe('gold');
  });
});

describe('applyThemeToBody', () => {
  it('removes body[data-theme] for the ROOT (Paper) theme — its tokens come from :root', () => {
    document.body.dataset.theme = 'gold';
    applyThemeToBody(ROOT_THEME_ID);
    expect(document.body.dataset.theme).toBeUndefined();
  });

  it('sets body[data-theme] for any non-root theme, including the default selection', () => {
    applyThemeToBody(DEFAULT_THEME_ID);
    expect(document.body.dataset.theme).toBe(DEFAULT_THEME_ID);
    applyThemeToBody('sakura');
    expect(document.body.getAttribute('data-theme')).toBe('sakura');
  });
});

describe('backup round-trip', () => {
  it('exports device + per-profile overrides and re-imports them', () => {
    setDeviceTheme('midnight');
    setProfileTheme(1, 'sakura');
    const snapshot = exportThemeState([1, 2]);
    expect(snapshot).toEqual({ device: 'midnight', profileThemes: { 1: 'sakura' } });

    localStorage.clear();
    importThemeState(snapshot);
    expect(getDeviceTheme()).toBe('midnight');
    expect(getProfileTheme(1)).toBe('sakura');
  });

  it('promotes a legacy per-profile premium unlock to the device level', () => {
    importThemeState({ device: ROOT_THEME_ID, profileThemes: {}, profileUnlocks: { 1: ['premium'] } });
    expect(isDevicePremiumUnlocked()).toBe(true);
  });
});
