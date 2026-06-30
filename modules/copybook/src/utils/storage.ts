const key = (userId: number) => `copybook:${userId}`;

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
