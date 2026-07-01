import { useEffect } from 'react';

const PORTRAIT_CLASS = 'lock-portrait';
const OVERLAY_ID = 'rotate-overlay';

export function useOrientationLock(orientationLock: '0' | '1' | undefined) {
  useEffect(() => {
    const enabled = orientationLock === '1';
    const root = document.documentElement;
    if (enabled) root.classList.add(PORTRAIT_CLASS); else root.classList.remove(PORTRAIT_CLASS);

    if (!enabled) return cleanup();
    let node: HTMLDivElement | null = null;
    if (!document.getElementById(OVERLAY_ID)) {
      node = document.createElement('div');
      node.id = OVERLAY_ID;
      node.className = 'rotate-overlay';
      node.innerHTML = '<div><p>🔁 Please rotate back to portrait to continue.</p></div>';
      document.body.appendChild(node);
    }
    const safeScreen = screen as unknown as { orientation?: { lock: (o: string) => Promise<void>; unlock: () => void } };
    return cleanup;
    function cleanup() {
      if (node && node.parentNode) node.parentNode.removeChild(node);
      node = null;
      if (safeScreen?.orientation?.unlock) safeScreen.orientation.unlock();
    }
  }, [orientationLock]);
}
