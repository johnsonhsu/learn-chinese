import { describe, it, expect } from "vitest";
import { t } from "../index";

describe("platform i18n styleguide keys", () => {
  const keys = [
    "styleguide.switchToZh",
    "styleguide.switchToEn",
    "styleguide.themeLabel",
    "styleguide.themeNote",
    "styleguide.title",
    "styleguide.subtitle",
    "styleguide.footer",
    "styleguide.section.button.title",
    "styleguide.section.button.desc",
    "styleguide.section.textInput.title",
    "styleguide.section.textInput.desc",
    "styleguide.section.charTile.title",
    "styleguide.section.charTile.desc",
    "styleguide.section.charTile.screenMyCharacters",
    "styleguide.section.charTile.screenOther",
    "styleguide.section.writingTrack.title",
    "styleguide.section.writingTrack.desc",
    "styleguide.section.card.title",
    "styleguide.section.card.desc",
    "styleguide.section.backButton.title",
    "styleguide.section.backButton.desc",
    "styleguide.section.moduleScreen.title",
    "styleguide.section.moduleScreen.desc",
    "styleguide.section.colorTokens.title",
    "styleguide.section.colorTokens.desc",
    "styleguide.section.semanticColors.title",
    "styleguide.section.semanticColors.desc",
    "styleguide.section.screenBackgrounds.title",
    "styleguide.section.screenBackgrounds.desc",
    "styleguide.section.surfaces.title",
    "styleguide.section.surfaces.desc",
    "styleguide.section.typography.title",
    "styleguide.section.typography.desc",
  ] as const;

  it("returns non-empty strings for both locales", () => {
    for (const lang of ["en", "zh-TW"] as const) {
      for (const key of keys) {
        const value = t(key, lang);
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
