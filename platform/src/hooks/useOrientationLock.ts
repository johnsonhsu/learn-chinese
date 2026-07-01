import { useEffect } from 'react';
import { t } from '../i18n/index.js';
import type { Language } from '../i18n/index.js';

const PORTRAIT_CLASS = 'lock-portrait';
const OVERLAY_ID = 'rotate-overlay';

export function useOrientationLock(orientationLock: '0' | '1' | undefined, lang: Language) {
  useEffect(() => {
    const root = document.documentElement;
    const enabled = orientationLock === '1';
    if (enabled) root.classList.add(PORTRAIT_CLASS);
    else root.classList.remove(PORTRAIT_CLASS);

    const mql = window.matchMedia('(orientation: landscape)');
    let node: HTMLDivElement | null = null;

    function apply() {
      if (!enabled || !mql.matches) {
        remove();
        return;
      }
      if (!node && !document.getElementById(OVERLAY_ID)) {
        node = document.createElement('div');
        node.id = OVERLAY_ID;
        node.className = 'rotate-overlay';
        node.innerHTML = `<div><p>${t('settings.orientationLock.rotateMessage', lang)}</p><button id="rotate-overlay-dismiss" class="rotate-overlay__dismiss">${t('settings.orientationLock.dismissButton', lang)}</button></div>`;
        document.body.appendChild(node);

        const btn = node.querySelector<HTMLButtonElement>('#rotate-overlay-dismiss');
        const dismiss = () => {
          localStorage.setItem('orientationLock', '0');
          localStorage.setItem('settingsOverrides', JSON.stringify({ ...(JSON.parse(localStorage.getItem('settingsOverrides') || '{}')), orientationLock: '0' }));
          remove();
          location.reload();
        };
        btn?.addEventListener('click', dismiss);
      }
    }

    function remove() {
      const existing = document.getElementById(OVERLAY_ID);
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      node = null;
    }

    apply();
    mql.addEventListener?.('change', apply);

    const safeScreen = screen as unknown as { orientation?: { lock: (_o: string) => Promise<void>; unlock: () => void } };
    if (enabled && safeScreen?.orientation?.lock) {
      safeScreen.orientation.lock('portrait').catch(() => {});
    }

    return () => {
      mql.removeEventListener?.('change', apply);
      remove();
      try { safeScreen?.orientation?.unlock?.(); } catch {}
    };
  }, [orientationLock, lang]);
}
