import { demoKey } from '@platform/offline/demo-key.ts';

// DEMO ISOLATION (issue #48): demo-scope the per-profile copybook text so a demo
// visitor's saved text lands on 'copybook:{id}-demo', never the real user's
// 'copybook:{id}' (demo + real profile ids collide). Reset each demo load.
const key = (userId: number) => demoKey(`copybook:${userId}`);

// Remembered "last text" the user wrote, so a returning user can re-load
// their previous text in one tap instead of re-pasting. Stored verbatim.
export function getLastText(userId: number): string {
  try {
    const v = localStorage.getItem(key(userId));
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

export function setLastText(userId: number, text: string): void {
  localStorage.setItem(key(userId), text);
}
