import { useMemo, type FormEvent } from "react";
import { useT } from "../i18n/index.ts";
import { THEMES, isThemeAvailable } from "../theme/theme-store.ts";
import { THEME_GROUP_LABELS, type Theme, type ThemeGroup } from "../theme/themes.ts";

type GroupedEntry = {
  group: ThemeGroup;
  themes: Theme[];
};

const GROUP_ORDER: ThemeGroup[] = [
  "default",
  "dark",
  "retro",
  "foil",
  "soft",
  "disney",
  "external",
];

function premiumUnlockHint(): string | undefined {
  const premiumAvailable = THEMES.some((th) => th.premium && isThemeAvailable(th));
  if (!premiumAvailable) return undefined;
  return "9000 → 9900/9901";
}

export function ThemeSelect({
  value,
  onChange,
  scope,
  profileId,
  inheritLabel,
  refreshKey,
}: {
  value: string;
  onChange: (_themeId: string) => void;
  scope: "device" | "profile";
  profileId?: number;
  inheritLabel?: string;
  refreshKey?: number;
}) {
  const t = useT();
  void scope;
  void profileId;

  const grouped: GroupedEntry[] = useMemo(() => {
    void refreshKey;
    const map: Record<ThemeGroup, Theme[]> = {
      default: [],
      dark: [],
      retro: [],
      foil: [],
      soft: [],
      disney: [],
      external: [],
    };
    for (const theme of THEMES) {
      if (!isThemeAvailable(theme)) continue;
      map[theme.group].push(theme);
    }
    return GROUP_ORDER.reduce<GroupedEntry[]>((acc, group) => {
      const themes = map[group];
      if (!themes.length) return acc;
      acc.push({ group, themes });
      return acc;
    }, []);
  }, [t, refreshKey]);

  const hint = premiumUnlockHint();

  const submit = (e: FormEvent<HTMLSelectElement>) => {
    const next = e.currentTarget.value;
    if (!next) return;
    onChange(next);
  };

  return (
    <select
      className="theme-select-groups"
      aria-label={t("settings.theme")}
      value={value}
      onChange={submit}
    >
      {typeof inheritLabel === "string" && <option value="">{inheritLabel}</option>}
      {grouped.map(({ group, themes }) => {
        const isFoil = group === "foil";
        return (
          <optgroup key={group} label={THEME_GROUP_LABELS[group].en}>
            {themes.map((theme) => {
              const foilHint = isFoil && hint ? ` — ${hint}` : "";
              return (
                <option key={theme.id} value={theme.id}>
                  {theme.nameKey ? t(theme.nameKey as Parameters<typeof t>[0]) : theme.name}
                  {theme.premium ? " ★" : ""}
                  {foilHint ? ` — ${hint}` : ""}
                </option>
              );
            })}
          </optgroup>
        );
      })}
    </select>
  );
}
