/**
 * In-app FEEDBACK widget — a global floating button (bottom-right) that opens a
 * dialog to submit categorized feedback with auto-captured (no-PII) context and
 * an optional screenshot of the current view.
 *
 * Mounted once in the app shell (App.tsx) so it's present across the app. It is
 * intentionally NOT on the marketing landing page.
 *
 * ONLINE-ONLY + LAZY: the DOM-to-image library (html-to-image) is dynamically
 * imported ONLY when a screenshot is actually captured, so it never enters the
 * offline app-shell critical path / precache. Feedback submission requires a
 * network connection (the button is disabled offline).
 *
 * Context captured (no PII): current screen (body[data-screen]) + active module,
 * app version (__CONTENT_VERSION__), numeric profile id, theme, language,
 * viewport size, online state, user-agent, timestamp. Submitted to the SILOED
 * feedback endpoint POST /api/feedback. App/user data is never sent beyond the
 * numeric profile id.
 */

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useT, LanguageContext } from './i18n/index.ts';

// Kept in sync with the server's FEEDBACK_CATEGORIES (server/feedback-shared.ts).
// Declared locally so the client bundle never pulls in server-side code.
type FeedbackCategory = 'bug' | 'suggestion' | 'content' | 'confusing' | 'other';

// Screenshot budget: target ~300KB. We render at reduced pixelRatio and re-encode
// as JPEG, dropping quality until under the cap (or give up gracefully).
const SCREENSHOT_TARGET_BYTES = 300 * 1024;

interface FeedbackWidgetProps {
  /** Numeric profile id of the active profile, or null if none selected. */
  profileId: number | null;
}

type Phase = 'idle' | 'open' | 'sending' | 'sent' | 'error';

const CATEGORIES: { value: FeedbackCategory; key: Parameters<ReturnType<typeof useT>>[0] }[] = [
  { value: 'bug', key: 'feedback.cat.bug' },
  { value: 'suggestion', key: 'feedback.cat.suggestion' },
  { value: 'content', key: 'feedback.cat.content' },
  { value: 'confusing', key: 'feedback.cat.confusing' },
  { value: 'other', key: 'feedback.cat.other' },
];

const SEVERITIES: { value: string; key: Parameters<ReturnType<typeof useT>>[0] }[] = [
  { value: 'low', key: 'feedback.sev.low' },
  { value: 'medium', key: 'feedback.sev.medium' },
  { value: 'high', key: 'feedback.sev.high' },
];

/** Approximate byte size of a base64 data URL's payload. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Capture the current view as a compressed JPEG data URL, lazily importing the
 * DOM-to-image lib. Returns null on any failure (graceful — feedback still sends).
 */
async function captureScreenshot(): Promise<string | null> {
  try {
    const { toJpeg } = await import('html-to-image');
    // Downscale aggressively: cap the longest side at ~900px-equivalent via
    // pixelRatio, and start at moderate JPEG quality.
    const node = document.body;
    const longest = Math.max(window.innerWidth, window.innerHeight) || 1;
    const ratio = Math.min(1, 900 / longest);
    let quality = 0.7;
    let out = await toJpeg(node, { quality, pixelRatio: ratio, cacheBust: true });
    // Step quality down until under the cap, or bail after a few tries.
    for (let i = 0; i < 3 && dataUrlBytes(out) > SCREENSHOT_TARGET_BYTES; i++) {
      quality = Math.max(0.35, quality - 0.15);
      out = await toJpeg(node, { quality, pixelRatio: ratio, cacheBust: true });
    }
    // Final hard guard: if still too big, drop it (the server caps too).
    if (dataUrlBytes(out) > SCREENSHOT_TARGET_BYTES * 2) return null;
    return out;
  } catch {
    return null;
  }
}

/** Gather no-PII context about the current view. */
function captureContext(language: string) {
  const screen = document.body.dataset.screen || 'unknown';
  // Active module: the app-shell wraps modules in `.app-shell--<module>`.
  const shell = document.querySelector('[class*="app-shell--"]');
  let activeModule = '';
  if (shell) {
    const m = /app-shell--([a-z-]+)/.exec(shell.className);
    if (m) activeModule = m[1];
  }
  const theme = document.body.dataset.theme || 'default';
  return {
    screen,
    activeModule,
    theme,
    language,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    online: navigator.onLine,
    timestamp: new Date().toISOString(),
  };
}

export default function FeedbackWidget({ profileId }: FeedbackWidgetProps) {
  const t = useT();
  const language = useContext(LanguageContext);
  const [phase, setPhase] = useState<Phase>('idle');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [severity, setSeverity] = useState('medium');
  const [message, setMessage] = useState('');
  const [includeShot, setIncludeShot] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const open = useCallback(() => {
    setMessage('');
    setCategory('bug');
    setSeverity('medium');
    setIncludeShot(true);
    setPhase('open');
  }, []);

  const close = useCallback(() => setPhase('idle'), []);

  // Focus the textarea when the dialog opens.
  useEffect(() => {
    if (phase === 'open') {
      const id = window.setTimeout(() => textRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [phase]);

  // Esc closes the dialog.
  useEffect(() => {
    if (phase !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, close]);

  const submit = useCallback(async () => {
    if (!message.trim()) return;
    if (!navigator.onLine) {
      setPhase('error');
      return;
    }
    setPhase('sending');
    const context = captureContext(language);
    // Capture the screenshot BEFORE we change the DOM further; we keep the dialog
    // up (it overlays the view) but html-to-image renders the whole body, which
    // includes this dialog. Acceptable for a feedback shot; the screen context is
    // what matters. Lazy-import means the lib only loads now.
    let screenshot: string | null = null;
    if (includeShot) {
      screenshot = await captureScreenshot();
    }
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          option: severity,
          message: message.trim(),
          screen: context.screen,
          context,
          screenshot,
          ua: navigator.userAgent,
          appVersion: __CONTENT_VERSION__,
          profileId,
        }),
      });
      if (!res.ok) {
        setPhase('error');
        return;
      }
      setPhase('sent');
      window.setTimeout(() => setPhase('idle'), 2200);
    } catch {
      setPhase('error');
    }
  }, [message, includeShot, category, severity, profileId, language]);

  return (
    <>
      {phase === 'idle' && (
        <button className="fb-fab" onClick={open} title={t('feedback.button')} aria-label={t('feedback.button')}>
          {/* speech-bubble glyph */}
          <span aria-hidden>💬</span>
        </button>
      )}

      {phase === 'sent' && <div className="fb-toast fb-toast--ok">{t('feedback.thanks')}</div>}

      {(phase === 'open' || phase === 'sending' || phase === 'error') && (
        <div className="fb-overlay" onClick={phase === 'sending' ? undefined : close}>
          <div
            className="fb-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('feedback.title')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fb-dialog__head">
              <h3>{t('feedback.title')}</h3>
              <button className="fb-close" onClick={close} disabled={phase === 'sending'} aria-label={t('feedback.cancel')}>
                ✕
              </button>
            </div>

            <label className="fb-label" htmlFor="fb-category">
              {t('feedback.category')}
            </label>
            <select
              id="fb-category"
              className="fb-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              disabled={phase === 'sending'}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {t(c.key)}
                </option>
              ))}
            </select>

            <span className="fb-label">{t('feedback.severity')}</span>
            <div className="fb-seg">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`fb-seg__btn${severity === s.value ? ' active' : ''}`}
                  onClick={() => setSeverity(s.value)}
                  disabled={phase === 'sending'}
                >
                  {t(s.key)}
                </button>
              ))}
            </div>

            <label className="fb-label" htmlFor="fb-message">
              {t('feedback.message')}
            </label>
            <textarea
              id="fb-message"
              ref={textRef}
              className="fb-textarea"
              rows={4}
              maxLength={4000}
              placeholder={t('feedback.messagePlaceholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={phase === 'sending'}
            />

            <label className="fb-check">
              <input
                type="checkbox"
                checked={includeShot}
                onChange={(e) => setIncludeShot(e.target.checked)}
                disabled={phase === 'sending'}
              />
              <span>{t('feedback.includeShot')}</span>
            </label>

            {phase === 'error' && (
              <p className="fb-error">{online ? t('feedback.failed') : t('feedback.offline')}</p>
            )}

            <div className="fb-actions">
              <button className="fb-btn" onClick={close} disabled={phase === 'sending'}>
                {t('feedback.cancel')}
              </button>
              <button
                className="fb-btn fb-btn--primary"
                onClick={submit}
                disabled={phase === 'sending' || !message.trim() || !online}
              >
                {phase === 'sending' ? t('feedback.sending') : t('feedback.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
