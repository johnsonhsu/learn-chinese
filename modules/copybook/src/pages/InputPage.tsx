import { useState, useRef, useContext } from "react";
import { useOffline } from "@platform/offline/offline-context.tsx";
import { ModuleScreen, Button } from "@platform/ui/index.ts";
import { getLastText, setLastText } from "../utils/storage.ts";
import { getUserGeminiKey } from "@platform/utils/geminiKey.ts";
import { useT, LanguageContext } from "../i18n/index.ts";

export function InputPage({
  userId,
  onStart,
  onExit,
}: {
  userId: number;
  onStart: (_text: string) => void;
  /** Exit the module back to home — drives the <ModuleScreen> back pill. */
  onExit?: () => void;
}) {
  const t = useT();
  const lang = useContext(LanguageContext);
  const { dataLayer } = useOffline();
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<
    "input.generateError" | "input.generateUnavailable" | "input.generateRateLimited" | null
  >(null);
  const lastText = useRef<string>(getLastText(userId));

  // One-to-one: whatever is typed is exactly what gets written. We only trim
  // outer whitespace — interior characters/order/repeats are preserved verbatim.
  const launch = (_text: string) => {
    const trimmed = _text.trim();
    if (trimmed.length === 0) return;
    setLastText(userId, trimmed); // remember this text for next time
    onStart(trimmed);
  };

  const handleStart = () => launch(input);
  const handleUseLast = () => {
    setInput(lastText.current);
    launch(lastText.current);
  };

  // Best-effort online convenience: ask the server to generate ONE natural
  // Taiwan-Traditional sentence seeded by this user's on-device level / known /
  // target signals, and drop it into the textarea for verbatim copying. Failures
  // (no key / offline / validation exhausted) just show a small inline note and
  // never touch the textarea, so manual typing is always available.
  const handleGenerate = async () => {
    if (generating) return;
    setGenError(null);

    // Gather seed signals from the on-device data layer.
    const debug = dataLayer?.getDebugInfo() ?? null;
    const ranked = dataLayer?.getCharRanking() ?? [];
    const level = debug?.level ?? 0;
    const targetChars = debug?.targetChars ?? [];

    // Pick a target char: a random one from targetChars, else a sensible default
    // (a mid-level known char, else a common fallback).
    let targetChar = "";
    if (targetChars.length > 0) {
      targetChar = targetChars[Math.floor(Math.random() * targetChars.length)];
    } else if (ranked.length > 0) {
      targetChar = ranked[Math.min(level, ranked.length - 1)]?.char ?? ranked[0].char;
    } else {
      targetChar = "我";
    }

    // Known-char pool sample (chars at/below the user's level) + a rank ceiling
    // for difficulty (a little above the current level).
    const knownChars = ranked
      .slice(0, Math.max(level, 1))
      .map((r) => r.char)
      .slice(0, 60);
    const rankCeiling = Math.max(level + 200, 600);

    // BYO-key: if this profile has saved their own Gemini key, send it so the
    // proxy uses it (overriding the server key, and working even when none is
    // configured). Empty = unset → the proxy falls back to the server/device key.
    // The key is the user's own secret — never log it.
    const apiKey = getUserGeminiKey(userId);

    setGenerating(true);
    try {
      const res = await fetch("/api/copybook/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetChar,
          knownChars,
          level,
          rankCeiling,
          ...(apiKey ? { apiKey } : {}),
        }),
      });
      if (!res.ok) {
        // Surface the real reason instead of a blanket failure: 503 = no Gemini
        // key configured on the server, 429 = rate-limited, else transient.
        setGenError(
          res.status === 503
            ? "input.generateUnavailable"
            : res.status === 429
              ? "input.generateRateLimited"
              : "input.generateError",
        );
        return;
      }
      const data = (await res.json()) as { sentence?: string };
      if (data.sentence && data.sentence.trim()) {
        setInput(data.sentence.trim());
      } else {
        setGenError("input.generateError");
      }
    } catch {
      setGenError("input.generateError");
    } finally {
      setGenerating(false);
    }
  };

  const canStart = input.trim().length > 0;

  return (
    // Shared module main-screen shell: renders the back pill (only because we
    // pass onBack) + the cream `.module-tile` card + the localized module name
    // title (shown in ONLY the chosen UI language). "Your Characters" + the
    // instruction stay below as the section subtitle; the textarea + generate /
    // error logic + the candy action buttons stay module-specific.
    <ModuleScreen
      title={lang === "zh-TW" ? t("module.nameZh") : t("module.nameEn")}
      onBack={onExit}
      backLabel={t("input.back")}
      cardClassName="cc-input"
    >
      <header className="cc-input-head">
        <h2 className="cc-input-title">{t("input.title")}</h2>
        <p className="cc-input-sub">{t("input.subtitle")}</p>
      </header>

      <textarea
        className="cc-textarea"
        placeholder={t("input.placeholder")}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (genError) setGenError(null);
        }}
        rows={3}
      />

      {genError && <p className="cc-input-error">{t(genError)}</p>}

      <div className="cc-input-actions">
        <Button
          variant="secondary"
          className="cc-action-btn"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? t("input.generating") : t("input.generate")}
        </Button>
        {!canStart && lastText.current.length > 0 && (
          <Button variant="secondary" className="cc-action-btn" onClick={handleUseLast}>
            {t("input.useLast")}
          </Button>
        )}
        <Button
          variant="primary"
          className="cc-action-btn"
          onClick={handleStart}
          disabled={!canStart}
        >
          {t("input.start")}
        </Button>
      </div>
    </ModuleScreen>
  );
}
