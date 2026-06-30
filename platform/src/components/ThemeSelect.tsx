import { useMemo } from 'react';
import { useT } from '../i18n/index.ts';
import { OptionSelect, type SelectOption } from './OptionSelect.tsx';
import { THEMES, isThemeAvailable } from '../theme/theme-store.ts';
import { isDevicePremiumUnlocked } from '../theme/theme-store.ts';
import { PREMIUM_FEATURE } from '../theme/themes.ts';

/**
 * Theme picker — reuses the shared {@link OptionSelect} (the extracted voice
 * dropdown UI). Lists ONLY the themes available in this context: the default
 * theme always, plus premium themes (gold/silver) when premium is unlocked
 * device-wide. Locked premium themes are NOT shown at all — there is no
 * lock badge and no redeem-on-select here.
 *
 * Unlocking premium happens elsewhere: under the Device ID in Device Settings,
 * via the {@link CodeEntry} keypad (code 9999), which unlocks premium for the
 * whole device. Pass a `refreshKey` that changes after such an unlock so this
 * selector re-derives its option list and the now-available themes appear.
 *
 * Selecting an option simply applies it via onChange. `inheritLabel` (optional)
 * adds a leading "use device theme" row whose value is '' — for the profile
 * selector.
 */
export function ThemeSelect({ value, onChange, scope, profileId, inheritLabel, refreshKey }: {
  value: string;
  onChange: (themeId: string) => void;
  /** Documents which selector this is; both gate on the same device unlock. */
  scope: 'device' | 'profile';
  profileId?: number;
  /** When set, prepends an "inherit/use device" option with value ''. */
  inheritLabel?: string;
  /** Bump to force the option list to re-derive after a device premium unlock. */
  refreshKey?: number;
}) {
  const t = useT();
  // scope/profileId are kept for caller clarity but no longer change gating.
  void scope; void profileId;

  const options: SelectOption[] = useMemo(() => {
    // refreshKey is a dep so the list refreshes after a device unlock.
    void refreshKey;
    const opts: SelectOption[] = [];
    if (inheritLabel !== undefined) opts.push({ value: '', label: inheritLabel });
    for (const th of THEMES) {
      // Only list themes that are actually available — locked premium themes
      // do not appear at all.
      if (!isThemeAvailable(th)) continue;
      const label = th.nameKey ? t(th.nameKey as Parameters<typeof t>[0]) : th.name;
      opts.push({ value: th.id, label });
    }
    return opts;
  }, [t, inheritLabel, refreshKey]);

  return (
    <OptionSelect value={value} options={options} onChange={onChange} ariaLabel={t('settings.theme')} />
  );
}

// Re-export so callers can show "premium unlocked" state without reaching into
// the store directly.
export { isDevicePremiumUnlocked, PREMIUM_FEATURE };
